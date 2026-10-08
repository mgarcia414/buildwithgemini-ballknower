"""Sports data fetchers and watch guide tools for Ballknower."""

import json
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any, Dict, List, Optional
from PIL import Image, ImageDraw, ImageFont
from google.cloud import storage

MY_TEAMS = ["Georgia Tech", "Fresno State", "Notre Dame"]
GCS_BUCKET_NAME = "ballknower-assets-qwiklabs-gcp-03-992d89eb5c7c"
PST = ZoneInfo("America/Los_Angeles")


def _fetch_json(url: str) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_cfb_weekend_and_live_alerts() -> Dict[str, Any]:
    """Fetch college football weekend games and detect smart upset & thriller alerts.

    Filters:
    - Favorite teams (Georgia Tech, Fresno State, Notre Dame) are included in the schedule but excluded from spam alerts.
    - Thriller Alert: 4th quarter games within 1 score (diff <= 8) where avg rank <= 40.
    - Upset Alert: The leading team is ranked 30+ spots lower than the opponent (or unranked leading a ranked team).

    Returns:
        Dict containing favorite_team_games, high_ranking_games, and live_alerts (with broadcast info in PST).
    """
    url = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
    try:
        data = _fetch_json(url)
    except Exception as e:
        return {"error": f"Failed to fetch CFB scores: {e}"}

    fav_games = []
    marquee_games = []
    live_alerts = []

    for event in data.get("events", []):
        competitions = event.get("competitions", [])
        if not competitions:
            continue
        comp = competitions[0]
        status = comp.get("status", {})
        period = status.get("period", 0)
        detail = status.get("type", {}).get("detail", "")
        broadcasts = [b["names"][0] for b in comp.get("broadcasts", []) if b.get("names")]
        channel = broadcasts[0] if broadcasts else "TBD"

        # Date & Time conversion to PST
        event_date_str = event.get("date")
        time_pst = "TBD"
        if event_date_str:
            try:
                utc_dt = datetime.fromisoformat(event_date_str.replace("Z", "+00:00"))
                pst_dt = utc_dt.astimezone(PST)
                time_pst = pst_dt.strftime("%a %I:%M %p PST")
            except Exception:
                time_pst = detail

        competitors = comp.get("competitors", [])
        if len(competitors) < 2:
            continue

        c1, c2 = competitors[0], competitors[1]
        team1 = c1.get("team", {}).get("displayName", "")
        team2 = c2.get("team", {}).get("displayName", "")
        rank1 = c1.get("curatedRank", {}).get("current", 99)
        rank2 = c2.get("curatedRank", {}).get("current", 99)
        score1 = int(c1.get("score") or 0)
        score2 = int(c2.get("score") or 0)

        # Favorite team check
        is_fav = any(fav.lower() in team1.lower() or fav.lower() in team2.lower() for fav in MY_TEAMS)
        game_info = {
            "name": event.get("name"),
            "time_pst": time_pst,
            "channel": channel,
            "status": detail,
            "score": f"{team1} {score1} - {score2} {team2}",
            "ranks": {team1: rank1 if rank1 <= 25 else "NR", team2: rank2 if rank2 <= 25 else "NR"},
        }

        if is_fav:
            fav_games.append(game_info)
        elif rank1 <= 25 or rank2 <= 25:
            marquee_games.append(game_info)

        # Skip alerts if it's user's favorite team (they already watch)
        if is_fav:
            continue

        # In-game checks (period 4 or 2nd half)
        diff = abs(score1 - score2)
        avg_rank = (rank1 + rank2) / 2.0

        # Thriller Alert: 4th quarter, 1 score (diff <= 8), quality matchup (avg rank <= 40)
        if period >= 4 and diff <= 8 and avg_rank <= 40:
            live_alerts.append({
                "type": "THRILLER_ALERT",
                "game": f"{team1} vs {team2}",
                "score": f"{score1} - {score2} (Diff: {diff})",
                "status": detail,
                "channel": channel,
                "reason": f"4th quarter one-score game in high-caliber matchup (avg rank {avg_rank:.1f}). Tune in!",
            })

        # Upset Alert: leading team is ranked 30+ spots worse than trailing team
        leading_team, lead_rank, trail_rank = None, None, None
        if score1 > score2:
            leading_team, lead_rank, trail_rank = team1, rank1, rank2
        elif score2 > score1:
            leading_team, lead_rank, trail_rank = team2, rank2, rank1

        if leading_team and (lead_rank - trail_rank >= 30) and period >= 3:
            live_alerts.append({
                "type": "UPSET_ALERT",
                "game": f"{team1} vs {team2}",
                "score": f"{score1} - {score2}",
                "status": detail,
                "channel": channel,
                "reason": f"Potential massive upset: {leading_team} (Rank {lead_rank if lead_rank <= 25 else 'NR'}) leading opponent (Rank {trail_rank})!",
            })

    return {
        "favorite_teams_schedule": fav_games,
        "marquee_games": marquee_games[:6],
        "live_alerts": live_alerts,
    }


