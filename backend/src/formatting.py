"""Shared display formatting: currency, percentage, and number rendering.
Centralised so every KPI card, chart, and table formats numbers identically.
"""
from __future__ import annotations

from config.settings import CURRENCY_SYMBOL

NA_LABEL = "N/A — required source field not available"


def format_currency(value: float | None) -> str:
    if value is None or (isinstance(value, float) and value != value):  # NaN check
        return NA_LABEL
    return f"{CURRENCY_SYMBOL}{value:,.2f}"


def format_number(value: float | None, decimals: int = 0) -> str:
    if value is None or (isinstance(value, float) and value != value):
        return NA_LABEL
    return f"{value:,.{decimals}f}"


def format_percent(value: float | None, decimals: int = 1) -> str:
    if value is None or (isinstance(value, float) and value != value):
        return NA_LABEL
    return f"{value:,.{decimals}f}%"


# KPI *card* variants: per the Historical Analytics Overhaul decision, a missing
# value on a KPI card renders 0 rather than N/A (matching the Daily dashboards).
# The plain format_* functions above keep the N/A convention and stay in use for
# tables/charts until that overhaul's table-level rules are specced.
def format_currency_or_zero(value: float | None) -> str:
    return format_currency(0.0 if value is None or value != value else value)


def format_number_or_zero(value: float | None, decimals: int = 0) -> str:
    return format_number(0.0 if value is None or value != value else value, decimals)


def format_percent_or_zero(value: float | None, decimals: int = 1) -> str:
    return format_percent(0.0 if value is None or value != value else value, decimals)
