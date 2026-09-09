"""Single source of truth for performance-status thresholds (master prompt Section 12).
Reused by KPI cards, gauges, charts, tables and scorecards — never redefine these
elsewhere.

The factory numbers live in ``_DEFAULTS``. An admin can override the
red/yellow/green band for ATV / RPV / Conversion % / Achievement % / Basket Size
at runtime via ``PUT /api/kpi-thresholds`` (``api/routes_kpi_thresholds.py``);
the override is persisted as a small git-ignored JSON file
(``config/kpi_thresholds.local.json``) and overlaid onto the defaults by
``get_thresholds`` / the ``*_status`` functions / ``src/charts.py``'s gauges.

*Why a file, not MongoDB:* MongoDB in this app is only the Daily Operations
live-log store — ``api/deps.py`` and the historical/pandas surface (both
Streamlit apps included) deliberately stay DB-free. Thresholds are tiny
(5 KPIs × 2 numbers), single-writer, admin-only, rarely changed.

The back-compat constants ``ATV_THRESHOLDS`` … still resolve to the *defaults*
(the Streamlit apps import them directly and only pick up an override on a
fresh process start). The FastAPI/React path always goes through
``get_thresholds`` / the ``*_status`` functions / the gauges, so it reflects an
override immediately (mtime-invalidated cache, no restart).
"""
from __future__ import annotations

import contextlib
import json
import os
import tempfile

from config.settings import PROJECT_ROOT

STATUS_RED = "red"
STATUS_YELLOW = "yellow"
STATUS_GREEN = "green"

# Immutable factory defaults — never mutate these dicts in place.
_DEFAULTS: dict[str, dict[str, float]] = {
    "atv": {"red_below": 900, "green_at_or_above": 1100},
    "rpv": {"red_below": 500, "green_at_or_above": 700},
    "conversion": {"red_below": 45.0, "green_at_or_above": 55.0},
    "achievement": {"red_below": 80.0, "green_above": 100.0},
    "basket_size": {"red_below": 2.0, "green_at_or_above": 5.0},
}

# Back-compat aliases (defaults only — see module docstring).
ATV_THRESHOLDS = _DEFAULTS["atv"]
RPV_THRESHOLDS = _DEFAULTS["rpv"]
CONVERSION_THRESHOLDS = _DEFAULTS["conversion"]
ACHIEVEMENT_THRESHOLDS = _DEFAULTS["achievement"]
BASKET_SIZE_THRESHOLDS = _DEFAULTS["basket_size"]

# The (low, high) band keys per KPI — drives validation + the not-inverted check.
# Achievement % uses ``green_above`` (strict ">") not ``green_at_or_above``: an
# explicit business spec ("Yellow: 80%–100%, Green: >100%"), not an inconsistency.
_BAND_KEYS: dict[str, tuple[str, str]] = {
    "atv": ("red_below", "green_at_or_above"),
    "rpv": ("red_below", "green_at_or_above"),
    "conversion": ("red_below", "green_at_or_above"),
    "basket_size": ("red_below", "green_at_or_above"),
    "achievement": ("red_below", "green_above"),
}

_OVERRIDES_PATH = PROJECT_ROOT / "config" / "kpi_thresholds.local.json"

_overrides_cache: dict | None = None
_overrides_mtime: float | None = None


class ThresholdValidationError(ValueError):
    """A bad PUT body — inverted band, negative / non-numeric value, or an
    unknown KPI / threshold key. Surfaced as a 422 by the route."""


