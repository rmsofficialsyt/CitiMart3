"""Shared FastAPI dependencies for Daily Operations.

The Analytics & Forecasting sub-project's version of this module is where
`get_dataset` and the full 8-level `parse_filter_state` live -- both exist
only to serve DATASET.xlsx, which this half of the project never opens. What
remains here is the one scoping concern Daily Operations genuinely has: a
store list clamped to what the caller is allowed to see, plus the single
date a live gauge is rendered for.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime

from fastapi import Depends, HTTPException, Query

from api.auth import CurrentUser, get_current_user
from config.settings import STORE_CODE_TO_NAME


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be YYYY-MM-DD.")


def _parse_csv(value: str | None) -> list[str] | None:
    if not value:
        return None
    items = [v.strip() for v in value.split(",") if v.strip()]
    return items or None


def _clamp_stores(requested: list[str] | None, allowed: list[str]) -> list[str]:
    """Turn a client-supplied store list into a server-enforced one: default to
    everything the caller may see, then drop anything outside that set. Empty
    result -> 403 (the caller asked only for stores they can't access)."""
    chosen = requested or list(allowed)
    scoped = [s for s in chosen if s in allowed]
    if not scoped:
        raise HTTPException(status_code=403, detail="No accessible stores in that selection.")
    return scoped


@dataclass
class DailyChartState:
    """Scope for a /api/charts/* request: which stores, and which single day.

    A list rather than a single code because the admin's "Overall Stores
    Summary" renders the same gauges blended across all three stores;
    api/routes_charts.py re-checks `user.is_admin` before taking that
    branch. `stores` is always already clamped to the caller's allowed set
    by the time it gets here."""

    stores: list[str] = field(default_factory=list)
    start_date: date | None = None
    end_date: date | None = None


def parse_daily_chart_state(
    user: CurrentUser = Depends(get_current_user),
    stores: str | None = Query(None, description="Comma-separated store codes, e.g. NM,HB"),
    start: str | None = Query(None, description="YYYY-MM-DD -- the day to render"),
    end: str | None = Query(None, description="YYYY-MM-DD; accepted for symmetry, unused by the daily charts"),
) -> DailyChartState:
    # Unlike the historical dashboard, there is no dataset to read the set of
    # active stores from -- config/settings.py's store table IS the universe
    # here, and every write is validated against the same table.
    allowed = user.allowed_stores(list(STORE_CODE_TO_NAME))
    return DailyChartState(
        stores=_clamp_stores(_parse_csv(stores), allowed),
        start_date=_parse_date(start),
        end_date=_parse_date(end),
    )
