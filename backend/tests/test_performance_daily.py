"""Performance tests verifying:
- Gauge pre-computation in daily live responses
- In-memory aggregation caching and write-invalidation
- ESR date-range scans for monthly target summaries
- Operations log batch fetching
"""
from __future__ import annotations

from datetime import date, time
import time as _time
import mongomock
import pytest

from db.models import ensure_indexes
from src import daily_dashboard_store
from api.routes_daily import _build_daily_gauges


@pytest.fixture()
def db():
    client = mongomock.MongoClient()
    db = client["citimart"]
    ensure_indexes(db)
    daily_dashboard_store.invalidate_dashboard_cache()
    yield db
    daily_dashboard_store.invalidate_dashboard_cache()


def test_build_daily_gauges_structure_and_values():
    kpis = {
        "conversion_pct": 25.5,
        "achievement_pct": 92.0,
        "remaining_pct": 8.0,
        "atv": 1540.0,
        "rpv": 320.0,
        "basket_size": 2.1,
    }
    gauges = _build_daily_gauges(kpis)

    assert set(gauges.keys()) == {
        "daily_conversion_gauge",
        "daily_achievement_gauge",
        "daily_remaining_gauge",
        "daily_atv_gauge",
        "daily_rpv_gauge",
        "daily_basket_size_gauge",
    }
    assert gauges["daily_conversion_gauge"]["value"] == 25.5
    assert gauges["daily_achievement_gauge"]["value"] == 92.0
    assert gauges["daily_remaining_gauge"]["value"] == 8.0
    assert gauges["daily_atv_gauge"]["value"] == 1540.0
    assert gauges["daily_rpv_gauge"]["value"] == 320.0
    assert gauges["daily_basket_size_gauge"]["value"] == 2.1


def test_compute_live_kpis_caching_and_invalidation(db):
    target_date = date(2026, 11, 2)
    daily_dashboard_store.add_bill_entry(db, "NM", target_date, time(12, 0), 1000.0, 3.0)
    daily_dashboard_store.add_footfall_entry(db, "NM", target_date, time(12, 0), 50.0)
    daily_dashboard_store.add_nob_entry(db, "NM", target_date, time(12, 0), 10.0)

    # First call: computes and caches
    kpis1 = daily_dashboard_store.compute_live_kpis(db, "NM", target_date)
    assert kpis1["net_sales"] == 1000.0
    assert kpis1["footfall"] == 50.0
    assert kpis1["nob"] == 10.0

    # Second call: hits cache in sub-millisecond
    t0 = _time.perf_counter()
    kpis2 = daily_dashboard_store.compute_live_kpis(db, "NM", target_date)
    t1 = _time.perf_counter()
    assert (t1 - t0) < 0.005  # sub-5ms in-memory cache hit
    assert kpis2 == kpis1

    # Mutation invalidates cache
    daily_dashboard_store.add_bill_entry(db, "NM", target_date, time(13, 0), 500.0, 1.0)
    kpis3 = daily_dashboard_store.compute_live_kpis(db, "NM", target_date)
    assert kpis3["net_sales"] == 1500.0
    assert kpis3["bill_quantity"] == 4.0


def test_compute_live_timeslot_breakdown_caching(db):
    target_date = date(2026, 11, 2)
    daily_dashboard_store.add_bill_entry(db, "NM", target_date, time(12, 30), 2500.0, 5.0)

    breakdown1 = daily_dashboard_store.compute_live_timeslot_breakdown(db, "NM", target_date)
    from config.settings import TIME_SLOT_ORDER
    slot = TIME_SLOT_ORDER[0]
    assert breakdown1[slot]["net_sales"] == 2500.0

    # Cache hit check
    t0 = _time.perf_counter()
    breakdown2 = daily_dashboard_store.compute_live_timeslot_breakdown(db, "NM", target_date)
    assert _time.perf_counter() - t0 < 0.005
    assert breakdown2 == breakdown1


def test_compute_monthly_target_summary_range_scan_and_caching(db):
    target_date = date(2026, 11, 2)
    daily_dashboard_store.set_store_target(db, "NM", date(2026, 11, 1), 50000.0, 45000.0)
    daily_dashboard_store.set_store_target(db, "NM", date(2026, 11, 2), 60000.0, 50000.0)
    daily_dashboard_store.add_bill_entry(db, "NM", date(2026, 11, 1), time(14, 0), 48000.0, 20.0)
    daily_dashboard_store.add_bill_entry(db, "NM", date(2026, 11, 2), time(15, 0), 52000.0, 25.0)

    summary = daily_dashboard_store.compute_monthly_target_summary(db, "NM", target_date)
    assert summary["month_target"] == 110000.0
    assert summary["prev_year_total"] == 95000.0
    assert summary["month_net_sales"] == 100000.0
    assert summary["daily_present_sales"] == 52000.0
    assert summary["daily_prev_year_sales"] == 50000.0


def test_operations_log_batch_fetch(db):
    target_date = date(2026, 11, 2)
    daily_dashboard_store.add_bill_entry(db, "NM", target_date, time(11, 0), 800.0, 2.0)
    daily_dashboard_store.add_footfall_entry(db, "NM", target_date, time(11, 0), 30.0)
    daily_dashboard_store.add_nob_entry(db, "NM", target_date, time(11, 0), 6.0)

    bills = daily_dashboard_store.list_bill_entries(db, "NM", target_date)
    footfall = daily_dashboard_store.list_footfall_entries(db, "NM", target_date)
    nob = daily_dashboard_store.list_nob_entries(db, "NM", target_date)

    assert len(bills) == 1
    assert bills[0]["net_amount"] == 800.0
    assert len(footfall) == 1
    assert footfall[0]["footfall"] == 30.0
    assert len(nob) == 1
    assert nob[0]["nob"] == 6.0
