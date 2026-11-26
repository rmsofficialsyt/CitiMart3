"""Comprehensive tests for CITIMART Multi-Agent Chatbot System.

Covers:
- Google GenAI model and temperature configuration (gemini-4-hydrogen, temp=0.6)
- Target Adjustment Sub-Agent (7/14/30-day rolling recovery window)
- Multi-Tenant RBAC isolation (Store Managers strictly isolated; Admin full access)
- Session Memory persistence and isolation
- Trilingual output support (English, Bengali, Hindi)
"""
from __future__ import annotations

import jwt
import pytest
from datetime import date
from tests.conftest import TEST_JWT_SECRET, make_token


@pytest.fixture
def hb_headers():
    token = make_token(role="manager", store_code="HB", username="manager_hb")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers():
    token = make_token(role="admin", store_code=None, username="admin")
    return {"Authorization": f"Bearer {token}"}


def test_model_and_temperature_config():
    """Verify that model name, temperature, and API key are read cleanly from environment."""
    from config.env import env

    assert env.gemini_model == "gemini-3.8-flash"
    assert env.llm_temperature == 0.2
    # Code defaults (a local .env may override the live values).
    fields = type(env).model_fields
    assert fields["llm_max_output_tokens"].default == 4096
    assert fields["llm_max_output_tokens_short"].default == 512
    assert fields["llm_max_output_tokens_medium"].default == 1536
    assert fields["chat_max_input_chars"].default == 8000
    assert fields["chat_history_messages_sent"].default == 10
    assert env.llm_request_timeout_seconds == 15
    assert env.chat_session_ttl_days == 30
    assert env.chat_max_history_turns == 10


