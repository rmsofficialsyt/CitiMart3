"""Stocks Management API Routes.

Handles store inventory lookups, Inward GRN creation, stock adjustments,
immutable movement audit logs, and inter-store stock transfers.

Access rules (docs/specs/ops-modules-hardening/spec.md):
  * read scope via resolve_store_scope -- fails closed (US-0)
  * a store manager may only *reduce* stock by adjustment; any increase is
    admin-only (US-S2) -- otherwise shrinkage could be hidden by "recounting"
  * transfer state changes are conditional in src/stocks_store.py; a lost race
    or a stale status is 409, never a double stock movement (US-S1)
Errors: StockNotFound -> 404, StockConflict -> 409, other ValueError -> 400.
"""
from __future__ import annotations

from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user, require_store_access, resolve_store_scope
from db.session import get_db
from src import stocks_store
from src.audit import audit_event
from src.rate_limiter import get_client_ip

router = APIRouter(prefix="/api/daily/stocks", tags=["stocks"])


class InwardItemPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    barcode: str = Field(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9\-]+$")
    item_name: str = Field(..., min_length=2, max_length=150)
    division: str = Field(default="General", max_length=80)
    section: str = Field(default="General", max_length=80)
    department: str = Field(default="General", max_length=80)
    brand: Optional[str] = Field(default="", max_length=80)
    mrp: float = Field(default=0.0, ge=0.0, le=10_000_000)
    cost_price: Optional[float] = Field(default=None, ge=0.0, le=10_000_000)
    quantity: int = Field(..., gt=0, le=100_000, description="Quantity received")
    reorder_level: Optional[int] = Field(default=10, ge=0, le=100_000)
    unit_of_measure: Optional[str] = Field(default="Pcs", max_length=20)


class RecordInwardGRNPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_code: Literal["NM", "HB", "CHW"]
    items: List[InwardItemPayload] = Field(..., min_length=1, max_length=200)
    reference_id: Optional[str] = Field(default="", max_length=80, description="Challan / PO / Invoice #")
    remarks: Optional[str] = Field(default="", max_length=300)


class AdjustmentPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    store_code: Literal["NM", "HB", "CHW"]
    barcode: str = Field(..., min_length=1, max_length=64)
    adjustment_type: Literal["DAMAGE_WRITE_OFF", "AUDIT_ADJUSTMENT"]
    quantity_change: int = Field(..., ge=-100_000, le=100_000, description="Negative removes stock; positive (admin only) adds")
    reason: str = Field(..., min_length=10, max_length=300)


class TransferItemPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    barcode: str = Field(..., min_length=1, max_length=64)
    quantity: int = Field(..., gt=0, le=100_000)


class CreateTransferPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_store: Literal["NM", "HB", "CHW"]
    to_store: Literal["NM", "HB", "CHW"]
    items: List[TransferItemPayload] = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = Field(default="", max_length=300)


class TransferRejectPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Optional[str] = Field(default="", max_length=300)


def _http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, stocks_store.StockNotFound):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, stocks_store.StockConflict):
        return HTTPException(status_code=409, detail=str(exc))
    return HTTPException(status_code=400, detail=str(exc))


def _transfer_or_404(db: Database, transfer_id: str) -> dict:
    transfer = stocks_store.get_transfer(db, transfer_id)
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found.")
    return transfer


def _audit_transfer(request: Request, db: Database, user: CurrentUser, action: str, transfer: dict) -> None:
    audit_event(
        f"stock.transfer.{action}", db=db, username=user.username, ip=get_client_ip(request),
        target=transfer.get("transfer_id"),
        details={"from": transfer.get("from_store"), "to": transfer.get("to_store"), "status": transfer.get("status")},
    )


