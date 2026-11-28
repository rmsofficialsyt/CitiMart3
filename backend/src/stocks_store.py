"""Stocks Management Store: Inventory control, stock movements audit ledger, and inter-store transfers.

Backed by MongoDB collections:
- stock_inventory: Current snapshot per store and barcode.
- stock_movements: Immutable audit log for every stock addition, deduction, or adjustment.
- stock_transfers: Two-phase inter-store transfer state machine
  (INITIATED -> DISPATCHED -> RECEIVED, or -> CANCELLED / REJECTED).

Invariants (docs/specs/ops-modules-hardening/spec.md US-S1), held on BOTH
storage paths below:
  * `current_stock` never goes below zero;
  * a transfer's stock moves exactly once per state change, even when two
    requests race (double-click, two tabs, two replicas).

How:
  * every transfer state change is a *conditional* flip --
    `find_one_and_update({"transfer_id", "status": <expected>}, ...)` -- and only
    the caller that wins the flip touches inventory; the loser gets StockConflict;
  * every decrement is guarded -- `{"current_stock": {"$gte": qty}}` + `$inc` --
    never read-then-`$set` (which loses concurrent updates);
  * multi-line writes run inside a MongoDB transaction when the server supports
    one (Atlas / any replica set). Without one (mongomock in tests, a standalone
    dev mongod) a failed line *compensates* the lines already written before
    raising, and movements are only inserted once every line has succeeded, so
    no half-applied transfer is left behind.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional

from pymongo import MongoClient, ReturnDocument
from pymongo.client_session import ClientSession
from pymongo.database import Database
from pymongo.errors import PyMongoError

from config.settings import STORE_CODE_TO_NAME
from db.models import STOCK_INVENTORY, STOCK_MOVEMENTS, STOCK_TRANSFERS, next_id
from src.time_utils import ist_today

logger = logging.getLogger(__name__)

MOVEMENT_TYPES = (
    "GRN_INWARD",
    "SALES_OUTWARD",
    "DAMAGE_WRITE_OFF",
    "AUDIT_ADJUSTMENT",
    "TRANSFER_OUT",
    "TRANSFER_IN",
    "TRANSFER_REVERSAL",
)

# Item master fields a GRN may carry. If a GRN *sends* one it is updated;
# if it doesn't, the default applies on first insert only -- a second receipt
# must never reset an item's reorder level / MRP to these (spec US-S3).
ITEM_META_DEFAULTS: Dict[str, Any] = {
    "division": "General",
    "section": "General",
    "department": "General",
    "brand": "",
    "mrp": 0.0,
    "cost_price": None,
    "reorder_level": 10,
    "unit_of_measure": "Pcs",
}


class StockNotFound(LookupError):
    """Unknown barcode / transfer. -> HTTP 404."""


class StockConflict(ValueError):
    """The change isn't valid against the *current* state (insufficient stock at
    dispatch time, transfer already moved on, concurrent write). -> HTTP 409."""


def _clean_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# Atomicity helper
# --------------------------------------------------------------------------- #
def _supports_transactions(db: Database) -> bool:
    """Real pymongo client on a replica set / sharded cluster (Atlas). mongomock
    and standalone servers can't run multi-document transactions."""
    client = getattr(db, "client", None)
    if not isinstance(client, MongoClient):
        return False
    try:
        kind = client.topology_description.topology_type_name
    except Exception:  # noqa: BLE001 -- unknown topology: use the safe path
        return False
    return kind in ("ReplicaSetWithPrimary", "Sharded", "LoadBalanced")


@contextmanager
def _atomic(db: Database) -> Iterator[Optional[ClientSession]]:
    """Yields a session inside an open transaction, or None (no transaction
    support). Callers pass it on via `**_s(session)` and must stay correct on
    the None path too (guards + compensation)."""
    if not _supports_transactions(db):
        yield None
        return
    try:
        with db.client.start_session() as session:
            with session.start_transaction():
                yield session
    except PyMongoError as exc:
        if exc.has_error_label("TransientTransactionError"):
            raise StockConflict("Another stock update happened at the same moment. Please retry.") from exc
        raise


