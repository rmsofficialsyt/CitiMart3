"""AI Decision Advisor (src/advisor/, api/routes_advisor.py)."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pytest

from src import daily_dashboard_store as store_db
from src.advisor import engine
from src.advisor.pacing import expected_share_at, learn_pacing_curve

TODAY = date(2026, 11, 24)  # a Tuesday
SLOT_TIMES = (time(12, 0), time(15, 0), time(18, 0), time(21, 0))


def _ist(hh: int, mm: int, d: date = TODAY) -> datetime:
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=engine.IST)


def _seed_history(db, store="NM", weeks=3, slot_sales=(1000, 2000, 3000, 4000)):
    """`weeks` past Tuesdays with a 10/30/60/100% cumulative shape."""
    for w in range(1, weeks + 1):
        d = TODAY - timedelta(weeks=w)
        for t, amount in zip(SLOT_TIMES, slot_sales):
            store_db.add_bill_entry(db, store, d, t, amount, 2)


# ---------------------------------------------------------------- pacing

def test_curve_learned_from_same_weekday(db_session):
    _seed_history(db_session)
    curve = learn_pacing_curve(db_session, "NM", TODAY)
    assert curve["available"] and curve["source"] == "same_weekday" and curve["days_used"] == 3
    assert curve["cumulative_share"] == pytest.approx([0.1, 0.3, 0.6, 1.0])


def test_curve_insufficient_history_is_not_fabricated(db_session):
    _seed_history(db_session, weeks=2)
    curve = learn_pacing_curve(db_session, "NM", TODAY)
    context = curve.pop("context")
    assert curve == {"available": False, "source": None, "days_used": 2, "cumulative_share": None}
    # TODAY is Guru Nanak's Jayanti; with no past holiday Tuesdays nothing is matched.
    assert context == {"holiday": True, "rainy": None, "matched_on": []}


def test_curve_ignores_other_stores(db_session):
    _seed_history(db_session, store="HB")
    assert learn_pacing_curve(db_session, "NM", TODAY)["available"] is False


def test_expected_share_interpolates_within_slot():
    curve = [0.1, 0.3, 0.6, 1.0]
    assert expected_share_at(curve, 9 * 60) == 0.0           # before opening
    assert expected_share_at(curve, 15 * 60 + 30) == pytest.approx(0.2)  # half of 14:00-17:00
    assert expected_share_at(curve, 24 * 60) == 1.0


# ---------------------------------------------------------------- engine

def test_behind_pace_projection_and_conversion(db_session):
    _seed_history(db_session)
    store_db.set_store_target(db_session, "NM", TODAY, 10000)
    store_db.add_bill_entry(db_session, "NM", TODAY, time(12, 0), 500, 2)
    store_db.add_footfall_entry(db_session, "NM", TODAY, time(12, 0), 30)
    store_db.add_nob_entry(db_session, "NM", TODAY, time(12, 0), 1)

    adv = engine.build_advice(db_session, "NM", TODAY, now=_ist(15, 30))

    assert adv["day_status"] == "open"
    assert adv["pacing"]["expected_achievement_pct"] == pytest.approx(20.0)
    assert adv["projection"]["projected_close"] == pytest.approx(2500.0)
    assert adv["projection"]["remaining_to_target"] == 9500
    assert adv["projection"]["bills_needed_at_current_atv"] == 19
    ids = [i["id"] for i in adv["insights"]]
    assert ids[:2] == ["pace_behind", "conversion_low"]  # urgent first
    conv = next(i for i in adv["insights"] if i["id"] == "conversion_low")
    assert conv["evidence"]["status"] == "red"
    assert "atv_low" not in ids  # nob below the sample-size guard


def test_no_history_means_no_pace_call_and_no_projection(db_session):
    store_db.set_store_target(db_session, "NM", TODAY, 10000)
    store_db.add_bill_entry(db_session, "NM", TODAY, time(12, 0), 500, 2)
    adv = engine.build_advice(db_session, "NM", TODAY, now=_ist(15, 30))
    assert adv["pacing"]["available"] is False
    assert adv["projection"]["projected_close"] is None
    assert not {"pace_behind", "pace_ahead"} & {i["id"] for i in adv["insights"]}


def test_missing_target_is_flagged_not_zeroed(db_session):
    adv = engine.build_advice(db_session, "NM", TODAY, now=_ist(12, 0))
    ids = [i["id"] for i in adv["insights"]]
    assert "no_target" in ids and "balanced" in ids
    assert adv["projection"]["remaining_to_target"] is None


def test_data_gap_flags_completed_slot_with_footfall_but_no_bills(db_session):
    store_db.add_footfall_entry(db_session, "NM", TODAY, time(15, 0), 40)
    adv = engine.build_advice(db_session, "NM", TODAY, now=_ist(18, 30))
    gap = next(i for i in adv["insights"] if i["id"] == "data_gap")
    assert gap["evidence"]["slots"] == ["02.00 PM - 04.59 PM"]


def test_closed_past_day_has_no_pace_insights(db_session):
    _seed_history(db_session)
    past = TODAY - timedelta(days=1)
    store_db.set_store_target(db_session, "NM", past, 10000)
    store_db.add_bill_entry(db_session, "NM", past, time(12, 0), 500, 2)
    adv = engine.build_advice(db_session, "NM", past, now=_ist(10, 0))
    assert adv["day_status"] == "closed"
    assert adv["projection"]["projected_close"] == 500
    assert not {"pace_behind", "closing_gap", "data_gap"} & {i["id"] for i in adv["insights"]}


# ---------------------------------------------------------------- routes

@pytest.fixture()
def frozen_now(monkeypatch):
    monkeypatch.setattr("api.routes_advisor.ist_now", lambda: _ist(15, 30))
    monkeypatch.setattr("src.advisor.engine.ist_now", lambda: _ist(15, 30))


def test_manager_cannot_read_other_store(client, nw_headers):
    r = client.get("/api/advisor", params={"store": "HB", "date": TODAY.isoformat()}, headers=nw_headers)
    assert r.status_code == 403


def test_unauthenticated_rejected(client):
    assert client.get("/api/advisor", params={"store": "NM", "date": TODAY.isoformat()}).status_code == 401


def test_checklist_tick_persists_and_is_audited(client, nw_headers, frozen_now, db_session):
    body = {"store": "NM", "date": TODAY.isoformat(), "action_key": "task2", "done": True}
    r = client.put("/api/advisor/actions", json=body, headers=nw_headers)
    assert r.status_code == 200 and r.json()["done"] is True

    adv = client.get("/api/advisor", params={"store": "NM", "date": TODAY.isoformat()}, headers=nw_headers).json()
    task2 = next(c for c in adv["checklist"] if c["action_key"] == "task2")
    assert task2["done"] is True and task2["done_by"] == "CITIMART - NEW MARKET"

    r = client.put("/api/advisor/actions", json={**body, "done": False}, headers=nw_headers)
    assert r.json()["done"] is False and r.json()["done_by"] is None
    assert db_session["advisor_actions"].count_documents({}) == 1


@pytest.mark.parametrize(
    "patch, code",
    [
        ({"action_key": "drop_table"}, 400),
        ({"date": (TODAY - timedelta(days=1)).isoformat()}, 400),
        ({"store": "HB"}, 403),
        ({"store": "XX"}, 400),
    ],
)
def test_checklist_write_validation(client, nw_headers, frozen_now, patch, code):
    body = {"store": "NM", "date": TODAY.isoformat(), "action_key": "task1", "done": True, **patch}
    assert client.put("/api/advisor/actions", json=body, headers=nw_headers).status_code == code
