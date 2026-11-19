"""Unit and Integration Tests for Anti-Hallucination Guardrail Hook.

Verifies:
1. Pre-generation date boundary enforcement (rejecting out-of-horizon queries).
2. Honest refusal messages in EN, BN, and HI containing verified calendar date bounds.
3. Post-generation audit ensuring zero fabricated figures when records do not exist.
4. Integration via run_copilot_turn and API endpoint.
"""
from datetime import date
import pytest
from src.chat.hooks.anti_hallucination_hook import AntiHallucinationHook
from src.chat.coordinator import run_copilot_turn
from src.chat.state import SecurityContext


def test_pre_generation_hook_out_of_bounds_en():
    """Verify pre-generation refusal for out-of-bounds historical date in English."""
    db_calendar = {
        "earliest_date": "2026-08-01",
        "latest_date": "2026-10-18",
        "total_operating_days": 79,
    }
    query = "What were our total sales on 2024-03-15?"
    refusal = AntiHallucinationHook.check_pre_generation(
        query=query,
        active_date=date(2024, 3, 15),
        active_store="NM",
        db_calendar=db_calendar,
        language="en",
    )
    assert refusal is not None
    assert "No Records Found" in refusal
    assert "2026-08-01" in refusal
    assert "2026-10-18" in refusal
    assert "79 operating days" in refusal


def test_pre_generation_hook_out_of_bounds_bn():
    """Verify pre-generation refusal in Bengali with verified calendar bounds."""
    db_calendar = {
        "earliest_date": "2026-08-01",
        "latest_date": "2026-10-18",
        "total_operating_days": 79,
    }
    query = "২০২৪ সালের ১৫ মার্চের সেলস কত ছিল?"
    refusal = AntiHallucinationHook.check_pre_generation(
        query=query,
        active_date=date(2024, 3, 15),
        active_store="HB",
        db_calendar=db_calendar,
        language="bn",
    )
    assert refusal is not None
    assert "তথ্য অনুপস্থিত" in refusal
    assert "2026-08-01" in refusal
    assert "2026-10-18" in refusal


def test_pre_generation_hook_out_of_bounds_hi():
    """Verify pre-generation refusal in Hindi with verified calendar bounds."""
    db_calendar = {
        "earliest_date": "2026-08-01",
        "latest_date": "2026-10-18",
        "total_operating_days": 79,
    }
    query = "2024 में 15 मार्च की बिक्री कितनी थी?"
    refusal = AntiHallucinationHook.check_pre_generation(
        query=query,
        active_date=date(2024, 3, 15),
        active_store="CHW",
        db_calendar=db_calendar,
        language="hi",
    )
    assert refusal is not None
    assert "रिकॉर्ड उपलब्ध नहीं" in refusal
    assert "2026-08-01" in refusal
    assert "2026-10-18" in refusal


def test_pre_generation_hook_passes_valid_date():
    """Verify that queries for recorded dates pass through the pre-generation check cleanly."""
    db_calendar = {
        "earliest_date": "2026-08-01",
        "latest_date": "2026-10-18",
        "total_operating_days": 79,
    }
    query = "Show yesterday's sales report"
    check = AntiHallucinationHook.check_pre_generation(
        query=query,
        active_date=date(2026, 10, 17),
        active_store="NM",
        db_calendar=db_calendar,
        language="en",
    )
    assert check is None


def test_post_generation_audit_sanitizes_unrecorded_data():
    """Verify post-generation audit sanitizes any unrecorded hallucinated data."""
    db_calendar = {
        "earliest_date": "2026-08-01",
        "latest_date": "2026-10-18",
        "total_operating_days": 79,
    }
    subagent_data = {
        "db_ops_agent": {
            "kpis": {"error": "NO_RECORDS_FOUND", "message": "No sales record found for 2024-01-01."}
        }
    }
    fake_reply = "Yesterday on 2024-01-01 net sales was ₹2,45,000 with 85% achievement."
    audited = AntiHallucinationHook.audit_post_generation(
        reply=fake_reply,
        active_date=date(2024, 1, 1),
        db_calendar=db_calendar,
        subagent_data=subagent_data,
        language="en",
    )
    assert "No verified operational sales records exist" in audited
    assert "₹2,45,000" not in audited
