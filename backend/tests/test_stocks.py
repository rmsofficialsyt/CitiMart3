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
