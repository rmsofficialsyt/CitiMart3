"""What-if simulator (Advisor Tier 3): conversion +x pp, ATV +₹y,
footfall ±z% -> projected day close and month close.

Sales = Footfall × Conversion × ATV, so the levers scale the *rest of the
day* (projected close − sales so far) and the month's remaining days by

    m = (1 + z/100) × (C + x)/C × (A + y)/A

using today's live conversion C and ATV A. Sales already banked are not
changed. Without a learned pace curve there is no projected close, so the
day half is unavailable (never extrapolated another way); the remaining
days of the month use ``replan.weekday_weights``.
"""
from __future__ import annotations

from datetime import date, datetime

from pymongo.database import Database

from db.models import TARGETS
from src.advisor.engine import day_projection
from src.advisor.replan import daily_sales, month_days, weekday_weights
from src.kpi_engine import safe_divide

LIMITS = {"conversion_pp": (-50.0, 50.0), "atv_delta": (-5000.0, 5000.0), "footfall_pct": (-90.0, 200.0)}


def _pct(value: float | None, target: float | None) -> float | None:
    r = safe_divide(value, target)
    return r * 100 if r is not None else None


def simulate(db: Database, store: str, day: date, conversion_pp: float, atv_delta: float, footfall_pct: float,
             now: datetime | None = None) -> dict:
    p = day_projection(db, store, day, now)
    kpis = p["kpis"]
    levers = {"conversion_pp": conversion_pp, "atv_delta": atv_delta, "footfall_pct": footfall_pct}
    result: dict = {"store": store, "date": day.isoformat(), "levers": levers, "available": p["day_status"] == "open",
                    "day_status": p["day_status"], "multiplier": None, "day": None, "month": None}
    if not result["available"]:
        return result

    conv, atv = kpis.get("conversion_pct"), kpis.get("atv")
    if not conv or not atv:
        result["available"] = False
        result["reason"] = "no_conversion_or_atv"
        return result
    mult = (1 + footfall_pct / 100) * (max(0.0, conv + conversion_pp) / conv) * (max(0.0, atv + atv_delta) / atv)
    result["multiplier"] = mult

    net = kpis.get("net_sales") or 0.0
    target = kpis.get("sales_target")
    base_close = p["projected_close"]
    scenario_close = net + (base_close - net) * mult if base_close is not None else None
    result["day"] = {
        "net_sales": net, "sales_target": target,
        "base_close": base_close, "scenario_close": scenario_close,
        "base_achievement_pct": _pct(base_close, target), "scenario_achievement_pct": _pct(scenario_close, target),
        "reason": None if base_close is not None else "insufficient_history",
    }

    days = month_days(day.replace(day=1))
    targets = [float(d["sales_target"]) for d in db[TARGETS].find(
        {"store_code": store, "entry_date": {"$gte": days[0].isoformat(), "$lte": days[-1].isoformat()}})
        if d.get("sales_target") is not None]
    month_target = sum(targets) if targets else None
    before = sum(v for d, v in daily_sales(db, store, days[0], day).items() if d < day.isoformat())
    future = [d for d in days if d > day]
    weights, _ = weekday_weights(db, store, day)
    if base_close is None or (future and weights is None):
        result["month"] = {"month_target": month_target, "base_close": None, "scenario_close": None,
                           "reason": "insufficient_history"}
        return result
    future_base = sum(weights[d.weekday()] for d in future) if future else 0.0
    month_base = before + base_close + future_base
    month_scn = before + scenario_close + future_base * mult
    result["month"] = {
        "month_target": month_target, "actual_before_today": before, "remaining_days": len(future),
        "base_close": month_base, "scenario_close": month_scn,
        "base_achievement_pct": _pct(month_base, month_target),
        "scenario_achievement_pct": _pct(month_scn, month_target), "reason": None,
    }
    return result
