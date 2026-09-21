"""Chart endpoints for Daily Operations -- the six live KPI gauges plus the
two time-slot charts on the Daily Dashboard.

The ~25 DATASET.xlsx-driven chart_ids this dispatcher used to also serve
(sales_overview, sales_trend, top_products, category_drilldown, ...) live in
the Analytics & Forecasting sub-project. That also removes the reason the old
version had to open its MongoDB session inside individual branches rather than
at the route: every chart_id here needs the database, so `Depends(get_db)` is
now a plain route-level dependency.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user, require_store_access
from api.deps import DailyChartState, parse_daily_chart_state
from db.session import get_db
from src import charts, daily_dashboard_store

router = APIRouter(prefix="/api/charts", tags=["charts"])

# Every gauge parks its needle at 0 rather than rendering GlossyGauge's "N/A"
# placeholder when a value is missing -- on this live manual-entry surface a
# blank means "hasn't happened yet today" (e.g. Achievement % before an admin
# sets the day's Sales Target), not "the source column doesn't exist". This
# matches the KPI cards above them, which use format.ts's *OrZero formatters.
_GAUGE_BUILDERS = {
    "daily_conversion_gauge": (charts.conversion_gauge, "conversion_pct"),
    "daily_achievement_gauge": (charts.achievement_gauge, "achievement_pct"),
    "daily_remaining_gauge": (charts.remaining_pct_gauge, "remaining_pct"),
    "daily_atv_gauge": (charts.atv_gauge, "atv"),
    "daily_rpv_gauge": (charts.rpv_gauge, "rpv"),
    "daily_basket_size_gauge": (charts.basket_size_gauge, "basket_size"),
}

_TIMESLOT_CHART_IDS = {"daily_timeslot_breakdown", "daily_footfall_nob"}


@router.get("/{chart_id}")
def get_chart(
    chart_id: str,
    db: Database = Depends(get_db),
    state: DailyChartState = Depends(parse_daily_chart_state),
    user: CurrentUser = Depends(get_current_user),
    theme: str | None = Query(None, description="Render hint: 'neon' recolours the figure; anything else is unchanged"),
):
    return charts.apply_theme(_dispatch_chart(chart_id, db, state, user), theme)


def _dispatch_chart(chart_id: str, db: Database, state: DailyChartState, user: CurrentUser) -> dict:
    if chart_id in _GAUGE_BUILDERS:
        builder, kpi_key = _GAUGE_BUILDERS[chart_id]
        return builder(_gauge_kpis(db, state, user)[kpi_key], zero_if_missing=True)

    if chart_id in _TIMESLOT_CHART_IDS:
        if not state.stores or state.start_date is None:
            raise HTTPException(status_code=400, detail="A single store and date are required for the daily time-slot charts.")
        end_date = state.end_date or state.start_date

        if len(state.stores) > 1 or (len(state.stores) == 1 and state.stores[0] == "ALL"):
            if not user.is_admin:
                raise HTTPException(status_code=403, detail="Administrator access required for multi-store charts.")
            breakdown = daily_dashboard_store.compute_live_timeslot_breakdown(db, "ALL", state.start_date, end_date)
            targets = [daily_dashboard_store.read_store_target(db, s, state.start_date, end_date) for s in daily_dashboard_store.STORE_CODE_TO_NAME]
            day_target = sum(t for t in targets if t is not None) if any(t is not None for t in targets) else None
        else:
            require_store_access(state.stores[0], user)
            breakdown = daily_dashboard_store.compute_live_timeslot_breakdown(db, state.stores[0], state.start_date, end_date)
            day_target = daily_dashboard_store.read_store_target(db, state.stores[0], state.start_date, end_date)

        if chart_id == "daily_footfall_nob":
            return charts.daily_footfall_vs_nob_chart(breakdown)
        return charts.daily_timeslot_breakdown_chart(breakdown, day_target)

    raise HTTPException(status_code=404, detail=f"Unknown chart_id: {chart_id}")


def _gauge_kpis(db: Database, state: DailyChartState, user: CurrentUser) -> dict:
    if not state.stores or state.start_date is None:
        raise HTTPException(status_code=400, detail="A single store and date are required for daily gauges.")
    if len(state.stores) > 1:
        # The admin's "Overall Stores Summary" passes every store -- blend
        # them (raw totals summed, ratios recomputed). state.stores is already
        # clamped to the caller's allowed set in parse_daily_chart_state, so a
        # manager can never reach this branch, but check explicitly.
        if not user.is_admin:
            raise HTTPException(status_code=403, detail="Administrator access required.")
        return daily_dashboard_store.compute_live_kpis_all_stores(db, state.start_date)["combined"]
    # Belt-and-braces authz check for the single store this resolves against.
    require_store_access(state.stores[0], user)
    return daily_dashboard_store.compute_live_kpis(db, state.stores[0], state.start_date)
