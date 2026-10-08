"""Firestore backend client and tools for Ballknower."""

from typing import Any, Dict, List, Optional
from google.cloud import firestore

PROJECT_ID = "qwiklabs-gcp-03-992d89eb5c7c"
EVENTS_COLLECTION = "weekend_events"


def get_firestore_client() -> firestore.Client:
    """Returns a Firestore client initialized with the hardcoded project ID."""
    return firestore.Client(project=PROJECT_ID)


def list_weekend_events(
    category: Optional[str] = None,
    must_watch_only: bool = False,
    featured_team: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List scheduled weekend sports events (CFB games and UFC fight cards/bouts) from Firestore.

    Args:
        category: Filter by event type, e.g. "CFB" or "UFC". If omitted, returns all.
        must_watch_only: If True, only returns games or bouts flagged as must_watch or upset alerts.
        featured_team: Filter for games involving a specific team (e.g. "Georgia Tech", "Fresno State", "Notre Dame").

    Returns:
        List of event records matching the criteria.
    """
    from google.cloud.firestore_v1.base_query import FieldFilter

    db = get_firestore_client()
    query = db.collection(EVENTS_COLLECTION)

    if category:
        query = query.where(filter=FieldFilter("category", "==", category.upper()))
    if must_watch_only:
        query = query.where(filter=FieldFilter("must_watch", "==", True))

    docs = query.stream()
    events = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        if featured_team:
            team_lower = featured_team.lower()
            matchup_teams = [t.lower() for t in data.get("teams", [])]
            title = data.get("title", "").lower()
            if not any(team_lower in t for t in matchup_teams) and team_lower not in title:
                continue
        events.append(data)

    return events


def add_or_update_event(
    event_id: str,
    title: str,
    category: str,
    start_time: str,
    network_or_broadcast: str,
    storyline: str,
    teams: Optional[List[str]] = None,
    fighters: Optional[List[str]] = None,
    is_live: bool = False,
    is_fourth_quarter: bool = False,
    score_differential: Optional[int] = None,
    must_watch: bool = False,
) -> Dict[str, Any]:
    """Add or update a sporting event or game record in Firestore.

    Args:
        event_id: Unique slug for the event (e.g. 'gt-vs-miami', 'ufc-310-main-card').
        title: Display title for the game or fight card.
        category: 'CFB' or 'UFC'.
        start_time: Date and time of the event (e.g. 'Saturday 3:30 PM ET').
        network_or_broadcast: Channel or stream (e.g. 'ABC', 'ESPN', 'PPV', 'ESPN+').
        storyline: Why fans should watch (e.g., 'ACC showdown, GT upset alert').
        teams: List of participating teams for CFB (e.g. ['Georgia Tech', 'Miami']).
        fighters: List of fighters for UFC (e.g. ['Belal Muhammad', 'Shavkat Rakhmonov']).
        is_live: Whether the event is currently live.
        is_fourth_quarter: Whether a CFB game is currently in the 4th quarter.
        score_differential: Point differential between teams (e.g. 3 for a 1-score game).
        must_watch: True if this is a high-priority / must-see event or upset alert.

    Returns:
        Status confirmation with updated record.
    """
    db = get_firestore_client()
    doc_ref = db.collection(EVENTS_COLLECTION).document(event_id)

    record = {
        "title": title,
        "category": category.upper(),
        "start_time": start_time,
        "network_or_broadcast": network_or_broadcast,
        "storyline": storyline,
        "teams": teams or [],
        "fighters": fighters or [],
        "is_live": is_live,
        "is_fourth_quarter": is_fourth_quarter,
        "score_differential": score_differential,
        "must_watch": must_watch,
    }

    doc_ref.set(record, merge=True)
    record["id"] = event_id
    return {"status": "success", "event": record}


def check_thriller_alerts() -> List[Dict[str, Any]]:
    """Scan Firestore for active 4th-quarter one-score college football games (score differential <= 8).

    Returns:
        List of urgent live game alerts that fans should tune into immediately.
    """
    from google.cloud.firestore_v1.base_query import FieldFilter

    db = get_firestore_client()
    docs = (
        db.collection(EVENTS_COLLECTION)
        .where(filter=FieldFilter("category", "==", "CFB"))
        .where(filter=FieldFilter("is_live", "==", True))
        .where(filter=FieldFilter("is_fourth_quarter", "==", True))
        .stream()
    )

    alerts = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        diff = data.get("score_differential")
        if diff is not None and diff <= 8:
            alerts.append(data)

    return alerts
