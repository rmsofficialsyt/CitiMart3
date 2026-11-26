"""Tests for WhatsApp AI Sales Alerts & Reporting Agent (SPEC-05)."""
from __future__ import annotations

from datetime import date, datetime, time
from unittest.mock import MagicMock

import pytest

from src import daily_dashboard_store
from src.alerts.scheduler import IST, acquire_alert_lock, due_scheduled_jobs, process_whatsapp_alert_job
from src.alerts.whatsapp_alert_agent import (
    WhatsAppAlertAgent,
    build_admin_report_facts,
    build_manager_report_facts,
)
from src.alerts.whatsapp_provider import (
    MetaCloudWhatsAppProvider,
    TwilioWhatsAppProvider,
    normalize_indian_phone,
)


def test_indian_phone_normalization():
    assert normalize_indian_phone("9876543210") == "+919876543210"
    assert normalize_indian_phone("09876543210") == "+919876543210"
    assert normalize_indian_phone("919876543210") == "+919876543210"
    assert normalize_indian_phone("+91 98765-43210") == "+919876543210"

    for bad in ("1234567890", "5876543210", "98765", "+14155551234", ""):
        with pytest.raises(ValueError):
            normalize_indian_phone(bad)


def test_alerts_endpoints_require_admin(client, admin_headers, nw_headers, hb_headers):
    # 401 without token
    assert client.get("/api/alerts/whatsapp/config").status_code == 401
    assert client.put("/api/alerts/whatsapp/config", json={}).status_code == 401
    assert client.post("/api/alerts/whatsapp/send", json={}).status_code == 401
    assert client.get("/api/alerts/whatsapp/logs").status_code == 401

    # 403 for store managers
    for mgr in (nw_headers, hb_headers):
        assert client.get("/api/alerts/whatsapp/config", headers=mgr).status_code == 403
        assert client.put("/api/alerts/whatsapp/config", json={}, headers=mgr).status_code == 403
        assert client.post("/api/alerts/whatsapp/send", json={}, headers=mgr).status_code == 403
        assert client.get("/api/alerts/whatsapp/logs", headers=mgr).status_code == 403

    # 200 for admin
    res = client.get("/api/alerts/whatsapp/config", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["provider"]["active_provider"] == "dry_run"


def test_config_validation_422_and_save(client, admin_headers):
    # Invalid Indian mobile number -> 422
    bad_payload = {
        "enabled": True,
        "language": "en",
        "trading_start_hour": 11,
        "trading_end_hour": 23,
        "admin_recipients": ["1234567890"],
        "manager_recipients": {"NM": []},
    }
    assert client.put("/api/alerts/whatsapp/config", json=bad_payload, headers=admin_headers).status_code == 422

    # start > end hour -> 422
    bad_hours = {
        "enabled": True,
        "language": "en",
        "trading_start_hour": 22,
        "trading_end_hour": 10,
        "admin_recipients": ["9876543210"],
        "manager_recipients": {},
    }
    assert client.put("/api/alerts/whatsapp/config", json=bad_hours, headers=admin_headers).status_code == 422

    # Valid save normalizes Indian numbers
    good = {
        "enabled": True,
        "language": "hi",
        "trading_start_hour": 11,
        "trading_end_hour": 23,
        "admin_recipients": ["9876543210"],
        "manager_recipients": {"NM": ["09830011223"], "HB": [], "CHW": []},
    }
    res = client.put("/api/alerts/whatsapp/config", json=good, headers=admin_headers)
    assert res.status_code == 200
    settings = res.json()["settings"]
    assert settings["admin_recipients"] == ["+919876543210"]
    assert settings["manager_recipients"]["NM"] == ["+919830011223"]
    assert settings["language"] == "hi"


def _seed_store_day(db_session, target_date: date):
    daily_dashboard_store.save_target_entry(db_session, "NM", target_date, 100000.0)
    daily_dashboard_store.add_bill_entry(db_session, "NM", target_date, time(12, 0), 60000.0, 40)
    daily_dashboard_store.add_footfall_entry(db_session, "NM", target_date, time(12, 0), 120)
    daily_dashboard_store.add_nob_entry(db_session, "NM", target_date, time(12, 0), 30)

    daily_dashboard_store.save_target_entry(db_session, "HB", target_date, 80000.0)
    daily_dashboard_store.add_bill_entry(db_session, "HB", target_date, time(15, 0), 92000.0, 55)
    daily_dashboard_store.add_footfall_entry(db_session, "HB", target_date, time(15, 0), 150)
    daily_dashboard_store.add_nob_entry(db_session, "HB", target_date, time(15, 0), 45)

    daily_dashboard_store.save_target_entry(db_session, "CHW", target_date, 50000.0)
    daily_dashboard_store.add_bill_entry(db_session, "CHW", target_date, time(18, 0), 25000.0, 20)


def test_admin_vs_manager_granular_isolation(db_session, monkeypatch):
    monkeypatch.setattr("src.alerts.whatsapp_alert_agent.generate_llm_response", lambda **_kw: None)
    d = date(2026, 11, 20)
    _seed_store_day(db_session, d)
    now = datetime(2026, 11, 20, 19, 0, tzinfo=IST)

    admin_facts = build_admin_report_facts(db_session, d, now)
    assert admin_facts["network"]["net_sales"] == 177000.0
    assert [s["store_code"] for s in admin_facts["stores"]] == ["HB", "NM", "CHW"]

    agent = WhatsAppAlertAgent()
    admin_msg, _, ai_used = agent.compose_message(
        db_session, audience="admin", store_code="ALL", alert_type="hourly_pulse", target_date=d, now=now
    )
    assert ai_used is False
    assert "```" in admin_msg
    assert "NM" in admin_msg and "HB" in admin_msg and "CHW" in admin_msg

    # Manager report for NM must NEVER contain HB or CHW figures
    mgr_facts = build_manager_report_facts(db_session, "NM", d, now)
    assert mgr_facts["store_code"] == "NM"
    assert mgr_facts["kpis"]["net_sales"] == 60000.0

    mgr_msg, _, _ = agent.compose_message(
        db_session, audience="manager", store_code="NM", alert_type="hourly_pulse", target_date=d, now=now
    )
    assert "NEW MARKET (NM)" in mgr_msg
    assert "```" in mgr_msg
    for forbidden in ("HB", "CHW", "Hatibagan", "Chowringhee", "92,000", "25,000"):
        assert forbidden not in mgr_msg


def test_ai_grounding_rejects_hallucinated_numbers(db_session, monkeypatch):
    d = date(2026, 11, 20)
    _seed_store_day(db_session, d)
    now = datetime(2026, 11, 20, 14, 0, tzinfo=IST)

    # Hallucinated figure 999888 should be rejected -> deterministic fallback
    monkeypatch.setattr(
        "src.alerts.whatsapp_alert_agent.generate_llm_response",
        lambda **_kw: "*CITIMART* Sales: ₹999,888",
    )
    agent = WhatsAppAlertAgent()
    msg, _, ai_used = agent.compose_message(
        db_session, audience="manager", store_code="NM", alert_type="hourly_pulse", target_date=d, now=now
    )
    assert ai_used is False
    assert "999,888" not in msg

    # Grounded response should be accepted
    monkeypatch.setattr(
        "src.alerts.whatsapp_alert_agent.generate_llm_response",
        lambda **_kw: "*CITIMART NEW MARKET (NM)*\nSales: ₹60,000 (60.0%)",
    )
    msg_ok, _, ai_used_ok = agent.compose_message(
        db_session, audience="manager", store_code="NM", alert_type="hourly_pulse", target_date=d, now=now
    )
    assert ai_used_ok is True
    assert "60,000" in msg_ok


def test_scheduler_triggers_and_redis_lock(fake_redis):
    # Outside trading hours (3:00 AM IST) -> nothing
    assert due_scheduled_jobs(datetime(2026, 11, 20, 3, 0, tzinfo=IST)) == []

    # 14:00 IST -> hourly_pulse + anomaly_pace + slot_summary
    types_14 = {j["alert_type"] for j in due_scheduled_jobs(datetime(2026, 11, 20, 14, 0, tzinfo=IST))}
    assert types_14 == {"hourly_pulse", "anomaly_pace", "slot_summary"}

    # 21:30 IST -> closing_sprint
    types_2130 = {j["alert_type"] for j in due_scheduled_jobs(datetime(2026, 11, 20, 21, 30, tzinfo=IST))}
    assert types_2130 == {"closing_sprint"}

    # 23:59 IST -> slot_summary + daily_eod
    types_2359 = {j["alert_type"] for j in due_scheduled_jobs(datetime(2026, 11, 20, 23, 59, tzinfo=IST))}
    assert types_2359 == {"slot_summary", "daily_eod"}

    # Redis SET NX lock prevents duplicate sends
    assert acquire_alert_lock("hourly_pulse:2026-11-20:14:admin:ALL") is True
    assert acquire_alert_lock("hourly_pulse:2026-11-20:14:admin:ALL") is False


def test_send_and_logs_api_flow(client, admin_headers):
    client.put(
        "/api/alerts/whatsapp/config",
        json={
            "enabled": True,
            "language": "en",
            "trading_start_hour": 11,
            "trading_end_hour": 23,
            "admin_recipients": ["9876543210"],
            "manager_recipients": {"NM": ["9830011223"], "HB": [], "CHW": []},
        },
        headers=admin_headers,
    )
    res = client.post(
        "/api/alerts/whatsapp/send",
        json={"audience": "admin", "store_code": "ALL", "alert_type": "daily_eod", "use_ai": False, "preview_only": False},
        headers=admin_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "sent"
    assert body["recipients"] == ["+919876543210"]

    logs = client.get("/api/alerts/whatsapp/logs", headers=admin_headers)
    assert logs.status_code == 200
    assert len(logs.json()["logs"]) == 1


def test_meta_and_twilio_providers(monkeypatch):
    mock_resp = MagicMock(status_code=200)
    mock_resp.json.return_value = {"messages": [{"id": "wamid.123"}], "sid": "SM123"}
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.post.return_value = mock_resp

    monkeypatch.setattr("src.alerts.whatsapp_provider.httpx.Client", lambda **_kw: mock_client)

    meta = MetaCloudWhatsAppProvider("tok", "12345")
    r1 = meta.send_text("+919876543210", "Hello")
    assert r1.ok and r1.message_id == "wamid.123"

    twilio = TwilioWhatsAppProvider("AC123", "auth", "+14155238886")
    r2 = twilio.send_text("+919876543210", "Hello")
    assert r2.ok and r2.message_id == "SM123"
