"""Tests for Granular Historical Sales, Natural Date Tokenizer, and Multi-Agent DB Alignment."""
from __future__ import annotations

from datetime import date, timedelta
import pytest
from mongomock import MongoClient

from config.settings import TIME_SLOT_ORDER
from db.models import BILLS, FOOTFALL, NOB, TARGETS
from src.chat.coordinator import run_copilot_turn
from src.chat.state import SecurityContext
from src.chat.tools.history_tools import (
    compare_same_day_prior_weeks,
    get_best_and_worst_days_in_month,
    get_database_date_range,
    get_exact_day_granular_kpis,
    get_month_to_date_granular_summary,
    get_recent_daily_history_table,
    resolve_query_target_date,
)


@pytest.fixture
def mock_db():
    """Populate mock database with realistic multi-day records."""
    client = MongoClient()
    db = client["citimart_test"]

    # Populate 10 consecutive operating days for NM and HB
    base_date = date(2026, 11, 10)
    for i in range(9):
        d_iso = (base_date + timedelta(days=i)).isoformat()
        # NM bills
        db[BILLS].insert_one({
            "store_code": "NM",
            "entry_date": d_iso,
            "bill_time": "12:30",
            "time_slot": TIME_SLOT_ORDER[0],
            "net_amount": 100000.0 + (i * 10000.0),
            "bill_quantity": 100 + i * 5,
        })
        db[BILLS].insert_one({
            "store_code": "NM",
            "entry_date": d_iso,
            "bill_time": "18:45",
            "time_slot": TIME_SLOT_ORDER[2],
            "net_amount": 150000.0 + (i * 5000.0),
            "bill_quantity": 150 + i * 5,
        })
        # NM footfall
        db[FOOTFALL].insert_one({
            "store_code": "NM",
            "entry_date": d_iso,
            "entry_time": "12:00",
            "time_slot": TIME_SLOT_ORDER[0],
            "footfall": 250,
        })
        db[FOOTFALL].insert_one({
            "store_code": "NM",
            "entry_date": d_iso,
            "entry_time": "18:00",
            "time_slot": TIME_SLOT_ORDER[2],
            "footfall": 350,
        })
        # NM nob
        db[NOB].insert_one({
            "store_code": "NM",
            "entry_date": d_iso,
            "entry_time": "12:00",
            "time_slot": TIME_SLOT_ORDER[0],
            "nob": 100,
        })
        db[NOB].insert_one({
            "store_code": "NM",
            "entry_date": d_iso,
            "entry_time": "18:00",
            "time_slot": TIME_SLOT_ORDER[2],
            "nob": 150,
        })
        # NM target
        db[TARGETS].insert_one({
            "store_code": "NM",
            "entry_date": d_iso,
            "sales_target": 250000.0,
        })

    return db


def test_resolve_query_target_date_natural_phrases(mock_db):
    """Test date resolver handles natural text dates, yesterday, and ISO strings."""
    today = date(2026, 11, 19)

    # Yesterday
    d, reason = resolve_query_target_date(mock_db, "NM", "What was yesterday's sales?", default_date=today)
    assert d == date(2026, 11, 18)
    assert "Yesterday" in reason

    # ISO date
    d, reason = resolve_query_target_date(mock_db, "NM", "Show sales for 2026-11-15", default_date=today)
    assert d == date(2026, 11, 15)
    assert "Explicit date" in reason

    # Natural English date: 14th nov
    d, reason = resolve_query_target_date(mock_db, "NM", "Give me report for 14th nov", default_date=today)
    assert d == date(2026, 11, 14)

    # Bengali yesterday: গতকালের সেলস
    d, reason = resolve_query_target_date(mock_db, "NM", "গতকালের সেলস কত ছিল?", default_date=today)
    assert d == date(2026, 11, 18)

    # Hindi yesterday: कल की बिक्री
    d, reason = resolve_query_target_date(mock_db, "NM", "कल की कुल बिक्री और टारगेट क्या था?", default_date=today)
    assert d == date(2026, 11, 18)


def test_get_database_date_range(mock_db):
    """Test calendar metadata bounds across MongoDB."""
    cal = get_database_date_range(mock_db, "NM")
    assert cal["earliest_date"] == "2026-11-10"
    assert cal["latest_date"] == "2026-11-18"
    assert cal["total_operating_days"] == 9


