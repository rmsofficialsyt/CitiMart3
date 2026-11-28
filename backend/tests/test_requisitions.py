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

    # 5. Delete requisition (Approved slip cannot be deleted by manager -> 409; admin -> 200)
    mgr_del = client.delete(
        f"/api/daily/requisitions/{req_id}",
        headers={"Authorization": f"Bearer {mgr_token}"},
    )
    assert mgr_del.status_code == 409
    del_res = client.delete(
        f"/api/daily/requisitions/{req_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True


def test_manager_cannot_update_requisition_status(client: TestClient):
    mgr_nm = make_token("manager", "NM", "mgr_nm")
    create_res = client.post(
        "/api/daily/requisitions",
        json={
            "store_code": "NM",
            "items": [{"division": "D", "section": "S", "department": "Dept", "product_required": "P"}],
        },
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert create_res.status_code == 200
    req_id = create_res.json()["requisition"]["_id"]

    status_res = client.put(
        f"/api/daily/requisitions/{req_id}/status",
        json={"status": "Approved", "admin_remarks": "Self-approved"},
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert status_res.status_code == 403


def _make_slip(client: TestClient, token: str, store_code: str = "NM") -> int:
    res = client.post(
        "/api/daily/requisitions",
        json={
            "store_code": store_code,
            "items": [{"division": "Apparel", "section": "Mens", "department": "Shirts", "product_required": "Tee"}],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    return res.json()["requisition"]["_id"]


def _advance_to(client: TestClient, admin_token: str, req_id: int, target: str) -> None:
    paths = {
        "Pending": [],
        "In Review": ["In Review"],
        "Approved": ["Approved"],
        "In Transit": ["Approved", "In Transit"],
        "Fulfilled": ["Approved", "Fulfilled"],
        "Rejected": ["Rejected"],
    }
    for st in paths[target]:
        r = client.put(
            f"/api/daily/requisitions/{req_id}/status",
            json={"status": st},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200


@pytest.mark.parametrize(
    "src,dst,allowed",
    [
        ("Pending", "In Review", True),
        ("Pending", "Approved", True),
        ("Pending", "Rejected", True),
        ("Pending", "In Transit", False),
        ("Pending", "Fulfilled", False),
        ("In Review", "Approved", True),
        ("In Review", "Rejected", True),
        ("In Review", "Pending", True),
        ("In Review", "In Transit", False),
        ("In Review", "Fulfilled", False),
        ("Approved", "In Transit", True),
        ("Approved", "Fulfilled", True),
        ("Approved", "Rejected", True),
        ("Approved", "Pending", False),
        ("In Transit", "Fulfilled", True),
        ("In Transit", "Pending", False),
        ("In Transit", "Rejected", False),
        ("Fulfilled", "Pending", False),
        ("Fulfilled", "Rejected", False),
        ("Rejected", "Pending", False),
        ("Rejected", "Approved", False),
    ],
)
def test_requisition_status_transitions(client: TestClient, src: str, dst: str, allowed: bool):
    mgr_nm = make_token("manager", "NM", "mgr_nm")
    admin = make_token("admin", None, "admin")
    req_id = _make_slip(client, mgr_nm)
    _advance_to(client, admin, req_id, src)

    res = client.put(
        f"/api/daily/requisitions/{req_id}/status",
        json={"status": dst},
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert res.status_code == (200 if allowed else 409)


def test_requisition_stale_status_race(client: TestClient, db_session):
    from src import requisitions_store

    mgr_nm = make_token("manager", "NM", "mgr_nm")
    req_id = _make_slip(client, mgr_nm)

    # Simulate two concurrent transitions from Pending: first succeeds, second hits 409
    r1 = requisitions_store.update_requisition_status(db_session, req_id, "Approved", actioned_by="admin")
    assert r1["status"] == "Approved"

    res = client.put(
        f"/api/daily/requisitions/{req_id}/status",
        json={"status": "Pending"},
        headers={"Authorization": f"Bearer {make_token('admin', None, 'admin')}"},
    )
    assert res.status_code == 409


def test_requisition_delete_guards(client: TestClient):
    mgr_a = make_token("manager", "NM", "mgr_nm_a")
    mgr_b = make_token("manager", "NM", "mgr_nm_b")
    admin = make_token("admin", None, "admin")

    # Own Pending -> 200
    r1 = _make_slip(client, mgr_a)
    assert client.delete(f"/api/daily/requisitions/{r1}", headers={"Authorization": f"Bearer {mgr_a}"}).status_code == 200

    # Own Approved -> 409
    r2 = _make_slip(client, mgr_a)
    _advance_to(client, admin, r2, "Approved")
    assert client.delete(f"/api/daily/requisitions/{r2}", headers={"Authorization": f"Bearer {mgr_a}"}).status_code == 409

    # Another user's -> 403
    assert client.delete(f"/api/daily/requisitions/{r2}", headers={"Authorization": f"Bearer {mgr_b}"}).status_code == 403

    # Admin deletes Approved -> 200
    assert client.delete(f"/api/daily/requisitions/{r2}", headers={"Authorization": f"Bearer {admin}"}).status_code == 200


def test_manager_slip_does_not_pollute_custom_categories(client: TestClient, db_session):
    from db.models import CUSTOM_CATEGORIES

    mgr_nm = make_token("manager", "NM", "mgr_nm")
    admin = make_token("admin", None, "admin")

    client.post(
        "/api/daily/requisitions",
        json={
            "store_code": "NM",
            "items": [{"division": "MgrCustomDiv", "section": "MgrSec", "department": "MgrDept"}],
        },
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert db_session[CUSTOM_CATEGORIES].count_documents({"division": "MgrCustomDiv"}) == 0

    client.post(
        "/api/daily/requisitions",
        json={
            "store_code": "NM",
            "items": [{"division": "AdminCustomDiv", "section": "AdminSec", "department": "AdminDept"}],
        },
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert db_session[CUSTOM_CATEGORIES].count_documents({"division": "AdminCustomDiv"}) == 1

