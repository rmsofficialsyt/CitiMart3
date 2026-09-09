"""Plotly figure builders for Daily Operations.

A deliberately small subset of the shared chart library: the six KPI gauges and
the two live time-slot charts the Daily Dashboard actually renders. Every
DATASET.xlsx-driven builder (sales trend, period comparison, top products,
category drilldown, the chart-type switcher, ...) lives in the *Analytics &
Forecasting* sub-project's copy of this module instead -- nothing here reads a
workbook frame, only the live MongoDB aggregates
src/daily_dashboard_store.py produces.

Every chart has a business title, currency/percent/count formatting, hover
info, empty-data handling, and returns a plain dict (via _fig_to_dict(fig))
that the API layer serialises to JSON for Plotly.js on the frontend.

The gauge numbers stay driven by config/kpi_thresholds.py, which the admin can
override at runtime -- keep the two sub-projects' threshold semantics
identical, since a manager and a developer looking at the same KPI must see
the same red/yellow/green call.
"""
from __future__ import annotations

import json

import pandas as pd
import plotly.graph_objects as go

from config.kpi_thresholds import get_thresholds
from config.settings import CURRENCY_SYMBOL, TIME_SLOT_ORDER
from src.theme import apply_theme as apply_theme  # re-export: charts.apply_theme is the public name

# Single source of truth for chart heights so every figure of a given kind
# renders at a consistent, readable size regardless of data volume. Width is
# left responsive (Plotly.newPlot is called with {responsive: true} on the
# frontend) so figures still fill their container on any screen size. These
# must stay in lockstep with the matching h-[..px] container classes on each
# <ChartPanel> in frontend/src/pages -- Plotly renders at the literal
# layout.height set here, so a mismatch produces clipping/whitespace.
STANDARD_CHART_HEIGHT = 460
GAUGE_HEIGHT = 360
STANDARD_MARGIN = {"l": 60, "r": 40, "t": 70, "b": 60}

# Matches the app UI: Geist Variable for chart chrome (titles/axes/legend),
# Fira Code Variable for the gauge's big numeric readout -- both are already
# self-hosted/loaded by the React frontend, so referencing them here keeps
# chart typography visually consistent with the surrounding KPI cards
# instead of falling back to Plotly's small default sans-serif.
CHART_FONT_FAMILY = "'Geist Variable', -apple-system, 'Segoe UI', sans-serif"
CHART_MONO_FONT_FAMILY = "'Fira Code Variable', ui-monospace, monospace"
CHART_TRANSITION = {"duration": 400, "easing": "cubic-in-out"}

# Pinned explicitly so every figure's JSON always embeds Plotly's own factory
# template, never whatever happens to be process-wide `pio.templates.default`
# at build time. Without this, importing `streamlit` (which registers its own
# "streamlit" template -- placeholder near-black colors like #000001..#000010
# meant to be swapped client-side only when st.plotly_chart(theme="streamlit")
# does the substitution) silently becomes the ambient default template for
# every go.Figure() built anywhere in that process, including here. Any trace
# below that doesn't set an explicit color then renders in those unreadable
# placeholder colors instead of Plotly's normal palette. This matters more in
# this sub-project than it used to: streamlit_daily_app.py imports this module
# in the same process as Streamlit itself.
CHART_TEMPLATE = "plotly"


def _size(fig: go.Figure, height: int, margin: dict | None = None) -> go.Figure:
    """Applies the shared size/typography/animation theme. Called last by
    every chart builder below, after any chart-specific layout tweaks --
    Plotly's update_layout merges nested dicts recursively, so this never
    clobbers a title/axis-title string set earlier in the same function."""
    fig.update_layout(
        template=CHART_TEMPLATE,
        height=height,
        margin=margin or STANDARD_MARGIN,
        autosize=True,
        font={"family": CHART_FONT_FAMILY, "size": 13, "color": "#1e293b"},
        title={"font": {"size": 19, "family": CHART_FONT_FAMILY}},
        legend={"font": {"size": 13}},
        xaxis={"tickfont": {"size": 12}, "title": {"font": {"size": 14}}},
        yaxis={"tickfont": {"size": 12}, "title": {"font": {"size": 14}}},
        transition=CHART_TRANSITION,
    )
    return fig


def _fig_to_dict(fig: go.Figure) -> dict:
    """Plotly's Figure.to_dict() can leave numpy arrays / binary-packed
    typed arrays in the output (a Plotly 6 perf optimisation), which
    FastAPI's default JSON encoder can't serialise. Round-tripping through
    Figure.to_json() (which uses Plotly's own JSON encoder) guarantees a
    plain, JSON-safe dict of lists instead."""
    return json.loads(fig.to_json())


