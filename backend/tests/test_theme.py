"""src/theme.py -- the opt-in "neon" chart post-processor.

Mirrors tests/test_chart_types.py's contract style: identity for every theme
except "neon"; for "neon", known light hexes are swapped and the layout
background is forced transparent. No production code asserts colours, so these
are the only regression guard for the palette map.
"""
import json

import plotly.graph_objects as go

from src import charts
from src.theme import HEX_REMAP, apply_theme


def _bar_fig() -> dict:
    fig = go.Figure(
        go.Bar(
            x=["Jan", "Feb", "Mar"],
            y=[1.0, 2.0, 3.0],
            name="Net Sales",
            marker_color="#2563eb",
        )
    )
    fig.update_layout(xaxis={"title": {"text": "Month"}}, yaxis={"title": {"text": "Sales"}})
    return json.loads(fig.to_json())


def test_identity_for_non_neon_themes():
    src = _bar_fig()
    assert apply_theme(src, None) is src
    assert apply_theme(src, "light") is src
    assert apply_theme(src, "dark") is src
    assert apply_theme(src, "system") is src


def test_charts_reexports_apply_theme():
    assert charts.apply_theme is apply_theme


def test_neon_swaps_known_hex_and_forces_transparent_background():
    out = apply_theme(_bar_fig(), "neon")
    assert out["data"][0]["marker"]["color"] == HEX_REMAP["#2563eb"]
    assert out["layout"]["paper_bgcolor"] == "rgba(0,0,0,0)"
    assert out["layout"]["plot_bgcolor"] == "rgba(0,0,0,0)"
    assert out["layout"]["font"]["color"] == "#cbd5e1"
    # axes present in the source get grid/line colours; ones that aren't stay absent
    assert "gridcolor" in out["layout"]["xaxis"]


def test_neon_leaves_unknown_colours_untouched():
    fig = go.Figure(go.Scatter(x=[1, 2], y=[3, 4], line={"color": "#123abc"}))
    out = apply_theme(json.loads(fig.to_json()), "neon")
    assert out["data"][0]["line"]["color"] == "#123abc"


def test_neon_is_noop_on_gauge_spec():
    spec = charts.atv_gauge(950.0, target=1000.0)
    assert apply_theme(spec, "neon") is spec
    assert spec["kind"] == "gauge"
    missing = charts.atv_gauge(None)
    assert apply_theme(missing, "neon") is missing
    assert missing["value"] is None


def test_neon_recolours_indicator_gauge_dial():
    fig = charts.gauge_chart(85.0, "Conversion %", 40.0, 25.0, 40.0, suffix="%")
    out = apply_theme(fig, "neon")
    indicator = next(t for t in out["data"] if t.get("type") == "indicator")
    assert indicator["gauge"]["bgcolor"] != "white"


def test_neon_remaps_nested_colours_and_marker_colour_lists():
    fig = go.Figure()
    fig.add_trace(go.Bar(x=["a", "b"], y=[1, 2], marker={"color": ["#2a78d6", "#eb6834"]}))
    fig.add_trace(go.Scatter(x=["a", "b"], y=[3, 4], line={"color": "#dc2626", "dash": "dash"}))
    fig.update_layout(annotations=[{"text": "note", "font": {"color": "#b45309"}}])
    out = apply_theme(json.loads(fig.to_json()), "neon")

    assert out["data"][0]["marker"]["color"] == [HEX_REMAP["#2a78d6"], HEX_REMAP["#eb6834"]]
    assert out["data"][1]["line"]["color"] == HEX_REMAP["#dc2626"]
    assert out["data"][1]["line"]["dash"] == "dash"  # non-colour string untouched
    assert out["layout"]["annotations"][0]["font"]["color"] == HEX_REMAP["#b45309"]


def test_neon_never_mutates_a_second_time_differently():
    once = apply_theme(_bar_fig(), "neon")
    twice = apply_theme(json.loads(json.dumps(once)), "neon")
    assert once["data"][0]["marker"]["color"] == twice["data"][0]["marker"]["color"]