def test_get_exact_day_granular_kpis(mock_db):
    """Test comprehensive single-day KPIs including 4 time-slots and peak slot."""
    sec_nm = SecurityContext(
        user_id="user1",
        username="manager_nm",
        role="store_manager",
        store_code="NM",
        allowed_stores=["NM"],
        is_admin=False,
    )
    target_d = date(2026, 11, 18)

    res = get_exact_day_granular_kpis(mock_db, "NM", target_d, sec_nm)
    assert res["store_code"] == "NM"
    assert res["date"] == "2026-11-18"
    assert res["kpis"]["net_sales"] > 0
    assert "timeslot_breakdown" in res
    assert TIME_SLOT_ORDER[0] in res["timeslot_breakdown"]
    assert TIME_SLOT_ORDER[2] in res["timeslot_breakdown"]
    assert res["peak_slot"]["net_sales"] > 0

    # RBAC protection: NM manager cannot query HB
    res_hb = get_exact_day_granular_kpis(mock_db, "HB", target_d, sec_nm)
    assert res_hb["error"] == "ACCESS_DENIED"


def test_get_recent_daily_history_table(mock_db):
    """Test 7-day tabular summary generation with totals and daily averages."""
    sec_nm = SecurityContext(
        user_id="user1",
        username="manager_nm",
        role="store_manager",
        store_code="NM",
        allowed_stores=["NM"],
        is_admin=False,
    )
    table_data = get_recent_daily_history_table(mock_db, "NM", days=7, sec_ctx=sec_nm)

    assert table_data["days_found"] == 7
    assert len(table_data["rows"]) == 7
    assert table_data["totals"]["net_sales"] > 0
    assert table_data["averages"]["daily_sales"] > 0
    assert table_data["averages"]["conversion_pct"] > 0


def test_get_month_to_date_granular_summary(mock_db):
    """Test MTD cumulative tracking and daily required run-rates."""
    sec_nm = SecurityContext(
        user_id="user1",
        username="manager_nm",
        role="store_manager",
        store_code="NM",
        allowed_stores=["NM"],
        is_admin=False,
    )
    target_d = date(2026, 11, 18)

    mtd = get_month_to_date_granular_summary(mock_db, "NM", target_d, sec_nm)
    assert mtd["store_code"] == "NM"
    assert mtd["active_operating_days"] == 9
    assert mtd["mtd_sales"] > 0
    assert mtd["mtd_target"] > 0
    assert mtd["days_remaining"] > 0


def test_get_best_and_worst_days_in_month(mock_db):
    """Test discovery of best peak day and lowest dip day."""
    sec_nm = SecurityContext(
        user_id="user1",
        username="manager_nm",
        role="store_manager",
        store_code="NM",
        allowed_stores=["NM"],
        is_admin=False,
    )
    target_d = date(2026, 11, 18)

    pd = get_best_and_worst_days_in_month(mock_db, "NM", target_d, sec_nm)
    assert "best_day" in pd
    assert "worst_day" in pd
    assert pd["best_day"]["net_sales"] >= pd["worst_day"]["net_sales"]


def test_run_copilot_turn_with_history_query(mock_db):
    """Test end-to-end coordinator execution for 'yesterday' and '7-day table'."""
    sec_nm = SecurityContext(
        user_id="user1",
        username="manager_nm",
        role="store_manager",
        store_code="NM",
        allowed_stores=["NM"],
        is_admin=False,
    )

    # Query 1: Yesterday's sales
    resp1 = run_copilot_turn(
        db=mock_db,
        query="What was yesterday's sales report with timeslots?",
        sec_ctx=sec_nm,
        target_date=date(2026, 11, 19),
        language="en",
    )
    assert "2026-11-18" in resp1.target_date
    assert "history_tools" in resp1.tools_executed
    assert "Net Sales" in resp1.reply or "net_sales" in resp1.reply
    assert "Time Slot" in resp1.reply or "11 AM - 2 PM" in resp1.reply

    # Query 2: Past 7 days table
    resp2 = run_copilot_turn(
        db=mock_db,
        query="Show past 7 days daily sales table",
        sec_ctx=sec_nm,
        target_date=date(2026, 11, 19),
        language="en",
    )
    assert "history_tools" in resp2.tools_executed
    assert "|" in resp2.reply
    assert "Net Sales" in resp2.reply
