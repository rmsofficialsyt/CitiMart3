"""Driver attribution: "why did we miss / beat target?" (Advisor Tier 3).

One explanation per store-day that joins the KPI decomposition
(``drivers``), the day's context, staffing against the store's usual
headcount, slot anomalies and (for today) stock-outs. Each reason carries
its own numbers; reasons are ordered by rupee impact first, then by the
non-monetary signals. Feeds ``GET /api/advisor/explain`` and the Co-Pilot's
``explain_day`` intent, so both give the same answer.
"""
from __future__ import annotations

from datetime import date, datetime

from pymongo.database import Database

from db.models import STAFF_ATTENDANCE, STOCK_INVENTORY
from src.advisor import context as advisor_context
from src.advisor.anomalies import slot_anomalies
from src.advisor.brief import store_review
from src.advisor.engine import _minutes_into_day, ist_now
from src.advisor.history import mean_or_none, prior_same_weekdays
from src.advisor.staffing import PRESENT_STATUSES

BASELINE_WEEKS = 4
# Present headcount this many people below the usual = short-staffed.
SHORT_STAFF_GAP = 1


def _present(db: Database, store: str, day: date) -> int | None:
    docs = list(db[STAFF_ATTENDANCE].find({"store_code": store, "date": day.isoformat()}, {"status": 1}))
    if not docs:
        return None
    return sum(1 for d in docs if d.get("status") in PRESENT_STATUSES)


def explain_day(db: Database, store: str, day: date, now: datetime | None = None) -> dict:
    now = now or ist_now()
    review = store_review(db, store, day)
    tags = advisor_context.day_tags(day)
    minutes = _minutes_into_day(day, now)

    reasons: list[dict] = []
    for d in review["drivers"]:
        if abs(d["amount"]) < 1:
            continue
        direction = "down" if d["amount"] < 0 else "up"
        reasons.append({"id": f"{d['driver']}_{direction}", "impact": d["amount"],
                        "evidence": {"change_pct": d["change_pct"], "current": d["current"], "baseline": d["baseline"]}})

    for a in slot_anomalies(db, store, day, minutes):
        reasons.append({"id": a["id"], "impact": None, "evidence": a["evidence"]})

    present = _present(db, store, day)
    usual = mean_or_none([p for d in prior_same_weekdays(day, BASELINE_WEEKS) if (p := _present(db, store, d)) is not None])
    if present is not None and usual is not None and present <= usual - SHORT_STAFF_GAP:
        reasons.append({"id": "short_staffed", "impact": None, "evidence": {"present": present, "usual": usual}})

    if day == now.date():
        out = db[STOCK_INVENTORY].count_documents({"store_code": store, "current_stock": {"$lte": 0}})
        if out:
            reasons.append({"id": "stock_out", "impact": None, "evidence": {"count": out}})

    for key in ("holiday", "election"):
        if tags[key]:
            reasons.append({"id": key, "impact": None, "evidence": {"label": tags[key]}})
    if tags["rainy"]:
        reasons.append({"id": "rain", "impact": None, "evidence": {}})

    # Reasons that point the same way as the result come first: a miss is
    # explained by what went down, a beat by what went up.
    missed = review["verdict"] == "missed" or (review["delta_vs_baseline"] or 0) < 0
    money = [r for r in reasons if r["impact"] is not None]
    money.sort(key=lambda r: (r["impact"] > 0) if missed else (r["impact"] < 0))
    other = [r for r in reasons if r["impact"] is None]
    return {
        "store": store,
        "date": day.isoformat(),
        "review": review,
        "context": tags,
        "staffing": {"present": present, "usual_present": usual},
        "reasons": money + other,
    }
