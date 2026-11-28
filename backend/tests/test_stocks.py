"""Unit & Security Tests for Stocks Management (src/stocks_store.py and api/routes_stocks.py)."""
from __future__ import annotations

import mongomock
import pytest
from fastapi import HTTPException
from pymongo.database import Database

from api.auth import CurrentUser, require_store_access
from db.models import STOCK_INVENTORY, STOCK_MOVEMENTS, STOCK_TRANSFERS, ensure_indexes
from src import stocks_store


@pytest.fixture
def mock_db() -> Database:
    client = mongomock.MongoClient()
    db = client["citimart_test"]
    ensure_indexes(db)
    return db


def test_inward_grn_updates_inventory_and_logs_movement(mock_db: Database):
    items = [
        {
            "barcode": "8901112223334",
            "item_name": "Premium Cotton Shirt",
            "division": "Apparel",
            "section": "Menswear",
            "department": "Casual Shirts",
            "brand": "Raymond",
            "mrp": 1499.0,
            "cost_price": 750.0,
            "quantity": 25,
            "reorder_level": 5,
            "unit_of_measure": "Pcs",
        }
    ]

    res = stocks_store.record_inward_grn(
        db=mock_db,
        store_code="NM",
        items=items,
        reference_id="CHALLAN-9001",
        remarks="Received from supplier",
        created_by="mgr_nm",
    )
    assert len(res) == 1
    assert res[0]["current_stock"] == 25

    # Check inventory query
    inv = stocks_store.list_inventory(mock_db, store_code="NM", search="8901112223334")
    assert inv["total"] == 1
    assert inv["items"][0]["barcode"] == "8901112223334"
    assert inv["items"][0]["current_stock"] == 25

    # Check immutable movement
    movs = stocks_store.list_movements(mock_db, store_code="NM", barcode="8901112223334")
    assert len(movs) == 1
    assert movs[0]["movement_type"] == "GRN_INWARD"
    assert movs[0]["quantity"] == 25
    assert movs[0]["balance_after"] == 25
    assert movs[0]["reference_id"] == "CHALLAN-9001"


def test_stock_adjustment_damage_and_audit(mock_db: Database):
    barcode = "8905556667778"
    stocks_store.record_inward_grn(
        db=mock_db,
        store_code="NM",
        items=[{"barcode": barcode, "item_name": "Glass Vase", "quantity": 10}],
        created_by="mgr_nm",
    )

    # Write off 2 damaged items
    updated = stocks_store.record_adjustment(
        db=mock_db,
        store_code="NM",
        barcode=barcode,
        adjustment_type="DAMAGE_WRITE_OFF",
        quantity_change=-2,
        reason="Broken in transit",
        created_by="mgr_nm",
    )
    assert updated["current_stock"] == 8

    # Prevent negative stock adjustment
    with pytest.raises(ValueError, match="Cannot adjust below zero"):
        stocks_store.record_adjustment(
            db=mock_db,
            store_code="NM",
            barcode=barcode,
            adjustment_type="DAMAGE_WRITE_OFF",
            quantity_change=-15,
            reason="Excessive deduction",
            created_by="mgr_nm",
        )


