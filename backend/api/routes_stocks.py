"""Stocks Management API Routes.

Handles store inventory lookups, Inward GRN creation, stock adjustments,
immutable movement audit logs, and inter-store stock transfers.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user, require_store_access
from config.settings import STORE_CODE_TO_NAME
from db.session import get_db
from src import stocks_store

router = APIRouter(prefix="/api/daily/stocks", tags=["stocks"])


class InwardItemPayload(BaseModel):
    barcode: str = Field(..., min_length=1, max_length=64)
    item_name: str = Field(..., min_length=2, max_length=150)
    division: str = Field(default="General", max_length=80)
    section: str = Field(default="General", max_length=80)
    department: str = Field(default="General", max_length=80)
    brand: Optional[str] = Field(default="", max_length=80)
    mrp: float = Field(default=0.0, ge=0.0)
    cost_price: Optional[float] = Field(default=None, ge=0.0)
    quantity: int = Field(..., gt=0, description="Quantity received")
    reorder_level: Optional[int] = Field(default=10, ge=0)
    unit_of_measure: Optional[str] = Field(default="Pcs", max_length=20)


class RecordInwardGRNPayload(BaseModel):
    store_code: Literal["NM", "HB", "CHW"]
    items: List[InwardItemPayload] = Field(..., min_length=1)
    reference_id: Optional[str] = Field(default="", max_length=80, description="Challan / PO / Invoice #")
    remarks: Optional[str] = Field(default="", max_length=300)


class AdjustmentPayload(BaseModel):
    store_code: Literal["NM", "HB", "CHW"]
    barcode: str = Field(..., min_length=1, max_length=64)
    adjustment_type: Literal["DAMAGE_WRITE_OFF", "AUDIT_ADJUSTMENT"]
    quantity_change: int = Field(..., description="Negative for write-off/damage, positive/negative for audit")
    reason: str = Field(..., min_length=3, max_length=300)


class TransferItemPayload(BaseModel):
    barcode: str = Field(..., min_length=1, max_length=64)
    quantity: int = Field(..., gt=0)


class CreateTransferPayload(BaseModel):
    from_store: Literal["NM", "HB", "CHW"]
    to_store: Literal["NM", "HB", "CHW"]
    items: List[TransferItemPayload] = Field(..., min_length=1)
    notes: Optional[str] = Field(default="", max_length=300)


class TransferRejectPayload(BaseModel):
    reason: Optional[str] = Field(default="", max_length=300)


@router.get("/summary")
def get_stocks_summary(
    store_code: Optional[str] = Query(None, description="Store code or ALL"),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve high-level stock KPIs (Total SKUs, Units, Low Stock, Pending Transfers)."""
    effective_store = store_code
    if not user.is_admin:
        effective_store = user.store_code or store_code
    if effective_store and effective_store.upper() != "ALL":
        require_store_access(effective_store, user)

    return stocks_store.get_stocks_summary(db, effective_store)


