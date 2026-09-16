"""Read/write layer for the Daily Dashboard's live data -- bills, footfall,
NOB, and targets, one row per store+date(+time) -- backed by MongoDB
(db/models.py's collection constants) since the Postgres -> MongoDB
migration. This module previously read/wrote TEST_DAILY_DASHBOARD.xlsx
directly via openpyxl, then PostgreSQL via SQLAlchemy; every function here
keeps the exact same name and returns the exact same dict shape as those
versions did, so api/routes_daily.py, api/routes_charts.py, and
src/daily_midnight_job.py only needed a `db` parameter threaded through, not
a rewrite.

Every function takes a `db: Database` as its first argument -- callers get
one via db.session.get_db() (FastAPI routes: `Depends(get_db)`) or
db.session.session_scope() (background tasks, scripts). Unlike the
Postgres/SQLAlchemy version this replaced, there's no unit-of-work to commit
or roll back -- each MongoDB write commits per document immediately.

Store codes are validated in application code (_validate_store, against
config/settings.py's STORE_CODE_TO_NAME) since MongoDB has no CHECK
constraint equivalent -- called at the top of every function that can insert
a brand-new document. TIME SLOT is still computed by
config.settings.time_slot_for_time at write time, the same single source of
truth as before -- never a user-supplied value.

A delete is a real document delete, not a blank-cells soft-delete -- same
behavior as the Postgres version, no "blank scaffold row" for list functions
to filter out.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from pymongo import ReturnDocument
from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME, TIME_SLOT_ORDER, time_slot_for_time
from db.models import BILLS, FOOTFALL, NOB, TARGETS, next_id
from src.kpi_engine import safe_divide


def _validate_store(store: str) -> None:
    if store not in STORE_CODE_TO_NAME:
        raise ValueError(f"Unknown store code: {store!r}")


# ---------------------------------------------------------------------------
# BILLS -- flat bill-level log, shared across all 3 stores
# ---------------------------------------------------------------------------


def _bill_to_dict(doc: dict) -> dict:
    return {
        "row": doc["_id"],
        "date": doc["entry_date"],
        "bill_time": doc["bill_time"],
        "net_amount": float(doc["net_amount"]),
        "bill_quantity": float(doc["bill_quantity"]),
        "time_slot": doc["time_slot"],
    }


def add_bill_entry(db: Database, store: str, target_date: date, bill_time: time, net_amount: float, bill_quantity: float) -> dict:
    _validate_store(store)
    doc = {
        "_id": next_id(db, BILLS),
        "store_code": store,
        "entry_date": target_date.isoformat(),
        "bill_time": bill_time.strftime("%H:%M"),
        "net_amount": net_amount,
        "bill_quantity": bill_quantity,
        "time_slot": time_slot_for_time(bill_time),
    }
    db[BILLS].insert_one(doc)
    return _bill_to_dict(doc)


def list_bill_entries(db: Database, store: str, target_date: date) -> list[dict]:
    cursor = db[BILLS].find({"store_code": store, "entry_date": target_date.isoformat()}).sort("bill_time", 1)
    return [_bill_to_dict(d) for d in cursor]


def delete_bill_entry(db: Database, store: str, row: int) -> bool:
    result = db[BILLS].delete_one({"_id": row, "store_code": store})
    return result.deleted_count == 1


def update_bill_entry(db: Database, store: str, row: int, bill_time: time, net_amount: float, bill_quantity: float) -> dict | None:
    """Corrects an already-logged bill in place (e.g. a mistyped amount)
    instead of forcing a delete-and-re-add. Returns None if there's no bill
    for this store at that row (matches delete_bill_entry's False-on-miss
    pattern), letting the caller answer with a 404 -- a wrong store+row
    pairing returns the same not-found result as a nonexistent row, it
    never silently touches another store's data. Time Slot is recomputed
    from the (possibly corrected) bill_time, same as add_bill_entry -- it's
    never accepted as one of the editable fields here."""
    doc = db[BILLS].find_one_and_update(
        {"_id": row, "store_code": store},
        {
            "$set": {
                "bill_time": bill_time.strftime("%H:%M"),
                "net_amount": net_amount,
                "bill_quantity": bill_quantity,
                "time_slot": time_slot_for_time(bill_time),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return _bill_to_dict(doc) if doc is not None else None


def sum_bill_log(db: Database, store: str, target_date: date) -> tuple[float, float]:
    """(net_sales, bill_quantity) summed for this store+date. Defaults to
    (0.0, 0.0) when no bills are logged yet -- a real "nothing sold so far
    today" zero, not a missing-column None."""
    pipeline = [
        {"$match": {"store_code": store, "entry_date": target_date.isoformat()}},
        {"$group": {"_id": None, "net_sales": {"$sum": "$net_amount"}, "bill_quantity": {"$sum": "$bill_quantity"}}},
    ]
    result = list(db[BILLS].aggregate(pipeline))
    if not result:
        return 0.0, 0.0
    return float(result[0]["net_sales"]), float(result[0]["bill_quantity"])


# ---------------------------------------------------------------------------
# FOOTFALL / NOB -- two separate flat, time-stamped, single-value logs,
# each shared across all 3 stores, same shape, generic implementation
# shared between them (Footfall and Nob are structurally identical
# collections).
# ---------------------------------------------------------------------------