def test_inter_store_transfer_two_phase_commit(mock_db: Database):
    barcode = "8909991112223"
    # 1. Inward 20 items to NM
    stocks_store.record_inward_grn(
        db=mock_db,
        store_code="NM",
        items=[{"barcode": barcode, "item_name": "Silk Scarf", "quantity": 20}],
        created_by="mgr_nm",
    )

    # 2. Initiate transfer NM -> HB (5 units)
    trf = stocks_store.create_transfer(
        db=mock_db,
        from_store="NM",
        to_store="HB",
        items=[{"barcode": barcode, "quantity": 5}],
        notes="Stock transfer to HB",
        created_by="mgr_nm",
    )
    trf_id = trf["transfer_id"]
    assert trf["status"] == "INITIATED"

    # NM stock is still 20 before dispatch
    nm_item = stocks_store.get_stock_item(mock_db, "NM", barcode)
    assert nm_item["current_stock"] == 20

    # 3. Dispatch transfer: NM stock decreases to 15
    dispatched = stocks_store.dispatch_transfer(mock_db, trf_id, dispatched_by="mgr_nm")
    assert dispatched["status"] == "DISPATCHED"
    nm_item_after = stocks_store.get_stock_item(mock_db, "NM", barcode)
    assert nm_item_after["current_stock"] == 15

    # 4. Receive transfer: HB stock increases to 5
    received = stocks_store.receive_transfer(mock_db, trf_id, received_by="mgr_hb")
    assert received["status"] == "RECEIVED"
    hb_item = stocks_store.get_stock_item(mock_db, "HB", barcode)
    assert hb_item["current_stock"] == 5


def test_inter_store_transfer_insufficient_stock_fails(mock_db: Database):
    barcode = "8900000000001"
    stocks_store.record_inward_grn(
        db=mock_db,
        store_code="NM",
        items=[{"barcode": barcode, "item_name": "Item A", "quantity": 3}],
        created_by="mgr_nm",
    )

    with pytest.raises(ValueError, match="Insufficient stock"):
        stocks_store.create_transfer(
            db=mock_db,
            from_store="NM",
            to_store="CHW",
            items=[{"barcode": barcode, "quantity": 10}],
            created_by="mgr_nm",
        )


def test_transfer_rejection_reverts_stock_to_sender(mock_db: Database):
    barcode = "8907778889990"
    stocks_store.record_inward_grn(
        db=mock_db,
        store_code="NM",
        items=[{"barcode": barcode, "item_name": "Leather Belt", "quantity": 10}],
        created_by="mgr_nm",
    )

    trf = stocks_store.create_transfer(
        db=mock_db,
        from_store="NM",
        to_store="HB",
        items=[{"barcode": barcode, "quantity": 4}],
        created_by="mgr_nm",
    )
    stocks_store.dispatch_transfer(mock_db, trf["transfer_id"], dispatched_by="mgr_nm")
    assert stocks_store.get_stock_item(mock_db, "NM", barcode)["current_stock"] == 6

    # HB rejects the dispatched transfer
    rejected = stocks_store.reject_or_cancel_transfer(
        db=mock_db,
        transfer_id=trf["transfer_id"],
        action="REJECT",
        user="mgr_hb",
        reason="Damaged in transit",
    )
    assert rejected["status"] == "REJECTED"
    # Stock reverted back to NM
    assert stocks_store.get_stock_item(mock_db, "NM", barcode)["current_stock"] == 10


def test_stocks_multi_tenant_authorization():
    nm_user = CurrentUser(sub="u1", username="mgr_nm", role="manager", store_code="NM")
    admin_user = CurrentUser(sub="u0", username="admin", role="admin", store_code=None)

    # Manager allowed on own store
    assert require_store_access("NM", nm_user).store_code == "NM"

    # Manager forbidden from other store
    with pytest.raises(HTTPException) as exc_info:
        require_store_access("HB", nm_user)
    assert exc_info.value.status_code == 403

    # Admin allowed on any valid store
    assert require_store_access("HB", admin_user).role == "admin"
    assert require_store_access("CHW", admin_user).role == "admin"


def test_double_dispatch_blocked_and_single_movement(mock_db: Database):
    barcode = "8901010101010"
    stocks_store.record_inward_grn(
        db=mock_db,
        store_code="NM",
        items=[{"barcode": barcode, "item_name": "Jacket", "quantity": 10}],
        created_by="mgr_nm",
    )
    trf = stocks_store.create_transfer(
        db=mock_db,
        from_store="NM",
        to_store="HB",
        items=[{"barcode": barcode, "quantity": 4}],
        created_by="mgr_nm",
    )
    stocks_store.dispatch_transfer(mock_db, trf["transfer_id"], dispatched_by="mgr_nm")

    with pytest.raises(stocks_store.StockConflict):
        stocks_store.dispatch_transfer(mock_db, trf["transfer_id"], dispatched_by="mgr_nm")

    assert stocks_store.get_stock_item(mock_db, "NM", barcode)["current_stock"] == 6
    movs = mock_db[STOCK_MOVEMENTS].count_documents(
        {"reference_id": trf["transfer_id"], "movement_type": "TRANSFER_OUT"}
    )
    assert movs == 1