def _s(session: Optional[ClientSession]) -> Dict[str, Any]:
    return {"session": session} if session is not None else {}


def _insert_movement(db: Database, session: Optional[ClientSession], **fields: Any) -> None:
    db[STOCK_MOVEMENTS].insert_one({**fields, "created_at": fields.get("created_at") or _now_iso()}, **_s(session))


def _decrement(db: Database, session: Optional[ClientSession], store: str, barcode: str, qty: int, now_iso: str) -> Optional[Dict[str, Any]]:
    """Guarded decrement: applies only if at least `qty` is on hand. None = refused."""
    return db[STOCK_INVENTORY].find_one_and_update(
        {"store_code": store, "barcode": barcode, "current_stock": {"$gte": qty}},
        {"$inc": {"current_stock": -qty}, "$set": {"updated_at": now_iso}},
        return_document=ReturnDocument.AFTER,
        **_s(session),
    )


def _increment(db: Database, session: Optional[ClientSession], store: str, barcode: str, qty: int, now_iso: str) -> Optional[Dict[str, Any]]:
    return db[STOCK_INVENTORY].find_one_and_update(
        {"store_code": store, "barcode": barcode},
        {"$inc": {"current_stock": qty}, "$set": {"updated_at": now_iso}},
        return_document=ReturnDocument.AFTER,
        **_s(session),
    )


# --------------------------------------------------------------------------- #
# Reads
# --------------------------------------------------------------------------- #
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


def get_transfer(db: Database, transfer_id: str) -> Optional[Dict[str, Any]]:
    return db[STOCK_TRANSFERS].find_one({"transfer_id": transfer_id.strip()})