def _timed_entry_to_dict(doc: dict, value_field: str) -> dict:
    return {
        "row": doc["_id"],
        "date": doc["entry_date"],
        "time": doc["entry_time"],
        value_field: float(doc[value_field]),
        "time_slot": doc["time_slot"],
    }


def _add_timed_entry(
    db: Database, collection: str, value_field: str,
    store: str, target_date: date, entry_time: time, value: float,
) -> dict:
    _validate_store(store)
    doc = {
        "_id": next_id(db, collection),
        "store_code": store,
        "entry_date": target_date.isoformat(),
        "entry_time": entry_time.strftime("%H:%M"),
        "time_slot": time_slot_for_time(entry_time),
        value_field: value,
    }
    db[collection].insert_one(doc)
    return _timed_entry_to_dict(doc, value_field)


def _list_timed_entries(db: Database, collection: str, value_field: str, store: str, target_date: date) -> list[dict]:
    cursor = db[collection].find({"store_code": store, "entry_date": target_date.isoformat()}).sort("entry_time", 1)
    return [_timed_entry_to_dict(d, value_field) for d in cursor]


def _delete_timed_entry(db: Database, collection: str, store: str, row: int) -> bool:
    result = db[collection].delete_one({"_id": row, "store_code": store})
    return result.deleted_count == 1


