"""Target re-planning for the rest of a month (Advisor Tier 3).

Recommends -- never writes -- daily targets for the month's remaining days so
that the month still lands on the sum of the admin's own daily targets:

    still needed = Σ month's set targets − actual sales on days already closed

spread over the remaining days in proportion to this store's learned
weekday weight (mean daily sales per weekday over the last 8 weeks). With
too little history the split is equal and says so (``weighting: "equal"``).
The admin applies it through the Sales Target grid's own Save, which goes
through ``set_store_target`` and its audit trail like any typed value.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta

from pymongo.database import Database

from db.models import BILLS, TARGETS
from src.advisor.history import mean_or_none

WEIGHT_LOOKBACK_DAYS = 56
MIN_WEIGHT_DAYS = 5
ROUND_TO = 10  # ₹


def month_days(month_start: date) -> list[date]:
    _, n = calendar.monthrange(month_start.year, month_start.month)
    return [month_start.replace(day=i) for i in range(1, n + 1)]


def daily_sales(db: Database, store: str, start: date, end: date) -> dict[str, float]:
    pipe = [
        {"$match": {"store_code": store, "entry_date": {"$gte": start.isoformat(), "$lte": end.isoformat()}}},
        {"$group": {"_id": "$entry_date", "net": {"$sum": "$net_amount"}}},
    ]
    return {d["_id"]: float(d.get("net") or 0.0) for d in db[BILLS].aggregate(pipe)}


def weekday_weights(db: Database, store: str, before: date) -> tuple[dict[int, float] | None, int]:
    """Mean daily sales per weekday (0=Mon) from the last 8 weeks before
    ``before``; ``None`` when there is too little history or a weekday has
    no sample."""
    sales = {d: v for d, v in daily_sales(db, store, before - timedelta(days=WEIGHT_LOOKBACK_DAYS),
                                          before - timedelta(days=1)).items() if v > 0}
    if len(sales) < MIN_WEIGHT_DAYS:
        return None, len(sales)
    by_wd: dict[int, list[float]] = {}
    for d, v in sales.items():
        by_wd.setdefault(date.fromisoformat(d).weekday(), []).append(v)
    if len(by_wd) < 7:
        return None, len(sales)
    return {wd: mean_or_none(v) for wd, v in by_wd.items()}, len(sales)


def build_replan(db: Database, store: str, month_start: date, today: date) -> dict:
    days = month_days(month_start)
    first, last = days[0], days[-1]
    targets = {
        d["entry_date"]: float(d["sales_target"])
        for d in db[TARGETS].find({"store_code": store, "entry_date": {"$gte": first.isoformat(), "$lte": last.isoformat()}})
        if d.get("sales_target") is not None
    }
    sales = daily_sales(db, store, first, last)
    base = {"store": store, "month": month_start.strftime("%Y-%m"), "rows": []}

    month_target = sum(targets.values())
    if not month_target:
        return {**base, "available": False, "reason": "no_targets"}
    remaining = [d for d in days if d >= today]
    if not remaining:
        return {**base, "available": False, "reason": "month_over"}

    closed = [d for d in days if d < today]
    actual_closed = sum(sales.get(d.isoformat(), 0.0) for d in closed)
    still_needed = max(0.0, month_target - actual_closed)

    weights, weight_days = weekday_weights(db, store, min(today, last + timedelta(days=1)))
    w = [weights[d.weekday()] if weights else 1.0 for d in remaining]
    total_w = sum(w)
    recommended = [round(still_needed * wi / total_w / ROUND_TO) * ROUND_TO for wi in w]
    # Rounding drift goes on the last day, so the plan sums exactly.
    recommended[-1] = max(0.0, recommended[-1] + (round(still_needed) - sum(recommended)))

    rows = []
    for d, rec in zip(remaining, recommended):
        current = targets.get(d.isoformat())
        rows.append({"date": d.isoformat(), "weekday": d.weekday(), "current_target": current,
                     "recommended_target": float(rec), "delta": (rec - current) if current is not None else None})
    return {
        **base,
        "available": True,
        "weighting": "weekday" if weights else "equal",
        "weight_days": weight_days,
        "month_target": month_target,
        "actual_closed_days": actual_closed,
        "closed_days": len(closed),
        "still_needed": still_needed,
        "remaining_current_targets": sum(targets.get(d.isoformat(), 0.0) for d in remaining),
        "rows": rows,
    }
