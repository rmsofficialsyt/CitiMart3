"""Tests for Product Requisition Slips and Categories API."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import make_token


def test_get_categories(client: TestClient):
    token = make_token("manager", "NM", "mgr_nm")
    res = client.get("/api/daily/requisitions/categories", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert "tree" in data
    assert "divisions" in data
    assert len(data["divisions"]) >= 15
    assert "Accoessories" in data["divisions"] or "Accessories" in str(data["divisions"])


def test_create_and_list_requisition(client: TestClient):
    mgr_token = make_token("manager", "NM", "mgr_nm")
    admin_token = make_token("admin", None, "admin")

    # 1. Manager creates a requisition slip
    payload = {
        "store_code": "NM",
        "date": "2026-09-21",
        "priority": "High",
        "remarks_general": "Urgent display requirements",
        "items": [
            {
                "sl_no": 1,
                "division": "Accoessories",
                "section": "Gift & Novelties",
                "department": "Baby Accessory",
                "barcode_details": "8901234567890 - Baby Soft Rattle",
                "brand": "MeeMee",
                "mrp": "399.00",
                "time_required": "2 days",
                "remarks": "Low floor inventory",
            },
            {
                "sl_no": 2,
                "division": "Custom Division",
                "section": "Custom Section",
                "department": "Custom Dept",
                "barcode_details": "8909999999999 - Custom Item",
                "brand": "Generic",
                "mrp": "150.00",
                "time_required": "1 day",
                "remarks": "New product trial",
            },
        ],
    }

    create_res = client.post(
        "/api/daily/requisitions",
        json=payload,
        headers={"Authorization": f"Bearer {mgr_token}"},
    )
    assert create_res.status_code == 200
    created = create_res.json()["requisition"]
    assert created["store_code"] == "NM"
    assert "LOURDES TEXTILES PVT. LTD. UNIT - CITIMART NEW MARKET" in created["store_name_full"]
    assert len(created["items"]) == 2
    assert created["status"] == "Pending"
    req_id = created["_id"]

    # 2. Admin queries list view
    list_res = client.get(
        "/api/daily/requisitions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["count"] >= 1
    found = [r for r in list_data["requisitions"] if r["_id"] == req_id]
    assert len(found) == 1
    assert found[0]["items"][0]["brand"] == "MeeMee"
    assert found[0]["items"][0]["mrp"] == "399.00"

    # 3. Admin updates requisition status
    status_payload = {
        "status": "Approved",
        "admin_remarks": "Approved. Dispatched from central warehouse.",
    }
    status_res = client.put(
        f"/api/daily/requisitions/{req_id}/status",
        json=status_payload,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert status_res.status_code == 200
    updated = status_res.json()["requisition"]
    assert updated["status"] == "Approved"
    assert updated["admin_remarks"] == "Approved. Dispatched from central warehouse."

    # 4. Admin exports requisitions to Excel
    export_res = client.get(
        "/api/daily/requisitions/export/xlsx",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert export_res.status_code == 200
    assert "spreadsheetml" in export_res.headers["content-type"]
    assert len(export_res.content) > 1000

    # 5. Delete requisition
    del_res = client.delete(
        f"/api/daily/requisitions/{req_id}",
        headers={"Authorization": f"Bearer {mgr_token}"},
    )
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True
