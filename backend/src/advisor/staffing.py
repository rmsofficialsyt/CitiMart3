"""Staffing vs traffic (Advisor Tier 2): staff on the floor per time slot
from ``staff_attendance`` against that slot's footfall.

Footfall per slot is the actual log for slots that have started and this
store's own same-weekday median for slots still ahead (labelled
``expected``, never mixed silently). Staff on the floor comes from each
present record's check-in / check-out; a present record with no usable
times counts for every slot and the block says ``times_known: false``.
"""
from __future__ import annotations

import statistics
from datetime import date, time

from pymongo.database import Database

from config.settings import TIME_SLOT_ORDER, _TIME_SLOT_BANDS
from db.models import STAFF_ATTENDANCE, STAFF_MEMBERS
from src.advisor.history import median_or_none, prior_same_weekdays, slot_facts
from src.kpi_engine import safe_divide

PRESENT_STATUSES = ("PRESENT", "HALF_DAY")
BASELINE_WEEKS = 4
# A slot whose footfall-per-staff is this multiple of the day's median slot
# load is an understaffed peak.
LOAD_RATIO = 1.5
MIN_SLOT_FOOTFALL = 15


def _minutes(value: str | None) -> int | None:
    if not value:
        return None
    try:
        t = time.fromisoformat(str(value).strip()[:5])
    except ValueError:
        return None
    return t.hour * 60 + t.minute


def _on_floor(records: list[dict]) -> tuple[list[int], bool]:
    """Staff present per slot (TIME_SLOT_ORDER order), and whether every
    present record had a usable check-in time."""
    counts = [0] * len(TIME_SLOT_ORDER)
    times_known = True
    for r in records:
        start, end = _minutes(r.get("check_in_time")), _minutes(r.get("check_out_time"))
        if start is None:
            times_known = False
        for i, (_, s_start, s_end) in enumerate(_TIME_SLOT_BANDS):
            arrives = start if start is not None else 0
            leaves = end if end is not None and (start is None or end > start) else 24 * 60
            if arrives < s_end and leaves > s_start:
                counts[i] += 1
    return counts, times_known


def staffing_signals(db: Database, store: str, target_date: date, minutes: int) -> tuple[dict, list[dict]]:
    active = db[STAFF_MEMBERS].count_documents({"store_code": store, "status": "ACTIVE"})
    records = list(db[STAFF_ATTENDANCE].find({"store_code": store, "date": target_date.isoformat()}))
    present = [r for r in records if r.get("status") in PRESENT_STATUSES]
    block: dict = {"available": False, "active_staff": active, "logged": len(records), "present": len(present),
                   "times_known": None, "slots": []}
    insights: list[dict] = []

    if active and not records and 0 < minutes < 24 * 60:
        insights.append({"id": "attendance_missing", "severity": "info", "kpi": None,
                         "evidence": {"active_staff": active}})
    if not present:
        return block, insights

    counts, times_known = _on_floor(present)
    today = slot_facts(db, store, target_date, target_date).get(target_date.isoformat())
    dates = prior_same_weekdays(target_date, BASELINE_WEEKS)
    history = slot_facts(db, store, min(dates), max(dates))
    rows = []
    for i, (slot, s_start, _) in enumerate(_TIME_SLOT_BANDS):
        started = minutes > s_start
        if started:
            footfall, source = (today[slot]["footfall"] if today else 0.0), "actual"
        else:
            footfall = median_or_none([history[d.isoformat()][slot]["footfall"] for d in dates if d.isoformat() in history])
            source = "expected"
        rows.append({
            "slot": slot, "staff": counts[i], "footfall": footfall, "footfall_source": source,
            "footfall_per_staff": safe_divide(footfall, counts[i]) if footfall is not None else None,
            "upcoming": not started or minutes < _TIME_SLOT_BANDS[i][2],
        })
    block.update({"available": True, "times_known": times_known, "slots": rows})

    loads = [r["footfall_per_staff"] for r in rows if r["footfall_per_staff"] is not None and r["footfall"]]
    if len(loads) >= 2:
        median_load = statistics.median(loads)
        peak = max((r for r in rows if r["footfall_per_staff"] is not None), key=lambda r: r["footfall_per_staff"])
        if (median_load and peak["footfall"] >= MIN_SLOT_FOOTFALL
                and peak["footfall_per_staff"] >= median_load * LOAD_RATIO):
            insights.append({
                "id": "understaffed_peak", "severity": "urgent" if peak["upcoming"] else "info", "kpi": "conversion_pct",
                "evidence": {"slot": peak["slot"], "footfall_per_staff": peak["footfall_per_staff"],
                             "median_footfall_per_staff": median_load, "staff": peak["staff"],
                             "footfall": peak["footfall"], "footfall_source": peak["footfall_source"]},
            })
        ahead = [r for r in rows if r["upcoming"] and r["footfall"] is not None]
        if len(ahead) >= 2:
            quiet = min(ahead, key=lambda r: r["footfall"])
            if quiet is not peak:
                insights.append({"id": "break_window", "severity": "info", "kpi": None,
                                 "evidence": {"slot": quiet["slot"], "footfall": quiet["footfall"],
                                              "footfall_source": quiet["footfall_source"]}})
    return block, insights
