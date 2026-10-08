"""Seed script for Ballknower Firestore backend."""

from google.cloud import firestore

PROJECT_ID = "qwiklabs-gcp-03-992d89eb5c7c"
COLLECTION_NAME = "weekend_events"

SEEDED_EVENTS = [
    {
        "id": "gt-vs-miami",
        "title": "Georgia Tech vs #4 Miami",
        "category": "CFB",
        "start_time": "Saturday 12:00 PM ET",
        "network_or_broadcast": "ESPN",
        "storyline": "Major ACC clash. Georgia Tech's explosive rushing offense looks to pull off a monumental upset over undefeated Miami.",
        "teams": ["Georgia Tech", "Miami"],
        "fighters": [],
        "is_live": True,
        "is_fourth_quarter": True,
        "score_differential": 5,
        "must_watch": True,
    },
    {
        "id": "notre-dame-vs-usc",
        "title": "#8 Notre Dame vs USC",
        "category": "CFB",
        "start_time": "Saturday 7:30 PM ET",
        "network_or_broadcast": "NBC / Peacock",
        "storyline": "Historic Jeweled Shillelagh rivalry with massive College Football Playoff implications for the Fighting Irish.",
        "teams": ["Notre Dame", "USC"],
        "fighters": [],
        "is_live": False,
        "is_fourth_quarter": False,
        "score_differential": None,
        "must_watch": True,
    },
    {
        "id": "fresno-state-vs-boise-state",
        "title": "Fresno State vs #12 Boise State",
        "category": "CFB",
        "start_time": "Saturday 10:30 PM ET",
        "network_or_broadcast": "FS1",
        "storyline": "Mountain West Battle for the Milk Can. Fresno State's defense faces the most explosive running back in the nation under the late-night lights.",
        "teams": ["Fresno State", "Boise State"],
        "fighters": [],
        "is_live": False,
        "is_fourth_quarter": False,
        "score_differential": None,
        "must_watch": True,
    },
    {
        "id": "georgia-vs-texas",
        "title": "#5 Georgia vs #1 Texas",
        "category": "CFB",
        "start_time": "Saturday 3:30 PM ET",
        "network_or_broadcast": "ABC",
        "storyline": "Game of the Week in Austin. Top-tier SEC heavyweight battle between national championship frontrunners.",
        "teams": ["Georgia", "Texas"],
        "fighters": [],
        "is_live": False,
        "is_fourth_quarter": False,
        "score_differential": None,
        "must_watch": True,
    },
    {
        "id": "ufc-main-card",
        "title": "UFC Fight Night: Topuria vs Holloway",
        "category": "UFC",
        "start_time": "Saturday 2:00 PM ET (Main Card 4:00 PM ET)",
        "network_or_broadcast": "ESPN+ / PPV",
        "storyline": "Featherweight World Championship on the line. Undefeated champion Ilia Topuria defends against BMF champion Max Holloway.",
        "teams": [],
        "fighters": ["Ilia Topuria", "Max Holloway", "Robert Whittaker", "Khamzat Chimaev"],
        "is_live": False,
        "is_fourth_quarter": False,
        "score_differential": None,
        "must_watch": True,
    },
]


def seed():
    print(f"Connecting to Firestore with hardcoded project ID: {PROJECT_ID}")
    db = firestore.Client(project=PROJECT_ID)
    batch = db.batch()

    for item in SEEDED_EVENTS:
        doc_id = item["id"]
        doc_ref = db.collection(COLLECTION_NAME).document(doc_id)
        data = {k: v for k, v in item.items() if k != "id"}
        batch.set(doc_ref, data)
        print(f"  Queued: [{item['category']}] {item['title']} (ID: {doc_id})")

    batch.commit()
    print(f"\nSuccessfully seeded {len(SEEDED_EVENTS)} events into '{COLLECTION_NAME}' collection.")


if __name__ == "__main__":
    seed()
