"""Tests for Boss (Raphael Sir) Directives, Alerts and Instructions."""
from __future__ import annotations


def test_manager_receives_default_directives(client, nw_headers):
    r = client.get("/api/daily/directives", headers=nw_headers)
    assert r.status_code == 200
    data = r.json()
    assert "directives" in data
    assert "unread_count" in data
    assert len(data["directives"]) >= 1
    assert data["directives"][0]["author_name"] == "Raphael Sir"


def test_admin_creates_and_manages_directive(client, admin_headers, nw_headers):
    # 1. Admin creates a directive
    payload = {
        "title": "Special Peak Hour Flash Target",
        "message": "Push conversion to 75% for next 3 hours.",
        "priority": "urgent",
        "category": "sales_target",
        "target_store": "ALL",
        "author_name": "Raphael Sir",
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

    # 4. Manager cannot delete or create
    del_forbidden = client.delete(f"/api/daily/directives/{directive_id}", headers=nw_headers)
    assert del_forbidden.status_code == 403

    # 5. Admin deletes the directive
    del_res = client.delete(f"/api/daily/directives/{directive_id}", headers=admin_headers)
    assert del_res.status_code == 200