def get_ufc_upcoming_card() -> Dict[str, Any]:
    """Fetch the upcoming UFC card schedule and bouts with times converted to PST.

    Returns:
        Dict with event name, date/time in PST, broadcast platform, and list of bouts.
    """
    url = "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard"
    try:
        data = _fetch_json(url)
    except Exception as e:
        return {"error": f"Failed to fetch UFC schedule: {e}"}

    events = data.get("events", [])
    if not events:
        return {"message": "No active UFC events found for this weekend."}

    event = events[0]
    name = event.get("name", "UFC Fight Night")
    event_date_str = event.get("date")
    time_pst = "TBD"
    if event_date_str:
        try:
            utc_dt = datetime.fromisoformat(event_date_str.replace("Z", "+00:00"))
            pst_dt = utc_dt.astimezone(PST)
            time_pst = pst_dt.strftime("%a %b %d, %I:%M %p PST")
        except Exception:
            time_pst = event_date_str

    bouts = []
    for comp in event.get("competitions", []):
        competitors = comp.get("competitors", [])
        if len(competitors) >= 2:
            f1 = competitors[0].get("athlete", {}).get("displayName", "Fighter 1")
            f2 = competitors[1].get("athlete", {}).get("displayName", "Fighter 2")
            bouts.append(f"{f1} vs {f2}")

    return {
        "event_name": name,
        "date_time_pst": time_pst,
        "broadcast": "ESPN+ / PPV",
        "estimated_duration": "5-6 hours total (Prelims ~3h, Main Card ~3h)",
        "bouts": bouts[:8],
    }


def generate_weekend_tv_guide_image(guide_title: str, schedule_items: List[Dict[str, str]]) -> Dict[str, str]:
    """Generate a clean TV Guide schedule image (in PST) and upload it to the public Cloud Storage bucket.

    Args:
        guide_title: Title of the TV guide (e.g., 'Ballknower Weekend TV Guide').
        schedule_items: List of schedule entries with keys:
                        'time_pst' (e.g. '12:00 PM PST'),
                        'event' (e.g. 'Georgia Tech vs Miami' or 'UFC Main Card'),
                        'channel' (e.g. 'ESPN', 'NBC', 'ESPN+'),
                        'duration' (e.g. '3.5 hrs').

    Returns:
        Dict with public URL to view the generated TV guide image.
    """
    # Create TV Guide Graphic (800x600 dark modern sports aesthetic)
    width, height = 800, max(500, 160 + len(schedule_items) * 65)
    img = Image.new("RGB", (width, height), color=(18, 22, 28))
    draw = ImageDraw.Draw(img)

    # Header Bar
    draw.rectangle([(0, 0), (width, 80)], fill=(30, 41, 59))
    draw.text((30, 15), guide_title.upper(), fill=(248, 250, 252))
    draw.text((30, 48), "All Times in PST | Ballknower Weekend Watch Slate", fill=(148, 163, 184))

    # Column Headers
    y = 100
    draw.text((30, y), "TIME (PST)", fill=(56, 189, 248))
    draw.text((180, y), "EVENT / MATCHUP", fill=(56, 189, 248))
    draw.text((540, y), "CHANNEL", fill=(56, 189, 248))
    draw.text((680, y), "DURATION", fill=(56, 189, 248))
    draw.line([(30, y + 25), (770, y + 25)], fill=(51, 65, 85), width=1)

    y += 40
    for item in schedule_items:
        draw.rectangle([(25, y - 5), (775, y + 45)], fill=(24, 30, 40))
        draw.text((30, y + 10), str(item.get("time_pst", "TBD")), fill=(226, 232, 240))
        draw.text((180, y + 10), str(item.get("event", "TBD"))[:38], fill=(255, 255, 255))
        draw.text((540, y + 10), str(item.get("channel", "TBD")), fill=(250, 204, 21))
        draw.text((680, y + 10), str(item.get("duration", "3.5h")), fill=(148, 163, 184))
        y += 55

    local_path = "/tmp/ballknower_tv_guide.png"
    img.save(local_path, format="PNG")

    # Upload to Cloud Storage
    client = storage.Client(project="qwiklabs-gcp-03-992d89eb5c7c")
    bucket = client.bucket(GCS_BUCKET_NAME)
    blob_name = f"tv_guides/tv_guide_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path, content_type="image/png")

    public_url = f"https://storage.googleapis.com/{GCS_BUCKET_NAME}/{blob_name}"
    return {
        "status": "success",
        "image_url": public_url,
        "message": f"TV Guide graphic created and published to {public_url}",
    }
