"""Tests for Boss / Operational Head Directives, Alerts and Manager Escalations."""
from __future__ import annotations


def test_manager_receives_default_directives(client, nw_headers):
    r = client.get("/api/daily/directives", headers=nw_headers)
    assert r.status_code == 200
    data = r.json()
    assert "directives" in data
    assert "unread_count" in data
    assert len(data["directives"]) >= 1
    assert data["directives"][0]["author_name"] == "Operational Head"


def test_admin_creates_and_manages_directive(client, admin_headers, nw_headers):
    # 1. Admin creates a directive
    payload = {
        "title": "Special Peak Hour Flash Target",
        "message": "Push conversion to 75% for next 3 hours.",
        "priority": "urgent",
        "category": "sales_target",
        "target_store": "ALL",
        "author_name": "Operational Head",
        "author_title": "Executive Director / Operations Head",
    }
    create_res = client.post("/api/daily/directives", json=payload, headers=admin_headers)
    assert create_res.status_code == 200
    created = create_res.json()["directive"]
    directive_id = created["id"]
    assert created["title"] == "Special Peak Hour Flash Target"

    # 2. Manager acknowledges the directive
    ack_res = client.post(f"/api/daily/directives/{directive_id}/acknowledge", json={}, headers=nw_headers)
    assert ack_res.status_code == 200
    assert len(ack_res.json()["directive"]["read_by"]) >= 1

    # 3. Admin updates the directive
    update_res = client.put(
        f"/api/daily/directives/{directive_id}",
        json={"title": "Updated Peak Hour Target", "active": True},
        headers=admin_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["directive"]["title"] == "Updated Peak Hour Target"

    # 4. Manager cannot delete admin directive
    del_forbidden = client.delete(f"/api/daily/directives/{directive_id}", headers=nw_headers)
    assert del_forbidden.status_code == 403

    # 5. Admin deletes the directive
    del_res = client.delete(f"/api/daily/directives/{directive_id}", headers=admin_headers)
    assert del_res.status_code == 200


def test_manager_submits_complaint_and_remarks_to_operational_head(client, nw_headers, admin_headers):
    # 1. Manager submits a complaint/requisition to Operational Head
    payload = {
        "title": "POS Barcode Scanner Fault at Counter 2",
        "message": "Scanner is unresponsive during peak billing hour. Immediate tech support requested.",
        "priority": "urgent",
        "category": "complaint",
        "target_store": "ADMIN",
    }
    submit_res = client.post("/api/daily/directives", json=payload, headers=nw_headers)
    assert submit_res.status_code == 200
    data = submit_res.json()["directive"]
    assert data["category"] == "complaint"
    assert data["priority"] == "urgent"
    assert "NEW MARKET" in data["author_title"].upper()
    report_id = data["id"]

    # 2. Admin retrieves directives and sees manager's complaint
    admin_get = client.get("/api/daily/directives", headers=admin_headers)
    assert admin_get.status_code == 200
    admin_directives = admin_get.json()["directives"]
    matching = [d for d in admin_directives if d["id"] == report_id]
    assert len(matching) == 1
    assert matching[0]["title"] == "POS Barcode Scanner Fault at Counter 2"

    # 3. Manager can delete their own submitted complaint
    del_own = client.delete(f"/api/daily/directives/{report_id}", headers=nw_headers)
    assert del_own.status_code == 200
