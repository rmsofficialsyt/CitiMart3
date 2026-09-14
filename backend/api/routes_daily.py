"""Daily Dashboard: per-store live KPIs (src/daily_dashboard_store.py, backed
by MongoDB) plus same-day weather/holiday/election context
(src/daily_context.py), and the Manual Daily Entry bill log + Save Entry
actions.

Every figure served here is read from MongoDB at request time. There is no
DATASET.xlsx in this sub-project, so the "Previous Year Same Day" matrix that
used to ride along in /live is gone -- year-on-year comparison belongs to
Analytics & Forecasting, which is where the historical workbook lives.
"""
from __future__ import annotations

from datetime import date, datetime, time

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user, require_admin, require_store_access
from config.kpi_thresholds import (
    achievement_status,
    atv_status,
    basket_size_status,
    conversion_status,
    remaining_status,
    rpv_status,
)
from src import daily_context, daily_dashboard_store
from src.daily_report import build_daily_report_payload
from src.reports.chart_image import ChartRenderError
from src.reports.dispatch import RENDERERS

from db.session import get_db

_REPORT_FORMATS = {"xlsx", "pdf"}

router = APIRouter(prefix="/api/daily", tags=["daily"])


def _guard(payload_or_store, user: CurrentUser) -> str:
    """Resolve the target store from a query param (str) or a request body
    (dict) and authorize the caller for it. A manager reaching for another
    store's data -- read or write, by date or by row -- gets 403 here before
    any DB access."""
    store = payload_or_store if isinstance(payload_or_store, str) else str(payload_or_store.get("store", "")).strip()
    require_store_access(store, user)
    return store


def _clean(value):
    if isinstance(value, float) and value != value:  # NaN
        return None
    return value


def _parse_iso_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD.")


def _parse_hhmm(value: str, field: str = "time") -> time:
    try:
        return time.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} must be HH:MM.")


def _parse_nonneg_number(payload: dict, field: str) -> float:
    try:
        value = float(payload.get(field))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field} must be a number.")
    if value < 0:
        raise HTTPException(status_code=400, detail=f"{field} cannot be negative.")
    return value


@router.get("/landing-hero")
def get_landing_hero(db: Database = Depends(get_db)):
    """Public telemetry for the landing page Hero section, fetched authentically
    from MongoDB across stores for the most recent / previous day."""
    return daily_dashboard_store.get_landing_hero_telemetry(db)


