"""Per-store Daily Operations report -- builds a Phase C ReportPayload
(src/reports/models.py) straight from the live MongoDB daily logs for one
store, covering *all* recorded dates by default or a caller-supplied
``start``/``end`` date window (the UI's "Single day" / "Date range" export
scopes -- both bounds inclusive, either one omittable for an open-ended
window).

This is a standalone export path, separate from Historical Analytics'
frontend-assembled ReportBuilder flow: the block list is built here on the
backend and handed straight to the same renderers (src/reports/dispatch.py).
Two shapes:

  * xlsx (``include_visuals=False``) -- the two data tables only, no charts:
    the xlsx renderer emits a Summary sheet + one sheet per TableBlock.
  * pdf  (``include_visuals=True``)  -- an overall-summary KPI grid, the three
    gauges (Conversion % / Achievement % / Remaining %), the Today's Sales
    Performance chart, a Today's Context line (weather / holiday / election),
    then the same two tables.

Every figure comes from src/daily_dashboard_store.compute_live_kpis /
compute_live_timeslot_breakdown, so a manager's KPI overrides
(targets.overrides) flow through unchanged. There is no workbook in this
sub-project at all, so nothing here can be re-derived from historical data --
the PDF's context block carries weather / day type / holiday / election only,
and the "Previous year same day" line it used to end with now lives with the
workbook, in the Analytics & Forecasting sub-project.
"""
from __future__ import annotations

from datetime import date, datetime

from pymongo.database import Database

from config.settings import CURRENCY_SYMBOL, STORE_CODE_TO_NAME, TIME_SLOT_ORDER
from db.models import BILLS, FOOTFALL, NOB, TARGETS
from src import charts, daily_context, daily_dashboard_store
from src.kpi_engine import safe_divide
from src.reports.models import (
    ChartBlock,
    GaugeBlock,
    KpiGridBlock,
    KpiItem,
    ReportMeta,
    ReportPayload,
    TableBlock,
    TextBlock,
    TitleBlock,
)

_TIMESLOT_COLUMNS = [
    "Date", "Time Slot", "Net Sales", "Remaining", "Bill Quantity", "Footfall",
    "Transactions (NOB)", "ATV", "RPV", "Basket Size", "Conversion %",
    "Achievement %", "Remaining %",
]
_DATEWISE_COLUMNS = [
    "Date", "Sales Target", "Net Sales", "Remaining", "Bill Quantity", "Footfall",
    "Transactions (NOB)", "ATV", "RPV", "Basket Size", "Conversion %",
    "Achievement %", "Remaining %", "Remarks",
]