def _update_timed_entry(
    db: Database, collection: str, value_field: str,
    store: str, row: int, entry_time: time, value: float,
) -> dict | None:
    doc = db[collection].find_one_and_update(
        {"_id": row, "store_code": store},
        {
            "$set": {
                "entry_time": entry_time.strftime("%H:%M"),
                "time_slot": time_slot_for_time(entry_time),
                value_field: value,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return _timed_entry_to_dict(doc, value_field) if doc is not None else None


def _sum_timed_log(db: Database, collection: str, value_field: str, store: str, target_date: date) -> float:
    pipeline = [
        {"$match": {"store_code": store, "entry_date": target_date.isoformat()}},
        {"$group": {"_id": None, "total": {"$sum": f"${value_field}"}}},
    ]
    result = list(db[collection].aggregate(pipeline))
    return float(result[0]["total"]) if result else 0.0


def add_footfall_entry(db: Database, store: str, target_date: date, entry_time: time, footfall: float) -> dict:
    return _add_timed_entry(db, FOOTFALL, "footfall", store, target_date, entry_time, footfall)


def list_footfall_entries(db: Database, store: str, target_date: date) -> list[dict]:
    return _list_timed_entries(db, FOOTFALL, "footfall", store, target_date)


def delete_footfall_entry(db: Database, store: str, row: int) -> bool:
    return _delete_timed_entry(db, FOOTFALL, store, row)


def update_footfall_entry(db: Database, store: str, row: int, entry_time: time, footfall: float) -> dict | None:
    return _update_timed_entry(db, FOOTFALL, "footfall", store, row, entry_time, footfall)


def sum_footfall_log(db: Database, store: str, target_date: date) -> float:
    return _sum_timed_log(db, FOOTFALL, "footfall", store, target_date)


def add_nob_entry(db: Database, store: str, target_date: date, entry_time: time, nob: float) -> dict:
    return _add_timed_entry(db, NOB, "nob", store, target_date, entry_time, nob)


def list_nob_entries(db: Database, store: str, target_date: date) -> list[dict]:
    return _list_timed_entries(db, NOB, "nob", store, target_date)


def delete_nob_entry(db: Database, store: str, row: int) -> bool:
    return _delete_timed_entry(db, NOB, store, row)


def update_nob_entry(db: Database, store: str, row: int, entry_time: time, nob: float) -> dict | None:
    return _update_timed_entry(db, NOB, "nob", store, row, entry_time, nob)


def sum_nob_log(db: Database, store: str, target_date: date) -> float:
    return _sum_timed_log(db, NOB, "nob", store, target_date)


def compute_live_timeslot_breakdown(
    db: Database, store: str, target_date: date, end_date: date | None = None
) -> dict[str, dict[str, float]]:
    """Today's or date range's Net Sales/Bill Quantity/Footfall/NOB, each summed
    per TIME_SLOT_ORDER band, from the three logs' own persisted TIME SLOT column.
    Supports single day or date range [target_date, end_date] and 'ALL' stores."""
    breakdown: dict[str, dict[str, float]] = {
        slot: {"net_sales": 0.0, "bill_quantity": 0.0, "footfall": 0.0, "nob": 0.0} for slot in TIME_SLOT_ORDER
    }
    cur_date = target_date
    final_date = end_date or target_date
    stores_to_query = list(STORE_CODE_TO_NAME) if store == "ALL" else [store]

    while cur_date <= final_date:
        for s in stores_to_query:
            for entry in list_bill_entries(db, s, cur_date):
                slot = entry.get("time_slot")
                if slot in breakdown:
                    breakdown[slot]["net_sales"] += entry.get("net_amount") or 0.0
                    breakdown[slot]["bill_quantity"] += entry.get("bill_quantity") or 0.0
            for entry in list_footfall_entries(db, s, cur_date):
                slot = entry.get("time_slot")
                if slot in breakdown:
                    breakdown[slot]["footfall"] += entry.get("footfall") or 0.0
            for entry in list_nob_entries(db, s, cur_date):
                slot = entry.get("time_slot")
                if slot in breakdown:
                    breakdown[slot]["nob"] += entry.get("nob") or 0.0
        cur_date += timedelta(days=1)
    return breakdown


# ---------------------------------------------------------------------------
# TARGETS -- one row per store+date, shared across all 3 stores
# ---------------------------------------------------------------------------


def _find_target(db: Database, store: str, target_date: date) -> dict | None:
    return db[TARGETS].find_one({"store_code": store, "entry_date": target_date.isoformat()})


def read_store_target(db: Database, store: str, target_date: date, end_date: date | None = None) -> float | None:
    if end_date is None or end_date <= target_date:
        target = _find_target(db, store, target_date)
        if target is None or target.get("sales_target") is None:
            return None
        return float(target["sales_target"])

    total_target = 0.0
    has_target = False
    cur = target_date
    while cur <= end_date:
        t = _find_target(db, store, cur)
        if t is not None and t.get("sales_target") is not None:
            total_target += float(t["sales_target"])
            has_target = True
        cur += timedelta(days=1)
    return total_target if has_target else None


def read_target_for_stores(db: Database, stores: list[str], target_date: date) -> float | None:
    values = [v for store in stores if (v := read_store_target(db, store, target_date)) is not None]
    return sum(values) if values else None


# The five ratio KPIs a store manager can override by hand on the Daily
# Dashboard when the auto-computed figure is wrong (e.g. a POS export gap).
# The raw log sums (net_sales/bill_quantity/footfall/nob) are never
# overridable -- they always come straight from the bill/footfall/NOB logs.
OVERRIDABLE_KPIS = ("atv", "rpv", "basket_size", "conversion_pct", "achievement_pct")

# Fields of a `targets` row that hold the last computed KPI snapshot (as
# opposed to admin-set sales_target, manually-typed reason, or the overrides
# sub-doc). save_target_entry / the midnight job refresh exactly these.
_TARGET_SNAPSHOT_FIELDS = (
    "net_sales", "remaining", "footfall", "nob",
    "atv", "rpv", "basket_size", "conversion_pct", "achievement_pct",
)


def _blank_target_doc(db: Database, store: str, target_date: date, **fields) -> dict:
    """A fresh `targets` document with every snapshot field NULL (never a
    fabricated 0 -- CLAUDE.md's don't-fabricate rule). Callers pass the one
    or two fields they actually know (sales_target, a snapshot dict, an
    overrides dict). Shared by set_store_target, save_target_entry and
    set_kpi_override so the row shape can't drift."""
    _validate_store(store)
    return {
        "_id": next_id(db, TARGETS),
        "store_code": store,
        "entry_date": target_date.isoformat(),
        "sales_target": None,
        "reason": None,
        "net_sales": None,
        "remaining": None,
        "footfall": None,
        "nob": None,
        "atv": None,
        "rpv": None,
        "basket_size": None,
        "conversion_pct": None,
        "achievement_pct": None,
        **fields,
    }


def _apply_overrides(kpis: dict, overrides: dict) -> dict:
    """Overlay a manager's manually-entered values (the targets.overrides
    sub-doc, set via set_kpi_override) onto a freshly-computed KPI dict.
    Only OVERRIDABLE_KPIS are honoured. Overriding achievement_pct also
    re-derives remaining/remaining_pct from it -- they're the same business
    quantity seen the other way round (remaining_pct == 100 - achievement_pct),
    so a hand-set achievement figure and the Remaining card can never
    disagree. kpis['overridden'] lists which fields were replaced, for the
    dashboard's "manually set" marker and so callers can surface it."""
    applied: list[str] = []
    for field in OVERRIDABLE_KPIS:
        value = overrides.get(field)
        if value is None:
            continue
        kpis[field] = float(value)
        applied.append(field)
    if "achievement_pct" in applied:
        ach = kpis["achievement_pct"]
        kpis["remaining_pct"] = 100.0 - ach
        if kpis.get("sales_target") is not None:
            kpis["remaining"] = kpis["sales_target"] - kpis["sales_target"] * ach / 100.0
    kpis["overridden"] = applied
    return kpis


def compute_live_kpis(db: Database, store: str, target_date: date) -> dict:
    net_sales, bill_quantity = sum_bill_log(db, store, target_date)
    footfall = sum_footfall_log(db, store, target_date)
    nob = sum_nob_log(db, store, target_date)

    target = _find_target(db, store, target_date)
    sales_target = float(target["sales_target"]) if target is not None and target.get("sales_target") is not None else None
    reason = target.get("reason") if target is not None and target.get("reason") else None
    overrides = (target.get("overrides") or {}) if target is not None else {}

    remaining = (sales_target - net_sales) if sales_target is not None else None
    achievement_ratio = safe_divide(net_sales, sales_target)
    achievement_pct = achievement_ratio * 100 if achievement_ratio is not None else None
    remaining_ratio = safe_divide(remaining, sales_target)
    remaining_pct = remaining_ratio * 100 if remaining_ratio is not None else None
    conversion_ratio = safe_divide(nob, footfall)
    conversion_pct = conversion_ratio * 100 if conversion_ratio is not None else None

    kpis = {
        "sales_target": sales_target,
        "net_sales": net_sales,
        "bill_quantity": bill_quantity,
        "remaining": remaining,
        "remaining_pct": remaining_pct,
        "footfall": footfall,
        "nob": nob,
        "atv": safe_divide(net_sales, nob),
        "rpv": safe_divide(net_sales, footfall),
        "basket_size": safe_divide(bill_quantity, nob),
        "conversion_pct": conversion_pct,
        "achievement_pct": achievement_pct,
        "reason": reason,
    }
    return _apply_overrides(kpis, overrides)


def compute_live_kpis_all_stores(db: Database, target_date: date) -> dict:
    """Blended Daily KPIs across every store for one date, plus each store's
    own bundle. The combined figures sum the *raw* totals (net_sales,
    bill_quantity, footfall, nob, sales_target) and re-derive the ratios from
    those sums -- the same "sum facts then divide" rule src/kpi_engine.py uses
    for multi-store Historical Analytics, and src/daily_report.py's
    build_overall_summary uses for multi-date. Per-store manager overrides
    (targets.overrides) are ratio-only and raw sums are override-independent,
    so the blended view deliberately reflects the computed figures, not any
    single store's hand-set correction.

    Returns {"combined": <kpi dict, same keys as compute_live_kpis minus
    'overridden'>, "per_store": {code: <compute_live_kpis dict>, ...}}.
    """
    per_store = {code: compute_live_kpis(db, code, target_date) for code in STORE_CODE_TO_NAME}

    net_sales = sum(b["net_sales"] or 0.0 for b in per_store.values())
    bill_quantity = sum(b["bill_quantity"] or 0.0 for b in per_store.values())
    footfall = sum(b["footfall"] or 0.0 for b in per_store.values())
    nob = sum(b["nob"] or 0.0 for b in per_store.values())
    set_targets = [b["sales_target"] for b in per_store.values() if b["sales_target"] is not None]
    sales_target = sum(set_targets) if set_targets else None

    remaining = (sales_target - net_sales) if sales_target is not None else None
    achievement_ratio = safe_divide(net_sales, sales_target)
    achievement_pct = achievement_ratio * 100 if achievement_ratio is not None else None
    remaining_ratio = safe_divide(remaining, sales_target)
    remaining_pct = remaining_ratio * 100 if remaining_ratio is not None else None
    conversion_ratio = safe_divide(nob, footfall)
    conversion_pct = conversion_ratio * 100 if conversion_ratio is not None else None

    combined = {
        "sales_target": sales_target,
        "net_sales": net_sales,
        "bill_quantity": bill_quantity,
        "remaining": remaining,
        "remaining_pct": remaining_pct,
        "footfall": footfall,
        "nob": nob,
        "atv": safe_divide(net_sales, nob),
        "rpv": safe_divide(net_sales, footfall),
        "basket_size": safe_divide(bill_quantity, nob),
        "conversion_pct": conversion_pct,
        "achievement_pct": achievement_pct,
        "reason": None,
    }
    return {"combined": combined, "per_store": per_store}


def set_kpi_override(db: Database, store: str, target_date: date, field: str, value: float) -> dict:
    """Store a manager's hand-entered value for one of OVERRIDABLE_KPIS,
    per store+date, in the targets.overrides sub-doc. Creates the targets
    row if this store+date has none yet (an admin needn't have set a
    sales_target first). Returns the refreshed live KPI dict (override
    already applied)."""
    if field not in OVERRIDABLE_KPIS:
        raise ValueError(f"{field!r} is not an overridable KPI (choose from {', '.join(OVERRIDABLE_KPIS)}).")
    if value < 0:
        raise ValueError("value cannot be negative.")
    target = _find_target(db, store, target_date)
    if target is None:
        db[TARGETS].insert_one(_blank_target_doc(db, store, target_date, overrides={field: float(value)}))
    else:
        db[TARGETS].update_one({"_id": target["_id"]}, {"$set": {f"overrides.{field}": float(value)}})
    return compute_live_kpis(db, store, target_date)


def clear_kpi_override(db: Database, store: str, target_date: date, field: str) -> dict:
    """Drop one KPI override, reverting that card to its computed value.
    A no-op (but still returns the current live KPIs) when there's no
    targets row or no override for that field."""
    if field not in OVERRIDABLE_KPIS:
        raise ValueError(f"{field!r} is not an overridable KPI (choose from {', '.join(OVERRIDABLE_KPIS)}).")
    target = _find_target(db, store, target_date)
    if target is not None:
        db[TARGETS].update_one({"_id": target["_id"]}, {"$unset": {f"overrides.{field}": ""}})
    return compute_live_kpis(db, store, target_date)


def set_store_target(db: Database, store: str, target_date: date, sales_target: float | None) -> dict:
    """Admin-authoritative SALES TARGET setter for one store+date (the
    "Sales Target" admin view, PUT /api/targets) -- and, since the split into
    two sub-projects, the ONLY way a target is ever set. The midnight job's
    old auto-assigned historical-median estimate is gone with DATASET.xlsx,
    so a store/date with no admin-set target simply keeps a null Achievement %
    rather than being handed a fabricated one.

    This overwrites whatever value is currently there (or clears it, when
    sales_target is None), because the admin is the source of truth for the
    figure. Creates the targets row if this
    store+date has none yet. After writing, refreshes the KPI snapshot
    (remaining/achievement_pct/... against the new target) via
    save_target_entry so the Daily Dashboard and the Date Wise report don't
    show a stale achievement figure until the next manual save or the
    midnight job. Returns the refreshed live KPI dict."""
    _validate_store(store)
    if sales_target is not None:
        sales_target = float(sales_target)
        if sales_target < 0:
            raise ValueError("sales_target cannot be negative.")

    target = _find_target(db, store, target_date)
    if target is None:
        db[TARGETS].insert_one(_blank_target_doc(db, store, target_date, sales_target=sales_target))
    else:
        db[TARGETS].update_one({"_id": target["_id"]}, {"$set": {"sales_target": sales_target}})
    return save_target_entry(db, store, target_date, None)


def list_store_targets(db: Database, store: str) -> list[dict]:
    """Every dated SALES TARGET row for one store, oldest first, each with
    the latest Net Sales / Achievement % snapshot alongside it so the admin
    page can show target-vs-actual at a glance. Rows whose sales_target is
    still NULL (e.g. one auto-created by a KPI override before any target was
    set) are included with sales_target: None."""
    _validate_store(store)
    cursor = db[TARGETS].find({"store_code": store}).sort("entry_date", 1)
    return [
        {
            "date": doc["entry_date"],
            "sales_target": None if doc.get("sales_target") is None else float(doc["sales_target"]),
            "net_sales": None if doc.get("net_sales") is None else float(doc["net_sales"]),
            "achievement_pct": None if doc.get("achievement_pct") is None else float(doc["achievement_pct"]),
        }
        for doc in cursor
    ]


def save_target_entry(db: Database, store: str, target_date: date, reason: str | None = None) -> dict:
    """The Manual Daily Entry Update/Final Submission handler. reason is
    optional -- omitted (None) leaves that cell as whatever it already was,
    so a click that's only logging a bill/footfall/NOB entry (no new
    Remarks to report) still safely refreshes NET SALES/FOOTFALL/NOB/ATV/etc.
    against the latest logs without clobbering a previously-saved Remarks
    note. Net Sales, Bill Quantity, Footfall, and NOB are all always
    recomputed live from their own logs -- none of them is a caller-supplied
    value here. The persisted snapshot reflects any active KPI overrides
    (compute_live_kpis applies them), so the Date Wise report reads the same
    figures the dashboard shows."""
    kpis = compute_live_kpis(db, store, target_date)
    snapshot = {field: kpis[field] for field in _TARGET_SNAPSHOT_FIELDS}
    if reason is not None:
        snapshot["reason"] = reason or None

    target = _find_target(db, store, target_date)
    if target is None:
        db[TARGETS].insert_one(_blank_target_doc(db, store, target_date, **snapshot))
    else:
        db[TARGETS].update_one({"_id": target["_id"]}, {"$set": snapshot})

    # Echo back only the reason this call was given (None when omitted) --
    # callers that need the persisted note read it from compute_live_kpis /
    # GET /api/daily/live, not from this return value.
    kpis["reason"] = reason
    kpis.pop("overridden", None)
    return kpis


def list_all_history_dates(db: Database, store: str) -> list[dict]:
    """Retrieves all recorded dates across BILLS, FOOTFALL, NOB, and TARGETS
    for the given store (or across all stores if store == 'ALL'). Returns a list
    sorted descending (newest date first) with daily summary statistics for each date."""
    query = {} if store == "ALL" else {"store_code": store}
    seen_dates: set[str] = set()
    for coll in (BILLS, FOOTFALL, NOB, TARGETS):
        for doc in db[coll].find(query, {"entry_date": 1}):
            iso = doc.get("entry_date")
            if iso:
                seen_dates.add(iso)

    if not seen_dates:
        seen_dates.add(date.today().isoformat())

    results = []
    for iso in sorted(seen_dates, reverse=True):
        d = date.fromisoformat(iso)
        if store == "ALL":
            combined_res = compute_live_kpis_all_stores(db, d)
            kpis = combined_res["combined"]
        else:
            kpis = compute_live_kpis(db, store, d)

        results.append({
            "date": iso,
            "day_name": d.strftime("%A"),
            "store": store,
            "net_sales": kpis.get("net_sales", 0.0),
            "footfall": kpis.get("footfall", 0.0),
            "bill_quantity": kpis.get("bill_quantity", 0.0),
            "nob": kpis.get("nob", 0.0),
            "sales_target": kpis.get("sales_target"),
            "achievement_pct": kpis.get("achievement_pct"),
            "atv": kpis.get("atv"),
            "conversion_pct": kpis.get("conversion_pct"),
        })
    return results


def _clean(value):
    if isinstance(value, float) and value != value:  # NaN
        return None
    return value


def get_history_details(db: Database, store: str, target_date: date) -> dict:
    """Returns comprehensive time-slot-wise history details and individual logs
    for a specific date and store (or ALL stores)."""
    iso_date = target_date.isoformat()
    stores_to_fetch = list(STORE_CODE_TO_NAME.keys()) if store == "ALL" else [store]

    bill_logs: list[dict] = []
    footfall_logs: list[dict] = []
    nob_logs: list[dict] = []

    for s in stores_to_fetch:
        for b in list_bill_entries(db, s, target_date):
            item = dict(b)
            if store == "ALL":
                item["store"] = s
            bill_logs.append(item)
        for f in list_footfall_entries(db, s, target_date):
            item = dict(f)
            if store == "ALL":
                item["store"] = s
            footfall_logs.append(item)
        for n in list_nob_entries(db, s, target_date):
            item = dict(n)
            if store == "ALL":
                item["store"] = s
            nob_logs.append(item)

    bill_logs.sort(key=lambda x: x.get("bill_time", ""))
    footfall_logs.sort(key=lambda x: x.get("time", ""))
    nob_logs.sort(key=lambda x: x.get("time", ""))

    if store == "ALL":
        all_kpis = compute_live_kpis_all_stores(db, target_date)
        kpis = all_kpis["combined"]
    else:
        kpis = compute_live_kpis(db, store, target_date)

    timeslot_summary: dict[str, dict[str, float]] = {
        slot: {
            "time_slot": slot,
            "net_sales": 0.0,
            "bill_quantity": 0.0,
            "bill_count": 0,
            "footfall": 0.0,
            "nob": 0.0,
            "atv": 0.0,
            "rpv": 0.0,
            "basket_size": 0.0,
            "conversion_pct": 0.0,
        }
        for slot in TIME_SLOT_ORDER
    }

    for b in bill_logs:
        slot = b.get("time_slot")
        if slot in timeslot_summary:
            timeslot_summary[slot]["net_sales"] += b.get("net_amount", 0.0) or 0.0
            timeslot_summary[slot]["bill_quantity"] += b.get("bill_quantity", 0.0) or 0.0
            timeslot_summary[slot]["bill_count"] += 1

    for f in footfall_logs:
        slot = f.get("time_slot")
        if slot in timeslot_summary:
            timeslot_summary[slot]["footfall"] += f.get("footfall", 0.0) or 0.0

    for n in nob_logs:
        slot = n.get("time_slot")
        if slot in timeslot_summary:
            timeslot_summary[slot]["nob"] += n.get("nob", 0.0) or 0.0

    timeslot_list = []
    sales_target = kpis.get("sales_target")
    for slot in TIME_SLOT_ORDER:
        cell = timeslot_summary[slot]
        ns = cell["net_sales"]
        bq = cell["bill_quantity"]
        ff = cell["footfall"]
        nob = cell["nob"]
        bc = cell["bill_count"]

        cell["sales_target"] = sales_target
        cell["remaining"] = round(sales_target - ns, 2) if sales_target is not None else None
        cell["achievement_pct"] = round((ns / sales_target) * 100, 2) if (sales_target and sales_target > 0) else 0.0
        cell["remaining_pct"] = round(((sales_target - ns) / sales_target) * 100, 2) if (sales_target and sales_target > 0) else 0.0
        cell["atv"] = round(ns / nob, 2) if nob > 0 else 0.0
        cell["rpv"] = round(ns / ff, 2) if ff > 0 else 0.0
        cell["basket_size"] = round(bq / nob, 2) if nob > 0 else 0.0
        cell["conversion_pct"] = round((nob / ff) * 100, 2) if ff > 0 else 0.0

        timeslot_list.append(cell)

    return {
        "store": store,
        "date": iso_date,
        "day_name": target_date.strftime("%A"),
        "kpis": {k: _clean(v) for k, v in kpis.items() if k not in ("reason", "overridden")},
        "timeslot_breakdown": timeslot_list,
        "bill_logs": bill_logs,
        "footfall_logs": footfall_logs,
        "nob_logs": nob_logs,
    }


def get_history_range_details(db: Database, store: str, start_date: date, end_date: date) -> dict:
    """Returns comprehensive historical operations metrics, daily breakdowns,
    aggregated time-slot breakdowns, and logs across a specified date range [start_date, end_date]."""
    if start_date > end_date:
        start_date, end_date = end_date, start_date

    stores_to_fetch = list(STORE_CODE_TO_NAME.keys()) if store == "ALL" else [store]
    
    total_days = (end_date - start_date).days + 1
    daily_breakdown: list[dict] = []
    
    all_bill_logs: list[dict] = []
    all_footfall_logs: list[dict] = []
    all_nob_logs: list[dict] = []

    timeslot_summary: dict[str, dict[str, float]] = {
        slot: {
            "time_slot": slot,
            "net_sales": 0.0,
            "bill_quantity": 0.0,
            "bill_count": 0,
            "footfall": 0.0,
            "nob": 0.0,
            "atv": 0.0,
            "rpv": 0.0,
            "basket_size": 0.0,
            "conversion_pct": 0.0,
        }
        for slot in TIME_SLOT_ORDER
    }

    total_net_sales = 0.0
    total_sales_target = 0.0
    has_any_target = False
    total_bill_quantity = 0.0
    total_footfall = 0.0
    total_nob = 0.0

    cur_d = start_date
    while cur_d <= end_date:
        iso_d = cur_d.isoformat()
        if store == "ALL":
            all_kpis = compute_live_kpis_all_stores(db, cur_d)
            kpis = all_kpis["combined"]
        else:
            kpis = compute_live_kpis(db, store, cur_d)

        ns = kpis.get("net_sales", 0.0) or 0.0
        bq = kpis.get("bill_quantity", 0.0) or 0.0
        ff = kpis.get("footfall", 0.0) or 0.0
        nb = kpis.get("nob", 0.0) or 0.0
        st = kpis.get("sales_target")

        total_net_sales += ns
        total_bill_quantity += bq
        total_footfall += ff
        total_nob += nb

        if st is not None:
            total_sales_target += st
            has_any_target = True

        for s in stores_to_fetch:
            for b in list_bill_entries(db, s, cur_d):
                item = dict(b)
                if store == "ALL":
                    item["store"] = s
                all_bill_logs.append(item)
            for f in list_footfall_entries(db, s, cur_d):
                item = dict(f)
                if store == "ALL":
                    item["store"] = s
                all_footfall_logs.append(item)
            for n in list_nob_entries(db, s, cur_d):
                item = dict(n)
                if store == "ALL":
                    item["store"] = s
                all_nob_logs.append(item)

        daily_breakdown.append({
            "date": iso_d,
            "day_name": cur_d.strftime("%A"),
            "net_sales": round(ns, 2),
            "sales_target": st,
            "achievement_pct": kpis.get("achievement_pct"),
            "remaining": kpis.get("remaining"),
            "bill_quantity": bq,
            "footfall": ff,
            "nob": nb,
            "basket_size": kpis.get("basket_size", 0.0) or 0.0,
            "atv": kpis.get("atv", 0.0) or 0.0,
            "rpv": kpis.get("rpv", 0.0) or 0.0,
            "conversion_pct": kpis.get("conversion_pct", 0.0) or 0.0,
        })
        cur_d += timedelta(days=1)

    all_bill_logs.sort(key=lambda x: (x.get("date", ""), x.get("bill_time", "")), reverse=True)
    all_footfall_logs.sort(key=lambda x: (x.get("date", ""), x.get("time", "")), reverse=True)
    all_nob_logs.sort(key=lambda x: (x.get("date", ""), x.get("time", "")), reverse=True)

    # Accumulate timeslot aggregations
    for b in all_bill_logs:
        slot = b.get("time_slot")
        if slot in timeslot_summary:
            timeslot_summary[slot]["net_sales"] += b.get("net_amount", 0.0) or 0.0
            timeslot_summary[slot]["bill_quantity"] += b.get("bill_quantity", 0.0) or 0.0
            timeslot_summary[slot]["bill_count"] += 1

    for f in all_footfall_logs:
        slot = f.get("time_slot")
        if slot in timeslot_summary:
            timeslot_summary[slot]["footfall"] += f.get("footfall", 0.0) or 0.0

    for n in all_nob_logs:
        slot = n.get("time_slot")
        if slot in timeslot_summary:
            timeslot_summary[slot]["nob"] += n.get("nob", 0.0) or 0.0

    timeslot_list = []
    final_sales_target = total_sales_target if has_any_target else None
    for slot in TIME_SLOT_ORDER:
        cell = timeslot_summary[slot]
        ns = cell["net_sales"]
        bq = cell["bill_quantity"]
        ff = cell["footfall"]
        nob = cell["nob"]
        bc = cell["bill_count"]

        cell["sales_target"] = final_sales_target
        cell["remaining"] = round(final_sales_target - ns, 2) if final_sales_target is not None else None
        cell["achievement_pct"] = round((ns / final_sales_target) * 100, 2) if (final_sales_target and final_sales_target > 0) else 0.0
        cell["remaining_pct"] = round(((final_sales_target - ns) / final_sales_target) * 100, 2) if (final_sales_target and final_sales_target > 0) else 0.0
        cell["atv"] = round(ns / nob, 2) if nob > 0 else 0.0
        cell["rpv"] = round(ns / ff, 2) if ff > 0 else 0.0
        cell["basket_size"] = round(bq / nob, 2) if nob > 0 else 0.0
        cell["conversion_pct"] = round((nob / ff) * 100, 2) if ff > 0 else 0.0

        timeslot_list.append(cell)

    overall_target = total_sales_target if has_any_target else None
    overall_remaining = max(0.0, overall_target - total_net_sales) if overall_target is not None else None
    overall_ach_pct = round((total_net_sales / overall_target) * 100, 2) if (overall_target and overall_target > 0) else None
    overall_rem_pct = round((overall_remaining / overall_target) * 100, 2) if (overall_target and overall_target > 0 and overall_remaining is not None) else None

    range_kpis = {
        "net_sales": round(total_net_sales, 2),
        "sales_target": overall_target,
        "remaining": overall_remaining,
        "achievement_pct": overall_ach_pct,
        "remaining_pct": overall_rem_pct,
        "bill_quantity": total_bill_quantity,
        "footfall": total_footfall,
        "nob": total_nob,
        "basket_size": round(total_bill_quantity / total_nob, 2) if total_nob > 0 else 0.0,
        "atv": round(total_net_sales / total_nob, 2) if total_nob > 0 else 0.0,
        "rpv": round(total_net_sales / total_footfall, 2) if total_footfall > 0 else 0.0,
        "conversion_pct": round((total_nob / total_footfall) * 100, 2) if total_footfall > 0 else 0.0,
    }

    return {
        "store": store,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "days_count": total_days,
        "kpis": range_kpis,
        "daily_breakdown": daily_breakdown,
        "timeslot_breakdown": timeslot_list,
        "bill_logs": all_bill_logs,
        "footfall_logs": all_footfall_logs,
        "nob_logs": all_nob_logs,
    }


def get_target_adjustment_alert(
    db: Database,
    store: str,
    target_date: date,
    recovery_window: int = 7,
    carry_forward_policy: str = "MONTH_END_CLOSE",
    distribution_mode: str = "EQUAL",
    policy_start_date: date | None = None,
) -> dict | None:
    """Calculates Target Adjustment alert using the rolling recovery deficit bucket engine."""
    from src.target_adjustment_engine import compute_target_adjustment

    kwargs = {
        "recovery_window": recovery_window,
        "carry_forward_policy": carry_forward_policy,
        "distribution_mode": distribution_mode,
    }
    if policy_start_date is not None:
        kwargs["policy_start_date"] = policy_start_date

    return compute_target_adjustment(
        db,
        store,
        target_date,
        **kwargs,
    )



def get_landing_hero_telemetry(db: Database) -> dict:
    """Computes authentic previous-day (or latest recorded day) telemetry
    for the Landing page Hero section across all stores and consolidated."""
    # Find most recent recorded date in MongoDB
    seen_dates: set[str] = set()
    for coll in (BILLS, FOOTFALL, NOB, TARGETS):
        for doc in db[coll].find({}, {"entry_date": 1}):
            iso = doc.get("entry_date")
            if iso:
                seen_dates.add(iso)

    today_iso = date.today().isoformat()
    # Prefer previous day or yesterday if present, otherwise latest recorded past date, otherwise today
    sorted_dates = sorted(seen_dates, reverse=True)
    
    target_iso = None
    for d_str in sorted_dates:
        if d_str < today_iso:
            target_iso = d_str
            break
    if not target_iso and sorted_dates:
        target_iso = sorted_dates[0]
    if not target_iso:
        target_iso = today_iso

    target_date = date.fromisoformat(target_iso)
    
    # Store names mapping
    store_meta = {
        "all": {"name": "Consolidated (All 3 Stores)", "subtitle": "Real-time network aggregate feed"},
        "NM": {"name": "New Market (Flagship)", "subtitle": "Lindsay Street · Central Kolkata"},
        "HB": {"name": "Hatibagan (North Hub)", "subtitle": "Bidhan Sarani · North Kolkata"},
        "CHW": {"name": "Chowringhee (Metro Core)", "subtitle": "J.L. Nehru Road · South-Central Kolkata"},
    }

    result = {
        "recorded_date": target_iso,
        "day_name": target_date.strftime("%A"),
        "stores": {},
    }

    # Consolidated ALL
    all_kpis_bundle = compute_live_kpis_all_stores(db, target_date)
    all_kpis = all_kpis_bundle["combined"]

    # Build per-store + all telemetry
    for store_key in ("all", "NM", "HB", "CHW"):
        if store_key == "all":
            kpis = all_kpis
            stores_to_fetch = list(STORE_CODE_TO_NAME.keys())
        else:
            kpis = compute_live_kpis(db, store_key, target_date)
            stores_to_fetch = [store_key]

        net_sales = kpis.get("net_sales", 0.0) or 0.0
        sales_target = kpis.get("sales_target")
        footfall = kpis.get("footfall", 0.0) or 0.0
        conversion_pct = kpis.get("conversion_pct", 0.0) or 0.0
        atv = kpis.get("atv", 0.0) or 0.0
        basket_size = kpis.get("basket_size", 0.0) or 0.0
        ach_pct = kpis.get("achievement_pct")

        if sales_target and sales_target > 0:
            diff_pct = ((net_sales - sales_target) / sales_target) * 100
            sales_growth_str = f"{'+' if diff_pct >= 0 else ''}{diff_pct:.1f}% vs target"
        else:
            sales_growth_str = "Target pending"

        # Calculate time slot distribution
        slot_sales = {slot: 0.0 for slot in TIME_SLOT_ORDER}
        for s in stores_to_fetch:
            for b in list_bill_entries(db, s, target_date):
                ts = b.get("time_slot")
                if ts in slot_sales:
                    slot_sales[ts] += b.get("net_amount", 0.0) or 0.0

        max_slot_val = max(slot_sales.values()) if slot_sales and max(slot_sales.values()) > 0 else 1.0

        # Define 7 standard time checkpoint labels
        time_labels = ["11 AM", "01 PM", "03 PM", "05 PM", "07 PM", "09 PM", "11 PM"]
        hourly_points = []
        for i, slot in enumerate(TIME_SLOT_ORDER):
            val = slot_sales.get(slot, 0.0)
            pct = round((val / max_slot_val) * 100) if max_slot_val > 0 else 20
            time_lbl = time_labels[i] if i < len(time_labels) else f"Slot {i+1}"
            hourly_points.append({
                "time": time_lbl,
                "value": max(15, pct),
                "amount": f"₹{val:,.0f}",
                "isPeak": (pct >= 85),
            })

        meta = store_meta.get(store_key, {"name": store_key, "subtitle": ""})

        result["stores"][store_key] = {
            "name": meta["name"],
            "subtitle": meta["subtitle"],
            "sales": f"₹{net_sales:,.0f}",
            "raw_sales": net_sales,
            "salesGrowth": sales_growth_str,
            "footfall": f"{footfall:,.0f}",
            "raw_footfall": footfall,
            "conversion": f"{conversion_pct:.1f}%",
            "raw_conversion": conversion_pct,
            "atv": f"₹{atv:,.0f}",
            "raw_atv": atv,
            "basket": f"{basket_size:.1f} units",
            "raw_basket": basket_size,
            "achievement_pct": ach_pct,
            "peakRush": "05:00 PM – 08:30 PM",
            "hourlyPoints": hourly_points,
        }

    return result

