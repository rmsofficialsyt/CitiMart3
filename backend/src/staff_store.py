"""Staff Management Store: Workforce directory and daily shift attendance tracking.

Backed by MongoDB collections:
- staff_members: Employee profiles scoped to store.
- staff_attendance: Daily attendance records, shifts, and timestamps.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pymongo import ReturnDocument
from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME
from db.models import STAFF_ATTENDANCE, STAFF_MEMBERS, next_id

logger = logging.getLogger(__name__)


def _clean_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def list_staff(
    db: Database,
    store_code: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    skip: int = 0,
) -> Dict[str, Any]:
    """Retrieve staff members with store scoping, filters, and search."""
    query: Dict[str, Any] = {}
    if store_code and store_code.upper() in STORE_CODE_TO_NAME:
        query["store_code"] = store_code.upper()

    if status:
        query["status"] = status.strip().upper()
    if department:
        query["department"] = department.strip()

    if search:
        s = search.strip()
        query["$or"] = [
            {"staff_id": {"$regex": s, "$options": "i"}},
            {"name": {"$regex": s, "$options": "i"}},
            {"role": {"$regex": s, "$options": "i"}},
            {"phone": {"$regex": s, "$options": "i"}},
            {"department": {"$regex": s, "$options": "i"}},
        ]

    total = db[STAFF_MEMBERS].count_documents(query)
    cursor = (
        db[STAFF_MEMBERS]
        .find(query)
        .sort([("store_code", 1), ("name", 1)])
        .skip(max(0, skip))
        .limit(min(500, max(1, limit)))
    )

    return {
        "total": total,
        "items": [_clean_doc(doc) for doc in cursor],
        "limit": limit,
        "skip": skip,
    }


def get_staff_member(db: Database, store_code: str, staff_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve single staff member by store code and unique staff_id."""
    doc = db[STAFF_MEMBERS].find_one(
        {"store_code": store_code.upper(), "staff_id": staff_id.strip()}
    )
    return _clean_doc(doc)


def create_staff_member(
    db: Database,
    store_code: str,
    data: Dict[str, Any],
    created_by: str = "system",
) -> Dict[str, Any]:
    """Create a new staff member profile with auto-generated ID."""
    code = store_code.upper()
    if code not in STORE_CODE_TO_NAME:
        raise ValueError(f"Unknown store code: {store_code}")

    seq = next_id(db, STAFF_MEMBERS)
    staff_id = f"STF-{code}-{seq:04d}"
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "staff_id": staff_id,
        "store_code": code,
        "name": str(data["name"]).strip(),
        "role": str(data.get("role", "Floor Associate")).strip(),
        "department": str(data.get("department", "General")).strip(),
        "phone": str(data.get("phone", "")).strip(),
        "email": str(data.get("email", "")).strip() or None,
        "status": str(data.get("status", "ACTIVE")).strip().upper(),
        "joining_date": str(data.get("joining_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")).strip(),
        "shift_preference": str(data.get("shift_preference", "General")).strip(),
        "notes": str(data.get("notes", "")).strip(),
        "created_by": created_by,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    db[STAFF_MEMBERS].insert_one(doc)
    return _clean_doc(doc)  # type: ignore


