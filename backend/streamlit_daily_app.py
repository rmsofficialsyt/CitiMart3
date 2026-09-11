"""CITIMART Daily Operations -- local Streamlit dashboard.

A secondary, read-only view of the same live MongoDB data the React SPA shows,
for looking at a store's day from a laptop without running the frontend build.
Run it from this directory:

    streamlit run streamlit_daily_app.py        # http://localhost:8601

Port 8601 is pinned in .streamlit/config.toml so this never collides with the
Analytics & Forecasting sub-project's two Streamlit apps (8602 / 8603) -- all
three can be up at once.

Deliberately read-only. Logging bills / footfall / NOB, editing entries and
setting Sales Targets all stay in the React app: those are audited write paths
with per-store authorization, confirmation dialogs and inline validation, and
duplicating them in a second UI is how the two drift apart. This app reads
exactly the same functions the API routes read -- src/daily_dashboard_store.py
and src/daily_context.py -- so a number here can never disagree with the
dashboard.

Auth is the same MongoDB `users` collection the API checks (src/user_store.py,
PBKDF2-SHA256), but there is no JWT: this process talks to the database
directly rather than to the API, so the login below just establishes *scope*
(which store this session may look at) inside st.session_state. It is a local
developer/manager convenience, not a hardened public surface -- don't expose
it beyond localhost.
"""
from __future__ import annotations

from datetime import date

import pandas as pd
import streamlit as st

from config.auth_users import AUTH_USERS
from config.kpi_thresholds import (
    achievement_status,
    atv_status,
    basket_size_status,
    conversion_status,
    get_thresholds,
    remaining_status,
    rpv_status,
)
from config.settings import CURRENCY_SYMBOL, STORE_CODE_TO_NAME, TIME_SLOT_ORDER
from db.session import session_scope
from src import charts, daily_context, daily_dashboard_store
from src.formatting import format_currency_or_zero, format_number_or_zero, format_percent_or_zero
from src.streamlit_theme import theme_selector, themed_figure
from src.user_store import get_user, verify_password

st.set_page_config(page_title="CITIMART Daily Operations", page_icon="🛍️", layout="wide")

# Status colour -> the emoji Streamlit can render inline in a metric label.
# Mirrors frontend/src/components/StatusBadge.tsx's red/amber/green.
_STATUS_DOT = {"red": "🔴", "yellow": "🟡", "green": "🟢"}


def _login_form() -> None:
    """Username + password against the `users` collection. Renders instead of
    the dashboard until a session is established."""
    st.title("CITIMART Daily Operations")
    st.caption("Sign in with the same credentials you use for the dashboard.")
    with st.form("login"):
        username = st.selectbox("Account", options=list(AUTH_USERS))
        password = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Sign in")
    if not submitted:
        return
    try:
        with session_scope() as db:
            user = get_user(db, username)
    except RuntimeError as error:
        # The one configuration mistake worth naming explicitly: no MONGODB_URI.
        st.error(str(error))
        return
    if user is None or not verify_password(password, user.get("password_hash")):
        st.error("Incorrect username or password.")
        return
    role, store_code = AUTH_USERS[username]
    st.session_state["auth"] = {"username": username, "role": role, "store_code": store_code}
    st.rerun()


def _visible_stores(auth: dict) -> list[str]:
    """An admin sees all three stores; a manager sees only their own -- the
    same scoping api/auth.py::CurrentUser.allowed_stores applies to the API."""
    if auth["role"] == "admin":
        return list(STORE_CODE_TO_NAME)
    return [auth["store_code"]] if auth["store_code"] else []


def _kpi_row(kpis: dict) -> None:
    """The eight headline figures, formatted exactly as the React KPI cards
    are. *_or_zero formatters throughout: on this live surface a blank means
    "hasn't happened yet today", not "the source column is missing"."""
    cards = [
        ("Sales Target", format_currency_or_zero(kpis["sales_target"]), None),
        ("Net Sales", format_currency_or_zero(kpis["net_sales"]), None),
        ("Remaining", format_currency_or_zero(kpis["remaining"]), None),
        ("Bill Quantity (units sold)", format_number_or_zero(kpis["bill_quantity"]), None),
        ("Footfall", format_number_or_zero(kpis["footfall"]), None),
        ("Transactions (NOB)", format_number_or_zero(kpis["nob"]), None),
        ("ATV", format_currency_or_zero(kpis["atv"]), atv_status(kpis["atv"])),
        ("RPV", format_currency_or_zero(kpis["rpv"]), rpv_status(kpis["rpv"])),
        ("Basket Size", format_number_or_zero(kpis["basket_size"], 2), basket_size_status(kpis["basket_size"])),
        ("Conversion %", format_percent_or_zero(kpis["conversion_pct"]), conversion_status(kpis["conversion_pct"])),
        ("Achievement %", format_percent_or_zero(kpis["achievement_pct"]), achievement_status(kpis["achievement_pct"])),
        ("Remaining %", format_percent_or_zero(kpis["remaining_pct"]), remaining_status(kpis["remaining_pct"])),
    ]
    for start in range(0, len(cards), 4):
        for column, (label, value, status) in zip(st.columns(4), cards[start:start + 4]):
            dot = _STATUS_DOT.get(status, "")
            column.metric(f"{dot} {label}".strip(), value)