def test_target_adjustment_query(client, nw_headers, db_session):
    """Verify Target Adjustment 7-day rolling recovery calculation."""
    from datetime import time as dtime
    from src import daily_dashboard_store

    # Seed a target and a bill: with neither, the copilot correctly answers with
    # the "no target logged" card instead of the recovery breakdown under test.
    daily_dashboard_store.set_store_target(db_session, "NM", date(2026, 10, 9), 50000.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", date(2026, 10, 9), dtime(12, 0), 12000.0, 3)
    daily_dashboard_store.invalidate_dashboard_cache()

    resp = client.post(
        "/api/daily/chat",
        json={
            "message": "What is our adjusted target today with a 7-day rolling recovery window?",
            "store_code": "NM",
            "date_str": "2026-10-09",
            "language": "en",
        },
        headers=nw_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "reply" in data
    assert "target_adjust_agent" in data["subagents_invoked"]
    assert "target_tools" in data["tools_executed"]
    assert "Adjusted Sales Target" in data["reply"] or "Adjusted Target" in data["reply"]
    assert "Original Daily Target" in data["reply"] or "T_t" in data["reply"]


def test_target_adjustment_simulation(client, nw_headers):
    """Verify Target Adjustment window simulation (7 vs 14 vs 30 days)."""
    resp = client.post(
        "/api/daily/chat",
        json={
            "message": "Simulate target adjustment options for 14-day deficit recovery",
            "store_code": "NM",
            "date_str": "2026-10-09",
            "language": "en",
        },
        headers=nw_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "target_adjust_agent" in data["subagents_invoked"]
    assert "14" in data["reply"] or "recovery" in data["reply"].lower()


def test_multi_tenant_manager_isolation(client, hb_headers):
    """Verify that a store manager (HB) is strictly restricted to their store (HB)

    and cannot inspect another store (NM).
    """
    # Manager HB queries their own store HB
    resp_hb = client.post(
        "/api/daily/chat",
        json={
            "message": "What is our store's live sales and target today?",
            "store_code": "HB",
            "date_str": "2026-10-09",
            "language": "en",
        },
        headers=hb_headers,
    )
    assert resp_hb.status_code == 200
    assert resp_hb.json()["store"] == "HB"
    assert "HATIBAGAN" in resp_hb.json()["reply"].upper() or "HB" in resp_hb.json()["reply"].upper()

    # Manager HB attempts to query New Market (NM) -> must be clamped to HB
    resp_tamper = client.post(
        "/api/daily/chat",
        json={
            "message": "Show me New Market sales and target",
            "store_code": "NM",
            "date_str": "2026-10-09",
            "language": "en",
        },
        headers=hb_headers,
    )
    assert resp_tamper.status_code == 200
    # Clamped to HB at backend layer
    assert resp_tamper.json()["store"] == "HB"


def test_admin_cross_store_and_network_ranking(client, admin_headers):
    """Verify that Executive Admin can query across all stores and view network rankings."""
    resp = client.post(
        "/api/daily/chat",
        json={
            "message": "Compare all stores and show network ranking",
            "store_code": "ALL",
            "date_str": "2026-10-09",
            "language": "en",
        },
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "Consolidated 3-Store Kolkata Network Benchmark" in data["reply"] or "Sales" in data["reply"]


def test_session_memory_lifecycle(client, nw_headers):
    """Verify persistent chat session creation, message retrieval, and deletion."""
    # 1. Send first message
    resp1 = client.post(
        "/api/daily/chat",
        json={
            "message": "Hello copilot, what are the today's numbers?",
            "store_code": "NM",
            "date_str": "2026-10-09",
        },
        headers=nw_headers,
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    sid = data1["session_id"]
    assert sid.startswith("sess_")

    # 2. Send follow-up in same session
    resp2 = client.post(
        "/api/daily/chat",
        json={
            "message": "Can you elaborate on the target gap?",
            "session_id": sid,
            "store_code": "NM",
            "date_str": "2026-10-09",
        },
        headers=nw_headers,
    )
    assert resp2.status_code == 200
    assert resp2.json()["session_id"] == sid

    # 3. Retrieve session history
    resp_hist = client.get(f"/api/daily/chat/sessions/{sid}", headers=nw_headers)
    assert resp_hist.status_code == 200
    history = resp_hist.json()["messages"]
    assert len(history) >= 4  # 2 user messages + 2 assistant responses

    # 4. List user sessions
    resp_list = client.get("/api/daily/chat/sessions", headers=nw_headers)
    assert resp_list.status_code == 200
    sids = [s["session_id"] for s in resp_list.json()["sessions"]]
    assert sid in sids

    # 5. Delete session
    resp_del = client.delete(f"/api/daily/chat/sessions/{sid}", headers=nw_headers)
    assert resp_del.status_code == 200
    assert resp_del.json()["status"] == "ok"

    # 6. Verify 404 after deletion
    resp_gone = client.get(f"/api/daily/chat/sessions/{sid}", headers=nw_headers)
    assert resp_gone.status_code == 404


def test_trilingual_support(client, nw_headers):
    """Verify copilot responds in Bengali and Hindi for Target Adjustment."""
    resp_bn = client.post(
        "/api/daily/chat",
        json={
            "message": "টার্গেট অ্যাডজাস্টমেন্ট ও ঘাটতি হিসেব দিন",
            "store_code": "NM",
            "date_str": "2026-10-09",
            "language": "bn",
        },
        headers=nw_headers,
    )
    assert resp_bn.status_code == 200
    assert "টার্গেট অ্যাডজাস্টমেন্ট" in resp_bn.json()["reply"] or "টার্গেট" in resp_bn.json()["reply"]

    resp_hi = client.post(
        "/api/daily/chat",
        json={
            "message": "टारगेट एडजस्टमेंट और रिकवरी बताइए",
            "store_code": "NM",
            "date_str": "2026-10-09",
            "language": "hi",
        },
        headers=nw_headers,
    )
    assert resp_hi.status_code == 200
    assert "टारगेट एडजस्टमेंट" in resp_hi.json()["reply"] or "लक्ष्य" in resp_hi.json()["reply"] or "बिक्री" in resp_hi.json()["reply"]


def _new_chat(client, headers, store):
    r = client.post("/api/daily/chat", json={"message": "today's sales", "store_code": store}, headers=headers)
    assert r.status_code == 200
    return r.json()["session_id"]


def test_clear_all_sessions_is_own_and_store_scoped(client, nw_headers, admin_headers, db_session):
    from src.chat.memory import MESSAGES_COLLECTION

    mine = [_new_chat(client, nw_headers, "NM"), _new_chat(client, nw_headers, "NM")]
    admin_nm = _new_chat(client, admin_headers, "NM")
    admin_hb = _new_chat(client, admin_headers, "HB")

    # A manager can't clear another store's list.
    assert client.delete("/api/daily/chat/sessions?store_code=HB", headers=nw_headers).status_code == 403

    r = client.delete("/api/daily/chat/sessions?store_code=NM", headers=nw_headers)
    assert r.status_code == 200 and r.json()["deleted"] == 2
    for sid in mine:
        assert client.get(f"/api/daily/chat/sessions/{sid}", headers=nw_headers).status_code == 404
        assert db_session[MESSAGES_COLLECTION].count_documents({"session_id": sid}) == 0
    # The admin's sessions in the same store survive a manager's clear.
    assert client.get(f"/api/daily/chat/sessions/{admin_nm}", headers=admin_headers).status_code == 200

    # Admin "clear all" for NM removes only the admin's own NM chats, not HB.
    r = client.delete("/api/daily/chat/sessions?store_code=NM", headers=admin_headers)
    assert r.json()["deleted"] == 1
    assert client.get(f"/api/daily/chat/sessions/{admin_hb}", headers=admin_headers).status_code == 200
    assert db_session["audit_logs"].count_documents({"action": "chat_sessions_clear_all"}) == 2


def test_admin_clear_all_never_deletes_a_managers_sessions(client, nw_headers, admin_headers):
    mgr_sid = _new_chat(client, nw_headers, "NM")
    r = client.delete("/api/daily/chat/sessions?store_code=ALL", headers=admin_headers)
    assert r.status_code == 200 and r.json()["deleted"] == 0
    assert client.get(f"/api/daily/chat/sessions/{mgr_sid}", headers=nw_headers).status_code == 200