def update_staff_member(
    db: Database,
    store_code: str,
    staff_id: str,
    updates: Dict[str, Any],
    updated_by: str = "system",
) -> Dict[str, Any]:
    """Update employee details, department, or status."""
    code = store_code.upper()
    sid = staff_id.strip()

    allowed_keys = {
        "name",
        "role",
        "department",
        "phone",
        "email",
        "status",
        "joining_date",
        "shift_preference",
        "notes",
    }
    cleaned_updates: Dict[str, Any] = {}
    for k, v in updates.items():
        if k in allowed_keys and v is not None:
            if k == "status":
                cleaned_updates[k] = str(v).strip().upper()
            else:
                cleaned_updates[k] = str(v).strip()

    cleaned_updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    cleaned_updates["updated_by"] = updated_by

    updated = db[STAFF_MEMBERS].find_one_and_update(
        {"store_code": code, "staff_id": sid},
        {"$set": cleaned_updates},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise ValueError(f"Staff member {sid} in store {code} not found.")

    return _clean_doc(updated)  # type: ignore


def get_daily_attendance(
    db: Database,
    store_code: str,
    date_str: str,
) -> Dict[str, Any]:
    """Retrieve full attendance list for store and date.

    Merges existing attendance records with active staff members so the manager
    can view and fill any unmarked entries smoothly.
    """
    code = store_code.upper()
    d_clean = date_str.strip()

    # Get active staff members for this store
    staff_cursor = db[STAFF_MEMBERS].find(
        {"store_code": code, "status": "ACTIVE"}
    ).sort("name", 1)
    staff_list = list(staff_cursor)

    # Get logged attendance records for this date
    att_cursor = db[STAFF_ATTENDANCE].find(
        {"store_code": code, "date": d_clean}
    )
    att_map = {doc["staff_id"]: doc for doc in att_cursor}

    merged = []
    for staff in staff_list:
        sid = staff["staff_id"]
        existing = att_map.get(sid)
        if existing:
            merged.append(
                {
                    "staff_id": sid,
                    "name": staff["name"],
                    "role": staff["role"],
                    "department": staff["department"],
                    "status": existing.get("status", "PRESENT"),
                    "shift": existing.get("shift", staff.get("shift_preference", "General")),
                    "check_in_time": existing.get("check_in_time", ""),
                    "check_out_time": existing.get("check_out_time", ""),
                    "remarks": existing.get("remarks", ""),
                    "is_logged": True,
                }
            )
        else:
            merged.append(
                {
                    "staff_id": sid,
                    "name": staff["name"],
                    "role": staff["role"],
                    "department": staff["department"],
                    "status": "UNMARKED",
                    "shift": staff.get("shift_preference", "General"),
                    "check_in_time": "",
                    "check_out_time": "",
                    "remarks": "",
                    "is_logged": False,
                }
            )

    return {
        "store_code": code,
        "date": d_clean,
        "total_active_staff": len(staff_list),
        "logged_count": len(att_map),
        "records": merged,
    }


def save_batch_attendance(
    db: Database,
    store_code: str,
    date_str: str,
    records: List[Dict[str, Any]],
    marked_by: str,
) -> List[Dict[str, Any]]:
    """Save or update attendance in batch for a date and store."""
    code = store_code.upper()
    d_clean = date_str.strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    saved = []

    valid_statuses = {"PRESENT", "ABSENT", "HALF_DAY", "WEEK_OFF", "PAID_LEAVE", "ON_LEAVE"}

    for item in records:
        sid = str(item["staff_id"]).strip()
        status = str(item.get("status", "PRESENT")).strip().upper()
        if status not in valid_statuses:
            status = "PRESENT"

        shift = str(item.get("shift", "General")).strip()
        cin = str(item.get("check_in_time") or "").strip()
        cout = str(item.get("check_out_time") or "").strip()
        remarks = str(item.get("remarks") or "").strip()

        doc = db[STAFF_ATTENDANCE].find_one_and_update(
            {"store_code": code, "date": d_clean, "staff_id": sid},
            {
                "$set": {
                    "status": status,
                    "shift": shift,
                    "check_in_time": cin,
                    "check_out_time": cout,
                    "remarks": remarks,
                    "marked_by": marked_by,
                    "updated_at": now_iso,
                },
                "$setOnInsert": {
                    "store_code": code,
                    "date": d_clean,
                    "staff_id": sid,
                    "created_at": now_iso,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        saved.append(_clean_doc(doc))

    return saved


def get_staff_summary(
    db: Database,
    store_code: Optional[str] = None,
    date_str: Optional[str] = None,
) -> Dict[str, Any]:
    """Compute staff and attendance metrics for KPI cards."""
    code = store_code.upper() if store_code and store_code.upper() in STORE_CODE_TO_NAME else None
    d_clean = (date_str or datetime.now(timezone.utc).strftime("%Y-%m-%d")).strip()

    staff_query: Dict[str, Any] = {}
    att_query: Dict[str, Any] = {"date": d_clean}
    if code:
        staff_query["store_code"] = code
        att_query["store_code"] = code

    total_staff = db[STAFF_MEMBERS].count_documents(staff_query)
    active_staff = db[STAFF_MEMBERS].count_documents({**staff_query, "status": "ACTIVE"})

    # Attendance breakdown
    pipeline = [
        {"$match": att_query},
        {
            "$group": {
                "_id": None,
                "present": {
                    "$sum": {"$cond": [{"$in": ["$status", ["PRESENT", "HALF_DAY"]]}, 1, 0]}
                },
                "absent": {"$sum": {"$cond": [{"$eq": ["$status", "ABSENT"]}, 1, 0]}},
                "leave": {
                    "$sum": {
                        "$cond": [{"$in": ["$status", ["PAID_LEAVE", "ON_LEAVE"]]}, 1, 0]
                    }
                },
                "morning_shift": {
                    "$sum": {"$cond": [{"$eq": ["$shift", "Morning"]}, 1, 0]}
                },
                "evening_shift": {
                    "$sum": {"$cond": [{"$eq": ["$shift", "Evening"]}, 1, 0]}
                },
            }
        },
    ]

    agg_res = list(db[STAFF_ATTENDANCE].aggregate(pipeline))
    att_stats = agg_res[0] if agg_res else {"present": 0, "absent": 0, "leave": 0, "morning_shift": 0, "evening_shift": 0}

    return {
        "store_code": code or "ALL",
        "date": d_clean,
        "total_staff": total_staff,
        "active_staff": active_staff,
        "present_today": int(att_stats.get("present") or 0),
        "absent_today": int(att_stats.get("absent") or 0),
        "leave_today": int(att_stats.get("leave") or 0),
        "morning_shift_count": int(att_stats.get("morning_shift") or 0),
        "evening_shift_count": int(att_stats.get("evening_shift") or 0),
    }

