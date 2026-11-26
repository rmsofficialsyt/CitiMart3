"""A store's own intraday sales curve, learned from its past bill log.

Replaces the old hardcoded "expected achievement by time slot" table
(20/40/55/75/90/95%) the frontend used to invent. For each past day we take
the cumulative share of that day's net sales reached by the end of each
TIME_SLOT_ORDER band, then take the median across days. Same-weekday history
is preferred (a Saturday shapes differently from a Tuesday); with too little of
it we fall back to every recent day, and with too little of *that* we return
``available: False`` -- never a fabricated curve.
"""
from __future__ import annotations

import statistics
from datetime import date, timedelta

from pymongo.database import Database

# Private in config/settings.py, but it *is* the slot definition; importing it
# keeps this module from growing a second, drifting copy of the band minutes.
from config.settings import TIME_SLOT_ORDER, _TIME_SLOT_BANDS
from db.models import BILLS
from src import daily_context
from src.advisor import context as advisor_context

LOOKBACK_DAYS = 56          # 8 weeks -> up to 8 same-weekday samples
MIN_SAME_WEEKDAY_DAYS = 3
MIN_ANY_DAYS = 5
# Similar-context days (rainy Saturdays, holidays) are rarer; two is enough
# to prefer them over the plain same-weekday curve.
MIN_SIMILAR_DAYS = 2


def _daily_slot_sales(db: Database, store: str, start: date, end: date) -> dict[str, list[float]]:
    """{iso_date: [net sales per slot, in TIME_SLOT_ORDER]} for days with sales."""
    pipe = [
        {"$match": {"store_code": store, "entry_date": {"$gte": start.isoformat(), "$lte": end.isoformat()}}},
        {"$group": {"_id": {"d": "$entry_date", "s": "$time_slot"}, "net": {"$sum": "$net_amount"}}},
    ]
    days: dict[str, list[float]] = {}
    for doc in db[BILLS].aggregate(pipe):
        slot = doc["_id"].get("s")
        if slot not in TIME_SLOT_ORDER:
            continue
        row = days.setdefault(doc["_id"]["d"], [0.0] * len(TIME_SLOT_ORDER))
        row[TIME_SLOT_ORDER.index(slot)] += float(doc.get("net") or 0.0)
    return {d: v for d, v in days.items() if sum(v) > 0}


def _context_sample(history: dict[str, list[float]], target_date: date) -> tuple[list[list[float]] | None, dict]:
    """Same-weekday days that share the target day's context (holiday / rain).

    A rainy Saturday is compared with rainy Saturdays, a holiday with
    holidays. On an ordinary day, holidays are dropped from the sample when
    enough ordinary same-weekdays remain. Returns (sample or None, context)."""
    same = {d: v for d, v in history.items() if date.fromisoformat(d).weekday() == target_date.weekday()}
    is_holiday = daily_context.get_holiday_name(target_date) is not None
    is_rainy = advisor_context.rainy(target_date) if same else None
    ctx = {"holiday": is_holiday, "rainy": is_rainy, "matched_on": []}

    if is_holiday or is_rainy:
        matched_on = (["holiday"] if is_holiday else []) + (["rain"] if is_rainy else [])
        similar = [
            v for d, v in same.items()
            if (not is_holiday or daily_context.get_holiday_name(date.fromisoformat(d)) is not None)
            and (not is_rainy or advisor_context.rainy(date.fromisoformat(d)) is True)
        ]
        if len(similar) >= MIN_SIMILAR_DAYS:
            return similar, {**ctx, "matched_on": matched_on}
        return None, ctx

    ordinary = [v for d, v in same.items() if daily_context.get_holiday_name(date.fromisoformat(d)) is None]
    if len(ordinary) >= MIN_SAME_WEEKDAY_DAYS and len(ordinary) < len(same):
        return ordinary, {**ctx, "matched_on": ["no_holiday"]}
    return None, ctx


def learn_pacing_curve(db: Database, store: str, target_date: date) -> dict:
    end = target_date - timedelta(days=1)
    history = _daily_slot_sales(db, store, target_date - timedelta(days=LOOKBACK_DAYS), end)

    similar, ctx = _context_sample(history, target_date)
    same = [v for d, v in history.items() if date.fromisoformat(d).weekday() == target_date.weekday()]
    if similar is not None:
        sample, source = similar, "similar_days"
    elif len(same) >= MIN_SAME_WEEKDAY_DAYS:
        sample, source = same, "same_weekday"
    elif len(history) >= MIN_ANY_DAYS:
        sample, source = list(history.values()), "all_days"
    else:
        return {"available": False, "source": None, "days_used": len(history), "cumulative_share": None, "context": ctx}

    cumulative: list[list[float]] = []
    for slots in sample:
        total, running, row = sum(slots), 0.0, []
        for value in slots:
            running += value
            row.append(running / total)
        cumulative.append(row)
    curve = [statistics.median(col) for col in zip(*cumulative)]
    return {"available": True, "source": source, "days_used": len(sample), "cumulative_share": curve, "context": ctx}


def expected_share_at(curve: list[float], minutes: int) -> float:
    """Expected share of the day's sales done by ``minutes`` after midnight,
    linearly interpolated inside the current slot."""
    previous = 0.0
    for (_, start, end), share in zip(_TIME_SLOT_BANDS, curve):
        if minutes < start:
            return previous
        if minutes < end:
            return previous + (share - previous) * (minutes - start) / (end - start)
        previous = share
    return 1.0
