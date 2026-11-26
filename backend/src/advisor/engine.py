"""Builds the Advisor payload for one store + day.

Everything here is deterministic and carries the evidence numbers it used:
the frontend picks localized wording by insight ``id`` and the Co-Pilot can
quote the same numbers, so the panel and the chat never disagree.

Rules:
- KPI bands come only from ``config.kpi_thresholds`` (the ``*_status``
  functions / ``get_thresholds``) -- no inline cutoffs.
- Ratios come only from ``safe_divide``; missing history or a missing target
  yields ``None`` / an ``insufficient`` flag, never a guessed number.
"""
from __future__ import annotations

import math
from datetime import date, datetime
from zoneinfo import ZoneInfo

from pymongo.database import Database

from config import kpi_thresholds as th
from config.settings import TIME_SLOT_ORDER, _TIME_SLOT_BANDS, time_slot_for_time
from src import daily_dashboard_store
from src.advisor import actions as advisor_actions
from src.advisor import anomalies, outcomes, staffing, stock_signals
from src.advisor.pacing import expected_share_at, learn_pacing_curve
from src.kpi_engine import safe_divide

IST = ZoneInfo("Asia/Kolkata")

# Pace tolerance (percentage points of target) before the Advisor calls a day
# behind / ahead of the store's own learned curve.
PACE_BEHIND_PP = 10.0
PACE_AHEAD_PP = 15.0
# Below this share of a normal day's sales, a straight-line projection is noise.
MIN_SHARE_TO_PROJECT = 0.10
# Closing sprint starts at 21:30 -- the last stretch of the final slot.
CLOSING_SPRINT_MIN = 21 * 60 + 30
# Minimum volume before a ratio KPI is worth advising on (sample-size guards,
# not KPI bands -- the bands themselves come from config.kpi_thresholds).
MIN_FOOTFALL_FOR_CONVERSION = 20
MIN_NOB_FOR_BASKET_ADVICE = 5

_SEVERITY_ORDER = {"urgent": 0, "opportunity": 1, "info": 2, "success": 3}
INSIGHT_IDS = (
    "no_target", "closing_gap", "pace_behind", "pace_ahead",
    "conversion_low", "atv_low", "basket_low", "data_gap", "balanced",
    # Tier 2 (anomalies / bill mix / staffing / stock)
    "conversion_leak", "atv_drop", "dead_hours", "mix_small_heavy", "mix_large_heavy", "big_bill",
    "understaffed_peak", "break_window", "attendance_missing",
    "stock_out", "stock_low", "slow_movers", "transfer_suggested",
)
# Insights that are a status, not something to do -- never a checklist item.
NON_ACTION_IDS = frozenset({"balanced", "no_target"})
ACTION_KEYS = frozenset(advisor_actions.FLOOR_TASKS) | (frozenset(INSIGHT_IDS) - NON_ACTION_IDS)


def ist_now() -> datetime:
    return datetime.now(IST)


def _minutes_into_day(target_date: date, now: datetime) -> int:
    """How far through ``target_date``'s trading day we are: the clock for
    today, the full day for a past date, zero for a future one."""
    today = now.date()
    if target_date < today:
        return 24 * 60
    if target_date > today:
        return 0
    return now.hour * 60 + now.minute


def _band_insight(insight_id: str, kpi: str, value, status: str, evidence: dict) -> dict | None:
    if value is None or status == th.STATUS_GREEN:
        return None
    severity = "urgent" if status == th.STATUS_RED else "opportunity"
    return {"id": insight_id, "severity": severity, "kpi": kpi, "evidence": {"value": value, "status": status, **evidence}}


