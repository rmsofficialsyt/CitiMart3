"""Comprehensive tests for Natural, Freeform User Questions (beyond preset buttons).

Verifies that the CITIMART Copilot & Domain Engine naturally understands:
1. Conversational greetings & identity ('hello', 'who are you', 'help', 'what can you do')
2. Targeted KPI formulas ('what is atv', 'what is conversion', 'how is upt calculated')
3. Target achievement & deficit queries ('are we hitting target', 'target shortfall', 'target koto baki')
4. Store competitive ranking ('which store is winning', 'who is top store')
5. Conversion & traffic coaching ('why is conversion low', 'how to increase sales')
6. Multilingual phrasing across English, Bengali, and Hindi (including Hinglish/Banglish)
"""
from __future__ import annotations

from datetime import date, time as dtime
import pytest

from src import daily_dashboard_store


def test_natural_greetings_and_help(client, nw_headers):
    """Verify that conversational greetings and help return helpful cards rather than 'No sales logged'."""
    # 1. English greeting
    resp1 = client.post(
        "/api/daily/chat",
        json={"message": "hello", "store_code": "NM", "language": "en"},
        headers=nw_headers,
    )
    assert resp1.status_code == 200
    reply1 = resp1.json()["reply"]
    assert "CITIMART" in reply1.upper() or "CO-PILOT" in reply1.upper() or "NEW MARKET" in reply1.upper()
    assert "No sales (bills)" not in reply1

    # 2. English help / capabilities
    resp2 = client.post(
        "/api/daily/chat",
        json={"message": "what can you do?", "store_code": "NM", "language": "en"},
        headers=nw_headers,
    )
    assert resp2.status_code == 200
    reply2 = resp2.json()["reply"]
    assert "Sub-Agents" in reply2 or "DbOps" in reply2 or "TargetAdjustment" in reply2

    # 3. Bengali greeting
    resp3 = client.post(
        "/api/daily/chat",
        json={"message": "নমস্কার", "store_code": "NM", "language": "bn"},
        headers=nw_headers,
    )
    assert resp3.status_code == 200
    reply3 = resp3.json()["reply"]
    assert "স্বাগতম" in reply3 or "CITIMART" in reply3.upper()

    # 4. Hindi greeting
    resp4 = client.post(
        "/api/daily/chat",
        json={"message": "नमस्ते", "store_code": "NM", "language": "hi"},
        headers=nw_headers,
    )
    assert resp4.status_code == 200
    reply4 = resp4.json()["reply"]
    assert "स्वागत" in reply4 or "CITIMART" in reply4.upper()


def test_natural_formula_questions(client, nw_headers):
    """Verify that specific KPI questions return the exact formula requested."""
    # 1. ATV query
    resp_atv = client.post(
        "/api/daily/chat",
        json={"message": "what is atv?", "store_code": "NM", "language": "en"},
        headers=nw_headers,
    )
    assert resp_atv.status_code == 200
    reply_atv = resp_atv.json()["reply"]
    assert "Average Transaction Value" in reply_atv
    assert "Net Sales / Total Bills" in reply_atv

    # 2. Conversion query
    resp_conv = client.post(
        "/api/daily/chat",
        json={"message": "what is conversion?", "store_code": "NM", "language": "en"},
        headers=nw_headers,
    )
    assert resp_conv.status_code == 200
    reply_conv = resp_conv.json()["reply"]
    assert "Conversion Rate" in reply_conv
    assert "Total Footfall" in reply_conv

    # 3. UPT query
    resp_upt = client.post(
        "/api/daily/chat",
        json={"message": "how is upt calculated?", "store_code": "NM", "language": "en"},
        headers=nw_headers,
    )
    assert resp_upt.status_code == 200
    reply_upt = resp_upt.json()["reply"]
    assert "Units Per Transaction" in reply_upt or "UPT" in reply_upt


def test_natural_target_questions(client, nw_headers, db_session):
    """Verify natural target questions route to TargetAdjustment."""
    target_d = date(2026, 10, 9)
    daily_dashboard_store.set_store_target(db_session, "NM", target_d, 50000.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", target_d, dtime(12, 0), 12000.0, 3)
    daily_dashboard_store.invalidate_dashboard_cache()

    # 1. English question: "Are we hitting our target?"
    resp1 = client.post(
        "/api/daily/chat",
        json={"message": "Are we hitting our target?", "store_code": "NM", "date_str": "2026-10-09", "language": "en"},
        headers=nw_headers,
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert "target_adjust_agent" in data1["subagents_invoked"]
    assert "Target" in data1["reply"]

    # 2. Bengali question: "টার্গেট কত বাকি আছে?"
    resp2 = client.post(
        "/api/daily/chat",
        json={"message": "টার্গেট কত বাকি আছে?", "store_code": "NM", "date_str": "2026-10-09", "language": "bn"},
        headers=nw_headers,
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert "target_adjust_agent" in data2["subagents_invoked"]

    # 3. Hindi question: "टारगेट कितना बाकी है?"
    resp3 = client.post(
        "/api/daily/chat",
        json={"message": "टारगेट कितना बाकी है?", "store_code": "NM", "date_str": "2026-10-09", "language": "hi"},
        headers=nw_headers,
    )
    assert resp3.status_code == 200
    data3 = resp3.json()
    assert "target_adjust_agent" in data3["subagents_invoked"]


def test_natural_ranking_questions(client, admin_headers, nw_headers):
    """Verify natural store competitive queries ('which store is winning')."""
    # 1. Admin querying ranking
    resp_admin = client.post(
        "/api/daily/chat",
        json={"message": "which store is winning?", "store_code": "NM", "date_str": "2026-10-09", "language": "en"},
        headers=admin_headers,
    )
    assert resp_admin.status_code == 200
    reply_admin = resp_admin.json()["reply"]
    assert "Consolidated 3-Store" in reply_admin or "Benchmark" in reply_admin or "NM" in reply_admin

    # 2. Store Manager querying ranking (must preserve security isolation)
    resp_mgr = client.post(
        "/api/daily/chat",
        json={"message": "which store is winning right now?", "store_code": "NM", "date_str": "2026-10-09", "language": "en"},
        headers=nw_headers,
    )
    assert resp_mgr.status_code == 200
    reply_mgr = resp_mgr.json()["reply"]
    assert "restricted" in reply_mgr.lower() or "access denied" in reply_mgr.lower()


def test_natural_coaching_questions(client, nw_headers):
    """Verify natural conversion questions route to coaching advice."""
    resp = client.post(
        "/api/daily/chat",
        json={"message": "why is conversion so low?", "store_code": "NM", "date_str": "2026-10-09", "language": "en"},
        headers=nw_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "retail_coach_agent" in data["subagents_invoked"]
    assert "conv" in data["reply"].lower() or "playbook" in data["reply"].lower()


def test_natural_largest_bill_question(client, nw_headers, db_session):
    """Verify natural purchase query routes to bills."""
    target_d = date(2026, 10, 9)
    daily_dashboard_store.add_bill_entry(db_session, "NM", target_d, dtime(15, 0), 8500.0, 1)
    daily_dashboard_store.invalidate_dashboard_cache()

    resp = client.post(
        "/api/daily/chat",
        json={"message": "who made the largest purchase?", "store_code": "NM", "date_str": "2026-10-09", "language": "en"},
        headers=nw_headers,
    )
    assert resp.status_code == 200
    reply = resp.json()["reply"]
    assert "₹8,500" in reply or "Bill" in reply or "Largest" in reply or "Single" in reply
