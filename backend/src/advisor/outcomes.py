"""Recommendation outcome tracking (Advisor Tier 3): did ticking an action
actually move its KPI?

For every checklist action marked done, the KPI it targets is read in the
*next* time slot after the tick and compared with that same slot's median
on the store's previous same weekdays. A rise is a win (every tracked KPI is
higher-is-better). Per action key: trials, wins, win rate and average lift.

Only completed slots are scored; a tick in the last slot, or one with too
little baseline history, is simply not scored -- never counted as a loss.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from pymongo.database import Database

from config.settings import TIME_SLOT_ORDER, _TIME_SLOT_BANDS
from db.models import ADVISOR_ACTIONS
from src.advisor.history import median_or_none, prior_same_weekdays, slot_facts
from src.kpi_engine import safe_divide

LOOKBACK_DAYS = 60
BASELINE_WEEKS = 4
MIN_BASELINE_DAYS = 2
MIN_TRIALS_TO_RANK = 3

# The KPI each action is meant to move. Floor routines follow their wording
# (task1 add-ons -> ATV, task2 floor attendants -> conversion, task3 trial
# rooms -> basket size, task4 fast checkout -> conversion).
ACTION_KPI: dict[str, str] = {
    "task1": "atv", "task2": "conversion_pct", "task3": "basket_size", "task4": "conversion_pct",
    "pace_behind": "net_sales", "closing_gap": "net_sales",
    "conversion_low": "conversion_pct", "atv_low": "atv", "basket_low": "basket_size",
    "conversion_leak": "conversion_pct", "atv_drop": "atv", "mix_small_heavy": "atv",
    "understaffed_peak": "conversion_pct", "slow_movers": "net_sales",
}


def _kpi(cell: dict | None, kpi: str) -> float | None:
    if not cell:
        return None
    if kpi == "net_sales":
        return cell["net_sales"] or None
    if kpi == "conversion_pct":
        r = safe_divide(cell["nob"], cell["footfall"])
        return r * 100 if r is not None else None
    if kpi == "atv":
        return safe_divide(cell["net_sales"], cell["nob"])
    if kpi == "basket_size":
        return safe_divide(cell["bill_quantity"], cell["nob"])
    return None


def _slot_index(minute: int) -> int:
    """Index of the slot containing ``minute``; -1 before opening."""
    for i, (_, start, end) in enumerate(_TIME_SLOT_BANDS):
        if start <= minute < end:
            return i
    return -1 if minute < _TIME_SLOT_BANDS[0][1] else len(_TIME_SLOT_BANDS)


def score_actions(db: Database, store: str, today: date, now: datetime) -> list[dict]:
    """One scored trial per done action: {action_key, date, slot, kpi, value, baseline, lift_pct, win}."""
    start = today - timedelta(days=LOOKBACK_DAYS)
    docs = list(db[ADVISOR_ACTIONS].find({"store_code": store, "done": True, "entry_date": {"$gte": start.isoformat()}}))
    if not docs:
        return []
    facts = slot_facts(db, store, start - timedelta(weeks=BASELINE_WEEKS), today)
    now_minute = now.hour * 60 + now.minute
    trials = []
    for doc in docs:
        kpi = ACTION_KPI.get(doc.get("action_key"))
        if kpi is None or not doc.get("done_at"):
            continue
        try:
            done_at = datetime.fromisoformat(doc["done_at"]).astimezone(now.tzinfo)
            day = date.fromisoformat(doc["entry_date"])
        except (TypeError, ValueError):
            continue
        if done_at.date() != day:
            continue
        measure = _slot_index(done_at.hour * 60 + done_at.minute) + 1
        if measure >= len(TIME_SLOT_ORDER):
            continue
        slot = TIME_SLOT_ORDER[measure]
        if day == today and now_minute < _TIME_SLOT_BANDS[measure][2]:
            continue  # that slot has not finished yet
        value = _kpi(facts.get(day.isoformat(), {}).get(slot), kpi)
        history = [_kpi(facts.get(d.isoformat(), {}).get(slot), kpi) for d in prior_same_weekdays(day, BASELINE_WEEKS)]
        history = [h for h in history if h is not None]
        baseline = median_or_none(history) if len(history) >= MIN_BASELINE_DAYS else None
        if value is None or not baseline:
            continue
        lift = (value - baseline) / baseline * 100
        trials.append({"action_key": doc["action_key"], "date": day.isoformat(), "slot": slot, "kpi": kpi,
                       "value": value, "baseline": baseline, "lift_pct": lift, "win": lift > 0})
    return trials


def outcome_stats(db: Database, store: str, today: date, now: datetime) -> dict[str, dict]:
    stats: dict[str, dict] = {}
    for t in score_actions(db, store, today, now):
        s = stats.setdefault(t["action_key"], {"kpi": t["kpi"], "trials": 0, "wins": 0, "lifts": []})
        s["trials"] += 1
        s["wins"] += int(t["win"])
        s["lifts"].append(t["lift_pct"])
    return {
        k: {"kpi": s["kpi"], "trials": s["trials"], "wins": s["wins"],
            "win_rate_pct": s["wins"] / s["trials"] * 100, "avg_lift_pct": sum(s["lifts"]) / len(s["lifts"]),
            "ranked": s["trials"] >= MIN_TRIALS_TO_RANK}
        for k, s in stats.items()
    }
