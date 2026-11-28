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


def test_batch_attendance_rejects_foreign_staff_id_atomically(client, db_session):
    from db.models import STAFF_ATTENDANCE
    from src.time_utils import ist_today
    from tests.conftest import make_token

    nm_staff = staff_store.create_staff_member(
        db=db_session,
        store_code="NM",
        data={"name": "NM Person", "role": "Cashier", "department": "Billing", "phone": "9830011111"},
        created_by="mgr_nm",
    )
    hb_staff = staff_store.create_staff_member(
        db=db_session,
        store_code="HB",
        data={"name": "HB Person", "role": "Cashier", "department": "Billing", "phone": "9830022222"},
        created_by="mgr_hb",
    )
    mgr_nm = make_token("manager", "NM", "mgr_nm")
    today = ist_today().isoformat()

    res = client.post(
        "/api/daily/staff/attendance/batch",
        json={
            "store_code": "NM",
            "date": today,
            "records": [
                {"staff_id": nm_staff["staff_id"], "status": "PRESENT"},
                {"staff_id": hb_staff["staff_id"], "status": "PRESENT"},
            ],
        },
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert res.status_code == 400
    assert db_session[STAFF_ATTENDANCE].count_documents({"store_code": "NM", "date": today}) == 0


def test_attendance_edit_window_and_admin_override_audit(client, db_session):
    from datetime import timedelta
    from src.time_utils import ist_today
    from tests.conftest import make_token

    s = staff_store.create_staff_member(
        db=db_session,
        store_code="NM",
        data={"name": "Window Staff", "role": "Cashier", "department": "Billing", "phone": "9830033333"},
        created_by="mgr_nm",
    )
    mgr_nm = make_token("manager", "NM", "mgr_nm")
    admin = make_token("admin", None, "admin")
    today = ist_today()

    # today - 3 -> 200 for manager
    r_ok = client.post(
        "/api/daily/staff/attendance/batch",
        json={"store_code": "NM", "date": (today - timedelta(days=3)).isoformat(), "records": [{"staff_id": s["staff_id"], "status": "PRESENT"}]},
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert r_ok.status_code == 200

    # today - 4 -> 403 for manager
    r_locked = client.post(
        "/api/daily/staff/attendance/batch",
        json={"store_code": "NM", "date": (today - timedelta(days=4)).isoformat(), "records": [{"staff_id": s["staff_id"], "status": "PRESENT"}]},
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert r_locked.status_code == 403

    # tomorrow -> 400 for everyone
    r_future = client.post(
        "/api/daily/staff/attendance/batch",
        json={"store_code": "NM", "date": (today + timedelta(days=1)).isoformat(), "records": [{"staff_id": s["staff_id"], "status": "PRESENT"}]},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert r_future.status_code == 400

    # Admin today - 30 -> 200 and audit event recorded
    r_admin = client.post(
        "/api/daily/staff/attendance/batch",
        json={"store_code": "NM", "date": (today - timedelta(days=30)).isoformat(), "records": [{"staff_id": s["staff_id"], "status": "PRESENT"}]},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert r_admin.status_code == 200
    from db.models import AUDIT_LOGS
    assert db_session[AUDIT_LOGS].count_documents({"action": "staff.attendance.override"}) == 1


def test_staff_summary_uses_ist_date_at_0030_ist(mock_db: Database, monkeypatch):
    from datetime import date as date_type

    monkeypatch.setattr(staff_store, "ist_today", lambda: date_type(2026, 11, 28))
    summary = staff_store.get_staff_summary(mock_db, store_code="NM")
    assert summary["date"] == "2026-11-28"


def test_manager_cannot_create_or_modify_store_manager_role(client, db_session):
    from tests.conftest import make_token

    mgr_nm = make_token("manager", "NM", "mgr_nm")
    admin = make_token("admin", None, "admin")

    res = client.post(
        "/api/daily/staff/members",
        json={
            "store_code": "NM",
            "name": "Fake Boss",
            "role": "Store Manager",
            "department": "Management",
            "phone": "9830044444",
        },
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert res.status_code == 403

    # Admin creates Store Manager; manager cannot demote them
    created = client.post(
        "/api/daily/staff/members",
        json={
            "store_code": "NM",
            "name": "Real Boss",
            "role": "Store Manager",
            "department": "Management",
            "phone": "9830055555",
        },
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert created.status_code == 200
    sid = created.json()["staff"]["staff_id"]

    demote = client.put(
        f"/api/daily/staff/members/{sid}?store_code=NM",
        json={"role": "Cashier"},
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert demote.status_code == 403


def test_staff_list_masks_pii_for_managers_and_single_get_audits(client, db_session):
    from tests.conftest import make_token

    mgr_nm = make_token("manager", "NM", "mgr_nm")
    admin = make_token("admin", None, "admin")
    created = staff_store.create_staff_member(
        db=db_session,
        store_code="NM",
        data={
            "name": "PII Staff",
            "role": "Cashier",
            "department": "Billing",
            "phone": "9830098765",
            "email": "pii@citimart.in",
        },
        created_by="admin",
    )
    sid = created["staff_id"]

    mgr_list = client.get("/api/daily/staff/members?store_code=NM", headers={"Authorization": f"Bearer {mgr_nm}"})
    assert mgr_list.status_code == 200
    item_mgr = mgr_list.json()["items"][0]
    assert item_mgr["phone"] == "••••••8765"
    assert "email" not in item_mgr

    adm_list = client.get("/api/daily/staff/members?store_code=NM", headers={"Authorization": f"Bearer {admin}"})
    assert adm_list.status_code == 200
    item_adm = adm_list.json()["items"][0]
    assert item_adm["phone"] == "9830098765"
    assert item_adm["email"] == "pii@citimart.in"

    detail = client.get(f"/api/daily/staff/members/{sid}?store_code=NM", headers={"Authorization": f"Bearer {mgr_nm}"})
    assert detail.status_code == 200
    assert detail.json()["phone"] == "9830098765"
    assert detail.json()["email"] == "pii@citimart.in"
    from db.models import AUDIT_LOGS
    log = db_session[AUDIT_LOGS].find_one({"action": "staff.contact.view", "target": sid})
    assert log is not None
    assert "9830098765" not in str(log)