def _empty_figure(title: str, message: str = "No data available for the selected filters", height: int = STANDARD_CHART_HEIGHT) -> dict:
    fig = go.Figure()
    fig.update_layout(
        title=title,
        annotations=[{"text": message, "xref": "paper", "yref": "paper", "showarrow": False, "font": {"size": 14}}],
        xaxis={"visible": False},
        yaxis={"visible": False},
    )
    _size(fig, height)
    return _fig_to_dict(fig)


# ---------------------------------------------------------------------------
# Live time-slot charts
# ---------------------------------------------------------------------------


def footfall_nob_by_timeslot_chart(footfall: pd.DataFrame, title: str = "Footfall vs NOB: Time-of-Day Performance") -> dict:
    """Footfall vs NOB summed by time-slot band -- which store hours actually
    convert footfall into transactions best. `title` is overridable so
    daily_footfall_vs_nob_chart below can reuse this exact bar-building logic
    (DRY -- one place draws a Footfall-vs-NOB-by-time-slot chart) under its
    own, differently-worded title, without duplicating the trace/layout code
    a second time."""
    if footfall.empty or "time_slot" not in footfall.columns:
        return _empty_figure(title)
    grouped = footfall.groupby("time_slot").agg(footfall=("footfall", "sum"), nob=("nob", "sum")).reindex(TIME_SLOT_ORDER)
    fig = go.Figure()
    fig.add_bar(x=TIME_SLOT_ORDER, y=grouped["footfall"], name="Footfall", marker_color="#94a3b8")
    fig.add_bar(x=TIME_SLOT_ORDER, y=grouped["nob"], name="NOB", marker_color="#2563eb")
    fig.update_layout(title=title, barmode="group", yaxis={"title": "Count"})
    _size(fig, STANDARD_CHART_HEIGHT)
    return _fig_to_dict(fig)


def daily_footfall_vs_nob_chart(breakdown: dict[str, dict[str, float]]) -> dict:
    """The Daily Dashboard's own simple Footfall-vs-NOB-by-Time-Slot view --
    just the two bars, no Conversion % line, for a reader who wants the
    plainest possible side-by-side comparison (daily_timeslot_breakdown_chart
    below is the sales-oriented view of the same live data). `breakdown` is
    src/daily_dashboard_store.compute_live_timeslot_breakdown's output,
    already keyed by TIME_SLOT_ORDER."""
    title = "Footfall vs NOB (based on Time Slot)"
    footfall_vals = [breakdown[slot]["footfall"] for slot in TIME_SLOT_ORDER]
    nob_vals = [breakdown[slot]["nob"] for slot in TIME_SLOT_ORDER]
    if not any(footfall_vals) and not any(nob_vals):
        return _empty_figure(title)
    df = pd.DataFrame({"time_slot": TIME_SLOT_ORDER, "footfall": footfall_vals, "nob": nob_vals})
    return footfall_nob_by_timeslot_chart(df, title=title)


def daily_timeslot_breakdown_chart(breakdown: dict[str, dict[str, float]], day_target: float | None = None) -> dict:
    """The Daily Dashboard's own Time Slot view -- sales-based: Net Sales per
    time slot (bars) against the whole-day admin Sales Target drawn as a
    horizontal reference line. There is no per-slot target in the data, so
    every slot is compared to the full-day target -- the same convention
    src/daily_report.py's slot-level table already uses (it repeats the
    whole-day target on every slot row rather than fabricating a per-slot
    split). Footfall/NOB by time slot is the separate
    daily_footfall_vs_nob_chart shown alongside this on the same page, so
    that view isn't lost -- this one just answers "which part of the day
    earned the money, and how far are we from target". `breakdown` is
    src/daily_dashboard_store.compute_live_timeslot_breakdown's output --
    already keyed by TIME_SLOT_ORDER, so no reindex is needed here."""
    title = "Today's Performance by Time Slot"
    net_sales_vals = [breakdown[slot]["net_sales"] for slot in TIME_SLOT_ORDER]
    if not any(net_sales_vals) and not day_target:
        return _empty_figure(title)
    fig = go.Figure()
    fig.add_bar(x=TIME_SLOT_ORDER, y=net_sales_vals, name="Net Sales", marker_color="#2563eb")
    if day_target:
        fig.add_hline(
            y=day_target,
            line={"color": "#f59e0b", "width": 2, "dash": "dash"},
            annotation_text=f"Day Sales Target: {CURRENCY_SYMBOL}{day_target:,.0f}",
            annotation_position="top left",
        )
    fig.update_layout(
        title=title,
        yaxis={"title": f"Net Sales ({CURRENCY_SYMBOL})"},
        hovermode="x unified",
    )
    _size(fig, STANDARD_CHART_HEIGHT)
    return _fig_to_dict(fig)