def day_projection(db: Database, store: str, target_date: date, now: datetime | None = None) -> dict:
    """Live KPIs + learned pace + projected close for one store-day. Shared by
    ``build_advice`` and the what-if simulator so both project identically."""
    now = now or ist_now()
    kpis = daily_dashboard_store.compute_live_kpis(db, store, target_date)
    minutes = _minutes_into_day(target_date, now)
    curve = learn_pacing_curve(db, store, target_date)
    share = expected_share_at(curve["cumulative_share"], minutes) if curve["available"] else None
    if minutes >= 24 * 60:
        share = 1.0  # a finished day is fully "in", curve or not
    net_sales = kpis.get("net_sales") or 0.0
    projected_close = safe_divide(net_sales, share) if share is not None and share >= MIN_SHARE_TO_PROJECT else None
    day_open = 0 < minutes < 24 * 60
    return {
        "now": now, "kpis": kpis, "minutes": minutes, "curve": curve, "share": share,
        "projected_close": projected_close, "day_open": day_open,
        "day_status": "open" if day_open else ("closed" if minutes >= 24 * 60 else "not_started"),
    }


def _rank_checklist(checklist: list[dict], outcomes: dict[str, dict]) -> list[dict]:
    """Actions with enough scored trials float up by win rate; the rest keep
    their order. An untested action is never ranked below a losing one by
    accident -- only *ranked* (enough trials) items move."""
    for item in checklist:
        item["outcome"] = outcomes.get(item["action_key"])
    ranked = sorted((c for c in checklist if c["outcome"] and c["outcome"]["ranked"]),
                    key=lambda c: -c["outcome"]["win_rate_pct"])
    return ranked + [c for c in checklist if not (c["outcome"] and c["outcome"]["ranked"])]