@router.get("/inventory")
def list_inventory(
    store_code: Optional[str] = Query(None, description="Store code or ALL"),
    search: Optional[str] = Query(None),
    division: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    low_stock_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Query current store inventory items with search and low-stock filter."""
    effective_store = store_code
    if not user.is_admin:
        effective_store = user.store_code or store_code
    if effective_store and effective_store.upper() != "ALL":
        require_store_access(effective_store, user)

    return stocks_store.list_inventory(
        db=db,
        store_code=effective_store,
        search=search,
        division=division,
        department=department,
        low_stock_only=low_stock_only,
        limit=limit,
        skip=skip,
    )


@router.post("/inward")
def record_inward_grn(
    payload: RecordInwardGRNPayload,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Record an Inward GRN for received inventory. Requires store access."""
    require_store_access(payload.store_code, user)
    items_raw = [item.model_dump() for item in payload.items]
    res = stocks_store.record_inward_grn(
        db=db,
        store_code=payload.store_code,
        items=items_raw,
        reference_id=payload.reference_id,
        remarks=payload.remarks,
        created_by=user.username,
    )
    return {"status": "success", "recorded_count": len(res), "items": res}


@router.post("/adjustment")
def record_adjustment(
    payload: AdjustmentPayload,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Record damage write-off or physical audit adjustment."""
    require_store_access(payload.store_code, user)
    try:
        updated = stocks_store.record_adjustment(
            db=db,
            store_code=payload.store_code,
            barcode=payload.barcode,
            adjustment_type=payload.adjustment_type,
            quantity_change=payload.quantity_change,
            reason=payload.reason,
            created_by=user.username,
        )
        return {"status": "success", "item": updated}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/movements")
def list_movements(
    store_code: Optional[str] = Query(None),
    barcode: Optional[str] = Query(None),
    movement_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve immutable stock movements ledger."""
    effective_store = store_code
    if not user.is_admin:
        effective_store = user.store_code or store_code
    if effective_store and effective_store.upper() != "ALL":
        require_store_access(effective_store, user)

    return stocks_store.list_movements(
        db=db,
        store_code=effective_store,
        barcode=barcode,
        movement_type=movement_type,
        limit=limit,
    )


@router.get("/transfers")
def list_transfers(
    store_code: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """List inter-store transfers."""
    effective_store = store_code
    if not user.is_admin:
        effective_store = user.store_code or store_code
    if effective_store and effective_store.upper() != "ALL":
        require_store_access(effective_store, user)

    return stocks_store.list_transfers(
        db=db,
        store_code=effective_store,
        status=status,
        limit=limit,
    )


@router.post("/transfers")
def create_transfer(
    payload: CreateTransferPayload,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Initiate an inter-store transfer from caller's store."""
    require_store_access(payload.from_store, user)
    try:
        items_raw = [item.model_dump() for item in payload.items]
        created = stocks_store.create_transfer(
            db=db,
            from_store=payload.from_store,
            to_store=payload.to_store,
            items=items_raw,
            notes=payload.notes,
            created_by=user.username,
        )
        return {"status": "success", "transfer": created}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/transfers/{transfer_id}/dispatch")
def dispatch_transfer(
    transfer_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Dispatch an initiated transfer (deducts stock from source store)."""
    transfer = db[stocks_store.STOCK_TRANSFERS].find_one({"transfer_id": transfer_id.strip()})
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found.")
    require_store_access(transfer["from_store"], user)

    try:
        updated = stocks_store.dispatch_transfer(db, transfer_id, dispatched_by=user.username)
        return {"status": "success", "transfer": updated}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/transfers/{transfer_id}/receive")
def receive_transfer(
    transfer_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Receive a dispatched transfer (increments stock in destination store)."""
    transfer = db[stocks_store.STOCK_TRANSFERS].find_one({"transfer_id": transfer_id.strip()})
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found.")
    require_store_access(transfer["to_store"], user)

    try:
        updated = stocks_store.receive_transfer(db, transfer_id, received_by=user.username)
        return {"status": "success", "transfer": updated}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/transfers/{transfer_id}/cancel")
def cancel_or_reject_transfer(
    transfer_id: str,
    payload: Optional[TransferRejectPayload] = None,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Cancel (if INITIATED) or reject (if DISPATCHED, reverting source stock)."""
    transfer = db[stocks_store.STOCK_TRANSFERS].find_one({"transfer_id": transfer_id.strip()})
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found.")

    # Only from_store can cancel an initiated transfer; only to_store can reject a dispatched transfer (or admin)
    status = transfer.get("status")
    if status == "INITIATED":
        require_store_access(transfer["from_store"], user)
        action = "CANCEL"
    elif status == "DISPATCHED":
        require_store_access(transfer["to_store"], user)
        action = "REJECT"
    else:
        raise HTTPException(status_code=400, detail=f"Cannot cancel/reject transfer in status {status}")

    try:
        reason = payload.reason if payload else ""
        updated = stocks_store.reject_or_cancel_transfer(
            db, transfer_id, action=action, user=user.username, reason=reason
        )
        return {"status": "success", "transfer": updated}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

