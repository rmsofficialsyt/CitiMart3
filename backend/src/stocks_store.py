"""Stocks Management Store: Inventory control, stock movements audit ledger, and inter-store transfers.

Backed by MongoDB collections:
- stock_inventory: Current snapshot per store and barcode.
- stock_movements: Immutable audit log for every stock addition, deduction, or adjustment.
- stock_transfers: Two-phase commit inter-store transfer state machine.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pymongo import ReturnDocument
from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME
from db.models import STOCK_INVENTORY, STOCK_MOVEMENTS, STOCK_TRANSFERS, next_id

logger = logging.getLogger(__name__)


def _clean_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def list_inventory(
    db: Database,
    store_code: Optional[str] = None,
    search: Optional[str] = None,
    division: Optional[str] = None,
    department: Optional[str] = None,
    low_stock_only: bool = False,
    limit: int = 100,
    skip: int = 0,
) -> Dict[str, Any]:
    """Query inventory items with filtering and pagination."""
    query: Dict[str, Any] = {}
    if store_code and store_code.upper() in STORE_CODE_TO_NAME:
        query["store_code"] = store_code.upper()

    if division:
        query["division"] = division.strip()
    if department:
        query["department"] = department.strip()

    if low_stock_only:
        # Match items where current_stock <= reorder_level
        query["$expr"] = {"$lte": ["$current_stock", "$reorder_level"]}

    if search:
        s = search.strip()
        query["$or"] = [
            {"barcode": {"$regex": s, "$options": "i"}},
            {"item_name": {"$regex": s, "$options": "i"}},
            {"brand": {"$regex": s, "$options": "i"}},
            {"department": {"$regex": s, "$options": "i"}},
        ]

    total_count = db[STOCK_INVENTORY].count_documents(query)
    cursor = (
        db[STOCK_INVENTORY]
        .find(query)
        .sort([("store_code", 1), ("item_name", 1)])
        .skip(max(0, skip))
        .limit(min(500, max(1, limit)))
    )

    items = [_clean_doc(doc) for doc in cursor]
    return {
        "total": total_count,
        "items": items,
        "limit": limit,
        "skip": skip,
    }


def get_stock_item(db: Database, store_code: str, barcode: str) -> Optional[Dict[str, Any]]:
    """Retrieve a single inventory item by store and barcode."""
    doc = db[STOCK_INVENTORY].find_one(
        {"store_code": store_code.upper(), "barcode": barcode.strip()}
    )
    return _clean_doc(doc)


def record_inward_grn(
    db: Database,
    store_code: str,
    items: List[Dict[str, Any]],
    reference_id: Optional[str] = None,
    remarks: Optional[str] = None,
    created_by: str = "system",
) -> List[Dict[str, Any]]:
    """Record an Inward Goods Received Note (GRN).

    Increments current_stock and appends an immutable GRN_INWARD movement.
    """
    code = store_code.upper()
    now_iso = datetime.now(timezone.utc).isoformat()
    results = []

    for item in items:
        barcode = str(item["barcode"]).strip()
        qty = int(item.get("quantity", 0))
        if qty <= 0:
            continue

        item_name = str(item.get("item_name") or "General Item").strip()
        division = str(item.get("division") or "General").strip()
        section = str(item.get("section") or "General").strip()
        department = str(item.get("department") or "General").strip()
        brand = str(item.get("brand") or "").strip()
        mrp = float(item.get("mrp") or 0.0)
        cost_price = float(item.get("cost_price") or 0.0) if item.get("cost_price") is not None else None
        reorder_level = int(item.get("reorder_level") or 10)
        uom = str(item.get("unit_of_measure") or "Pcs").strip()

        # Upsert stock inventory
        updated_doc = db[STOCK_INVENTORY].find_one_and_update(
            {"store_code": code, "barcode": barcode},
            {
                "$inc": {"current_stock": qty},
                "$set": {
                    "item_name": item_name,
                    "division": division,
                    "section": section,
                    "department": department,
                    "brand": brand,
                    "mrp": mrp,
                    "cost_price": cost_price,
                    "reorder_level": reorder_level,
                    "unit_of_measure": uom,
                    "last_restocked_at": now_iso,
                    "updated_at": now_iso,
                },
                "$setOnInsert": {
                    "store_code": code,
                    "barcode": barcode,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )

        bal_after = updated_doc["current_stock"]

        # Append immutable movement
        movement_doc = {
            "store_code": code,
            "barcode": barcode,
            "item_name": item_name,
            "movement_type": "GRN_INWARD",
            "quantity": qty,
            "balance_after": bal_after,
            "reference_id": reference_id or "",
            "remarks": remarks or f"Inward GRN receipt of {qty} {uom}",
            "created_by": created_by,
            "created_at": now_iso,
        }
        db[STOCK_MOVEMENTS].insert_one(movement_doc)
        results.append(_clean_doc(updated_doc))

    return results


def record_adjustment(
    db: Database,
    store_code: str,
    barcode: str,
    adjustment_type: str,
    quantity_change: int,
    reason: str,
    created_by: str,
) -> Dict[str, Any]:
    """Record an audit adjustment or damage write-off."""
    code = store_code.upper()
    barcode_clean = barcode.strip()
    valid_types = {"DAMAGE_WRITE_OFF", "AUDIT_ADJUSTMENT", "SALES_OUTWARD"}
    if adjustment_type not in valid_types:
        raise ValueError(f"Invalid adjustment type: {adjustment_type}")

    stock_item = db[STOCK_INVENTORY].find_one({"store_code": code, "barcode": barcode_clean})
    if not stock_item:
        raise ValueError(f"Stock item with barcode {barcode_clean} not found in store {code}")

    curr_stock = stock_item.get("current_stock", 0)
    new_stock = curr_stock + quantity_change
    if new_stock < 0:
        raise ValueError(f"Cannot adjust below zero. Current: {curr_stock}, Adjustment: {quantity_change}")

    now_iso = datetime.now(timezone.utc).isoformat()
    updated = db[STOCK_INVENTORY].find_one_and_update(
        {"store_code": code, "barcode": barcode_clean},
        {
            "$set": {
                "current_stock": new_stock,
                "updated_at": now_iso,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    movement_doc = {
        "store_code": code,
        "barcode": barcode_clean,
        "item_name": stock_item.get("item_name", ""),
        "movement_type": adjustment_type,
        "quantity": quantity_change,
        "balance_after": new_stock,
        "reference_id": "",
        "remarks": reason.strip(),
        "created_by": created_by,
        "created_at": now_iso,
    }
    db[STOCK_MOVEMENTS].insert_one(movement_doc)
    return _clean_doc(updated)  # type: ignore


def list_movements(
    db: Database,
    store_code: Optional[str] = None,
    barcode: Optional[str] = None,
    movement_type: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Retrieve immutable stock movements audit trail."""
    query: Dict[str, Any] = {}
    if store_code and store_code.upper() in STORE_CODE_TO_NAME:
        query["store_code"] = store_code.upper()
    if barcode:
        query["barcode"] = barcode.strip()
    if movement_type:
        query["movement_type"] = movement_type.strip()

    cursor = db[STOCK_MOVEMENTS].find(query).sort("created_at", -1).limit(min(500, max(1, limit)))
    return [_clean_doc(doc) for doc in cursor]