# --------------------------------------------------------------------------- #
# GRN + adjustments
# --------------------------------------------------------------------------- #
def record_inward_grn(
    db: Database,
    store_code: str,
    items: List[Dict[str, Any]],
    reference_id: Optional[str] = None,
    remarks: Optional[str] = None,
    created_by: str = "system",
) -> List[Dict[str, Any]]:
    """Record an Inward Goods Received Note (GRN).

    Increments current_stock and appends an immutable GRN_INWARD movement per
    line. `items` should contain only the fields the user actually sent (the
    route uses model_dump(exclude_unset=True)): a field present is updated, a
    field absent keeps the item's existing value (default on first receipt).
    """
    code = store_code.upper()
    now_iso = _now_iso()
    results: List[Dict[str, Any]] = []

    with _atomic(db) as session:
        for item in items:
            barcode = str(item["barcode"]).strip()
            qty = int(item.get("quantity", 0))
            if qty <= 0:
                continue

            to_set: Dict[str, Any] = {
                "item_name": str(item.get("item_name") or "General Item").strip(),
                "last_restocked_at": now_iso,
                "updated_at": now_iso,
            }
            on_insert: Dict[str, Any] = {"store_code": code, "barcode": barcode}
            for key, default in ITEM_META_DEFAULTS.items():
                if key in item and item[key] is not None:
                    value = item[key]
                    if key in ("mrp", "cost_price"):
                        value = float(value)
                    elif key == "reorder_level":
                        value = int(value)
                    else:
                        value = str(value).strip()
                    to_set[key] = value
                else:
                    on_insert[key] = default

            updated_doc = db[STOCK_INVENTORY].find_one_and_update(
                {"store_code": code, "barcode": barcode},
                {"$inc": {"current_stock": qty}, "$set": to_set, "$setOnInsert": on_insert},
                upsert=True,
                return_document=ReturnDocument.AFTER,
                **_s(session),
            )
            uom = updated_doc.get("unit_of_measure", "Pcs")
            _insert_movement(
                db, session,
                store_code=code,
                barcode=barcode,
                item_name=to_set["item_name"],
                movement_type="GRN_INWARD",
                quantity=qty,
                balance_after=updated_doc["current_stock"],
                reference_id=reference_id or "",
                remarks=remarks or f"Inward GRN receipt of {qty} {uom}",
                created_by=created_by,
                created_at=now_iso,
            )
            results.append(_clean_doc(updated_doc))  # type: ignore[arg-type]

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
    """Record a damage write-off or audit correction, atomically.

    A decrease is a guarded `$inc` (can never take stock below zero, even
    against a concurrent sale/transfer); an increase is a plain `$inc`. Who
    may *increase* stock is decided by the route (admin only, spec US-S2).
    """
    code = store_code.upper()
    barcode_clean = barcode.strip()
    valid_types = {"DAMAGE_WRITE_OFF", "AUDIT_ADJUSTMENT", "SALES_OUTWARD"}
    if adjustment_type not in valid_types:
        raise ValueError(f"Invalid adjustment type: {adjustment_type}")
    if quantity_change == 0:
        raise ValueError("Quantity change must not be zero.")
    if adjustment_type in ("DAMAGE_WRITE_OFF", "SALES_OUTWARD") and quantity_change > 0:
        raise ValueError(f"{adjustment_type} must reduce stock (use a negative quantity).")

    now_iso = _now_iso()
    with _atomic(db) as session:
        if quantity_change < 0:
            updated = _decrement(db, session, code, barcode_clean, -quantity_change, now_iso)
        else:
            updated = _increment(db, session, code, barcode_clean, quantity_change, now_iso)

        if updated is None:
            current = db[STOCK_INVENTORY].find_one({"store_code": code, "barcode": barcode_clean}, **_s(session))
            if not current:
                raise StockNotFound(f"Stock item with barcode {barcode_clean} not found in store {code}")
            raise ValueError(
                f"Cannot adjust below zero. Current: {current.get('current_stock', 0)}, Adjustment: {quantity_change}"
            )

        _insert_movement(
            db, session,
            store_code=code,
            barcode=barcode_clean,
            item_name=updated.get("item_name", ""),
            movement_type=adjustment_type,
            quantity=quantity_change,
            balance_after=updated["current_stock"],
            reference_id="",
            remarks=reason.strip(),
            created_by=created_by,
            created_at=now_iso,
        )
    return _clean_doc(updated)  # type: ignore[return-value]


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
    return [_clean_doc(doc) for doc in cursor]  # type: ignore[misc]


# --------------------------------------------------------------------------- #
# Transfers
# --------------------------------------------------------------------------- #
def create_transfer(
    db: Database,
    from_store: str,
    to_store: str,
    items: List[Dict[str, Any]],
    notes: Optional[str] = None,
    created_by: str = "system",
) -> Dict[str, Any]:
    """Initiate an inter-store transfer request.

    Checks available stock at from_store as a courtesy; nothing is reserved,
    so dispatch re-checks under its own guard.
    """
    src = from_store.upper()
    dst = to_store.upper()
    if src not in STORE_CODE_TO_NAME or dst not in STORE_CODE_TO_NAME:
        raise ValueError(f"Invalid store codes: from={src}, to={dst}")
    if src == dst:
        raise ValueError("Source and destination stores cannot be identical.")

    if not items:
        raise ValueError("Transfer must contain at least one item.")

    merged: Dict[str, int] = {}
    for item in items:
        barcode = str(item["barcode"]).strip()
        qty = int(item["quantity"])
        if qty <= 0:
            raise ValueError(f"Invalid quantity {qty} for barcode {barcode}")
        # The same barcode twice would be checked against stock twice but
        # deducted as a sum -- merge first.
        merged[barcode] = merged.get(barcode, 0) + qty

    transfer_items = []
    for barcode, qty in merged.items():
        current = db[STOCK_INVENTORY].find_one({"store_code": src, "barcode": barcode})
        if not current:
            raise StockNotFound(f"Barcode {barcode} does not exist in store {src}")
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
    transfer_id = f"TRF-{ist_today().strftime('%Y%m%d')}-{src}-{dst}-{t_num:04d}"
    now_iso = _now_iso()

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
    return _clean_doc(doc)  # type: ignore[return-value]


