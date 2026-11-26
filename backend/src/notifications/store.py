"""MongoDB persistence for role- and store-scoped notifications (SPEC-06)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from api.auth import CurrentUser
from db.models import NOTIFICATIONS, next_id


def create_notification(
    db: Database,
    *,
    agent: str,
    audience: str,
    store_code: str,
    severity: str,
    title: str,
    message: str,
    dedupe_key: str,
    action_link: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Insert a notification idempotently. Returns the doc if created, else None."""
    notif_id = f"ntf_{next_id(db, NOTIFICATIONS)}"
    doc = {
        "notif_id": notif_id,
        "agent": agent,
        "audience": audience,
        "store_code": store_code,
        "severity": severity,
        "title": title,
        "message": message,
        "action_link": action_link,
        "metadata": metadata or {},
        "dedupe_key": dedupe_key,
        "read": False,
        "read_at": None,
        "read_by": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        db[NOTIFICATIONS].insert_one(doc)
        doc.pop("_id", None)
        return doc
    except DuplicateKeyError:
        return None


def _scope_query(user: CurrentUser) -> dict[str, Any]:
    if user.is_admin:
        return {"audience": "admin"}
    return {"audience": "manager", "store_code": user.store_code}


def list_notifications(
    db: Database,
    user: CurrentUser,
    *,
    unread_only: bool = False,
    limit: int = 40,
) -> dict[str, Any]:
    base = _scope_query(user)
    unread_count = db[NOTIFICATIONS].count_documents({**base, "read": False})
    query = {**base, "read": False} if unread_only else base
    items = list(
        db[NOTIFICATIONS]
        .find(query, {"_id": 0})
        .sort("created_at", -1)
        .limit(max(1, min(limit, 100)))
    )
    return {"unread_count": int(unread_count), "items": items}


def mark_read(db: Database, notif_id: str, user: CurrentUser) -> tuple[bool, bool]:
    """Mark one notification read. Returns (found, forbidden)."""
    doc = db[NOTIFICATIONS].find_one({"notif_id": notif_id}, {"_id": 0, "audience": 1, "store_code": 1})
    if not doc:
        return False, False
    if user.is_admin:
        if doc.get("audience") != "admin":
            return True, True
    else:
        if doc.get("audience") != "manager" or doc.get("store_code") != user.store_code:
            return True, True

    db[NOTIFICATIONS].update_one(
        {"notif_id": notif_id},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat(), "read_by": user.username}},
    )
    return True, False


def mark_all_read(db: Database, user: CurrentUser) -> int:
    res = db[NOTIFICATIONS].update_many(
        {**_scope_query(user), "read": False},
        {"$set": {"read": True, "read_at": datetime.now(timezone.utc).isoformat(), "read_by": user.username}},
    )
    return int(res.modified_count)
