"""Shared KPI arithmetic for Daily Operations.

The full historical KPI engine (compute_kpis / KpiBundle / _col_sum, which
aggregate DATASET.xlsx's fact / footfall / target frames) lives in the
*Analytics & Forecasting* sub-project, not here -- this module deliberately
carries no pandas aggregation at all, because Daily Operations reads every
number from MongoDB, never from a workbook.

What survives is `safe_divide`, the one piece both halves genuinely share: the
"don't fabricate" rule for a ratio. src/daily_dashboard_store.py's
compute_live_kpis builds ATV / RPV / Basket Size / Conversion % / Achievement %
on top of it, and it must keep returning None (never 0) for an unavailable or
zero denominator -- the display layer decides whether that renders as "N/A" or
"0", the arithmetic never guesses.
"""
from __future__ import annotations

import math


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None:
        return None
    if denominator == 0:
        return None
    for val in (numerator, denominator):
        try:
            if math.isnan(val):
                return None
        except (TypeError, ValueError):
            pass
    return numerator / denominator