def create_transfer(
    db: Database,
    from_store: str,
    to_store: str,
    items: List[Dict[str, Any]],
    notes: Optional[str] = None,
    created_by: str = "system",
) -> Dict[str, Any]:
    """Initiate an inter-store transfer request.

    Verifies available stock at from_store before initiating.
    """
    src = from_store.upper()
    dst = to_store.upper()
    if src not in STORE_CODE_TO_NAME or dst not in STORE_CODE_TO_NAME:
        raise ValueError(f"Invalid store codes: from={src}, to={dst}")
    if src == dst:
        raise ValueError("Source and destination stores cannot be identical.")

    if not items:
        raise ValueError("Transfer must contain at least one item.")

    transfer_items = []
    for item in items:
        barcode = str(item["barcode"]).strip()
        qty = int(item["quantity"])
        if qty <= 0:
            raise ValueError(f"Invalid quantity {qty} for barcode {barcode}")

        current = db[STOCK_INVENTORY].find_one({"store_code": src, "barcode": barcode})
        if not current:
            raise ValueError(f"Barcode {barcode} does not exist in store {src}")
        if current.get("current_stock", 0) < qty:
            raise ValueError(
                f"Insufficient stock for {current.get('item_name')} ({barcode}). "
                f"Available: {current.get('current_stock')}, Requested: {qty}"
            )

        transfer_items.append(
            {
                "barcode": barcode,
                "item_name": current.get("item_name", ""),
                "division": current.get("division", ""),
                "section": current.get("section", ""),
                "department": current.get("department", ""),
                "brand": current.get("brand", ""),
                "mrp": current.get("mrp", 0.0),
                "cost_price": current.get("cost_price"),
                "quantity": qty,
                "unit_of_measure": current.get("unit_of_measure", "Pcs"),
            }
        )

    t_num = next_id(db, STOCK_TRANSFERS)
    date_compact = datetime.now(timezone.utc).strftime("%Y%m%d")
    transfer_id = f"TRF-{date_compact}-{src}-{dst}-{t_num:04d}"
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "transfer_id": transfer_id,
        "from_store": src,
        "to_store": dst,
        "items": transfer_items,
        "status": "INITIATED",
        "notes": notes or "",
        "created_by": created_by,
        "created_at": now_iso,
        "updated_at": now_iso,
        "dispatched_by": None,
        "dispatched_at": None,
        "received_by": None,
        "received_at": None,
    }
    db[STOCK_TRANSFERS].insert_one(doc)
    return _clean_doc(doc)  # type: ignore


