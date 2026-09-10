import pytest
from fastapi.testclient import TestClient

from config.settings import DEFAULT_PASSWORDS
from db.models import BILLS, FOOTFALL, NOB, TARGETS, next_id


def test_history_endpoints(client: TestClient, db_session):
    # Seed bill, footfall, and nob entries
    db_session[BILLS].insert_one({
        "_id": next_id(db_session, BILLS),
        "store_code": "NM",
        "entry_date": "2026-08-20",
        "bill_time": "11:30",
        "net_amount": 1500.0,
        "bill_quantity": 3,
        "time_slot": "11:00 AM - 01:00 PM",
    })
    db_session[FOOTFALL].insert_one({
        "_id": next_id(db_session, FOOTFALL),
        "store_code": "NM",
        "entry_date": "2026-08-20",
        "entry_time": "11:20",
        "footfall": 10,
        "time_slot": "11:00 AM - 01:00 PM",
    })
    db_session[NOB].insert_one({
        "_id": next_id(db_session, NOB),
        "store_code": "NM",
        "entry_date": "2026-08-20",
        "entry_time": "11:30",
        "nob": 1,
        "time_slot": "11:00 AM - 01:00 PM",
    })

    # Log in as Manager NM
    resp = client.post(
        "/api/auth/login",
        json={"username": "CITIMART - NEW MARKET", "password": DEFAULT_PASSWORDS["CITIMART - NEW MARKET"]},
    )
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test history dates endpoint
    dates_resp = client.get("/api/daily/history/dates?store=NM", headers=headers)
    assert dates_resp.status_code == 200
    dates = dates_resp.json()
    assert any(d["date"] == "2026-08-20" for d in dates)

    # Test history details endpoint
    details_resp = client.get("/api/daily/history/details?store=NM&date=2026-08-20", headers=headers)
    assert details_resp.status_code == 200
    details = details_resp.json()
    assert details["store"] == "NM"
    assert details["date"] == "2026-08-20"
    assert len(details["bill_logs"]) == 1
    assert details["bill_logs"][0]["net_amount"] == 1500.0
    assert len(details["timeslot_breakdown"]) > 0