# ---------------------------------------------------------------------------
# Gauges
# ---------------------------------------------------------------------------

# Vivid speedometer-band colors -- same red/yellow/green hue families as the
# KPI card status colors (frontend/src/index.css's --status-*), just more
# saturated than a status badge/pill needs to be, since these fill an entire
# dial band rather than a small chip. Kept as their own constants (not
# config/kpi_thresholds.py, which owns the *numeric* red/yellow/green
# breakpoints, not colors) so every gauge_chart() caller renders an
# identical dial.
_GAUGE_RED = "#dc2626"
_GAUGE_YELLOW = "#eab308"
_GAUGE_GREEN = "#16a34a"
_GAUGE_BEZEL = "#1e293b"
_GAUGE_NEEDLE = "#111827"


def _gauge_axis_range(value: float, red_below: float, green_at: float, reverse: bool) -> tuple[float, float]:
    """The gauge's [min, max] axis bounds -- padded past the red/green
    thresholds (and past the live value, if it's off-scale) so all 3 bands
    keep real width and the value never clamps to an axis endpoint it
    hasn't actually reached.

    reverse=True gauges (Remaining %) put the "good" (green) zone at the LOW
    end, and that zone can be *negative* -- Remaining % goes below 0 once
    Achievement % passes 100 (over-target), and green_at itself mirrors
    Achievement %'s strict >100 rule (100-100=0), so the green cutoff is
    already right at 0 with nothing below it. A hardcoded axis min of 0 (the
    right choice for every non-reverse gauge here, since ATV/Conversion
    %/Achievement % can't go negative) would leave the green zone exactly
    zero-width forever and clamp any negative value to the same spot as
    zero -- this is the bug that made Remaining % never show green and
    stick its needle at the start on an over-achieved day. Padding the
    minimum below green_at (and below the value itself, if it's already
    lower) fixes both at once."""
    if reverse:
        pad = max(red_below - green_at, 1) * 0.3
        axis_min = min(0.0, green_at - pad, value - pad)
        axis_max = max(red_below * 1.3, green_at * 1.3, value * 1.2, axis_min + 1)
    else:
        axis_min = 0.0
        axis_max = max(red_below * 1.3, green_at * 1.3, value * 1.2, 1)
    return axis_min, axis_max


def gauge_chart(
    value: float | None,
    title: str,
    target: float | None,
    red_below: float,
    green_at: float,
    suffix: str = "",
    prefix: str = "",
    reverse: bool = False,
) -> dict:
    """Plotly Indicator version of the gauge -- used only by the Streamlit app
    (streamlit_daily_app.py calls this directly). The FastAPI/React path uses
    gauge_spec() below instead: frontend/src/components/GlossyGauge.tsx draws
    a real analog-speedometer needle in SVG, which Plotly's Indicator can't
    (it has no true needle primitive, only a `threshold` line as a stand-in,
    which is what this function still uses).

    reverse=True is for "lower is better" metrics (e.g. Remaining %): the
    red/yellow/green band order flips so red still means "bad", even though
    it now sits at the high end of the axis rather than the low end."""
    if value is None:
        return _empty_figure(title, "N/A — required source field not available", height=GAUGE_HEIGHT)
    axis_min, axis_max = _gauge_axis_range(value, red_below, green_at, reverse)
    if reverse:
        steps = [
            {"range": [axis_min, green_at], "color": _GAUGE_GREEN},
            {"range": [green_at, red_below], "color": _GAUGE_YELLOW},
            {"range": [red_below, axis_max], "color": _GAUGE_RED},
        ]
    else:
        steps = [
            {"range": [axis_min, red_below], "color": _GAUGE_RED},
            {"range": [red_below, green_at], "color": _GAUGE_YELLOW},
            {"range": [green_at, axis_max], "color": _GAUGE_GREEN},
        ]
    fig = go.Figure(
        go.Indicator(
            mode="gauge+number+delta",
            value=value,
            number={"suffix": suffix, "prefix": prefix, "font": {"size": 42, "family": CHART_MONO_FONT_FAMILY, "color": "#0f172a"}},
            delta={"reference": target, "font": {"size": 16, "family": CHART_MONO_FONT_FAMILY}} if target is not None else None,
            gauge={
                "axis": {"range": [axis_min, axis_max], "tickfont": {"size": 12}, "tickcolor": _GAUGE_BEZEL, "tickwidth": 2},
                "bar": {"color": "rgba(0,0,0,0)"},
                "bgcolor": "white",
                "bordercolor": _GAUGE_BEZEL,
                "borderwidth": 4,
                "steps": steps,
                "threshold": {"line": {"color": _GAUGE_NEEDLE, "width": 6}, "thickness": 0.9, "value": value},
            },
            title={"text": title, "font": {"size": 17, "family": CHART_FONT_FAMILY}},
        )
    )
    _size(fig, GAUGE_HEIGHT, margin={"l": 30, "r": 30, "t": 70, "b": 20})
    # Unlike every other chart here, a gauge's visible label lives on the
    # Indicator trace's own `title` above -- the figure-level layout.title
    # is never set to a string first, so _size()'s title={"font": ...} merge
    # leaves layout.title.text unset. Plotly.js then renders that as the
    # literal word "undefined" instead of nothing, so it must be cleared
    # explicitly here.
    fig.update_layout(title_text="")
    return _fig_to_dict(fig)


