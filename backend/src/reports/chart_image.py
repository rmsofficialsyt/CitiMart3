"""Rasterizes a report's ChartBlock/GaugeBlock content to PNG bytes via
Kaleido, for every format that can't embed a live interactive chart
(PDF/PPTX/DOCX/XLSX; MD/HTML also use these PNGs, inlined as base64 data
URIs, so every format has the same static "print" fidelity -- see
src/reports/models.py's module docstring).

gauge_spec_to_figure reconstructs the exact same Plotly Indicator figure
src/charts.py's gauge_chart() would have built, but from the already-
resolved GaugeSpec dict (kind/title/value/target/min/max/redBelow/greenAt/
reverse/suffix/prefix) the frontend already fetched via gauge_spec() --
axis_min/axis_max are already resolved in the spec, so _gauge_axis_range
never needs to run again here.
"""
from __future__ import annotations

import threading

import plotly.graph_objects as go

from src.charts import CHART_FONT_FAMILY, CHART_MONO_FONT_FAMILY, GAUGE_HEIGHT, _GAUGE_BEZEL, _GAUGE_GREEN, _GAUGE_NEEDLE, _GAUGE_RED, _GAUGE_YELLOW, _empty_figure, _size

_KALEIDO_LOCK = threading.Lock()


class ChartRenderError(RuntimeError):
    """Raised with an actionable message when Kaleido can't rasterize a
    chart -- e.g. its headless-browser backend isn't available in this
    environment -- rather than letting a raw exception bubble up as a
    500 with no explanation (per the master spec's explicit ask to handle
    a missing chart-export dependency gracefully)."""


def fig_dict_to_png(figure: dict, *, width: int = 1000, height: int = 500) -> bytes:
    try:
        fig = go.Figure(figure)
        with _KALEIDO_LOCK:
            return fig.to_image(format="png", width=width, height=height, scale=2)
    except Exception as error:  # pragma: no cover - depends on local Kaleido/browser install
        raise ChartRenderError(
            "Could not render a chart image for this report (Kaleido/its headless-browser "
            "backend may not be installed correctly). Install/repair it with "
            "`pip install --force-reinstall kaleido` and try again."
        ) from error


def gauge_spec_to_figure(spec: dict) -> go.Figure:
    title = spec.get("title", "")
    value = spec.get("value")
    if value is None:
        return go.Figure(_empty_figure(title, "N/A — required source field not available", height=GAUGE_HEIGHT))

    target = spec.get("target")
    axis_min = spec.get("min", 0)
    axis_max = spec.get("max", 100)
    red_below = spec.get("redBelow")
    green_at = spec.get("greenAt")
    reverse = bool(spec.get("reverse", False))
    suffix = spec.get("suffix", "")
    prefix = spec.get("prefix", "")

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
            number={"suffix": suffix, "prefix": prefix, "font": {"size": 34, "family": CHART_MONO_FONT_FAMILY, "color": "#0f172a"}},
            delta={"reference": target, "font": {"size": 14, "family": CHART_MONO_FONT_FAMILY}} if target is not None else None,
            gauge={
                "axis": {"range": [axis_min, axis_max], "tickfont": {"size": 11, "color": "#475569"}, "tickcolor": _GAUGE_BEZEL, "tickwidth": 2},
                "bar": {"color": "rgba(0,0,0,0)"},
                "bgcolor": "#ffffff",
                "bordercolor": _GAUGE_BEZEL,
                "borderwidth": 3,
                "steps": steps,
                "threshold": {"line": {"color": "#dc2626", "width": 5}, "thickness": 0.88, "value": value},
            },
            title={"text": f"<b>{title}</b>", "font": {"size": 15, "family": CHART_FONT_FAMILY, "color": "#1e3a8a"}},
        )
    )
    _size(fig, GAUGE_HEIGHT, margin={"l": 25, "r": 25, "t": 50, "b": 15})
    fig.update_layout(title_text="", paper_bgcolor="#ffffff", plot_bgcolor="#ffffff")
    return fig


def gauge_spec_to_png(spec: dict, *, width: int = 700, height: int = 500) -> bytes:
    try:
        fig = gauge_spec_to_figure(spec)
        with _KALEIDO_LOCK:
            return fig.to_image(format="png", width=width, height=height, scale=2)
    except ChartRenderError:
        raise
    except Exception as error:  # pragma: no cover - depends on local Kaleido/browser install
        raise ChartRenderError(
            "Could not render a gauge image for this report (Kaleido/its headless-browser "
            "backend may not be installed correctly). Install/repair it with "
            "`pip install --force-reinstall kaleido` and try again."
        ) from error