def test_dispatch_compensates_when_stock_drops_after_create(mock_db: Database):
    b1, b2 = "8902020202001", "8902020202002"
    stocks_store.record_inward_grn(
        db=mock_db,
        store_code="NM",
        items=[
            {"barcode": b1, "item_name": "Item 1", "quantity": 10},
            {"barcode": b2, "item_name": "Item 2", "quantity": 5},
        ],
        created_by="mgr_nm",
    )
    trf = stocks_store.create_transfer(
        db=mock_db,
        from_store="NM",
        to_store="HB",
        items=[{"barcode": b1, "quantity": 4}, {"barcode": b2, "quantity": 5}],
        created_by="mgr_nm",
    )
    # Stock for b2 drops before dispatch
    stocks_store.record_adjustment(
        db=mock_db,
        store_code="NM",
        barcode=b2,
        adjustment_type="DAMAGE_WRITE_OFF",
        quantity_change=-2,
        reason="Damaged during handling",
        created_by="mgr_nm",
    )

    with pytest.raises(stocks_store.StockConflict, match=b2):
        stocks_store.dispatch_transfer(mock_db, trf["transfer_id"], dispatched_by="mgr_nm")

    # b1 compensated back to 10, b2 stays 3, transfer back to INITIATED, no TRANSFER_OUT movements
    assert stocks_store.get_stock_item(mock_db, "NM", b1)["current_stock"] == 10
    assert stocks_store.get_stock_item(mock_db, "NM", b2)["current_stock"] == 3
    assert stocks_store.get_transfer(mock_db, trf["transfer_id"])["status"] == "INITIATED"
    assert mock_db[STOCK_MOVEMENTS].count_documents({"reference_id": trf["transfer_id"]}) == 0


def test_concurrent_negative_adjustments_never_go_below_zero(mock_db: Database):
    from concurrent.futures import ThreadPoolExecutor

    barcode = "8903030303001"
    stocks_store.record_inward_grn(
        db=mock_db,
        store_code="NM",
        items=[{"barcode": barcode, "item_name": "Concurrent Item", "quantity": 5}],
        created_by="mgr_nm",
    )

    def _deduct(_i: int) -> bool:
        try:
            stocks_store.record_adjustment(
                db=mock_db,
                store_code="NM",
                barcode=barcode,
                adjustment_type="DAMAGE_WRITE_OFF",
                quantity_change=-1,
                reason="Concurrent write-off check",
                created_by="mgr_nm",
            )
            return True
        except ValueError:
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(_deduct, range(12)))

    succeeded = sum(1 for r in results if r)
    final_stock = stocks_store.get_stock_item(mock_db, "NM", barcode)["current_stock"]
    assert final_stock >= 0
    assert final_stock == 5 - succeeded
    assert succeeded == 5