def gauge_spec(
    value: float | None,
    title: str,
    target: float | None,
    red_below: float,
    green_at: float,
    suffix: str = "",
    prefix: str = "",
    reverse: bool = False,
    zero_if_missing: bool = False,
) -> dict:
    """Plain-JSON gauge description (not a Plotly figure) for the FastAPI/
    React path -- frontend/src/components/GlossyGauge.tsx renders this as a
    true analog speedometer (chrome bezel, needle, tick marks), which Plotly
    can't draw. Same red_below/green_at business thresholds and reverse
    semantics as gauge_chart() above (still config/kpi_thresholds.py-driven,
    nothing duplicated here) -- `_gauge_axis_range` is shared by both so a
    React gauge and its Streamlit counterpart always land on the same
    numbers.

    zero_if_missing renders a missing (None) value as a real gauge with the
    needle parked at 0 instead of the "N/A" placeholder. Every Daily
    Operations gauge passes this, so they match this page's KPI cards, which
    already show 0 (not N/A) for an empty value via format.ts's *OrZero
    formatters -- on a live manual-entry page a blank almost always means
    "hasn't happened yet today", not "the source column doesn't exist"."""
    if value is None:
        if not zero_if_missing:
            return {"kind": "gauge", "title": title, "value": None}
        value = 0.0
    axis_min, axis_max = _gauge_axis_range(value, red_below, green_at, reverse)
    return {
        "kind": "gauge",
        "title": title,
        "value": value,
        "target": target,
        "min": axis_min,
        "max": axis_max,
        "redBelow": red_below,
        "greenAt": green_at,
        "reverse": reverse,
        "suffix": suffix,
        "prefix": prefix,
    }


# Each gauge reads config/kpi_thresholds.get_thresholds(...) *inside* its body
# (not a module-load snapshot) so an admin's PUT /api/kpi-thresholds shows up on
# the next /api/charts/*_gauge request with no restart.
def atv_gauge(atv: float | None, target: float | None = None, *, zero_if_missing: bool = False) -> dict:
    band = get_thresholds("atv")
    return gauge_spec(atv, "ATV (Average Transaction Value)", target, band["red_below"], band["green_at_or_above"], prefix=f"{CURRENCY_SYMBOL} ", zero_if_missing=zero_if_missing)


def rpv_gauge(rpv: float | None, target: float | None = None, *, zero_if_missing: bool = False) -> dict:
    band = get_thresholds("rpv")
    return gauge_spec(rpv, "RPV (Revenue Per Visitor)", target, band["red_below"], band["green_at_or_above"], prefix=f"{CURRENCY_SYMBOL} ", zero_if_missing=zero_if_missing)


def conversion_gauge(conversion_pct: float | None, target: float = 40.0, *, zero_if_missing: bool = False) -> dict:
    band = get_thresholds("conversion")
    return gauge_spec(conversion_pct, "Conversion %", target, band["red_below"], band["green_at_or_above"], suffix="%", zero_if_missing=zero_if_missing)


def basket_size_gauge(basket_size: float | None, target: float | None = None, *, zero_if_missing: bool = False) -> dict:
    band = get_thresholds("basket_size")
    return gauge_spec(basket_size, "Basket Size", target, band["red_below"], band["green_at_or_above"], zero_if_missing=zero_if_missing)


def achievement_gauge(achievement_pct: float | None, *, zero_if_missing: bool = False) -> dict:
    band = get_thresholds("achievement")
    return gauge_spec(achievement_pct, "Target Achievement %", 100.0, band["red_below"], band["green_above"], suffix="%", zero_if_missing=zero_if_missing)


def remaining_pct_gauge(remaining_pct: float | None, *, zero_if_missing: bool = False) -> dict:
    # Remaining % = 100 - Achievement %, so its bands are the achievement band
    # mirrored around 100 rather than a separately-defined business threshold.
    band = get_thresholds("achievement")
    red_above = 100 - band["red_below"]
    green_at_or_below = 100 - band["green_above"]
    return gauge_spec(remaining_pct, "Remaining %", 0.0, red_above, green_at_or_below, suffix="%", reverse=True, zero_if_missing=zero_if_missing)
