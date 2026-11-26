"""Advisor Tier 2: slot anomalies, bill mix, staffing, stock, context pacing."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

import pytest

from db.models import STAFF_ATTENDANCE, STAFF_MEMBERS, STOCK_INVENTORY
from src import daily_dashboard_store as store_db
from src.advisor import anomalies, engine, staffing, stock_signals
from src.advisor.pacing import learn_pacing_curve
from src.daily_context import WeatherReading

TODAY = date(2026, 11, 24)  # a Tuesday (also Guru Nanak's Jayanti)
SLOT1 = "11.00 AM - 01.59 PM"
SLOT2 = "02.00 PM - 04.59 PM"


def _ist(hh: int, mm: int, d: date = TODAY) -> datetime:
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=engine.IST)


def _minutes(hh: int, mm: int) -> int:
    return hh * 60 + mm


def _slot1_day(db, d, *, sales=1000.0, nob=10, footfall=20, store="NM"):
    store_db.add_bill_entry(db, store, d, time(12, 30), sales, 2)
    store_db.add_nob_entry(db, store, d, time(12, 30), nob)
    store_db.add_footfall_entry(db, store, d, time(12, 30), footfall)


def _baseline(db, weeks=3, **kw):
    for w in range(1, weeks + 1):
        _slot1_day(db, TODAY - timedelta(weeks=w), **kw)


# ---------------------------------------------------------------- anomalies

def test_conversion_leak_flags_footfall_spike_with_flat_nob(db_session):
    _baseline(db_session)  # slot1: 20 footfall, 10 NOB
    _slot1_day(db_session, TODAY, footfall=40, nob=5)
    ins = anomalies.slot_anomalies(db_session, "NM", TODAY, _minutes(15, 30))
    leak = next(i for i in ins if i["id"] == "conversion_leak")
    assert leak["evidence"]["slot"] == SLOT1
    assert leak["evidence"]["footfall"] == 40 and leak["evidence"]["baseline_footfall"] == 20
    assert leak["evidence"]["baseline_days"] == 3


def test_atv_drop_vs_same_slot_norm(db_session):
    _baseline(db_session, sales=4000, nob=4)       # ATV 1000
    _slot1_day(db_session, TODAY, sales=2000, nob=4)  # ATV 500
    drop = next(i for i in anomalies.slot_anomalies(db_session, "NM", TODAY, _minutes(15, 30)) if i["id"] == "atv_drop")
    assert drop["evidence"]["atv"] == 500 and drop["evidence"]["baseline_atv"] == 1000
    assert drop["evidence"]["drop_pct"] == pytest.approx(50.0)


def test_anomalies_need_baseline_history(db_session):
    _baseline(db_session, weeks=1)
    _slot1_day(db_session, TODAY, footfall=200, nob=1)
    assert anomalies.slot_anomalies(db_session, "NM", TODAY, _minutes(15, 30)) == []


def test_unfinished_slot_is_not_judged_early(db_session):
    _baseline(db_session)
    _slot1_day(db_session, TODAY, footfall=40, nob=5)
    # 11:00 -> only ~14% of slot 1 elapsed
    assert anomalies.slot_anomalies(db_session, "NM", TODAY, _minutes(11, 0)) == []


def test_dead_hours_flags_usual_hour_with_no_bills(db_session):
    _baseline(db_session)  # bills at 12:30 on 3 past Tuesdays
    store_db.add_bill_entry(db_session, "NM", TODAY, time(11, 15), 300, 1)
    dead = anomalies.dead_hours(db_session, "NM", TODAY, _minutes(14, 10))
    assert dead["evidence"]["hours"] == ["12:00"]


def test_bill_mix_small_heavy_and_big_bill(db_session):
    for i in range(30):
        store_db.add_bill_entry(db_session, "NM", TODAY - timedelta(days=1 + i % 20), time(12, 0), 1000, 2)
    for _ in range(5):
        store_db.add_bill_entry(db_session, "NM", TODAY, time(12, 0), 200, 1)
    store_db.add_bill_entry(db_session, "NM", TODAY, time(13, 0), 9000, 3)

    block, ins = anomalies.bill_mix(db_session, "NM", TODAY, expected_achievement_pct=None, sales_target=None)
    by_id = {i["id"]: i for i in ins}
    assert block["today_bills"] == 6 and block["norm_bills"] == 30
    small = next(b for b in block["bands"] if b["band"] == "under_500")
    assert small["today_count"] == 5 and small["norm_share_pct"] == 0
    assert "mix_small_heavy" in by_id
    assert by_id["big_bill"]["evidence"]["net_sales_without"] == 1000
    assert by_id["big_bill"]["severity"] == "info"  # no target -> cannot say it hides a weak day


def test_bill_mix_without_norm_gives_no_mix_call(db_session):
    for _ in range(6):
        store_db.add_bill_entry(db_session, "NM", TODAY, time(12, 0), 200, 1)
    block, ins = anomalies.bill_mix(db_session, "NM", TODAY, None, None)
    assert block["norm_available"] is False
    assert all(b["norm_share_pct"] is None for b in block["bands"])
    assert not {"mix_small_heavy", "mix_large_heavy"} & {i["id"] for i in ins}


# ---------------------------------------------------------------- staffing

def _staff(db, sid, check_in="", check_out="", status="PRESENT", store="NM", d=TODAY):
    db[STAFF_MEMBERS].insert_one({"store_code": store, "staff_id": sid, "name": sid, "role": "Sales",
                                  "department": "Floor", "status": "ACTIVE"})
    db[STAFF_ATTENDANCE].insert_one({"store_code": store, "date": d.isoformat(), "staff_id": sid, "status": status,
                                     "check_in_time": check_in, "check_out_time": check_out})


def test_understaffed_peak_from_attendance_times(db_session):
    _staff(db_session, "S1", "10:30", "15:00")
    _staff(db_session, "S2", "10:30", "15:00")
    _staff(db_session, "S3", "14:00", "23:00")
    store_db.add_footfall_entry(db_session, "NM", TODAY, time(12, 0), 20)
    store_db.add_footfall_entry(db_session, "NM", TODAY, time(14, 30), 90)

    block, ins = staffing.staffing_signals(db_session, "NM", TODAY, _minutes(15, 30))
    staff_by_slot = {r["slot"]: r["staff"] for r in block["slots"]}
    assert staff_by_slot[SLOT1] == 2 and staff_by_slot[SLOT2] == 3
    assert block["times_known"] is True
    peak = next(i for i in ins if i["id"] == "understaffed_peak")
    assert peak["evidence"]["slot"] == SLOT2 and peak["severity"] == "urgent"
    assert peak["evidence"]["footfall_per_staff"] == 30


def test_attendance_missing_nudge(db_session):
    db_session[STAFF_MEMBERS].insert_one({"store_code": "NM", "staff_id": "S1", "name": "A", "status": "ACTIVE"})
    block, ins = staffing.staffing_signals(db_session, "NM", TODAY, _minutes(12, 0))
    assert block["available"] is False
    assert [i["id"] for i in ins] == ["attendance_missing"]


def test_staffing_ignores_other_stores(db_session):
    _staff(db_session, "H1", "10:30", "23:00", store="HB")
    block, ins = staffing.staffing_signals(db_session, "NM", TODAY, _minutes(12, 0))
    assert block["present"] == 0 and ins == []


# ---------------------------------------------------------------- stock

NOW_UTC = datetime(2026, 11, 24, 9, 0, tzinfo=timezone.utc)


def _inv(db, store, barcode, stock, reorder=5, restocked="2026-09-01T00:00:00+00:00"):
    db[STOCK_INVENTORY].insert_one({"store_code": store, "barcode": barcode, "item_name": f"Item {barcode}",
                                    "department": "Mens", "current_stock": stock, "reorder_level": reorder,
                                    "last_restocked_at": restocked})


def test_stock_signals_and_transfer_directions(db_session):
    _inv(db_session, "NM", "B1", 0)     # NM out
    _inv(db_session, "HB", "B1", 30)    # HB surplus
    _inv(db_session, "NM", "B2", 50)    # NM surplus, slow mover
    _inv(db_session, "CHW", "B2", 1)    # CHW short

    block, ins = stock_signals.stock_signals(db_session, "NM", now=NOW_UTC)
    ids = {i["id"] for i in ins}
    assert {"stock_out", "slow_movers", "transfer_suggested"} <= ids
    inbound = next(t for t in block["transfers"] if t["direction"] == "inbound")
    outbound = next(t for t in block["transfers"] if t["direction"] == "outbound")
    assert (inbound["from_store"], inbound["to_store"], inbound["quantity"]) == ("HB", "NM", 6)
    assert "from_stock" not in inbound  # a manager never sees another store's stock level
    assert (outbound["from_store"], outbound["to_store"], outbound["quantity"]) == ("NM", "CHW", 5)
    assert [s["barcode"] for s in block["slow_movers"]] == ["B2"]


def test_open_transfer_suppresses_duplicate_suggestion(db_session):
    _inv(db_session, "NM", "B1", 0)
    _inv(db_session, "HB", "B1", 30)
    db_session["stock_transfers"].insert_one({"transfer_id": "T1", "from_store": "HB", "to_store": "NM",
                                              "status": "INITIATED", "items": [{"barcode": "B1", "quantity": 6}]})
    block, _ = stock_signals.stock_signals(db_session, "NM", now=NOW_UTC)
    assert block["transfers"] == []


def test_no_inventory_means_no_stock_insights(db_session):
    block, ins = stock_signals.stock_signals(db_session, "NM", now=NOW_UTC)
    assert block["available"] is False and ins == []


def test_stock_is_today_only_in_advice(db_session):
    _inv(db_session, "NM", "B1", 0)
    past = engine.build_advice(db_session, "NM", TODAY - timedelta(days=1), now=_ist(12, 0))
    assert past["stock"]["available"] is False
    assert "stock_out" not in {i["id"] for i in past["insights"]}
    live = engine.build_advice(db_session, "NM", TODAY, now=_ist(12, 0))
    assert "stock_out" in {i["id"] for i in live["insights"]}
    assert "stock_out" in {c["action_key"] for c in live["checklist"]}


# ---------------------------------------------------------------- context

def test_rainy_day_uses_rainy_same_weekdays(db_session, monkeypatch):
    target = date(2026, 11, 17)  # ordinary Tuesday
    rainy_days = {target, target - timedelta(weeks=1), target - timedelta(weeks=2)}
    monkeypatch.setattr(
        "src.advisor.context.weather_lookup",
        lambda d: WeatherReading("Rain", 28, 22, 20.0 if d in rainy_days else 0.0),
    )
    slots = (time(12, 0), time(15, 0), time(18, 0), time(21, 0))
    for w, shape in ((1, (5000, 2000, 2000, 1000)), (2, (5000, 2000, 2000, 1000)),
                     (3, (1000, 2000, 3000, 4000)), (4, (1000, 2000, 3000, 4000))):
        for t, amount in zip(slots, shape):
            store_db.add_bill_entry(db_session, "NM", target - timedelta(weeks=w), t, amount, 1)

    curve = learn_pacing_curve(db_session, "NM", target)
    assert curve["source"] == "similar_days" and curve["days_used"] == 2
    assert curve["context"]["matched_on"] == ["rain"]
    assert curve["cumulative_share"] == pytest.approx([0.5, 0.7, 0.9, 1.0])


def test_weather_unknown_falls_back_to_same_weekday(db_session):
    target = date(2026, 11, 17)
    for w in range(1, 4):
        store_db.add_bill_entry(db_session, "NM", target - timedelta(weeks=w), time(12, 0), 1000, 1)
    curve = learn_pacing_curve(db_session, "NM", target)
    assert curve["source"] == "same_weekday" and curve["context"]["rainy"] is None


# ---------------------------------------------------------------- route

def test_advice_route_carries_tier2_blocks(client, nw_headers):
    r = client.get("/api/advisor", params={"store": "NM", "date": TODAY.isoformat()}, headers=nw_headers)
    assert r.status_code == 200
    body = r.json()
    assert {"bill_mix", "staffing", "stock", "outcomes"} <= body.keys()
    assert "context" in body["pacing"]