def test_adjustment_authority_and_extra_forbid(client: TestClient, db_session):
    from tests.conftest import make_token

    mgr_nm = make_token("manager", "NM", "mgr_nm")
    admin = make_token("admin", None, "admin")
    barcode = "8904040404001"
    stocks_store.record_inward_grn(
        db=db_session,
        store_code="NM",
        items=[{"barcode": barcode, "item_name": "Shirt", "quantity": 10}],
        created_by="admin",
    )

    # Manager positive AUDIT_ADJUSTMENT -> 403
    r_pos_mgr = client.post(
        "/api/daily/stocks/adjustment",
        json={
            "store_code": "NM",
            "barcode": barcode,
            "adjustment_type": "AUDIT_ADJUSTMENT",
            "quantity_change": 3,
            "reason": "Found extra units on shelf",
        },
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert r_pos_mgr.status_code == 403

    # Admin positive AUDIT_ADJUSTMENT -> 200
    r_pos_adm = client.post(
        "/api/daily/stocks/adjustment",
        json={
            "store_code": "NM",
            "barcode": barcode,
            "adjustment_type": "AUDIT_ADJUSTMENT",
            "quantity_change": 3,
            "reason": "Found extra units on shelf",
        },
        headers={"Authorization": f"Bearer {admin}"},
    )
    assert r_pos_adm.status_code == 200

    # Manager negative AUDIT_ADJUSTMENT -> 200
    r_neg_mgr = client.post(
        "/api/daily/stocks/adjustment",
        json={
            "store_code": "NM",
            "barcode": barcode,
            "adjustment_type": "AUDIT_ADJUSTMENT",
            "quantity_change": -2,
            "reason": "Damaged during display setup",
        },
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert r_neg_mgr.status_code == 200

    # Extra unknown field -> 422
    r_extra = client.post(
        "/api/daily/stocks/adjustment",
        json={
            "store_code": "NM",
            "barcode": barcode,
            "adjustment_type": "DAMAGE_WRITE_OFF",
            "quantity_change": -1,
            "reason": "Extra field validation check",
            "unexpected_field": "nope",
        },
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert r_extra.status_code == 422


def test_second_grn_preserves_reorder_level_unless_sent(client: TestClient, db_session):
    from tests.conftest import make_token

    mgr_nm = make_token("manager", "NM", "mgr_nm")
    barcode = "8905050505001"

    r1 = client.post(
        "/api/daily/stocks/inward",
        json={
            "store_code": "NM",
            "items": [{"barcode": barcode, "item_name": "Kurta", "quantity": 5, "reorder_level": 25}],
        },
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert r1.status_code == 200
    assert stocks_store.get_stock_item(db_session, "NM", barcode)["reorder_level"] == 25

    # Second GRN without reorder_level keeps 25
    r2 = client.post(
        "/api/daily/stocks/inward",
        json={"store_code": "NM", "items": [{"barcode": barcode, "item_name": "Kurta", "quantity": 5}]},
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert r2.status_code == 200
    assert stocks_store.get_stock_item(db_session, "NM", barcode)["reorder_level"] == 25

    # Third GRN with explicit reorder_level updates it
    r3 = client.post(
        "/api/daily/stocks/inward",
        json={
            "store_code": "NM",
            "items": [{"barcode": barcode, "item_name": "Kurta", "quantity": 5, "reorder_level": 40}],
        },
        headers={"Authorization": f"Bearer {mgr_nm}"},
    )
    assert r3.status_code == 200
    assert stocks_store.get_stock_item(db_session, "NM", barcode)["reorder_level"] == 40


def test_transfer_rejection_writes_transfer_reversal(mock_db: Database):
    barcode = "8906060606001"
    stocks_store.record_inward_grn(
        db=mock_db,
        store_code="NM",
        items=[{"barcode": barcode, "item_name": "Saree", "quantity": 10}],
        created_by="mgr_nm",
    )
    trf = stocks_store.create_transfer(
        db=mock_db,
        from_store="NM",
        to_store="HB",
        items=[{"barcode": barcode, "quantity": 3}],
        created_by="mgr_nm",
    )
    stocks_store.dispatch_transfer(mock_db, trf["transfer_id"], dispatched_by="mgr_nm")
    stocks_store.reject_or_cancel_transfer(mock_db, trf["transfer_id"], action="REJECT", user="mgr_hb", reason="Wrong")

    movs = stocks_store.list_movements(mock_db, store_code="NM", movement_type="TRANSFER_REVERSAL")
    assert len(movs) == 1
    assert movs[0]["reference_id"] == trf["transfer_id"]
    assert movs[0]["quantity"] == 3