@router.get("/summary")
def get_stocks_summary(
    store_code: Optional[str] = Query(None, max_length=8, description="Store code or ALL"),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve high-level stock KPIs (Total SKUs, Units, Low Stock, Pending Transfers)."""
    return stocks_store.get_stocks_summary(db, resolve_store_scope(user, store_code))


@router.get("/inventory")
def list_inventory(
    store_code: Optional[str] = Query(None, max_length=8, description="Store code or ALL"),
    search: Optional[str] = Query(None, max_length=100),
    division: Optional[str] = Query(None, max_length=80),
    department: Optional[str] = Query(None, max_length=80),
    low_stock_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Query current store inventory items with search and low-stock filter."""
    return stocks_store.list_inventory(
        db=db,
        store_code=resolve_store_scope(user, store_code),
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
    # exclude_unset: a field the GRN didn't send keeps the item's existing
    # value instead of being reset to the model default (spec US-S3).
    items_raw = [item.model_dump(exclude_unset=True) for item in payload.items]
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
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Record damage write-off or physical audit adjustment."""
    require_store_access(payload.store_code, user)
    if payload.quantity_change > 0 and not user.is_admin:
        raise HTTPException(
            status_code=403,
            detail="Only Central Admin can add stock through an adjustment. Record received goods as a GRN.",
        )
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
    except (ValueError, LookupError) as e:
        raise _http_error(e)

    audit_event(
        "stock.adjustment", db=db, username=user.username, ip=get_client_ip(request),
        target=f"{payload.store_code}:{payload.barcode}",
        details={
            "type": payload.adjustment_type,
            "delta": payload.quantity_change,
            "balance_after": updated.get("current_stock"),
        },
    )
    return {"status": "success", "item": updated}


@router.get("/movements")
def list_movements(
    store_code: Optional[str] = Query(None, max_length=8),
    barcode: Optional[str] = Query(None, max_length=64),
    movement_type: Optional[str] = Query(None, max_length=30),
    limit: int = Query(100, ge=1, le=500),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve immutable stock movements ledger."""
    return stocks_store.list_movements(
        db=db,
        store_code=resolve_store_scope(user, store_code),
        barcode=barcode,
        movement_type=movement_type,
        limit=limit,
    )


@router.get("/transfers")
def list_transfers(
    store_code: Optional[str] = Query(None, max_length=8),
    status: Optional[str] = Query(None, max_length=20),
    limit: int = Query(100, ge=1, le=500),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """List inter-store transfers."""
    return stocks_store.list_transfers(
        db=db,
        store_code=resolve_store_scope(user, store_code),
        status=status,
        limit=limit,
    )


@router.post("/transfers")
def create_transfer(
    payload: CreateTransferPayload,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Initiate an inter-store transfer from caller's store."""
    require_store_access(payload.from_store, user)
    try:
        created = stocks_store.create_transfer(
            db=db,
            from_store=payload.from_store,
            to_store=payload.to_store,
            items=[item.model_dump() for item in payload.items],
            notes=payload.notes,
            created_by=user.username,
        )
    except (ValueError, LookupError) as e:
        raise _http_error(e)
    _audit_transfer(request, db, user, "create", created)
    return {"status": "success", "transfer": created}


@router.put("/transfers/{transfer_id}/dispatch")
def dispatch_transfer(
    transfer_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Dispatch an initiated transfer (deducts stock from source store)."""
    transfer = _transfer_or_404(db, transfer_id)
    require_store_access(transfer["from_store"], user)
    try:
        updated = stocks_store.dispatch_transfer(db, transfer_id, dispatched_by=user.username)
    except (ValueError, LookupError) as e:
        raise _http_error(e)
    _audit_transfer(request, db, user, "dispatch", updated)
    return {"status": "success", "transfer": updated}


@router.put("/transfers/{transfer_id}/receive")
def receive_transfer(
    transfer_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Receive a dispatched transfer (increments stock in destination store)."""
    transfer = _transfer_or_404(db, transfer_id)
    require_store_access(transfer["to_store"], user)
    try:
        updated = stocks_store.receive_transfer(db, transfer_id, received_by=user.username)
    except (ValueError, LookupError) as e:
        raise _http_error(e)
    _audit_transfer(request, db, user, "receive", updated)
    return {"status": "success", "transfer": updated}


@router.put("/transfers/{transfer_id}/cancel")
def cancel_or_reject_transfer(
    transfer_id: str,
    request: Request,
    payload: Optional[TransferRejectPayload] = None,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Cancel (sender, while INITIATED) or reject (receiver, while DISPATCHED,
    returning stock to the sender). The action is chosen from the status read
    here; the store's conditional flip makes a status change in between a 409."""
    transfer = _transfer_or_404(db, transfer_id)
    status = transfer.get("status")
    if status == "INITIATED":
        require_store_access(transfer["from_store"], user)
        action = "CANCEL"
    elif status == "DISPATCHED":
        require_store_access(transfer["to_store"], user)
        action = "REJECT"
    else:
        raise HTTPException(status_code=409, detail=f"Cannot cancel/reject a transfer that is {status}.")

    try:
        updated = stocks_store.reject_or_cancel_transfer(
            db, transfer_id, action=action, user=user.username, reason=payload.reason if payload else ""
        )
    except (ValueError, LookupError) as e:
        raise _http_error(e)
    _audit_transfer(request, db, user, action.lower(), updated)
    return {"status": "success", "transfer": updated}
