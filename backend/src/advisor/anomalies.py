"""Slot-level anomaly signals and the bill-size mix (Advisor Tier 2).

Every comparison is against *this store's own* history -- the same time slot
on the last few same weekdays -- never a network-wide or invented norm, and
every signal returns the numbers it compared. Too little history means the
signal is skipped, not guessed.
"""
from __future__ import annotations

from datetime import date, time, timedelta

from pymongo.database import Database

from config.settings import TIME_SLOT_ORDER, _TIME_SLOT_BANDS
from db.models import BILLS
from src.advisor.history import median_or_none, prior_same_weekdays, slot_facts
from src.kpi_engine import safe_divide

BASELINE_WEEKS = 4
MIN_BASELINE_DAYS = 2
# A slot's footfall this far above its own norm while NOB did not rise = a
# conversion leak (people came, bills did not follow).
FOOTFALL_SPIKE_RATIO = 1.3
# Slot ATV at or below this share of its own norm = an ATV drop.
ATV_DROP_RATIO = 0.85
MIN_SLOT_FOOTFALL = 15
MIN_SLOT_NOB_FOR_ATV = 3
# The current slot is compared once at least half of it has elapsed, with
# its norm scaled to the elapsed fraction.
MIN_SLOT_FRACTION = 0.5
# Dead hour: no bills in a finished clock hour that normally has bills on
# at least this many of the baseline days.
DEAD_HOUR_MIN_USUAL_DAYS = 2
FIRST_TRADING_HOUR = 11

# Bill-size bands (₹). Upper bound exclusive; None = open-ended.
BILL_BANDS: tuple[tuple[str, float, float | None], ...] = (
    ("under_500", 0.0, 500.0),
    ("500_1500", 500.0, 1500.0),
    ("over_1500", 1500.0, None),
)
MIX_LOOKBACK_DAYS = 28
MIN_MIX_NORM_BILLS = 30
MIN_MIX_TODAY_BILLS = 5
MIX_SHIFT_PP = 15.0
# One bill carrying this share of the day's sales can hide a weak day.
BIG_BILL_SHARE = 0.25
# ...and is "hiding" one when, without it, the day would be this far behind
# its learned pace (same tolerance as engine.PACE_BEHIND_PP).
BIG_BILL_PACE_PP = 10.0


def _slot_fraction(label: str, minutes: int) -> float:
    for name, start, end in _TIME_SLOT_BANDS:
        if name == label:
            if minutes >= end:
                return 1.0
            if minutes <= start:
                return 0.0
            return (minutes - start) / (end - start)
    return 0.0


def _baselines(db: Database, store: str, target_date: date) -> tuple[dict, int]:
    dates = prior_same_weekdays(target_date, BASELINE_WEEKS)
    facts = slot_facts(db, store, min(dates), max(dates))
    days = [facts[d.isoformat()] for d in dates if d.isoformat() in facts]
    days = [d for d in days if sum(d[s]["net_sales"] for s in TIME_SLOT_ORDER) > 0]
    base: dict[str, dict[str, float | None]] = {}
    for slot in TIME_SLOT_ORDER:
        cells = [d[slot] for d in days]
        base[slot] = {
            "footfall": median_or_none([c["footfall"] for c in cells]),
            "nob": median_or_none([c["nob"] for c in cells]),
            "atv": median_or_none([a for c in cells if (a := safe_divide(c["net_sales"], c["nob"])) is not None]),
            "conversion_pct": median_or_none(
                [r * 100 for c in cells if (r := safe_divide(c["nob"], c["footfall"])) is not None]
            ),
        }
    return base, len(days)


def slot_anomalies(db: Database, store: str, target_date: date, minutes: int) -> list[dict]:
    """``conversion_leak`` and ``atv_drop`` insights for slots that have
    (at least half) elapsed; one insight per type, for the worst slot."""
    base, days_used = _baselines(db, store, target_date)
    if days_used < MIN_BASELINE_DAYS:
        return []
    today = slot_facts(db, store, target_date, target_date).get(target_date.isoformat())
    if not today:
        return []

    leaks, drops = [], []
    for slot in TIME_SLOT_ORDER:
        frac = _slot_fraction(slot, minutes)
        if frac < MIN_SLOT_FRACTION:
            continue
        cell, b = today[slot], base[slot]
        if b["footfall"] and b["nob"] is not None and cell["footfall"] >= MIN_SLOT_FOOTFALL:
            expected_ff = b["footfall"] * frac
            expected_nob = b["nob"] * frac
            if cell["footfall"] >= expected_ff * FOOTFALL_SPIKE_RATIO and cell["nob"] <= expected_nob:
                conv = safe_divide(cell["nob"], cell["footfall"])
                leaks.append({
                    "slot": slot, "footfall": cell["footfall"], "baseline_footfall": expected_ff,
                    "nob": cell["nob"], "baseline_nob": expected_nob,
                    "conversion_pct": conv * 100 if conv is not None else None,
                    "baseline_conversion_pct": b["conversion_pct"],
                    "footfall_lift_pct": (cell["footfall"] / expected_ff - 1) * 100,
                })
        atv = safe_divide(cell["net_sales"], cell["nob"])
        if b["atv"] and atv is not None and cell["nob"] >= MIN_SLOT_NOB_FOR_ATV and atv <= b["atv"] * ATV_DROP_RATIO:
            drops.append({"slot": slot, "atv": atv, "baseline_atv": b["atv"], "drop_pct": (1 - atv / b["atv"]) * 100})

    out = []
    if leaks:
        worst = max(leaks, key=lambda e: e["footfall_lift_pct"])
        out.append({"id": "conversion_leak", "severity": "urgent", "kpi": "conversion_pct",
                    "evidence": {**worst, "baseline_days": days_used}})
    if drops:
        worst = max(drops, key=lambda e: e["drop_pct"])
        out.append({"id": "atv_drop", "severity": "opportunity", "kpi": "atv",
                    "evidence": {**worst, "baseline_days": days_used}})
    return out