def _round(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(float(value), digits)


def _pct(numerator: float | None, denominator: float | None) -> float | None:
    ratio = safe_divide(numerator, denominator)
    return None if ratio is None else ratio * 100


def report_dates(
    db: Database, store: str, start: date | None = None, end: date | None = None
) -> list[str]:
    """Every ISO date this store has any bill / footfall / NOB / target row
    for, sorted, narrowed to the inclusive [start, end] window when either
    bound is given. The window is applied on the ISO strings, which sort
    identically to the dates they encode."""
    lower = None if start is None else start.isoformat()
    upper = None if end is None else end.isoformat()
    seen: set[str] = set()
    for collection in (BILLS, FOOTFALL, NOB, TARGETS):
        for doc in db[collection].find({"store_code": store}):
            iso = doc.get("entry_date")
            if not iso:
                continue
            if (lower is None or iso >= lower) and (upper is None or iso <= upper):
                seen.add(iso)
    return sorted(seen)


def scope_label(start: date | None, end: date | None) -> str | None:
    """Human-readable name for the export's date window, or None for the
    default "every recorded date" export."""
    if start is None and end is None:
        return None
    if start is not None and end is not None:
        return start.isoformat() if start == end else f"{start.isoformat()} to {end.isoformat()}"
    if start is not None:
        return f"from {start.isoformat()}"
    return f"up to {end.isoformat()}"  # type: ignore[union-attr]


def build_timeslot_rows(db: Database, store: str, dates: list[str]) -> list[dict]:
    rows: list[dict] = []
    for iso in dates:
        d = date.fromisoformat(iso)
        breakdown = daily_dashboard_store.compute_live_timeslot_breakdown(db, store, d)
        target = daily_dashboard_store.read_store_target(db, store, d)
        for slot in TIME_SLOT_ORDER:
            cell = breakdown[slot]
            net_sales = cell["net_sales"]
            bill_quantity = cell["bill_quantity"]
            footfall = cell["footfall"]
            nob = cell["nob"]
            if not any((net_sales, bill_quantity, footfall, nob)):
                continue
            achievement_pct = _pct(net_sales, target)
            rows.append({
                "Date": iso,
                "Time Slot": slot,
                "Net Sales": _round(net_sales),
                "Remaining": _round(target - net_sales) if target is not None else None,
                "Bill Quantity": _round(bill_quantity),
                "Footfall": _round(footfall),
                "Transactions (NOB)": _round(nob),
                "ATV": _round(safe_divide(net_sales, nob)),
                "RPV": _round(safe_divide(net_sales, footfall)),
                "Basket Size": _round(safe_divide(bill_quantity, nob)),
                "Conversion %": _round(_pct(nob, footfall), 1),
                "Achievement %": _round(achievement_pct, 1),
                "Remaining %": _round(None if achievement_pct is None else 100 - achievement_pct, 1),
            })
    return rows


def build_datewise_rows(db: Database, store: str, dates: list[str]) -> list[dict]:
    rows: list[dict] = []
    for iso in dates:
        k = daily_dashboard_store.compute_live_kpis(db, store, date.fromisoformat(iso))
        rows.append({
            "Date": iso,
            "Sales Target": _round(k["sales_target"]),
            "Net Sales": _round(k["net_sales"]),
            "Remaining": _round(k["remaining"]),
            "Bill Quantity": _round(k["bill_quantity"]),
            "Footfall": _round(k["footfall"]),
            "Transactions (NOB)": _round(k["nob"]),
            "ATV": _round(k["atv"]),
            "RPV": _round(k["rpv"]),
            "Basket Size": _round(k["basket_size"]),
            "Conversion %": _round(k["conversion_pct"], 1),
            "Achievement %": _round(k["achievement_pct"], 1),
            "Remaining %": _round(k["remaining_pct"], 1),
            "Remarks": k["reason"] or "",
        })
    return rows


def _fmt_currency(value: float | None) -> str:
    return "N/A" if value is None else f"{CURRENCY_SYMBOL}{value:,.0f}"


def _fmt_number(value: float | None) -> str:
    return "N/A" if value is None else f"{value:,.0f}"


def _fmt_pct(value: float | None) -> str:
    return "N/A" if value is None else f"{value:.1f}%"


def build_overall_summary(db: Database, store: str, dates: list[str]) -> list[KpiItem]:
    bundles = [daily_dashboard_store.compute_live_kpis(db, store, date.fromisoformat(iso)) for iso in dates]
    total_net = sum(b["net_sales"] or 0.0 for b in bundles)
    total_qty = sum(b["bill_quantity"] or 0.0 for b in bundles)
    total_footfall = sum(b["footfall"] or 0.0 for b in bundles)
    total_nob = sum(b["nob"] or 0.0 for b in bundles)
    targets = [b["sales_target"] for b in bundles if b["sales_target"] is not None]
    total_target = sum(targets) if targets else None
    achievement_pct = _pct(total_net, total_target)
    return [
        KpiItem(label="Days Recorded", value=str(len(dates))),
        KpiItem(label="Date Range", value=f"{dates[0]} to {dates[-1]}" if dates else "N/A"),
        KpiItem(label="Total Sales Target", value=_fmt_currency(total_target)),
        KpiItem(label="Total Net Sales", value=_fmt_currency(total_net)),
        KpiItem(label="Overall Achievement %", value=_fmt_pct(achievement_pct)),
        KpiItem(label="Total Bill Quantity", value=_fmt_number(total_qty)),
        KpiItem(label="Total Footfall", value=_fmt_number(total_footfall)),
        KpiItem(label="Total Transactions (NOB)", value=_fmt_number(total_nob)),
        KpiItem(label="Blended ATV", value=_fmt_currency(safe_divide(total_net, total_nob))),
        KpiItem(label="Blended RPV", value=_fmt_currency(safe_divide(total_net, total_footfall))),
        KpiItem(label="Blended Basket Size", value=_fmt_number(safe_divide(total_qty, total_nob))),
        KpiItem(label="Blended Conversion %", value=_fmt_pct(_pct(total_nob, total_footfall))),
    ]


def _context_text(target_date: date) -> str:
    weather = daily_context.get_weather(target_date)
    if weather is not None:
        bits = [weather.condition]
        if weather.temp_max_c is not None:
            bits.append(f"{weather.temp_max_c:.0f}°C / {(weather.temp_min_c or weather.temp_max_c):.0f}°C")
        if weather.precipitation_mm:
            bits.append(f"{weather.precipitation_mm:.0f}mm rain")
        weather_line = ", ".join(bits)
    else:
        weather_line = "unavailable"
    holiday = daily_context.get_holiday_name(target_date)
    election = daily_context.get_election_info(target_date)
    lines = [
        f"<b>Weather (Kolkata):</b> {weather_line}",
        f"<b>Day type:</b> {daily_context.day_type(target_date)}",
        f"<b>Holiday:</b> {holiday or 'none'}",
        f"<b>Election:</b> {election or 'none'}",
    ]
    return "<br/>".join(lines)


def build_daily_report_payload(
    db: Database,
    store: str,
    *,
    include_visuals: bool,
    start: date | None = None,
    end: date | None = None,
) -> ReportPayload:
    if store not in STORE_CODE_TO_NAME:
        raise ValueError(f"Unknown store code: {store!r}")
    if start is not None and end is not None and start > end:
        raise ValueError("start date must not be after end date.")
    store_name = STORE_CODE_TO_NAME[store]
    dates = report_dates(db, store, start, end)
    scope = scope_label(start, end)

    title = f"{store_name} — Daily Operations Report"
    if scope is not None:
        title = f"{title} ({scope})"
    blocks: list = [TitleBlock(text=title)]

    if include_visuals:
        # The visual half is a single day's snapshot. Unscoped that day is
        # today (the live dashboard's own view); a date-scoped export pins it
        # to the window's last day instead, so a report for a past date shows
        # that date's gauges/chart/context rather than today's.
        focus = end or start or date.today()
        chart_title = "Today's Sales Performance" if scope is None else f"Sales Performance — {focus.isoformat()}"
        context_heading = "Today's Context" if scope is None else f"Context — {focus.isoformat()}"
        today_kpis = daily_dashboard_store.compute_live_kpis(db, store, focus)
        today_breakdown = daily_dashboard_store.compute_live_timeslot_breakdown(db, store, focus)
        summary_heading = f"Overall Summary ({'All Recorded Days' if scope is None else scope})"
        blocks.append(KpiGridBlock(heading=summary_heading, items=build_overall_summary(db, store, dates)))
        # zero_if_missing=True to match the live Daily Dashboard's gauges and
        # its *OrZero KPI cards -- a blank on this manual-entry surface means
        # "not logged yet today", not "column absent".
        blocks.append(GaugeBlock(spec=charts.conversion_gauge(today_kpis["conversion_pct"], zero_if_missing=True)))
        blocks.append(GaugeBlock(spec=charts.achievement_gauge(today_kpis["achievement_pct"], zero_if_missing=True)))
        blocks.append(GaugeBlock(spec=charts.remaining_pct_gauge(today_kpis["remaining_pct"], zero_if_missing=True)))
        blocks.append(GaugeBlock(spec=charts.atv_gauge(today_kpis["atv"], zero_if_missing=True)))
        blocks.append(GaugeBlock(spec=charts.rpv_gauge(today_kpis["rpv"], zero_if_missing=True)))
        blocks.append(GaugeBlock(spec=charts.basket_size_gauge(today_kpis["basket_size"], zero_if_missing=True)))
        blocks.append(ChartBlock(
            title=chart_title,
            figure=charts.daily_timeslot_breakdown_chart(today_breakdown, today_kpis["sales_target"]),
        ))
        blocks.append(TextBlock(
            heading=context_heading,
            text=_context_text(focus),
        ))

    blocks.append(TableBlock(title="Date & Time Slot Wise", columns=_TIMESLOT_COLUMNS, rows=build_timeslot_rows(db, store, dates)))
    blocks.append(TableBlock(title="Date Wise Store Summary", columns=_DATEWISE_COLUMNS, rows=build_datewise_rows(db, store, dates)))

    span = f"{dates[0]} to {dates[-1]}" if dates else "no recorded dates"
    scope_text = "All recorded dates" if scope is None else f"Dates: {scope}"
    meta = ReportMeta(
        title=title,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        filters_summary_text=f"Store: {store_name} | {scope_text} | Recorded: {span}",
        workbook_note="Figures are live Daily Operations data (MongoDB), not DATASET.xlsx.",
    )
    return ReportPayload(meta=meta, blocks=blocks)
