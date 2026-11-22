"""Comprehensive tests for Named National/State Holiday & Festival Query Intelligence.

Verifies that the CITIMART Copilot naturally understands:
1. "Gandhi birthday" / "Gandhi Jayanti" -> resolves to October 2nd (e.g. 2026-10-02)
2. Multilingual variants across English, Bengali, and Hindi
3. Netaji Birthday, Republic Day, Independence Day, Christmas, Poila Boishakh, Durga Puja
4. Explicit year resolution (e.g. "Gandhi birthday 2025" -> 2025-10-02)
5. Multi-turn follow-up date carry-over ("Gandhi birthday" followed by "and footfall?")
6. Full API chat response carrying the holiday name in metadata and report cards.
"""
from __future__ import annotations

from datetime import date
from mongomock import MongoClient
import pytest

from src.chat.tools.history_tools import (
    is_explicit_date_reason,
    resolve_query_target_date,
)


@pytest.fixture
def mock_db():
    client = MongoClient()
    return client["citimart_holiday_test"]


def test_gandhi_birthday_and_jayanti_resolution(mock_db):
    """Verify natural variations of Gandhi's birthday resolve to October 2nd."""
    ref_today = date(2026, 11, 22)

    # 1. Natural English
    d1, r1 = resolve_query_target_date(mock_db, "NM", "Gandhi birthday", default_date=ref_today)
    assert d1 == date(2026, 10, 2)
    assert "Gandhi" in r1
    assert is_explicit_date_reason(r1)

    d2, r2 = resolve_query_target_date(mock_db, "ALL", "how were sales on Gandhi Jayanti?", default_date=ref_today)
    assert d2 == date(2026, 10, 2)
    assert is_explicit_date_reason(r2)

    d3, r3 = resolve_query_target_date(mock_db, "NM", "Mahatma Gandhi's birthday sales report", default_date=ref_today)
    assert d3 == date(2026, 10, 2)

    # 2. Bengali
    d_bn, r_bn = resolve_query_target_date(mock_db, "NM", "গান্ধী জয়ন্তীর সেলস রিপোর্ট দেখাও", default_date=ref_today)
    assert d_bn == date(2026, 10, 2)
    assert is_explicit_date_reason(r_bn)

    d_bn2, _ = resolve_query_target_date(mock_db, "HB", "গান্ধী জন্মদিন", default_date=ref_today)
    assert d_bn2 == date(2026, 10, 2)

    # 3. Hindi
    d_hi, r_hi = resolve_query_target_date(mock_db, "CHW", "गांधी जयंती की बिक्री कैसी रही?", default_date=ref_today)
    assert d_hi == date(2026, 10, 2)
    assert is_explicit_date_reason(r_hi)

    d_hi2, _ = resolve_query_target_date(mock_db, "NM", "गांधी जन्मदिन", default_date=ref_today)
    assert d_hi2 == date(2026, 10, 2)


def test_explicit_year_holiday_resolution(mock_db):
    """Verify specifying an explicit year overrides the default operating year."""
    ref_today = date(2026, 11, 22)
    d, r = resolve_query_target_date(mock_db, "NM", "Gandhi birthday 2025 report", default_date=ref_today)
    assert d == date(2025, 10, 2)
    assert "2025-10-02" in r


def test_major_national_and_wb_holidays(mock_db):
    """Verify Republic Day, Netaji Birthday, Independence Day, Christmas, Poila Boishakh."""
    ref_today = date(2026, 11, 22)

    # Netaji Birthday (Jan 23)
    d_netaji, _ = resolve_query_target_date(mock_db, "NM", "Netaji birthday sales", default_date=ref_today)
    assert d_netaji == date(2026, 1, 23)

    # Republic Day (Jan 26)
    d_rep, _ = resolve_query_target_date(mock_db, "NM", "Republic Day footfall", default_date=ref_today)
    assert d_rep == date(2026, 1, 26)

    # Independence Day (Aug 15)
    d_ind, _ = resolve_query_target_date(mock_db, "NM", "Independence Day conversion", default_date=ref_today)
    assert d_ind == date(2026, 8, 15)

    # Christmas (Dec 25)
    d_xmas, _ = resolve_query_target_date(mock_db, "NM", "Christmas report", default_date=ref_today)
    assert d_xmas == date(2026, 12, 25)

    # Poila Boishakh (Apr 15)
    d_pb, _ = resolve_query_target_date(mock_db, "NM", "পয়লা বৈশাখের কালেকশন", default_date=ref_today)
    assert d_pb == date(2026, 4, 15)


def test_holiday_follow_up_carry_over(mock_db):
    """Verify follow-up queries carry over the holiday date when fallback_date is present."""
    ref_today = date(2026, 11, 22)

    # Turn 1: Gandhi birthday
    d1, r1 = resolve_query_target_date(mock_db, "NM", "Gandhi birthday", default_date=ref_today)
    assert d1 == date(2026, 10, 2)
    assert is_explicit_date_reason(r1) is True

    # Turn 2: Follow-up question without explicit date
    d2, r2 = resolve_query_target_date(mock_db, "NM", "and what was the conversion rate?", default_date=ref_today, fallback_date=d1)
    assert d2 == date(2026, 10, 2)
    assert "Carried over" in r2


def test_api_chat_resolves_gandhi_birthday(client, nw_headers):
    """Integration test verifying /api/daily/chat handles 'Gandhi birthday' gracefully."""
    resp = client.post(
        "/api/daily/chat",
        json={"message": "Gandhi birthday", "store_code": "NM", "language": "en"},
        headers=nw_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["target_date"] == "2026-10-02"
    reply = data["reply"]
    # Should refer to 2026-10-02 (and not 2026-11-22)
    assert "2026-10-02" in reply
    assert "2026-11-22" not in reply
    assert "Mahatma Gandhi" in reply or "Gandhi" in reply