def _bill_hours(db: Database, store: str, day: date) -> set[int]:
    hours = set()
    for doc in db[BILLS].find({"store_code": store, "entry_date": day.isoformat()}, {"bill_time": 1}):
        try:
            hours.add(time.fromisoformat(str(doc.get("bill_time"))[:5]).hour)
        except ValueError:
            continue
    return hours


def dead_hours(db: Database, store: str, target_date: date, minutes: int) -> dict | None:
    """Finished clock hours today with no bill logged although this hour
    usually has bills -- a slow hour, or (often) a missed entry."""
    last_full_hour = minutes // 60 - 1
    if last_full_hour < FIRST_TRADING_HOUR:
        return None
    usual: dict[int, int] = {}
    for d in prior_same_weekdays(target_date, BASELINE_WEEKS):
        for h in _bill_hours(db, store, d):
            usual[h] = usual.get(h, 0) + 1
    today = _bill_hours(db, store, target_date)
    dead = [
        h for h in range(FIRST_TRADING_HOUR, last_full_hour + 1)
        if h not in today and usual.get(h, 0) >= DEAD_HOUR_MIN_USUAL_DAYS
    ]
    if not dead:
        return None
    return {"id": "dead_hours", "severity": "info", "kpi": "nob",
            "evidence": {"hours": [f"{h:02d}:00" for h in dead]}}


def _band_of(amount: float) -> str:
    for name, lo, hi in BILL_BANDS:
        if amount >= lo and (hi is None or amount < hi):
            return name
    return BILL_BANDS[0][0]


def _amounts(db: Database, store: str, start: date, end: date) -> list[float]:
    flt = {"store_code": store, "entry_date": {"$gte": start.isoformat(), "$lte": end.isoformat()}}
    return [float(d.get("net_amount") or 0.0) for d in db[BILLS].find(flt, {"net_amount": 1})]


def _shares(amounts: list[float]) -> dict[str, float]:
    counts = {name: 0 for name, _, _ in BILL_BANDS}
    for a in amounts:
        counts[_band_of(a)] += 1
    return {k: v / len(amounts) * 100 for k, v in counts.items()} if amounts else {k: 0.0 for k in counts}


def bill_mix(db: Database, store: str, target_date: date, expected_achievement_pct: float | None,
             sales_target: float | None) -> tuple[dict, list[dict]]:
    """(bill_mix block, insights). The norm is this store's pooled bills over
    the previous ``MIX_LOOKBACK_DAYS`` days."""
    today = _amounts(db, store, target_date, target_date)
    norm = _amounts(db, store, target_date - timedelta(days=MIX_LOOKBACK_DAYS), target_date - timedelta(days=1))
    today_share, norm_share = _shares(today), _shares(norm)
    norm_ok = len(norm) >= MIN_MIX_NORM_BILLS
    block = {
        "available": bool(today),
        "norm_available": norm_ok,
        "today_bills": len(today),
        "norm_bills": len(norm),
        "bands": [
            {"band": name, "today_count": sum(1 for a in today if _band_of(a) == name),
             "today_share_pct": today_share[name], "norm_share_pct": norm_share[name] if norm_ok else None}
            for name, _, _ in BILL_BANDS
        ],
        "largest_bill": max(today) if today else None,
    }
    insights: list[dict] = []
    if len(today) < MIN_MIX_TODAY_BILLS:
        return block, insights

    if norm_ok:
        small, large = BILL_BANDS[0][0], BILL_BANDS[-1][0]
        if today_share[small] >= norm_share[small] + MIX_SHIFT_PP:
            insights.append({"id": "mix_small_heavy", "severity": "opportunity", "kpi": "atv",
                             "evidence": {"today_share_pct": today_share[small], "norm_share_pct": norm_share[small]}})
        elif today_share[large] >= norm_share[large] + MIX_SHIFT_PP:
            insights.append({"id": "mix_large_heavy", "severity": "info", "kpi": "nob",
                             "evidence": {"today_share_pct": today_share[large], "norm_share_pct": norm_share[large]}})

    total = sum(today)
    largest = max(today)
    share = safe_divide(largest, total)
    if share is not None and share >= BIG_BILL_SHARE:
        ex_total = total - largest
        ex_ratio = safe_divide(ex_total, sales_target)
        ex_ach = ex_ratio * 100 if ex_ratio is not None else None
        hides_weak_day = (
            ex_ach is not None and expected_achievement_pct is not None
            and ex_ach < expected_achievement_pct - BIG_BILL_PACE_PP
        )
        block["largest_share_pct"] = share * 100
        insights.append({
            "id": "big_bill", "severity": "urgent" if hides_weak_day else "info", "kpi": "net_sales",
            "evidence": {"largest_bill": largest, "share_pct": share * 100, "net_sales_without": ex_total,
                         "achievement_without_pct": ex_ach, "expected_pct": expected_achievement_pct},
        })
    return block, insights