@router.get("/live")
def get_daily_live(
    store: str = Query(..., description="Single store code, e.g. NM"),
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    _guard(store, user)
    target_date = _parse_iso_date(date)
    kpis = daily_dashboard_store.compute_live_kpis(db, store, target_date)

    weather = daily_context.get_weather(target_date)
    holiday_name = daily_context.get_holiday_name(target_date)
    election_name = daily_context.get_election_info(target_date)
    is_weekend = target_date.weekday() >= 5
    target_adj = daily_dashboard_store.get_target_adjustment_alert(db, store, target_date)

    return {
        "store": store,
        "date": target_date.isoformat(),
        "day_name": target_date.strftime("%A"),
        "is_weekend": is_weekend,
        "day_type": daily_context.day_type(target_date),
        "holiday_name": holiday_name,
        "election_name": election_name,
        "weather": weather.__dict__ if weather else None,
        "kpis": {k: _clean(v) for k, v in kpis.items() if k not in ("reason", "overridden")},
        "overridden": kpis.get("overridden", []),
        "statuses": _daily_statuses(kpis),
        "target_adjustment": target_adj,
        "reason": kpis["reason"],
    }


def _daily_statuses(kpis: dict) -> dict:
    return {
        "atv": atv_status(kpis["atv"]),
        "rpv": rpv_status(kpis["rpv"]),
        "basket_size": basket_size_status(kpis["basket_size"]),
        "conversion_pct": conversion_status(kpis["conversion_pct"]),
        "achievement_pct": achievement_status(kpis["achievement_pct"]),
        "remaining_pct": remaining_status(kpis["remaining_pct"]),
    }


@router.get("/live/overall")
def get_daily_live_overall(
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
):
    """Blended live Daily KPIs across all three stores for one date, plus each
    store's own bundle. Admin-only (store managers see only their own store)."""
    target_date = _parse_iso_date(date)
    result = daily_dashboard_store.compute_live_kpis_all_stores(db, target_date)
    combined = result["combined"]
    target_adj = daily_dashboard_store.get_target_adjustment_alert(db, "ALL", target_date)
    return {
        "store": "ALL",
        "date": target_date.isoformat(),
        "kpis": {k: _clean(v) for k, v in combined.items() if k != "reason"},
        "statuses": _daily_statuses(combined),
        "target_adjustment": target_adj,
        "per_store": {
            code: {k: _clean(v) for k, v in bundle.items() if k not in ("reason", "overridden")}
            for code, bundle in result["per_store"].items()
        },
    }


@router.get("/target-adjustment")
def get_target_adjustment(
    store: str = Query(..., description="Single store code, e.g. NM, or ALL"),
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Cumulative target adjustment calculation based on previous day's target vs actual sales."""
    if store == "ALL":
        require_admin(user)
    else:
        _guard(store, user)
    target_date = _parse_iso_date(date)
    return daily_dashboard_store.get_target_adjustment_alert(db, store, target_date)



def _live_kpi_response(store: str, target_date: date, kpis: dict) -> dict:
    return {
        "store": store,
        "date": target_date.isoformat(),
        "kpis": {k: _clean(v) for k, v in kpis.items() if k not in ("reason", "overridden")},
        "overridden": kpis.get("overridden", []),
    }


@router.put("/kpi-override")
def put_kpi_override(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Store a manager's hand-entered value for one of the five overridable
    ratio KPIs (ATV / RPV / Basket Size / Conversion % / Achievement %),
    per store+date. Persisted in targets.overrides and overlaid on the
    computed figure everywhere compute_live_kpis is read (cards, gauges,
    reports, the midnight finalize snapshot)."""
    store = _guard(payload, user)
    date_str = str(payload.get("date", "")).strip()
    field = str(payload.get("field", "")).strip()
    if not store or not date_str or not field:
        raise HTTPException(status_code=400, detail="store, date, and field are required.")
    target_date = _parse_iso_date(date_str)
    value = _parse_nonneg_number(payload, "value")
    try:
        kpis = daily_dashboard_store.set_kpi_override(db, store, target_date, field, value)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    return _live_kpi_response(store, target_date, kpis)


@router.delete("/kpi-override")
def delete_kpi_override(
    store: str = Query(...),
    date: str = Query(..., description="YYYY-MM-DD"),
    field: str = Query(..., description="One of atv/rpv/basket_size/conversion_pct/achievement_pct"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    _guard(store, user)
    target_date = _parse_iso_date(date)
    try:
        kpis = daily_dashboard_store.clear_kpi_override(db, store, target_date, field)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    return _live_kpi_response(store, target_date, kpis)


@router.get("/bill-log")
def get_bill_log(
    store: str = Query(..., description="Single store code, e.g. NM"),
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    _guard(store, user)
    target_date = _parse_iso_date(date)
    entries = daily_dashboard_store.list_bill_entries(db, store, target_date)
    return {"store": store, "date": target_date.isoformat(), "entries": entries}


def _parse_bill_numbers(payload: dict) -> tuple[float, float]:
    try:
        net_amount = float(payload.get("net_amount"))
        bill_quantity = float(payload.get("bill_quantity"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="net_amount and bill_quantity must be numbers.")
    if net_amount < 0 or bill_quantity < 0:
        raise HTTPException(status_code=400, detail="net_amount and bill_quantity cannot be negative.")
    return net_amount, bill_quantity


@router.post("/bill-log")
def add_bill_log_entry(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    store = _guard(payload, user)
    date_str = str(payload.get("date", "")).strip()
    bill_time_str = str(payload.get("bill_time", "")).strip()
    if not store or not date_str or not bill_time_str:
        raise HTTPException(status_code=400, detail="store, date, and bill_time are required.")
    target_date = _parse_iso_date(date_str)
    bill_time = _parse_hhmm(bill_time_str, "bill_time")
    net_amount, bill_quantity = _parse_bill_numbers(payload)

    try:
        return daily_dashboard_store.add_bill_entry(db, store, target_date, bill_time, net_amount, bill_quantity)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.put("/bill-log")
def update_bill_log_entry(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    store = _guard(payload, user)
    try:
        row = int(payload.get("row"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="row must be an integer.")
    bill_time_str = str(payload.get("bill_time", "")).strip()
    if not store or not bill_time_str:
        raise HTTPException(status_code=400, detail="store and bill_time are required.")
    bill_time = _parse_hhmm(bill_time_str, "bill_time")
    net_amount, bill_quantity = _parse_bill_numbers(payload)

    entry = daily_dashboard_store.update_bill_entry(db, store, row, bill_time, net_amount, bill_quantity)
    if entry is None:
        raise HTTPException(status_code=404, detail="No bill entry found at that row.")
    return entry


@router.delete("/bill-log")
def delete_bill_log_entry(
    store: str = Query(...),
    row: int = Query(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    _guard(store, user)
    deleted = daily_dashboard_store.delete_bill_entry(db, store, row)
    if not deleted:
        raise HTTPException(status_code=404, detail="No bill entry found at that row.")
    return {"deleted": True}


@router.get("/footfall-log")
def get_footfall_log(
    store: str = Query(..., description="Single store code, e.g. NM"),
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    _guard(store, user)
    target_date = _parse_iso_date(date)
    entries = daily_dashboard_store.list_footfall_entries(db, store, target_date)
    return {"store": store, "date": target_date.isoformat(), "entries": entries}


@router.post("/footfall-log")
def add_footfall_log_entry(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    store = _guard(payload, user)
    date_str = str(payload.get("date", "")).strip()
    time_str = str(payload.get("time", "")).strip()
    if not store or not date_str or not time_str:
        raise HTTPException(status_code=400, detail="store, date, and time are required.")
    target_date = _parse_iso_date(date_str)
    entry_time = _parse_hhmm(time_str)
    footfall = _parse_nonneg_number(payload, "footfall")

    try:
        return daily_dashboard_store.add_footfall_entry(db, store, target_date, entry_time, footfall)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.put("/footfall-log")
def update_footfall_log_entry(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    store = _guard(payload, user)
    try:
        row = int(payload.get("row"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="row must be an integer.")
    time_str = str(payload.get("time", "")).strip()
    if not store or not time_str:
        raise HTTPException(status_code=400, detail="store and time are required.")
    entry_time = _parse_hhmm(time_str)
    footfall = _parse_nonneg_number(payload, "footfall")

    entry = daily_dashboard_store.update_footfall_entry(db, store, row, entry_time, footfall)
    if entry is None:
        raise HTTPException(status_code=404, detail="No footfall entry found at that row.")
    return entry


@router.delete("/footfall-log")
def delete_footfall_log_entry(
    store: str = Query(...),
    row: int = Query(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    _guard(store, user)
    deleted = daily_dashboard_store.delete_footfall_entry(db, store, row)
    if not deleted:
        raise HTTPException(status_code=404, detail="No footfall entry found at that row.")
    return {"deleted": True}


@router.get("/nob-log")
def get_nob_log(
    store: str = Query(..., description="Single store code, e.g. NM"),
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    _guard(store, user)
    target_date = _parse_iso_date(date)
    entries = daily_dashboard_store.list_nob_entries(db, store, target_date)
    return {"store": store, "date": target_date.isoformat(), "entries": entries}


@router.post("/nob-log")
def add_nob_log_entry(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    store = _guard(payload, user)
    date_str = str(payload.get("date", "")).strip()
    time_str = str(payload.get("time", "")).strip()
    if not store or not date_str or not time_str:
        raise HTTPException(status_code=400, detail="store, date, and time are required.")
    target_date = _parse_iso_date(date_str)
    entry_time = _parse_hhmm(time_str)
    nob = _parse_nonneg_number(payload, "nob")

    try:
        return daily_dashboard_store.add_nob_entry(db, store, target_date, entry_time, nob)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.put("/nob-log")
def update_nob_log_entry(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    store = _guard(payload, user)
    try:
        row = int(payload.get("row"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="row must be an integer.")
    time_str = str(payload.get("time", "")).strip()
    if not store or not time_str:
        raise HTTPException(status_code=400, detail="store and time are required.")
    entry_time = _parse_hhmm(time_str)
    nob = _parse_nonneg_number(payload, "nob")

    entry = daily_dashboard_store.update_nob_entry(db, store, row, entry_time, nob)
    if entry is None:
        raise HTTPException(status_code=404, detail="No NOB entry found at that row.")
    return entry


@router.delete("/nob-log")
def delete_nob_log_entry(
    store: str = Query(...),
    row: int = Query(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    _guard(store, user)
    deleted = daily_dashboard_store.delete_nob_entry(db, store, row)
    if not deleted:
        raise HTTPException(status_code=404, detail="No NOB entry found at that row.")
    return {"deleted": True}


@router.post("/save-entry")
def save_daily_entry(
    payload: dict = Body(...),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Manual Daily Entry's Update/Final Submission action -- both buttons
    call this. reason is optional (None if omitted from the payload): a
    click that's only logging a bill/footfall/NOB entry still safely
    refreshes NET SALES/FOOTFALL/NOB/ATV/etc. against the latest logs
    without needing Remarks filled in, and omitting reason simply keeps
    whatever was last saved. Net Sales, Bill Quantity, Footfall, and NOB
    are never accepted here -- they're always save_target_entry's own live
    sums across today's bill/footfall/NOB logs."""
    store = _guard(payload, user)
    date_str = str(payload.get("date", "")).strip()
    if not store or not date_str:
        raise HTTPException(status_code=400, detail="store and date are required.")
    target_date = _parse_iso_date(date_str)

    reason = payload.get("reason")
    reason = str(reason).strip() if reason not in (None, "") else None

    try:
        result = daily_dashboard_store.save_target_entry(db, store, target_date, reason)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {"store": store, "date": target_date.isoformat(), **{k: _clean(v) for k, v in result.items()}}


@router.get("/report")
def get_daily_report(
    store: str = Query(..., description="Single store code, e.g. NM"),
    format: str = Query("xlsx", description="xlsx or pdf"),
    start: str | None = Query(None, description="Inclusive first date (YYYY-MM-DD); omit for every recorded date"),
    end: str | None = Query(None, description="Inclusive last date (YYYY-MM-DD); omit for every recorded date"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Per-store Daily Operations export. Covers every recorded date by
    default, or the inclusive `start`..`end` window when either is supplied
    (`start == end` is the single-day export). xlsx = the two data tables
    only (no charts); pdf = overall-summary KPI header + gauges + the sales
    performance chart + the context block + the same two tables, the visual
    half pinned to the window's last day (today when unscoped). See
    src/daily_report.py."""
    _guard(store, user)
    if format not in _REPORT_FORMATS:
        raise HTTPException(status_code=400, detail=f"format must be one of {sorted(_REPORT_FORMATS)}.")
    start_date = _parse_iso_date(start) if start else None
    end_date = _parse_iso_date(end) if end else None
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(status_code=400, detail="start date must not be after end date.")

    try:
        payload = build_daily_report_payload(
            db, store, include_visuals=(format == "pdf"), start=start_date, end=end_date
        )
        content = RENDERERS[format].render(payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as error:
        if format == "pdf":
            try:
                fallback_payload = build_daily_report_payload(
                    db, store, include_visuals=False, start=start_date, end=end_date
                )
                content = RENDERERS["pdf"].render(fallback_payload)
            except Exception:
                raise HTTPException(status_code=500, detail=f"Failed to generate PDF report: {error}")
        else:
            raise HTTPException(status_code=500, detail=str(error))

    safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in payload.meta.title).strip() or "daily-report"
    filename = f"{safe_title}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.{RENDERERS[format].extension}"
    return Response(
        content=content,
        media_type=RENDERERS[format].content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/history/dates")
def get_history_dates(
    store: str = Query("ALL", description="Store code e.g. NM, HB, CHW, or ALL"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """List all available historical dates for a store (or ALL stores for admin),
    sorted descending with summary stats."""
    if store == "ALL":
        require_admin(user)
    else:
        _guard(store, user)
    return daily_dashboard_store.list_all_history_dates(db, store)


@router.get("/history/details")
def get_history_details(
    store: str = Query(..., description="Store code e.g. NM, HB, CHW, or ALL"),
    date: str = Query(..., description="YYYY-MM-DD"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Detailed time-slot wise logs (footfall, billing details, sales/NOB) for
    a specific date and store."""
    if store == "ALL":
        require_admin(user)
    else:
        _guard(store, user)
    target_date = _parse_iso_date(date)
    return daily_dashboard_store.get_history_details(db, store, target_date)


@router.get("/history/range")
def get_history_range(
    store: str = Query("ALL", description="Store code e.g. NM, HB, CHW, or ALL"),
    start_date: str = Query(..., description="YYYY-MM-DD"),
    end_date: str = Query(..., description="YYYY-MM-DD"),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Detailed multi-day metrics, daily trends, aggregated time slots, and logs
    across a date range."""
    if store == "ALL":
        require_admin(user)
    else:
        _guard(store, user)
    start_d = _parse_iso_date(start_date)
    end_d = _parse_iso_date(end_date)
    return daily_dashboard_store.get_history_range_details(db, store, start_d, end_d)

