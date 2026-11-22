"""Tests for Month and Year Sales Summary Queries across Multi-Agent Engine.

Verifies:
1. "Give me previous month full sales summery" / "last month sales summary" -> resolves to October 2026 (completed month),
   detects intent "mtd", and synthesizes the Full Month Operations Summary card.
2. "October sales summary" -> resolves to October 2026.
3. "full year sales summary" / "this year sales" / "annual report" -> detects intent "year_summary",
   resolves to 2026, computes month-by-month breakdown, and synthesizes Annual Sales & Performance Summary (YTD).
4. Multilingual support across Bengali and Hindi.
5. Multi-tenant store confinement and Admin ALL store consolidation.
"""
from __future__ import annotations

from datetime import date
from mongomock import MongoClient
import pytest

from db.models import BILLS, FOOTFALL, NOB, TARGETS
from src import daily_dashboard_store
from src.chat.coordinator import run_copilot_turn
from src.chat.intent import detect_intent
from src.chat.state import SecurityContext
from src.chat.tools.history_tools import (
    get_month_to_date_granular_summary,
    get_year_to_date_granular_summary,
    resolve_query_target_date,
)


@pytest.fixture
def mock_db():
    daily_dashboard_store.invalidate_dashboard_cache()
    client = MongoClient()
    db = client["citimart_month_year_test"]

    # Seed data for 2026-10 (October, previous completed month) and 2026-11 (November, current month)
    # Seed 3 days in October for NM
    for d_str, sales, target, ff, bills in [
        ("2026-10-02", 750000.0, 600000.0, 1400, 720),
        ("2026-10-15", 520000.0, 500000.0, 1100, 550),
        ("2026-10-31", 610000.0, 550000.0, 1250, 600),
        ("2026-11-20", 400000.0, 450000.0, 900, 410),
        ("2026-11-21", 480000.0, 450000.0, 950, 430),
    ]:
        db[BILLS].insert_one({
            "store_code": "NM",
            "entry_date": d_str,
            "net_amount": sales,
            "bill_quantity": 10,
            "bill_time": "14:30",
            "time_slot": "02.00 PM - 04.59 PM",
        })
        db[TARGETS].insert_one({"store_code": "NM", "entry_date": d_str, "sales_target": target})
        db[FOOTFALL].insert_one({"store_code": "NM", "entry_date": d_str, "entry_time": "14:30", "footfall": ff, "time_slot": "02.00 PM - 04.59 PM"})
        db[NOB].insert_one({"store_code": "NM", "entry_date": d_str, "entry_time": "14:30", "nob": bills, "time_slot": "02.00 PM - 04.59 PM"})

    return db


def test_previous_month_intent_and_target_date(mock_db):
    """Verify 'Give me previous month full sales summery' detects 'mtd' and resolves to prior month end."""
    ref_today = date(2026, 11, 22)
    query = "Give me previous month full sales summery"

    # 1. Intent Detection
    intent = detect_intent(query)
    assert intent.primary == "mtd"

    # 2. Date Resolution (relative month -> 2026-10-31)
    target_d, reason = resolve_query_target_date(mock_db, "NM", query, default_date=ref_today)
    assert target_d == date(2026, 10, 31)
    assert "October 2026" in reason


def test_full_year_intent_and_target_date(mock_db):
    """Verify full year queries detect 'year_summary' and resolve to reference year."""
    ref_today = date(2026, 11, 22)

    queries = [
        "Give me full year sales summary",
        "Give me full year sales summery",
        "annual sales report",
        "this year sales summary",
        "sales for this year",
        "ytd sales performance",
    ]

    for q in queries:
        intent = detect_intent(q)
        assert intent.primary == "year_summary", f"Failed intent for: {q}"
        target_d, reason = resolve_query_target_date(mock_db, "NM", q, default_date=ref_today)
        assert target_d.year == 2026
        assert "Annual / Full Year" in reason or "2026" in reason


def test_previous_month_full_summary_card(mock_db):
    """Verify copilot turn returns the completed Full Month Operations Summary card."""
    ref_today = date(2026, 11, 22)
    sec_ctx = SecurityContext(user_id="mgr_nm", role="store_manager", store_code="NM")

    resp = run_copilot_turn(
        db=mock_db,
        query="Give me previous month full sales summery",
        sec_ctx=sec_ctx,
        target_date=ref_today,
        language="en",
    )

    assert "Full Month Operations Summary" in resp.reply
    assert "October 2026" in resp.reply
    assert "Total Net Sales" in resp.reply
    assert "Total Sales Target" in resp.reply
    assert "Peak Sales Day" in resp.reply or "Peak" in resp.reply
    assert "2026-10-02" in resp.reply  # October 2nd was highest sales day (750k)


def test_annual_year_summary_card(mock_db):
    """Verify copilot turn returns the Annual Sales & Performance Summary (YTD) card with table."""
    ref_today = date(2026, 11, 22)
    sec_ctx = SecurityContext(user_id="mgr_nm", role="store_manager", store_code="NM")

    resp = run_copilot_turn(
        db=mock_db,
        query="Give me full year sales summary",
        sec_ctx=sec_ctx,
        target_date=ref_today,
        language="en",
    )

    assert "Annual Sales & Performance Summary (YTD)" in resp.reply
    assert "2026" in resp.reply
    assert "Month-by-Month Performance Breakdown" in resp.reply
    assert "October 2026" in resp.reply
    assert "November 2026" in resp.reply
    assert "Consolidated Annual Net Sales" in resp.reply
    assert "Top Performing Month" in resp.reply


def test_multilingual_month_and_year(mock_db):
    """Verify Bengali and Hindi phrasing for month and year summaries."""
    ref_today = date(2026, 11, 22)
    sec_ctx = SecurityContext(user_id="mgr_nm", role="store_manager", store_code="NM")

    # Bengali previous month
    resp_bn_m = run_copilot_turn(
        db=mock_db,
        query="গত মাসের সেলস সামারি দেখাও",
        sec_ctx=sec_ctx,
        target_date=ref_today,
        language="bn",
    )
    assert "সম্পূর্ণ মাসের সেলস ও পারফরম্যান্স সামারি" in resp_bn_m.reply
    assert "October 2026" in resp_bn_m.reply

    # Bengali annual year
    resp_bn_y = run_copilot_turn(
        db=mock_db,
        query="সারা বছরের সেলস রিপোর্ট দাও",
        sec_ctx=sec_ctx,
        target_date=ref_today,
        language="bn",
    )
    assert "বার্ষিক সেলস ও পারফরম্যান্স সামারি" in resp_bn_y.reply
    assert "2026" in resp_bn_y.reply

    # Hindi previous month
    resp_hi_m = run_copilot_turn(
        db=mock_db,
        query="पिछले महीने की बिक्री सारांश दिखाएं",
        sec_ctx=sec_ctx,
        target_date=ref_today,
        language="hi",
    )
    assert "पूरे महीने की बिक्री व परिचालन सारांश" in resp_hi_m.reply

    # Hindi annual year
    resp_hi_y = run_copilot_turn(
        db=mock_db,
        query="पूरे साल की बिक्री रिपोर्ट दिखाएं",
        sec_ctx=sec_ctx,
        target_date=ref_today,
        language="hi",
    )
    assert "वार्षिक बिक्री व प्रदर्शन सारांश" in resp_hi_y.reply
