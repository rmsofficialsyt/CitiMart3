"""Unit & Security Tests for Staff Management (src/staff_store.py and api/routes_staff.py)."""
from __future__ import annotations

import mongomock
import pytest
from fastapi import HTTPException
from pymongo.database import Database

from api.auth import CurrentUser, require_store_access
from db.models import ensure_indexes
from src import staff_store


@pytest.fixture
def mock_db() -> Database:
    client = mongomock.MongoClient()
    db = client["citimart_test"]
    ensure_indexes(db)
    return db


def test_create_and_list_staff_member(mock_db: Database):
    data = {
        "name": "Subhashish Roy",
        "role": "Cashier",
        "department": "Billing Desk",
        "phone": "9830012345",
        "email": "subhashish@citimart.in",
        "status": "ACTIVE",
        "joining_date": "2026-01-15",
        "shift_preference": "Morning",
    }

    created = staff_store.create_staff_member(
        db=mock_db,
        store_code="NM",
        data=data,
        created_by="mgr_nm",
    )
    assert created["name"] == "Subhashish Roy"
    assert created["store_code"] == "NM"
    assert created["staff_id"].startswith("STF-NM-")

    # List staff
    res = staff_store.list_staff(mock_db, store_code="NM", search="Subhashish")
    assert res["total"] == 1
    assert res["items"][0]["staff_id"] == created["staff_id"]


def test_update_staff_member(mock_db: Database):
    created = staff_store.create_staff_member(
        db=mock_db,
        store_code="NM",
        data={
            "name": "Debabrata Das",
            "role": "Floor Associate",
            "department": "Menswear",
            "phone": "9832233445",
        },
        created_by="mgr_nm",
    )
    staff_id = created["staff_id"]

    updated = staff_store.update_staff_member(
        db=mock_db,
        store_code="NM",
        staff_id=staff_id,
        updates={"role": "Department Supervisor", "status": "ACTIVE"},
        updated_by="mgr_nm",
    )
    assert updated["role"] == "Department Supervisor"


def test_attendance_merging_and_batch_submission(mock_db: Database):
    # 1. Add 2 staff members in NM
    s1 = staff_store.create_staff_member(
        db=mock_db,
        store_code="NM",
        data={"name": "Alice Ghosh", "role": "Cashier", "department": "Cash Counter", "phone": "9830011111"},
        created_by="mgr_nm",
    )
    s2 = staff_store.create_staff_member(
        db=mock_db,
        store_code="NM",
        data={"name": "Bob Sen", "role": "Floor Associate", "department": "Sarees", "phone": "9830022222"},
        created_by="mgr_nm",
    )

    date_str = "2026-11-03"

    # 2. Daily attendance fetches active staff even if unlogged
    att_view = staff_store.get_daily_attendance(mock_db, "NM", date_str)
    assert att_view["total_active_staff"] == 2
    assert att_view["logged_count"] == 0
    assert len(att_view["records"]) == 2
    assert att_view["records"][0]["status"] == "UNMARKED"

    # 3. Save batch attendance
    batch_records = [
        {
            "staff_id": s1["staff_id"],
            "status": "PRESENT",
            "shift": "Morning",
            "check_in_time": "09:45",
            "check_out_time": "18:00",
            "remarks": "On time",
        },
        {
            "staff_id": s2["staff_id"],
            "status": "ABSENT",
            "shift": "Evening",
            "check_in_time": "",
            "check_out_time": "",
            "remarks": "Sick leave requested",
        },
    ]

    saved = staff_store.save_batch_attendance(
        db=mock_db,
        store_code="NM",
        date_str=date_str,
        records=batch_records,
        marked_by="mgr_nm",
    )
    assert len(saved) == 2

    # 4. Summary metrics
    summary = staff_store.get_staff_summary(mock_db, "NM", date_str)
    assert summary["total_staff"] == 2
    assert summary["present_today"] == 1
    assert summary["absent_today"] == 1
    assert summary["morning_shift_count"] == 1


def test_staff_multi_tenant_authorization():
    nm_user = CurrentUser(sub="u1", username="mgr_nm", role="manager", store_code="NM")
    admin_user = CurrentUser(sub="u0", username="admin", role="admin", store_code=None)

    # Manager allowed on own store
    assert require_store_access("NM", nm_user).store_code == "NM"

    # Manager forbidden from other store
    with pytest.raises(HTTPException) as exc_info:
        require_store_access("CHW", nm_user)
    assert exc_info.value.status_code == 403

    # Admin allowed on any store
    assert require_store_access("CHW", admin_user).role == "admin"
