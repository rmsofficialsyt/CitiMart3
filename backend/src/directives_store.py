from __future__ import annotations

from datetime import datetime, timezone
from pymongo import ReturnDocument
from pymongo.database import Database

from db.models import DIRECTIVES, next_id


DEFAULT_SEED_DIRECTIVE = {
    "title": "Puja Season Sales Target & Conversion Push",
    "message": "Special instructions from Operational Head: Focus heavily on peak hour floor presence (03:00 PM - 09:00 PM). Ensure minimum conversion rate of 70% across all departments. Hatibagan, New Market, and Chowringhee managers, please maintain ATV above ₹1,800 with active cross-selling at billing counters.",
    "priority": "urgent",  # "urgent" | "high" | "normal" | "info"
    "category": "sales_target",  # "sales_target" | "special_notice" | "operations" | "announcement" | "remarks"
    "target_store": "ALL",  # "ALL" | "NM" | "HB" | "CHW"
    "author_name": "Operational Head",
    "author_title": "Executive Director / Operations Head",
    "active": True,
    "read_by": [],
}


def _directive_to_dict(doc: dict) -> dict:
    return {
        "id": int(doc["_id"]),
        "title": doc.get("title", ""),
        "message": doc.get("message", ""),
        "priority": doc.get("priority", "high"),
        "category": doc.get("category", "sales_target"),
        "target_store": doc.get("target_store", "ALL"),
        "author_name": doc.get("author_name", "Operational Head"),
        "author_title": doc.get("author_title", "Executive Director"),
        "active": bool(doc.get("active", True)),
        "created_at": doc.get("created_at", ""),
        "updated_at": doc.get("updated_at", ""),
        "read_by": doc.get("read_by", []),
    }


def seed_default_directives(db: Database) -> None:
    if db[DIRECTIVES].count_documents({}) == 0:
        now_iso = datetime.now(timezone.utc).isoformat()
        doc = {
            "_id": next_id(db, DIRECTIVES),
            **DEFAULT_SEED_DIRECTIVE,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        db[DIRECTIVES].insert_one(doc)


def list_directives(db: Database, store_code: str | None = None, is_admin: bool = False) -> list[dict]:
    seed_default_directives(db)
    query: dict = {}
    if not is_admin:
        query["active"] = True
        if store_code:
            query["target_store"] = {"$in": ["ALL", store_code]}
        else:
            query["target_store"] = "ALL"

    docs = list(db[DIRECTIVES].find(query).sort("created_at", -1))
    return [_directive_to_dict(d) for d in docs]


def create_directive(
    db: Database,
    title: str,
    message: str,
    priority: str = "high",
    category: str = "sales_target",
    target_store: str = "ALL",
    author_name: str = "Operational Head",
    author_title: str = "Executive Director / Operations Head",
) -> dict:
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "_id": next_id(db, DIRECTIVES),
        "title": title.strip(),
        "message": message.strip(),
        "priority": priority,
        "category": category,
        "target_store": target_store,
        "author_name": author_name.strip() or "Operational Head",
        "author_title": author_title.strip() or "Executive Director",
        "active": True,
        "read_by": [],
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    db[DIRECTIVES].insert_one(doc)
    return _directive_to_dict(doc)


def update_directive(db: Database, directive_id: int, updates: dict) -> dict | None:
    allowed_fields = {"title", "message", "priority", "category", "target_store", "active", "author_name", "author_title"}
    filtered = {k: v for k, v in updates.items() if k in allowed_fields}
    if not filtered:
        doc = db[DIRECTIVES].find_one({"_id": directive_id})
        return _directive_to_dict(doc) if doc else None

    filtered["updated_at"] = datetime.now(timezone.utc).isoformat()
    doc = db[DIRECTIVES].find_one_and_update(
        {"_id": directive_id},
        {"$set": filtered},
        return_document=ReturnDocument.AFTER,
    )
    return _directive_to_dict(doc) if doc else None


def delete_directive(db: Database, directive_id: int) -> bool:
    res = db[DIRECTIVES].delete_one({"_id": directive_id})
    return res.deleted_count == 1


def acknowledge_directive(db: Database, directive_id: int, username: str) -> dict | None:
    doc = db[DIRECTIVES].find_one_and_update(
        {"_id": directive_id},
        {"$addToSet": {"read_by": username}},
        return_document=ReturnDocument.AFTER,
    )
    return _directive_to_dict(doc) if doc else None


def get_directives_summary(db: Database, username: str | None, store_code: str | None, is_admin: bool) -> dict:
    all_directives = list_directives(db, store_code, is_admin)
    active_directives = [d for d in all_directives if d["active"]]

    unread_count = 0
    if username:
        unread_count = sum(1 for d in active_directives if username not in d.get("read_by", []))
    else:
        unread_count = len(active_directives)

    latest_active = active_directives[0] if active_directives else None

    return {
        "directives": all_directives,
        "latest_active": latest_active,
        "unread_count": unread_count,
        "has_urgent": any(d["priority"] in ("urgent", "high") for d in active_directives),
    }
