"""Single source of truth for the optional "neon" chart theme.

The dashboard's charts are built once (``src/charts.py``) with a fixed light
palette and the pinned ``"plotly"`` template. Rather than threading a theme flag
through every builder, ``apply_theme`` is a *post-processor* on the
already-serialised figure dict: it is the identity function for every theme
except ``"neon"``, and for ``"neon"`` it deep-walks the figure dict, swapping
each known light hex for its neon counterpart and forcing the layout background
/ font / axis colours.

Only the React SPA's live charts opt in (``?theme=neon`` on ``/api/charts/*``) and
streamlit_daily_app.py's runtime toggle. Report exports deliberately never pass a
theme, so exported documents stay on the light palette.

This file is duplicated verbatim in the Analytics & Forecasting sub-project,
whose charts use the same light palette -- HEX_REMAP is the shared contract
between them. Adding a hardcoded colour to either ``src/charts.py`` means adding
its neon counterpart here, in both copies, or it won't reskin.
"""
from __future__ import annotations

from typing import Any

NEON = "neon"

# Light hex (as written in src/charts.py) -> neon hex. Entries for charts that
# now live only in the Analytics & Forecasting sub-project are kept so the two
# copies of this table stay identical and diff cleanly.
# Keys are lower-case; matching is done case-insensitively on exact string values.
HEX_REMAP: dict[str, str] = {
    # brand blues / "Net Sales"
    "#2563eb": "#22d3ee",
    "#2a78d6": "#22d3ee",
    "#0ea5e9": "#38bdf8",
    "#93c5fd": "#38bdf8",
    # greys
    "#94a3b8": "#8b9cb3",
    "#cbd5e1": "#5b6b82",
    "#898781": "#8b9cb3",
    # rolling-average navy
    "#1e3a8a": "#a78bfa",
    "#4a3aa7": "#a78bfa",
    # ambers / oranges
    "#f59e0b": "#fbbf24",
    "#eda100": "#fbbf24",
    "#b45309": "#fbbf24",
    "#eb6834": "#fb923c",
    # reds
    "#dc2626": "#fb7185",
    "#e34948": "#fb7185",
    # greens / teals
    "#16a34a": "#34d399",
    "#008300": "#34d399",
    "#1baf7a": "#2dd4bf",
    # yellow (gauge band)
    "#eab308": "#facc15",
    # pink (categorical)
    "#e87ba4": "#f472b6",
    # near-blacks: gauge bezel / needle / numeric readout / chart font
    "#1e293b": "#cbd5e1",
    "#111827": "#e2e8f0",
    "#0f172a": "#e2e8f0",
    # forecast confidence band fill
    "rgba(37, 99, 235, 0.15)": "rgba(34, 211, 238, 0.18)",
    "rgba(37,99,235,0.15)": "rgba(34, 211, 238, 0.18)",
}

# Neon categorical colorway (used when a trace carries no explicit colour so it
# would otherwise fall back to the template's implicit cycle).
NEON_COLORWAY = [
    "#22d3ee", "#e879f9", "#a3e635", "#fbbf24",
    "#f472b6", "#38bdf8", "#c084fc", "#4ade80",
]

_NEON_PAPER = "rgba(0,0,0,0)"        # transparent -> the glass panel shows through
_NEON_PLOT = "rgba(0,0,0,0)"
_NEON_FONT = "#cbd5e1"
_NEON_GRID = "rgba(148,163,184,0.14)"
_NEON_ZEROLINE = "rgba(148,163,184,0.28)"
_NEON_LINE = "rgba(148,163,184,0.32)"


def _remap_str(value: str) -> str:
    return HEX_REMAP.get(value.lower(), value)


def _deep_remap(node: Any) -> None:
    """In-place: replace every string leaf that matches HEX_REMAP."""
    if isinstance(node, dict):
        for key, val in node.items():
            if isinstance(val, str):
                node[key] = _remap_str(val)
            else:
                _deep_remap(val)
    elif isinstance(node, list):
        for i, val in enumerate(node):
            if isinstance(val, str):
                node[i] = _remap_str(val)
            else:
                _deep_remap(val)


def _style_indicator_gauges(data: Any) -> None:
    """Plotly ``Indicator`` gauges (Streamlit's ``charts.gauge_chart``) hardcode a
    ``"white"`` dial background that the hex remap deliberately leaves alone
    everywhere else -- swap it to the dark glass tone here, scoped to the gauge."""
    if not isinstance(data, list):
        return
    for trace in data:
        if not isinstance(trace, dict) or trace.get("type") != "indicator":
            continue
        gauge = trace.get("gauge")
        if isinstance(gauge, dict) and gauge.get("bgcolor") in ("white", "#ffffff", "#fff"):
            gauge["bgcolor"] = "#0f1729"


def _style_axes(layout: dict) -> None:
    for key, axis in layout.items():
        if not isinstance(axis, dict):
            continue
        if key.startswith("xaxis") or key.startswith("yaxis"):
            axis.setdefault("gridcolor", _NEON_GRID)
            axis.setdefault("zerolinecolor", _NEON_ZEROLINE)
            axis.setdefault("linecolor", _NEON_LINE)
        elif key in ("scene", "polar", "ternary"):
            axis.setdefault("bgcolor", _NEON_PAPER)


def apply_theme(fig_dict: dict, theme: str | None) -> dict:
    """Post-process a serialised Plotly figure dict for ``theme``.

    Identity (returns the same object untouched) for every theme except
    ``"neon"``. For ``"neon"`` it mutates ``fig_dict`` in place -- swapping known
    light hexes and forcing transparent backgrounds + light font/axis colours --
    and returns it. Safe to call on a gauge-spec dict (``{"kind": "gauge", ...}``)
    or an empty figure: the remap simply finds nothing to change and no
    ``data``/``layout`` keys to style.
    """
    if theme != NEON or not isinstance(fig_dict, dict):
        return fig_dict
    if fig_dict.get("kind") == "gauge":
        # GaugeSpec is themed client-side by GlossyGauge.tsx; nothing to do here.
        return fig_dict

    _deep_remap(fig_dict)
    _style_indicator_gauges(fig_dict.get("data"))

    layout = fig_dict.get("layout")
    if isinstance(layout, dict):
        layout["paper_bgcolor"] = _NEON_PAPER
        layout["plot_bgcolor"] = _NEON_PLOT
        font = layout.setdefault("font", {})
        if isinstance(font, dict):
            font["color"] = _NEON_FONT
        layout.setdefault("colorway", list(NEON_COLORWAY))
        legend = layout.get("legend")
        if isinstance(legend, dict):
            legend.setdefault("font", {})
            if isinstance(legend["font"], dict):
                legend["font"].setdefault("color", _NEON_FONT)
        _style_axes(layout)

    return fig_dict
