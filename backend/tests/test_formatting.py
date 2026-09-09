"""Covers the display formatters in src/formatting.py, in particular the
`*_or_zero` KPI-card variants added for the Historical Analytics Overhaul
(missing value on a KPI card renders 0, not N/A)."""
import math

from src import formatting


def test_plain_formatters_keep_na_on_missing():
    assert formatting.format_currency(None) == formatting.NA_LABEL
    assert formatting.format_number(None) == formatting.NA_LABEL
    assert formatting.format_percent(None) == formatting.NA_LABEL
    assert formatting.format_currency(math.nan) == formatting.NA_LABEL


def test_or_zero_formatters_render_zero_on_missing():
    assert formatting.format_currency_or_zero(None) == formatting.format_currency(0.0)
    assert formatting.format_number_or_zero(None) == formatting.format_number(0.0)
    assert formatting.format_percent_or_zero(None) == formatting.format_percent(0.0)
    assert formatting.format_currency_or_zero(math.nan) == formatting.format_currency(0.0)


def test_or_zero_formatters_passthrough_real_values():
    assert formatting.format_currency_or_zero(1234.5) == formatting.format_currency(1234.5)
    assert formatting.format_number_or_zero(12, decimals=2) == formatting.format_number(12, decimals=2)
    assert formatting.format_percent_or_zero(87.6) == formatting.format_percent(87.6)
