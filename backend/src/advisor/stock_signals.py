"""Stock-aware advice (Advisor Tier 2): out-of-stock, low-stock, slow movers
and inter-store transfer suggestions, from ``stock_inventory`` /
``stock_movements`` / ``stock_transfers``.

Inventory is a *current* snapshot, so these signals are only produced for
today -- a past day's advice never shows today's shelf.

Transfers are initiated by the *sending* store (``routes_stocks`` checks
``from_store``), so a suggestion is ``outbound`` (this store has surplus,
another is short: this store can act) or ``inbound`` (this store is short:
the other store has to send). An inbound suggestion carries only the
suggested quantity, never the other store's stock level, which a manager
cannot otherwise read.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME
from db.models import STOCK_INVENTORY, STOCK_MOVEMENTS, STOCK_TRANSFERS

SLOW_MOVER_DAYS = 21
TOP_N = 5
# A donor keeps this multiple of its own reorder level before giving stock.
DONOR_KEEP_MULTIPLE = 1.5
_OPEN_TRANSFER = ("INITIATED", "DISPATCHED")


def _item(doc: dict) -> dict:
    return {
        "barcode": doc.get("barcode"),
        "item_name": doc.get("item_name"),
        "department": doc.get("department"),
        "current_stock": int(doc.get("current_stock") or 0),
        "reorder_level": int(doc.get("reorder_level") or 0),
    }


def _surplus(doc: dict) -> int:
    keep = math.ceil(int(doc.get("reorder_level") or 0) * DONOR_KEEP_MULTIPLE)
    return max(0, int(doc.get("current_stock") or 0) - keep)


def _need(doc: dict) -> int:
    return max(1, int(doc.get("reorder_level") or 0) - int(doc.get("current_stock") or 0) + 1)


def _is_short(doc: dict) -> bool:
    return int(doc.get("current_stock") or 0) <= int(doc.get("reorder_level") or 0)


def _open_pairs(db: Database) -> set[tuple[str, str, str]]:
    pairs = set()
    for t in db[STOCK_TRANSFERS].find({"status": {"$in": list(_OPEN_TRANSFER)}}, {"from_store": 1, "to_store": 1, "items": 1}):
        for it in t.get("items") or []:
            pairs.add((t.get("from_store"), t.get("to_store"), str(it.get("barcode"))))
    return pairs


def stock_signals(db: Database, store: str, now: datetime | None = None) -> tuple[dict, list[dict]]:
    now = now or datetime.now(timezone.utc)
    own = list(db[STOCK_INVENTORY].find({"store_code": store}))
    block: dict = {"available": bool(own), "total_skus": len(own), "out_of_stock": [], "low_stock": [],
                   "slow_movers": [], "transfers": [], "out_of_stock_count": 0, "low_stock_count": 0}
    if not own:
        return block, []

    out = [d for d in own if int(d.get("current_stock") or 0) <= 0]
    low = [d for d in own if 0 < int(d.get("current_stock") or 0) <= int(d.get("reorder_level") or 0)]
    low.sort(key=lambda d: (int(d.get("current_stock") or 0) / max(1, int(d.get("reorder_level") or 1))))

    cutoff = (now - timedelta(days=SLOW_MOVER_DAYS)).isoformat()
    moved = set(db[STOCK_MOVEMENTS].distinct(
        "barcode", {"store_code": store, "movement_type": "SALES_OUTWARD", "created_at": {"$gte": cutoff}}
    ))
    slow = [
        d for d in own
        if int(d.get("current_stock") or 0) > 0 and d.get("barcode") not in moved
        and str(d.get("last_restocked_at") or "") < cutoff
    ]
    slow.sort(key=lambda d: -int(d.get("current_stock") or 0))

    # Transfer matching against the other stores' same barcodes.
    open_pairs = _open_pairs(db)
    own_short = {d["barcode"]: d for d in own if _is_short(d)}
    own_surplus = {d["barcode"]: d for d in own if _surplus(d) > 0}
    wanted = list(set(own_short) | set(own_surplus))
    others = list(db[STOCK_INVENTORY].find({"store_code": {"$ne": store}, "barcode": {"$in": wanted}})) if wanted else []
    transfers = []
    for o in others:
        code, bc = o.get("store_code"), o.get("barcode")
        if code not in STORE_CODE_TO_NAME:
            continue
        if bc in own_short and _surplus(o) > 0 and (code, store, bc) not in open_pairs:
            mine = own_short[bc]
            transfers.append({"direction": "inbound", "from_store": code, "to_store": store, "barcode": bc,
                              "item_name": mine.get("item_name"), "quantity": min(_need(mine), _surplus(o)),
                              "to_stock": int(mine.get("current_stock") or 0)})
        elif bc in own_surplus and _is_short(o) and (store, code, bc) not in open_pairs:
            mine = own_surplus[bc]
            transfers.append({"direction": "outbound", "from_store": store, "to_store": code, "barcode": bc,
                              "item_name": mine.get("item_name"), "quantity": min(_need(o), _surplus(mine)),
                              "from_stock": int(mine.get("current_stock") or 0)})
    # Stock-outs at the receiving end first, then larger moves.
    transfers.sort(key=lambda t: (t.get("to_stock", 1) > 0, -t["quantity"]))

    block.update({
        "out_of_stock_count": len(out),
        "low_stock_count": len(low),
        "out_of_stock": [_item(d) for d in out[:TOP_N]],
        "low_stock": [_item(d) for d in low[:TOP_N]],
        "slow_movers": [_item(d) for d in slow[:TOP_N]],
        "slow_mover_days": SLOW_MOVER_DAYS,
        "transfers": transfers[:TOP_N],
    })

    insights = []
    if out:
        insights.append({"id": "stock_out", "severity": "urgent", "kpi": None,
                         "evidence": {"count": len(out), "items": [d.get("item_name") for d in out[:3]]}})
    if low:
        insights.append({"id": "stock_low", "severity": "opportunity", "kpi": None,
                         "evidence": {"count": len(low), "items": [d.get("item_name") for d in low[:3]]}})
    if slow:
        insights.append({"id": "slow_movers", "severity": "opportunity", "kpi": "net_sales",
                         "evidence": {"count": len(slow), "days": SLOW_MOVER_DAYS,
                                      "items": [d.get("item_name") for d in slow[:3]]}})
    if transfers:
        insights.append({"id": "transfer_suggested", "severity": "info", "kpi": None,
                         "evidence": {"count": len(transfers),
                                      "outbound": sum(1 for t in transfers if t["direction"] == "outbound"),
                                      "inbound": sum(1 for t in transfers if t["direction"] == "inbound")}})
    return block, insights