def _flip_status(
    db: Database,
    session: Optional[ClientSession],
    transfer_id: str,
    expected: str,
    new_status: str,
    extra: Dict[str, Any],
) -> Dict[str, Any]:
    """The single winning state change. Raises StockNotFound / StockConflict."""
    flipped = db[STOCK_TRANSFERS].find_one_and_update(
        {"transfer_id": transfer_id, "status": expected},
        {"$set": {"status": new_status, **extra}},
        return_document=ReturnDocument.AFTER,
        **_s(session),
    )
    if flipped is not None:
        return flipped
    current = db[STOCK_TRANSFERS].find_one({"transfer_id": transfer_id}, **_s(session))
    if not current:
        raise StockNotFound(f"Transfer {transfer_id} not found.")
    raise StockConflict(f"Transfer {transfer_id} is {current.get('status')}, not {expected}.")


def dispatch_transfer(db: Database, transfer_id: str, dispatched_by: str) -> Dict[str, Any]:
    """INITIATED -> DISPATCHED: deducts every line from the sender, or nothing.

    Stock is re-checked *now* (it may have sold or moved since the transfer was
    created). If any line is short, lines already deducted are put back, the
    transfer returns to INITIATED and StockConflict names the short barcode.
    """
    tid = transfer_id.strip()
    now_iso = _now_iso()

    with _atomic(db) as session:
        transfer = _flip_status(
            db, session, tid, "INITIATED", "DISPATCHED",
            {"dispatched_by": dispatched_by, "dispatched_at": now_iso, "updated_at": now_iso},
        )
        src = transfer["from_store"]
        done: List[tuple[Dict[str, Any], int]] = []  # (item, balance_after)

        for item in transfer["items"]:
            updated = _decrement(db, session, src, item["barcode"], item["quantity"], now_iso)
            if updated is None:
                # Compensate (matters only without a transaction; with one, the
                # raise below aborts everything anyway).
                for prev, _bal in done:
                    _increment(db, session, src, prev["barcode"], prev["quantity"], now_iso)
                db[STOCK_TRANSFERS].update_one(
                    {"transfer_id": tid, "status": "DISPATCHED"},
                    {"$set": {"status": "INITIATED", "dispatched_by": None, "dispatched_at": None, "updated_at": now_iso}},
                    **_s(session),
                )
                on_hand = db[STOCK_INVENTORY].find_one({"store_code": src, "barcode": item["barcode"]}, **_s(session))
                available = on_hand.get("current_stock", 0) if on_hand else 0
                raise StockConflict(
                    f"Insufficient stock for {item.get('item_name') or item['barcode']} ({item['barcode']}) at {src}: "
                    f"available {available}, transfer needs {item['quantity']}. Nothing was dispatched."
                )
            done.append((item, updated["current_stock"]))

        # Movements only once every line has succeeded -- no orphan ledger rows.
        for item, balance in done:
            _insert_movement(
                db, session,
                store_code=src,
                barcode=item["barcode"],
                item_name=item["item_name"],
                movement_type="TRANSFER_OUT",
                quantity=-item["quantity"],
                balance_after=balance,
                reference_id=tid,
                remarks=f"Dispatched transfer {tid} to {transfer['to_store']}",
                created_by=dispatched_by,
                created_at=now_iso,
            )
    return _clean_doc(transfer)  # type: ignore[return-value]