def build_advice(db: Database, store: str, target_date: date, now: datetime | None = None) -> dict:
    p = day_projection(db, store, target_date, now)
    now, kpis, minutes, curve, share = p["now"], p["kpis"], p["minutes"], p["curve"], p["share"]
    day_open = p["day_open"]

    net_sales = kpis.get("net_sales") or 0.0
    target = kpis.get("sales_target")
    ach = kpis.get("achievement_pct")
    atv = kpis.get("atv")
    nob = kpis.get("nob") or 0.0
    footfall = kpis.get("footfall") or 0.0

    expected_ach = share * 100 if share is not None and target else None
    projected_close = p["projected_close"]
    projected_ach_ratio = safe_divide(projected_close, target)
    remaining = max(0.0, target - net_sales) if target else None
    bills_needed_ratio = safe_divide(remaining, atv) if remaining is not None else None
    bills_needed = math.ceil(bills_needed_ratio) if bills_needed_ratio is not None else None

    current_slot = time_slot_for_time(now.time()) if day_open and target_date == now.date() else None

    insights: list[dict] = []

    # 1. Target pace (only meaningful while the day is still trading).
    if not target:
        insights.append({"id": "no_target", "severity": "info", "kpi": "achievement_pct", "evidence": {}})
    elif day_open and ach is not None:
        if minutes >= CLOSING_SPRINT_MIN and ach < 100:
            insights.append({
                "id": "closing_gap", "severity": "urgent", "kpi": "remaining",
                "evidence": {"remaining": remaining, "bills_needed": bills_needed, "achievement_pct": ach},
            })
        elif expected_ach is not None and ach < expected_ach - PACE_BEHIND_PP:
            insights.append({
                "id": "pace_behind", "severity": "urgent", "kpi": "achievement_pct",
                "evidence": {"achievement_pct": ach, "expected_pct": expected_ach, "slot": current_slot,
                             "projected_close": projected_close, "bills_needed": bills_needed},
            })
        elif expected_ach is not None and ach >= expected_ach + PACE_AHEAD_PP:
            insights.append({
                "id": "pace_ahead", "severity": "success", "kpi": "achievement_pct",
                "evidence": {"achievement_pct": ach, "expected_pct": expected_ach, "projected_close": projected_close},
            })

    # 2. KPI bands -- same red/yellow/green call as the KPI cards.
    if footfall >= MIN_FOOTFALL_FOR_CONVERSION:
        conv = kpis.get("conversion_pct")
        band = th.get_thresholds("conversion")
        ins = _band_insight("conversion_low", "conversion_pct", conv, th.conversion_status(conv),
                            {"footfall": footfall, "green_at": band["green_at_or_above"]})
        if ins:
            insights.append(ins)
    if nob >= MIN_NOB_FOR_BASKET_ADVICE:
        band = th.get_thresholds("atv")
        uplift = (band["green_at_or_above"] - atv) * nob if atv is not None else None
        ins = _band_insight("atv_low", "atv", atv, th.atv_status(atv),
                            {"nob": nob, "green_at": band["green_at_or_above"], "uplift_if_green": uplift})
        if ins:
            insights.append(ins)
        basket = kpis.get("basket_size")
        band = th.get_thresholds("basket_size")
        ins = _band_insight("basket_low", "basket_size", basket, th.basket_size_status(basket),
                            {"green_at": band["green_at_or_above"]})
        if ins:
            insights.append(ins)

    # 3. Data-entry gaps: a finished slot today with footfall but no bills
    #    logged is far more often a missed entry than a zero-sales slot.
    if day_open:
        breakdown = daily_dashboard_store.compute_live_timeslot_breakdown(db, store, target_date)
        missing = [
            label for (label, _start, end) in _TIME_SLOT_BANDS
            if end <= minutes and breakdown[label]["footfall"] > 0 and breakdown[label]["net_sales"] == 0
        ]
        if missing:
            insights.append({"id": "data_gap", "severity": "info", "kpi": "net_sales", "evidence": {"slots": missing}})
        dead = anomalies.dead_hours(db, store, target_date, minutes)
        if dead:
            insights.append(dead)

    # 4. Tier 2 signals from data already logged.
    if minutes > 0:
        insights += anomalies.slot_anomalies(db, store, target_date, minutes)
    mix_block, mix_insights = anomalies.bill_mix(db, store, target_date, expected_ach if day_open else None, target)
    insights += mix_insights
    staff_block, staff_insights = staffing.staffing_signals(db, store, target_date, minutes)
    insights += staff_insights
    is_today = target_date == now.date()
    if is_today:
        stock_block, stock_insights = stock_signals.stock_signals(db, store)
        insights += stock_insights
    else:
        stock_block = {"available": False, "reason": "snapshot_is_today_only"}

    if not insights or all(i["id"] == "no_target" for i in insights):
        insights.append({
            "id": "balanced", "severity": "success", "kpi": None,
            "evidence": {"net_sales": net_sales, "footfall": footfall, "conversion_pct": kpis.get("conversion_pct")},
        })
    insights.sort(key=lambda i: _SEVERITY_ORDER[i["severity"]])

    done = advisor_actions.list_actions(db, store, target_date)
    action_keys = list(advisor_actions.FLOOR_TASKS) + [i["id"] for i in insights if i["id"] not in NON_ACTION_IDS]
    checklist = [{"action_key": k, **done.get(k, {"done": False, "done_by": None, "done_at": None})} for k in action_keys]
    outcome = outcomes.outcome_stats(db, store, now.date(), now)
    checklist = _rank_checklist(checklist, outcome)

    return {
        "store": store,
        "date": target_date.isoformat(),
        "as_of": now.isoformat(timespec="minutes"),
        "day_status": p["day_status"],
        "current_slot": current_slot,
        "pacing": {
            "available": curve["available"],
            "source": curve["source"],
            "days_used": curve["days_used"],
            "slots": TIME_SLOT_ORDER,
            "cumulative_share": curve["cumulative_share"],
            "expected_share_now": share,
            "expected_achievement_pct": expected_ach,
            "context": curve.get("context"),
        },
        "bill_mix": mix_block,
        "staffing": staff_block,
        "stock": stock_block,
        "outcomes": outcome,
        "projection": {
            "projected_close": projected_close,
            "projected_achievement_pct": projected_ach_ratio * 100 if projected_ach_ratio is not None else None,
            "remaining_to_target": remaining,
            "bills_needed_at_current_atv": bills_needed,
        },
        "kpis": {k: kpis.get(k) for k in ("net_sales", "sales_target", "achievement_pct", "footfall", "nob",
                                          "conversion_pct", "atv", "basket_size")},
        "insights": insights,
        "checklist": checklist,
    }