def dispatch_transfer(db: Database, transfer_id: str, dispatched_by: str) -> Dict[str, Any]:
    """Dispatch a transfer: decrements sender store stock and sets status to DISPATCHED."""
    transfer = db[STOCK_TRANSFERS].find_one({"transfer_id": transfer_id.strip()})
    if not transfer:
        raise ValueError(f"Transfer {transfer_id} not found.")
    if transfer.get("status") != "INITIATED":
        raise ValueError(f"Cannot dispatch transfer with status {transfer.get('status')}")

    src = transfer["from_store"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # Deduct stock and write TRANSFER_OUT movements
    for item in transfer["items"]:
        barcode = item["barcode"]
        qty = item["quantity"]

        updated = db[STOCK_INVENTORY].find_one_and_update(
            {"store_code": src, "barcode": barcode},
            {"$inc": {"current_stock": -qty}, "$set": {"updated_at": now_iso}},
            return_document=ReturnDocument.AFTER,
        )
        bal_after = updated["current_stock"] if updated else 0

        db[STOCK_MOVEMENTS].insert_one(
            {
                "store_code": src,
                "barcode": barcode,
                "item_name": item["item_name"],
                "movement_type": "TRANSFER_OUT",
                "quantity": -qty,
                "balance_after": bal_after,
                "reference_id": transfer_id,
                "remarks": f"Dispatched transfer {transfer_id} to {transfer['to_store']}",
                "created_by": dispatched_by,
                "created_at": now_iso,
            }
        )

    updated_transfer = db[STOCK_TRANSFERS].find_one_and_update(
        {"transfer_id": transfer_id.strip()},
        {
            "$set": {
                "status": "DISPATCHED",
                "dispatched_by": dispatched_by,
                "dispatched_at": now_iso,
                "updated_at": now_iso,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return _clean_doc(updated_transfer)  # type: ignore


def receive_transfer(db: Database, transfer_id: str, received_by: str) -> Dict[str, Any]:
    """Receive a transfer: increments receiver store stock and sets status to RECEIVED."""
    transfer = db[STOCK_TRANSFERS].find_one({"transfer_id": transfer_id.strip()})
    if not transfer:
        raise ValueError(f"Transfer {transfer_id} not found.")
    if transfer.get("status") != "DISPATCHED":
        raise ValueError(f"Cannot receive transfer in status {transfer.get('status')}. Must be DISPATCHED.")

    dst = transfer["to_store"]
    now_iso = datetime.now(timezone.utc).isoformat()

    for item in transfer["items"]:
        barcode = item["barcode"]
        qty = item["quantity"]

        updated = db[STOCK_INVENTORY].find_one_and_update(
            {"store_code": dst, "barcode": barcode},
            {
                "$inc": {"current_stock": qty},
                "$set": {
                    "item_name": item["item_name"],
                    "division": item.get("division", ""),
                    "section": item.get("section", ""),
                    "department": item.get("department", ""),
                    "brand": item.get("brand", ""),
                    "mrp": item.get("mrp", 0.0),
                    "cost_price": item.get("cost_price"),
                    "unit_of_measure": item.get("unit_of_measure", "Pcs"),
                    "updated_at": now_iso,
                },
                "$setOnInsert": {
                    "store_code": dst,
                    "barcode": barcode,
                    "reorder_level": 10,
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        bal_after = updated["current_stock"]

        db[STOCK_MOVEMENTS].insert_one(
            {
                "store_code": dst,
                "barcode": barcode,
                "item_name": item["item_name"],
                "movement_type": "TRANSFER_IN",
                "quantity": qty,
                "balance_after": bal_after,
                "reference_id": transfer_id,
                "remarks": f"Received transfer {transfer_id} from {transfer['from_store']}",
                "created_by": received_by,
                "created_at": now_iso,
            }
        )

    updated_transfer = db[STOCK_TRANSFERS].find_one_and_update(
        {"transfer_id": transfer_id.strip()},
        {
            "$set": {
                "status": "RECEIVED",
                "received_by": received_by,
                "received_at": now_iso,
                "updated_at": now_iso,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return _clean_doc(updated_transfer)  # type: ignore


def reject_or_cancel_transfer(
    db: Database,
    transfer_id: str,
    action: str,  # "CANCEL" or "REJECT"
    user: str,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Cancel (if INITIATED) or reject (if DISPATCHED, reverting stock back to source)."""
    transfer = db[STOCK_TRANSFERS].find_one({"transfer_id": transfer_id.strip()})
    if not transfer:
        raise ValueError(f"Transfer {transfer_id} not found.")

    status = transfer.get("status")
    now_iso = datetime.now(timezone.utc).isoformat()
    src = transfer["from_store"]

    if status == "INITIATED":
        target_status = "CANCELLED"
    elif status == "DISPATCHED":
        target_status = "REJECTED"
        # Revert stock back to source
        for item in transfer["items"]:
            barcode = item["barcode"]
            qty = item["quantity"]
            updated = db[STOCK_INVENTORY].find_one_and_update(
                {"store_code": src, "barcode": barcode},
                {"$inc": {"current_stock": qty}, "$set": {"updated_at": now_iso}},
                return_document=ReturnDocument.AFTER,
            )
            bal = updated["current_stock"] if updated else 0
            db[STOCK_MOVEMENTS].insert_one(
                {
                    "store_code": src,
                    "barcode": barcode,
                    "item_name": item["item_name"],
                    "movement_type": "AUDIT_ADJUSTMENT",
                    "quantity": qty,
                    "balance_after": bal,
                    "reference_id": transfer_id,
                    "remarks": f"Reverted stock due to transfer rejection: {reason or 'No reason provided'}",
                    "created_by": user,
                    "created_at": now_iso,
                }
            )
    else:
        raise ValueError(f"Cannot cancel or reject transfer in status {status}")

    updated_transfer = db[STOCK_TRANSFERS].find_one_and_update(
        {"transfer_id": transfer_id.strip()},
        {
            "$set": {
                "status": target_status,
                "notes": f"{transfer.get('notes', '')} | {target_status}: {reason or ''}".strip(" | "),
                "updated_at": now_iso,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return _clean_doc(updated_transfer)  # type: ignore


def list_transfers(
    db: Database,
    store_code: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """List transfers involving a store (as sender or receiver) or network-wide for admin."""
    query: Dict[str, Any] = {}
    if store_code and store_code.upper() in STORE_CODE_TO_NAME:
        code = store_code.upper()
        query["$or"] = [{"from_store": code}, {"to_store": code}]

    if status:
        query["status"] = status.strip().upper()

    cursor = db[STOCK_TRANSFERS].find(query).sort("created_at", -1).limit(min(500, max(1, limit)))
    return [_clean_doc(doc) for doc in cursor]


def get_stocks_summary(db: Database, store_code: Optional[str] = None) -> Dict[str, Any]:
    """Compute KPI metrics for stocks dashboard."""
    query: Dict[str, Any] = {}
    if store_code and store_code.upper() in STORE_CODE_TO_NAME:
        query["store_code"] = store_code.upper()

    total_skus = db[STOCK_INVENTORY].count_documents(query)

    # Aggregation for total units, low stock count, out of stock count
    pipeline = [
        {"$match": query},
        {
            "$group": {
                "_id": None,
                "total_units": {"$sum": "$current_stock"},
                "out_of_stock": {
                    "$sum": {"$cond": [{"$lte": ["$current_stock", 0]}, 1, 0]}
                },
                "low_stock": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$gt": ["$current_stock", 0]},
                                    {"$lte": ["$current_stock", "$reorder_level"]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
            }
        },
    ]

    agg_res = list(db[STOCK_INVENTORY].aggregate(pipeline))
    stats = agg_res[0] if agg_res else {"total_units": 0, "out_of_stock": 0, "low_stock": 0}

    # Transfers pending count
    trf_query: Dict[str, Any] = {"status": {"$in": ["INITIATED", "DISPATCHED"]}}
    if store_code and store_code.upper() in STORE_CODE_TO_NAME:
        code = store_code.upper()
        trf_query["$or"] = [{"from_store": code}, {"to_store": code}]
    pending_transfers = db[STOCK_TRANSFERS].count_documents(trf_query)

    return {
        "store_code": store_code or "ALL",
        "total_skus": total_skus,
        "total_units": int(stats.get("total_units") or 0),
        "out_of_stock_count": int(stats.get("out_of_stock") or 0),
        "low_stock_count": int(stats.get("low_stock") or 0),
        "pending_transfers_count": pending_transfers,
    }