def receive_transfer(db: Database, transfer_id: str, received_by: str) -> Dict[str, Any]:
    """DISPATCHED -> RECEIVED: credits the destination exactly once."""
    tid = transfer_id.strip()
    now_iso = _now_iso()

    with _atomic(db) as session:
        transfer = _flip_status(
            db, session, tid, "DISPATCHED", "RECEIVED",
            {"received_by": received_by, "received_at": now_iso, "updated_at": now_iso},
        )
        dst = transfer["to_store"]

        for item in transfer["items"]:
            # The destination's own master data (reorder level, MRP...) wins if
            # it already stocks the barcode; the sender's copy seeds a new SKU.
            on_insert = {
                "store_code": dst,
                "barcode": item["barcode"],
                "item_name": item["item_name"],
                "division": item.get("division", ""),
                "section": item.get("section", ""),
                "department": item.get("department", ""),
                "brand": item.get("brand", ""),
                "mrp": item.get("mrp", 0.0),
                "cost_price": item.get("cost_price"),
                "unit_of_measure": item.get("unit_of_measure", "Pcs"),
                "reorder_level": ITEM_META_DEFAULTS["reorder_level"],
            }
            updated = db[STOCK_INVENTORY].find_one_and_update(
                {"store_code": dst, "barcode": item["barcode"]},
                {"$inc": {"current_stock": item["quantity"]}, "$set": {"updated_at": now_iso}, "$setOnInsert": on_insert},
                upsert=True,
                return_document=ReturnDocument.AFTER,
                **_s(session),
            )
            _insert_movement(
                db, session,
                store_code=dst,
                barcode=item["barcode"],
                item_name=item["item_name"],
                movement_type="TRANSFER_IN",
                quantity=item["quantity"],
                balance_after=updated["current_stock"],
                reference_id=tid,
                remarks=f"Received transfer {tid} from {transfer['from_store']}",
                created_by=received_by,
                created_at=now_iso,
            )
    return _clean_doc(transfer)  # type: ignore[return-value]


def reject_or_cancel_transfer(
    db: Database,
    transfer_id: str,
    action: str,  # "CANCEL" or "REJECT"
    user: str,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """CANCEL: INITIATED -> CANCELLED (no stock moved yet).
    REJECT: DISPATCHED -> REJECTED, crediting the sender back with a
    TRANSFER_REVERSAL movement (spec US-S4 -- not a generic audit adjustment)."""
    expected_by_action = {"CANCEL": ("INITIATED", "CANCELLED"), "REJECT": ("DISPATCHED", "REJECTED")}
    if action not in expected_by_action:
        raise ValueError(f"Unknown transfer action: {action}")
    expected, target_status = expected_by_action[action]
    tid = transfer_id.strip()
    now_iso = _now_iso()

    existing = get_transfer(db, tid)
    if not existing:
        raise StockNotFound(f"Transfer {tid} not found.")
    notes = f"{existing.get('notes', '')} | {target_status}: {reason or ''}".strip(" | ")

    with _atomic(db) as session:
        transfer = _flip_status(
            db, session, tid, expected, target_status,
            {"notes": notes, "updated_at": now_iso, "actioned_by": user},
        )
        if action == "REJECT":
            src = transfer["from_store"]
            for item in transfer["items"]:
                updated = db[STOCK_INVENTORY].find_one_and_update(
                    {"store_code": src, "barcode": item["barcode"]},
                    {"$inc": {"current_stock": item["quantity"]}, "$set": {"updated_at": now_iso}},
                    upsert=True,  # the SKU row may have been removed meanwhile; still owe the units back
                    return_document=ReturnDocument.AFTER,
                    **_s(session),
                )
                _insert_movement(
                    db, session,
                    store_code=src,
                    barcode=item["barcode"],
                    item_name=item["item_name"],
                    movement_type="TRANSFER_REVERSAL",
                    quantity=item["quantity"],
                    balance_after=updated["current_stock"],
                    reference_id=tid,
                    remarks=f"Returned by {transfer['to_store']} (transfer rejected): {reason or 'No reason provided'}",
                    created_by=user,
                    created_at=now_iso,
                )
    return _clean_doc(transfer)  # type: ignore[return-value]


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
    return [_clean_doc(doc) for doc in cursor]  # type: ignore[misc]


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
