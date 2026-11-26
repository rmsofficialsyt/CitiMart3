"""Persisted tick-state for the Advisor's floor checklist (``advisor_actions``).
One document per store + day + action key. Every read/write is scoped by
``store_code`` -- the collection is shared across stores."""
from __future__ import annotations

from datetime import date, datetime, timezone

from pymongo import ReturnDocument
from pymongo.database import Database

from db.models import ADVISOR_ACTIONS, next_id

# Standing floor routines shown every day, alongside the insight-driven ones.
FLOOR_TASKS = ("task1", "task2", "task3", "task4")


def list_actions(db: Database, store: str, target_date: date) -> dict[str, dict]:
    cursor = db[ADVISOR_ACTIONS].find({"store_code": store, "entry_date": target_date.isoformat()})
    return {
        d["action_key"]: {"done": bool(d.get("done")), "done_by": d.get("done_by"), "done_at": d.get("done_at")}
        for d in cursor
    }


def set_action(db: Database, store: str, target_date: date, action_key: str, done: bool, username: str) -> dict:
    flt = {"store_code": store, "entry_date": target_date.isoformat(), "action_key": action_key}
    doc = db[ADVISOR_ACTIONS].find_one_and_update(
        flt,
        {
            "$set": {
                "done": done,
                "done_by": username if done else None,
                "done_at": datetime.now(timezone.utc).isoformat() if done else None,
            },
            # Only used on insert; on an update the counter value is simply skipped.
            "$setOnInsert": {"_id": next_id(db, ADVISOR_ACTIONS)},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return {"action_key": action_key, "done": bool(doc.get("done")), "done_by": doc.get("done_by"), "done_at": doc.get("done_at")}