def _gauges(kpis: dict) -> None:
    """The same six gauges the Daily Dashboard shows, built from the same
    config/kpi_thresholds.py bands (read at call time, so an admin's runtime
    override applies here on the next rerun with no restart). gauge_chart --
    Plotly's Indicator -- rather than gauge_spec, which only the React
    GlossyGauge component knows how to draw."""
    specs = [
        ("atv", "ATV (Average Transaction Value)", kpis["atv"], f"{CURRENCY_SYMBOL} ", "", None, False),
        ("rpv", "RPV (Revenue Per Visitor)", kpis["rpv"], f"{CURRENCY_SYMBOL} ", "", None, False),
        ("basket_size", "Basket Size", kpis["basket_size"], "", "", None, False),
        ("conversion", "Conversion %", kpis["conversion_pct"], "", "%", 40.0, False),
        ("achievement", "Target Achievement %", kpis["achievement_pct"], "", "%", 100.0, False),
        ("achievement", "Remaining %", kpis["remaining_pct"], "", "%", 0.0, True),
    ]
    for start in range(0, len(specs), 3):
        for column, (key, title, value, prefix, suffix, target, reverse) in zip(st.columns(3), specs[start:start + 3]):
            band = get_thresholds(key)
            green = band.get("green_at_or_above", band.get("green_above"))
            red_below, green_at = band["red_below"], green
            if reverse:
                # Remaining % is exactly 100 - Achievement %, so its bands are
                # the achievement band mirrored around 100 -- never a
                # separately-defined business rule. Same derivation as
                # charts.remaining_pct_gauge.
                red_below, green_at = 100 - band["red_below"], 100 - band["green_above"]
            figure = charts.gauge_chart(
                # 0.0 rather than None so the needle parks at the start
                # instead of rendering the "N/A" placeholder, matching the
                # *_or_zero cards above.
                0.0 if value is None else value,
                title, target, red_below, green_at,
                suffix=suffix, prefix=prefix, reverse=reverse,
            )
            column.plotly_chart(themed_figure(figure), use_container_width=True, theme=None)


def _context_panel(target_date: date) -> None:
    weather = daily_context.get_weather(target_date)
    if weather is None:
        weather_line = "unavailable"
    else:
        bits = [weather.condition]
        if weather.temp_max_c is not None:
            bits.append(f"{weather.temp_max_c:.0f}°C / {(weather.temp_min_c or weather.temp_max_c):.0f}°C")
        if weather.precipitation_mm:
            bits.append(f"{weather.precipitation_mm:.0f}mm rain")
        weather_line = ", ".join(bits)
    columns = st.columns(4)
    columns[0].metric("Weather (Kolkata)", weather_line)
    columns[1].metric("Day type", daily_context.day_type(target_date))
    columns[2].metric("Holiday", daily_context.get_holiday_name(target_date) or "none")
    columns[3].metric("Election", daily_context.get_election_info(target_date) or "none")


def _logged_entries(db, store: str, target_date: date) -> None:
    """Bills, Footfall and NOB are three independent logs -- shown as three
    tables rather than the React app's merged Bills+NOB view, because a plain
    st.dataframe has no per-row action column to justify interleaving them."""
    bills = daily_dashboard_store.list_bill_entries(db, store, target_date)
    footfall = daily_dashboard_store.list_footfall_entries(db, store, target_date)
    nob = daily_dashboard_store.list_nob_entries(db, store, target_date)
    for heading, rows, empty in [
        ("Logged Bills", bills, "No bills logged for this date."),
        ("Logged Footfall", footfall, "No footfall entries logged for this date."),
        ("Logged NOB", nob, "No NOB entries logged for this date."),
    ]:
        st.subheader(heading)
        if rows:
            st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
        else:
            st.caption(empty)


def _timeslot_table(breakdown: dict[str, dict[str, float]]) -> pd.DataFrame:
    return pd.DataFrame(
        [{"Time Slot": slot, **{k.replace("_", " ").title(): v for k, v in breakdown[slot].items()}}
         for slot in TIME_SLOT_ORDER]
    )


def main() -> None:
    theme_selector()
    auth = st.session_state.get("auth")
    if auth is None:
        _login_form()
        return

    stores = _visible_stores(auth)
    if not stores:
        st.error("This account has no store assigned; contact the administrator.")
        return

    with st.sidebar:
        st.markdown(f"**{auth['username']}**")
        st.caption("Administrator" if auth["role"] == "admin" else f"Manager · {auth['store_code']}")
        store = st.selectbox("Store", options=stores, format_func=lambda c: STORE_CODE_TO_NAME[c])
        target_date = st.date_input("Date", value=date.today())
        if st.button("Sign out"):
            del st.session_state["auth"]
            st.rerun()

    st.title(STORE_CODE_TO_NAME[store])
    st.caption(f"Live figures for {target_date.strftime('%d-%m-%Y')} — read-only; log entries in the dashboard.")

    try:
        with session_scope() as db:
            kpis = daily_dashboard_store.compute_live_kpis(db, store, target_date)
            breakdown = daily_dashboard_store.compute_live_timeslot_breakdown(db, store, target_date)
            day_target = daily_dashboard_store.read_store_target(db, store, target_date)
            _kpi_row(kpis)
            if kpis.get("reason"):
                st.info(f"**Remarks:** {kpis['reason']}")

            st.header("Today's Context")
            _context_panel(target_date)

            st.header("Performance by Time Slot")
            left, right = st.columns(2)
            left.plotly_chart(
                themed_figure(charts.daily_timeslot_breakdown_chart(breakdown, day_target)),
                use_container_width=True, theme=None,
            )
            right.plotly_chart(
                themed_figure(charts.daily_footfall_vs_nob_chart(breakdown)),
                use_container_width=True, theme=None,
            )
            st.dataframe(_timeslot_table(breakdown), use_container_width=True, hide_index=True)

            st.header("KPI Gauges")
            _gauges(kpis)

            st.header("Logged Entries")
            _logged_entries(db, store, target_date)
    except RuntimeError as error:
        st.error(str(error))


main()
