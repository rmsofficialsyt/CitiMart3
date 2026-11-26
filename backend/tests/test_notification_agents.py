"""Tests for Notification & Log Handling Agents (SPEC-06)."""
from __future__ import annotations

from datetime import date, datetime, time, timezone

from src import daily_dashboard_store
from src.notifications.agents import (
    IST,
    AuditGuardAgent,
    DirectiveFollowUpAgent,
    LogOpsAgent,
    RequisitionAgent,
    StockOpsAgent,
    WorkforceAgent,
)
from src.notifications.runner import run_notification_agents
from src.notifications.store import create_notification


def test_notifications_auth_and_isolation(client, db_session, admin_headers, nw_headers, hb_headers):
    # 401 without token
    assert client.get("/api/notifications").status_code == 401
    assert client.post("/api/notifications/read-all").status_code == 401
    assert client.post("/api/notifications/scan").status_code == 401

    # 403 when manager calls admin-only /scan
    assert client.post("/api/notifications/scan", headers=nw_headers).status_code == 403

    # Seed one Admin notification and one NM manager notification
    admin_ntf = create_notification(
        db_session,
        agent="log_ops_agent",
        audience="admin",
        store_code="ALL",
        severity="urgent",
        title="Log Spike",
        message="Error spike",
        dedupe_key="test:admin:1",
    )
    nm_ntf = create_notification(
        db_session,
        agent="stock_ops_agent",
        audience="manager",
        store_code="NM",
        severity="warning",
        title="Low Stock NM",
        message="Low stock at NM",
        dedupe_key="test:nm:1",
    )
    assert admin_ntf is not None and nm_ntf is not None

    # Admin sees only admin notifications; NM sees only NM; HB sees none
    assert len(client.get("/api/notifications", headers=admin_headers).json()["items"]) == 1
    assert len(client.get("/api/notifications", headers=nw_headers).json()["items"]) == 1
    assert len(client.get("/api/notifications", headers=hb_headers).json()["items"]) == 0

    # HB cannot mark NM's notification read (403); NM cannot mark Admin's read (403)
    assert client.post(f"/api/notifications/{nm_ntf['notif_id']}/read", headers=hb_headers).status_code == 403
    assert client.post(f"/api/notifications/{admin_ntf['notif_id']}/read", headers=nw_headers).status_code == 403
    assert client.post("/api/notifications/ntf_999999/read", headers=admin_headers).status_code == 404

    # NM marks own notification read -> unread_count becomes 0
    assert client.post(f"/api/notifications/{nm_ntf['notif_id']}/read", headers=nw_headers).status_code == 200
    assert client.get("/api/notifications", headers=nw_headers).json()["unread_count"] == 0


def test_six_agents_and_deduplication(db_session, tmp_path):
    now = datetime(2026, 11, 20, 14, 0, tzinfo=IST)
    iso = now.date().isoformat()

    # 1. StockOpsAgent: low stock + pending transfer
    db_session["stock_inventory"].insert_one({
        "store_code": "NM", "barcode": "111", "item_name": "Denim Jacket", "current_stock": 2, "reorder_level": 10
    })
    db_session["stock_transfers"].insert_one({
        "transfer_id": "TRF-1", "from_store": "HB", "to_store": "NM", "status": "PENDING"
    })
    stock_events = StockOpsAgent().evaluate(db_session, now)
    assert any(e.store_code == "NM" and "Low Stock" in e.title for e in stock_events)
    assert any(e.store_code == "NM" and "Incoming Stock Transfer" in e.title for e in stock_events)

    # 2. AuditGuardAgent: NOB > Footfall at HB + missing entries at CHW
    daily_dashboard_store.add_footfall_entry(db_session, "HB", date(2026, 11, 20), time(12, 0), 10)
    daily_dashboard_store.add_nob_entry(db_session, "HB", date(2026, 11, 20), time(12, 0), 25)
    audit_events = AuditGuardAgent().evaluate(db_session, now)
    assert any(e.store_code == "HB" and "Conversion Anomaly" in e.title for e in audit_events)
    assert any(e.store_code == "CHW" and "Missing Daily Entries" in e.title for e in audit_events)

    # 3. WorkforceAgent: active staff with 0 attendance
    db_session["staff_members"].insert_one({"store_code": "NM", "staff_id": "S1", "status": "ACTIVE"})
    wf_events = WorkforceAgent().evaluate(db_session, now)
    assert any(e.store_code == "NM" and "Attendance Not Logged" in e.title for e in wf_events)

    # 4. RequisitionAgent: urgent pending slip
    db_session["requisitions"].insert_one({"store_code": "NM", "status": "pending", "priority": "Urgent"})
    req_events = RequisitionAgent().evaluate(db_session, now)
    assert len(req_events) == 1 and req_events[0].audience == "admin"

    # 5. DirectiveFollowUpAgent: active unacknowledged directive
    db_session["directives"].insert_one({"directive_id": 1, "active": True, "acknowledged_by": ["HB"]})
    dir_events = DirectiveFollowUpAgent().evaluate(db_session, now)
    assert any(e.store_code == "NM" for e in dir_events)
    assert not any(e.store_code == "HB" for e in dir_events)

    # 6. LogOpsAgent: error.log spike + access.log 500s + audit_logs failed logins
    (tmp_path / "error.log").write_text("\n".join([f"{iso} 14:00:00 [ERROR] DB timeout" for _ in range(3)]))
    (tmp_path / "access.log").write_text("\n".join([f"{iso} 14:00:00 HTTP GET /api/x 500 error" for _ in range(2)]))
    now_utc = now.astimezone(timezone.utc).isoformat()
    for _ in range(5):
        db_session["audit_logs"].insert_one({"action": "login_failed", "ts": now_utc})

    log_events = LogOpsAgent(logs_dir=tmp_path).evaluate(db_session, now)
    assert all(e.audience == "admin" for e in log_events)
    assert len(log_events) == 3

    # Runner persists and deduplicates on 2nd run
    first = run_notification_agents(db_session, now)
    assert first["created_count"] > 0
    second = run_notification_agents(db_session, now)
    assert second["created_count"] == 0
