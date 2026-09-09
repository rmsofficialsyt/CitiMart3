"""Admin-only runtime editing of the red/yellow/green KPI status thresholds
(ATV / RPV / Conversion % / Achievement % / Basket Size). Backed by a small
git-ignored JSON overlay on config/kpi_thresholds.py's `_DEFAULTS` -- see that
module's docstring for why a file and not MongoDB.

All three verbs return the same `{defaults, overrides, effective}` shape.
"""
from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException, Query

from config.kpi_thresholds import (
    ThresholdValidationError,
    effective_thresholds,
    reset_overrides,
    set_overrides,
)

router = APIRouter(prefix="/api/kpi-thresholds", tags=["kpi-thresholds"])


@router.get("")
def get_kpi_thresholds() -> dict:
    return effective_thresholds()


@router.put("")
def put_kpi_thresholds(patch: dict = Body(...)) -> dict:
    """Partial body: `{"atv": {"red_below": 850, "green_at_or_above": 1150}, ...}`.
    Only the KPIs/keys present are changed; the rest keep their current value."""
    try:
        return set_overrides(patch)
    except ThresholdValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.delete("")
def delete_kpi_thresholds(kpi: str | None = Query(None)) -> dict:
    """Reset one KPI's override (`?kpi=atv`) or every override (no query)."""
    try:
        return reset_overrides(kpi)
    except ThresholdValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