def _read_overrides_file() -> dict:
    try:
        raw = json.loads(_OVERRIDES_PATH.read_text("utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError, ValueError):
        return {}
    if not isinstance(raw, dict):
        return {}
    clean: dict[str, dict[str, float]] = {}
    for kpi, patch in raw.items():
        if kpi in _DEFAULTS and isinstance(patch, dict):
            band = {
                key: float(value)
                for key, value in patch.items()
                if key in _BAND_KEYS[kpi] and isinstance(value, (int, float)) and not isinstance(value, bool)
            }
            if band:
                clean[kpi] = band
    return clean


def _overrides() -> dict:
    global _overrides_cache, _overrides_mtime
    try:
        mtime = _OVERRIDES_PATH.stat().st_mtime
    except OSError:
        mtime = None
    if _overrides_cache is None or mtime != _overrides_mtime:
        _overrides_cache = _read_overrides_file()
        _overrides_mtime = mtime
    return _overrides_cache


def get_thresholds(kpi: str) -> dict:
    """Effective band for ``kpi`` — the default with any admin override applied."""
    if kpi not in _DEFAULTS:
        raise KeyError(f"Unknown KPI {kpi!r}")
    return {**_DEFAULTS[kpi], **_overrides().get(kpi, {})}


def effective_thresholds() -> dict:
    """The ``{defaults, overrides, effective}`` shape the GET/PUT/DELETE
    endpoints return."""
    return {
        "defaults": {kpi: dict(band) for kpi, band in _DEFAULTS.items()},
        "overrides": {kpi: dict(band) for kpi, band in _overrides().items()},
        "effective": {kpi: get_thresholds(kpi) for kpi in _DEFAULTS},
    }


def _write_overrides(data: dict) -> None:
    global _overrides_cache, _overrides_mtime
    payload = {kpi: band for kpi, band in data.items() if band}
    _OVERRIDES_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=_OVERRIDES_PATH.parent, prefix=".kpi_thresholds.", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
        os.replace(tmp_path, _OVERRIDES_PATH)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp_path)
        raise
    _overrides_cache = None
    _overrides_mtime = None


def set_overrides(patch: dict) -> dict:
    """Validate ``patch`` (``{atv: {red_below, green_at_or_above}, ...}``), merge
    it into the on-disk overrides, and return ``effective_thresholds()``."""
    if not isinstance(patch, dict) or not patch:
        raise ThresholdValidationError("Body must be a non-empty object of {kpi: {band: value}}")
    current = {kpi: dict(band) for kpi, band in _overrides().items()}
    for kpi, bands in patch.items():
        if kpi not in _DEFAULTS:
            raise ThresholdValidationError(f"Unknown KPI {kpi!r}")
        if not isinstance(bands, dict) or not bands:
            raise ThresholdValidationError(f"{kpi}: expected an object of threshold values")
        merged = dict(current.get(kpi, {}))
        for key, value in bands.items():
            if key not in _BAND_KEYS[kpi]:
                raise ThresholdValidationError(f"{kpi}: unknown threshold key {key!r}")
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ThresholdValidationError(f"{kpi}.{key}: must be a number")
            if value < 0:
                raise ThresholdValidationError(f"{kpi}.{key}: must be >= 0")
            merged[key] = float(value)
        low_key, high_key = _BAND_KEYS[kpi]
        effective = {**_DEFAULTS[kpi], **merged}
        if effective[low_key] >= effective[high_key]:
            raise ThresholdValidationError(f"{kpi}: {low_key} must be less than {high_key}")
        current[kpi] = merged
    _write_overrides(current)
    return effective_thresholds()


def reset_overrides(kpi: str | None = None) -> dict:
    """Drop the override for ``kpi`` (or all overrides when ``kpi`` is None)."""
    if kpi is None:
        _write_overrides({})
        return effective_thresholds()
    if kpi not in _DEFAULTS:
        raise ThresholdValidationError(f"Unknown KPI {kpi!r}")
    current = {k: dict(band) for k, band in _overrides().items() if k != kpi}
    _write_overrides(current)
    return effective_thresholds()


def _band_status(value: float | None, red_below: float, green_at_or_above: float) -> str:
    if value is None:
        return STATUS_YELLOW
    if value < red_below:
        return STATUS_RED
    if value >= green_at_or_above:
        return STATUS_GREEN
    return STATUS_YELLOW


def atv_status(value: float | None) -> str:
    band = get_thresholds("atv")
    return _band_status(value, band["red_below"], band["green_at_or_above"])


def rpv_status(value: float | None) -> str:
    band = get_thresholds("rpv")
    return _band_status(value, band["red_below"], band["green_at_or_above"])


def conversion_status(value: float | None) -> str:
    band = get_thresholds("conversion")
    return _band_status(value, band["red_below"], band["green_at_or_above"])


def basket_size_status(value: float | None) -> str:
    band = get_thresholds("basket_size")
    return _band_status(value, band["red_below"], band["green_at_or_above"])


def achievement_status(value: float | None) -> str:
    if value is None:
        return STATUS_YELLOW
    band = get_thresholds("achievement")
    if value < band["red_below"]:
        return STATUS_RED
    if value > band["green_above"]:  # deliberately strict '>' per the business spec
        return STATUS_GREEN
    return STATUS_YELLOW


def remaining_status(value: float | None) -> str:
    """Remaining % (how much of Sales Target is still unmet) is exactly
    100 - Achievement %, so its status mirrors achievement_status's
    business-approved thresholds rather than defining new ones."""
    if value is None:
        return STATUS_YELLOW
    return achievement_status(100 - value)


def delta_status(current: float | None, previous: float | None, higher_is_better: bool = True) -> str:
    """Generic status for a KPI-card delta vs a prior period.
    Does not automatically treat every increase as positive; callers pass
    higher_is_better=False for metrics like discount % where a rise is a warning.
    """
    if current is None or previous is None:
        return STATUS_YELLOW
    if current == previous:
        return STATUS_YELLOW
    improved = (current > previous) if higher_is_better else (current < previous)
    return STATUS_GREEN if improved else STATUS_RED
