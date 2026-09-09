"""Runtime "Neon" theme toggle (plus the small-screen CSS) shared by both Streamlit apps.

Streamlit has no first-class multi-theme switch, so this is a sidebar radio that
flips a ``st.session_state`` flag plus a one-shot ``st.markdown`` CSS injection
targeting Streamlit's stable ``data-testid`` DOM hooks. Charts are recoloured by
routing every figure dict through :func:`src.theme.apply_theme` (see
``themed_figure``), the same post-processor the FastAPI ``/api/charts`` route uses
for the React app.

``theme_selector`` also injects :data:`_MOBILE_CSS` on *every* rerun regardless of
theme -- it's the phone/tablet layer for these secondary UIs (the React SPA has
its own in ``frontend/src/index.css``). Both apps are ``layout="wide"`` and lay
their KPIs out with ``st.columns(4)``, which on a 375px screen would otherwise be
four ~80px columns of unreadable numbers.

Usage (near ``st.set_page_config`` in each app)::

    from src.streamlit_theme import theme_selector, themed_figure
    theme_selector()
    ...
    st.plotly_chart(themed_figure(charts.some_chart(...)), theme=None)
"""
from __future__ import annotations

import plotly.graph_objects as go
import streamlit as st

from src.theme import NEON, apply_theme

_STATE_KEY = "citimart_theme"

_NEON_CSS = """
<style>
:root { --neon-bg: #0e1220; --neon-panel: rgba(30,41,74,0.55); --neon-cyan: #22d3ee; --neon-text: #e2e8f0; }
[data-testid="stAppViewContainer"] {
  background-color: var(--neon-bg);
  background-image:
    radial-gradient(ellipse 80% 55% at 12% -5%, rgba(34,211,238,0.16), transparent 60%),
    radial-gradient(ellipse 70% 55% at 88% 10%, rgba(232,121,249,0.14), transparent 55%),
    radial-gradient(ellipse 95% 70% at 50% 108%, rgba(129,140,248,0.14), transparent 62%);
  background-attachment: fixed;
  color: var(--neon-text);
}
[data-testid="stHeader"] { background: transparent; }
[data-testid="stSidebar"] {
  background-color: rgba(20,26,45,0.75);
  backdrop-filter: blur(14px) saturate(1.4);
  border-right: 1px solid rgba(148,197,255,0.18);
}
[data-testid="stSidebar"] * , [data-testid="stAppViewContainer"] .stMarkdown, [data-testid="stAppViewContainer"] p,
[data-testid="stAppViewContainer"] label, [data-testid="stAppViewContainer"] h1, [data-testid="stAppViewContainer"] h2,
[data-testid="stAppViewContainer"] h3, [data-testid="stAppViewContainer"] h4 { color: var(--neon-text); }
[data-testid="stAppViewContainer"] h1, [data-testid="stAppViewContainer"] h2, [data-testid="stAppViewContainer"] h3 {
  text-shadow: 0 0 18px rgba(34,211,238,0.22);
}
[data-testid="stMetric"] {
  background: var(--neon-panel);
  backdrop-filter: blur(14px) saturate(1.5);
  border: 1px solid rgba(148,197,255,0.18);
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 8px 30px rgba(4,8,20,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
}
[data-testid="stMetricValue"] { color: var(--neon-cyan); }
.stTabs [data-baseweb="tab-list"] { background: transparent; border-bottom: 1px solid rgba(148,197,255,0.18); }
.stTabs [data-baseweb="tab"] { color: rgba(226,232,240,0.65); }
.stTabs [aria-selected="true"] { color: var(--neon-cyan); }
[data-testid="stDataFrame"], [data-testid="stExpander"] details {
  background: var(--neon-panel);
  border: 1px solid rgba(148,197,255,0.18);
  border-radius: 12px;
}
.stButton > button, .stDownloadButton > button {
  background: rgba(34,211,238,0.12);
  border: 1px solid rgba(34,211,238,0.4);
  color: var(--neon-cyan);
}
.stButton > button:hover, .stDownloadButton > button:hover { background: rgba(34,211,238,0.22); }
</style>
"""

# Injected on every rerun in both themes. Everything is inside a max-width query,
# so a desktop browser sees no change at all.
_MOBILE_CSS = """
<style>
@media (max-width: 767px) {
  /* layout="wide" keeps a generous side gutter that costs ~20% of a phone's
     width; claw it back. */
  [data-testid="stAppViewContainer"] .block-container {
    padding-left: 0.75rem;
    padding-right: 0.75rem;
    padding-top: 2.5rem;
  }

  /* st.columns renders one flex row that does not stack on its own, so
     st.columns(4) becomes four ~80px KPI columns. Force 2-up on a phone and
     1-up on the smallest widths, for every column count both apps use. */
  [data-testid="stHorizontalBlock"] { flex-wrap: wrap; gap: 0.75rem; }
  [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
    flex: 1 1 calc(50% - 0.75rem);
    min-width: calc(50% - 0.75rem);
  }

  /* Long metric labels ("Achievement %  vs prev period") truncate to an
     ellipsis in a half-width column -- let them wrap instead. */
  [data-testid="stMetricLabel"] p { white-space: normal; overflow: visible; }
  [data-testid="stMetricValue"] { font-size: 1.25rem; }

  /* The tab strips (both apps use st.tabs with 6-8 long labels) scroll
     sideways rather than wrapping into a wall of rows. */
  .stTabs [data-baseweb="tab-list"] {
    overflow-x: auto;
    flex-wrap: nowrap;
    scrollbar-width: none;
  }
  .stTabs [data-baseweb="tab-list"]::-webkit-scrollbar { display: none; }
  .stTabs [data-baseweb="tab"] { white-space: nowrap; }

  /* Tables/dataframes scroll inside themselves; the page must not pan. */
  [data-testid="stAppViewContainer"] { overflow-x: hidden; }
}

/* Single-column below 480px -- two gauges side by side at that width are
   smaller than the numbers printed on them. */
@media (max-width: 479px) {
  [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
    flex: 1 1 100%;
    min-width: 100%;
  }
}
</style>
"""


def theme_selector(*, sidebar: bool = True) -> str:
    """Render the Default / Neon picker and return the active theme.

    Persists the choice in ``st.session_state`` and injects the neon CSS on every
    rerun while Neon is active (Streamlit drops injected ``<style>`` between
    reruns, so this must run each pass). The small-screen CSS is injected the
    same way but unconditionally -- it's orthogonal to the theme.
    """
    st.markdown(_MOBILE_CSS, unsafe_allow_html=True)
    container = st.sidebar if sidebar else st
    # `key` alone drives persistence across reruns; no `index=`/`value=` so
    # Streamlit doesn't warn about a widget default competing with session state.
    choice = container.radio(
        "Theme",
        options=["Default", "Neon"],
        horizontal=True,
        key=_STATE_KEY,
    )
    if choice == "Neon":
        st.markdown(_NEON_CSS, unsafe_allow_html=True)
        return NEON
    return "default"


def active_theme() -> str:
    return NEON if st.session_state.get(_STATE_KEY) == "Neon" else "default"


def themed_figure(fig_dict: dict) -> go.Figure:
    """``go.Figure`` for ``st.plotly_chart``, recoloured when Neon is active.

    Drop-in replacement for each app's local ``to_figure`` helper.
    """
    return go.Figure(apply_theme(fig_dict, active_theme()))
