"""Admin-only SALES TARGET entry for the Daily Operations stores -- the
"Sales Targets" admin page. One `targets` row per store+date (shared
`targets` collection, src/daily_dashboard_store.py); `sales_target` is the
admin-set figure the Daily Dashboard's Remaining / Achievement % KPIs are
measured against.

This router is mounted with Depends(require_admin) in app.py, so every
handler here already knows the caller is the admin account -- a store
manager never reaches it (they set no targets, only log bills/footfall/NOB).
The only per-request check left is that `store` is a real store code.
"""
from __future__ import annotations

import io
from datetime import date, datetime

import openpyxl
from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME
from src import daily_dashboard_store

from db.session import get_db

router = APIRouter(prefix="/api/targets", tags=["targets"])


def _validate_store(store: str) -> str:
    code = (store or "").strip()
    if code not in STORE_CODE_TO_NAME:
        raise HTTPException(status_code=400, detail=f"Unknown store code: {store!r}")
    return code


def _parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD.")


def _parse_target(value) -> float | None:
    """None / "" -> clear the target. Otherwise a non-negative number."""
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="sales_target must be a number or null.")
    if number < 0:
        raise HTTPException(status_code=400, detail="sales_target cannot be negative.")
    return number


@router.get("")
def list_targets(
    store: str = Query(..., description="Single store code, e.g. NM"),
    db: Database = Depends(get_db),
):
    code = _validate_store(store)
    return {"store": code, "entries": daily_dashboard_store.list_store_targets(db, code)}


@router.put("")
def put_target(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
):
    """Body: {store, date, sales_target}. sales_target null/omitted clears the
    target for that store+date. Returns the refreshed live KPI snapshot."""
    code = _validate_store(str(payload.get("store", "")))
    date_str = str(payload.get("date", "")).strip()
    if not date_str:
        raise HTTPException(status_code=400, detail="date is required.")
    target_date = _parse_iso_date(date_str)
    sales_target = _parse_target(payload.get("sales_target"))
    try:
        kpis = daily_dashboard_store.set_store_target(db, code, target_date, sales_target)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {
        "store": code,
        "date": target_date.isoformat(),
        "sales_target": kpis.get("sales_target"),
        "net_sales": kpis.get("net_sales"),
        "achievement_pct": kpis.get("achievement_pct"),
    }


def _apply_target_rows(db: Database, code: str, rows: list) -> int:
    """Apply {date, sales_target} rows to one store in order (a null/blank
    sales_target clears that date). A bad row 400s before any later row is
    touched, but rows already applied stay applied -- each write commits
    immediately, there is no transaction to roll back."""
    applied = 0
    for row in rows:
        if not isinstance(row, dict):
            raise HTTPException(status_code=400, detail="each row must be an object with date and sales_target.")
        date_str = str(row.get("date", "")).strip()
        if not date_str:
            raise HTTPException(status_code=400, detail="each row needs a date.")
        target_date = _parse_iso_date(date_str)
        sales_target = _parse_target(row.get("sales_target"))
        try:
            daily_dashboard_store.set_store_target(db, code, target_date, sales_target)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))
        applied += 1
    return applied


@router.post("/bulk")
def put_targets_bulk(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
):
    """Body: {store, rows: [{date, sales_target}, ...]}. Applies each row with
    the same semantics as PUT."""
    code = _validate_store(str(payload.get("store", "")))
    rows = payload.get("rows")
    if not isinstance(rows, list) or not rows:
        raise HTTPException(status_code=400, detail="rows must be a non-empty list.")
    applied = _apply_target_rows(db, code, rows)
    return {"store": code, "applied": applied, "entries": daily_dashboard_store.list_store_targets(db, code)}


def _cell_to_iso_date(value) -> str:
    """Normalise an Excel Date cell (openpyxl gives datetime/date for real
    date cells, a string for text) to YYYY-MM-DD for _parse_iso_date."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value or "").strip()[:10]


@router.post("/upload")
def upload_targets(
    store: str = Query(..., description="Single store code, e.g. NM"),
    file: UploadFile = File(...),
    db: Database = Depends(get_db),
):
    """Bulk-set a store's monthly SALES TARGET from a two-column .xlsx
    (`Date`, `Sales Target`; header row skipped). Same per-row semantics as
    POST /bulk -- a blank Sales Target clears that date, a negative value or
    unparseable date 400s. Admin-only (this whole router is)."""
    code = _validate_store(store)
    raw = file.file.read()
    try:
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the file as an .xlsx workbook.")
    ws = wb.active
    rows: list[dict] = []
    for excel_row in ws.iter_rows(min_row=2, values_only=True):
        date_cell = excel_row[0] if len(excel_row) > 0 else None
        target_cell = excel_row[1] if len(excel_row) > 1 else None
        if date_cell is None and (target_cell is None or target_cell == ""):
            continue  # trailing blank rows
        rows.append({"date": _cell_to_iso_date(date_cell), "sales_target": target_cell})
    wb.close()
    if not rows:
        raise HTTPException(status_code=400, detail="No data rows found (expected columns: Date, Sales Target).")
    applied = _apply_target_rows(db, code, rows)
    return {"store": code, "applied": applied, "entries": daily_dashboard_store.list_store_targets(db, code)}


@router.delete("")
def delete_target(
    store: str = Query(...),
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Database = Depends(get_db),
):
    """Clear one store+date's SALES TARGET (sets sales_target back to NULL and
    refreshes the snapshot). The `targets` row itself is kept -- it may still
    carry a manually-entered Remarks note or KPI overrides."""
    code = _validate_store(store)
    target_date = _parse_iso_date(date)
    try:
        daily_dashboard_store.set_store_target(db, code, target_date, None)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {"store": code, "date": target_date.isoformat(), "cleared": True}
