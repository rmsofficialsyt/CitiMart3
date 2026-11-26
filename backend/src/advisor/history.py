"""Per-day, per-slot facts from the three live logs, for the Advisor's
baselines (anomalies, outcome tracking, driver attribution, re-planning).

One aggregation per log over a whole date range, instead of one
``compute_live_timeslot_breakdown`` call per day -- the baselines look back
4-8 weeks and would otherwise cost ~3 queries per past day.
"""
from __future__ import annotations

import statistics
from datetime import date, timedelta

from pymongo.database import Database

from config.settings import TIME_SLOT_ORDER
from db.models import BILLS, FOOTFALL, NOB

FIELDS = ("net_sales", "bills", "bill_quantity", "footfall", "nob")


def _blank_day() -> dict[str, dict[str, float]]:
    return {slot: {f: 0.0 for f in FIELDS} for slot in TIME_SLOT_ORDER}


def slot_facts(db: Database, store: str, start: date, end: date) -> dict[str, dict[str, dict[str, float]]]:
    """{iso_date: {slot: {net_sales, bills, bill_quantity, footfall, nob}}}
    for every date in [start, end] that has at least one entry in any log.
    ``bills`` is the number of bill-log rows; ``nob`` is the NOB log's sum
    (the two are separate logs and are never derived from each other)."""
    match = {"store_code": store, "entry_date": {"$gte": start.isoformat(), "$lte": end.isoformat()}}
    days: dict[str, dict[str, dict[str, float]]] = {}

    def put(doc: dict, values: dict[str, float]) -> None:
        slot = doc["_id"].get("s")
        if slot not in TIME_SLOT_ORDER:
            return
        cell = days.setdefault(doc["_id"]["d"], _blank_day())[slot]
        for k, v in values.items():
            cell[k] += float(v or 0.0)

    group_id = {"d": "$entry_date", "s": "$time_slot"}
    for doc in db[BILLS].aggregate([
        {"$match": match},
        {"$group": {"_id": group_id, "net": {"$sum": "$net_amount"}, "qty": {"$sum": "$bill_quantity"}, "n": {"$sum": 1}}},
    ]):
        put(doc, {"net_sales": doc.get("net"), "bill_quantity": doc.get("qty"), "bills": doc.get("n")})
    for doc in db[FOOTFALL].aggregate([{"$match": match}, {"$group": {"_id": group_id, "v": {"$sum": "$footfall"}}}]):
        put(doc, {"footfall": doc.get("v")})
    for doc in db[NOB].aggregate([{"$match": match}, {"$group": {"_id": group_id, "v": {"$sum": "$nob"}}}]):
        put(doc, {"nob": doc.get("v")})
    return days


def day_totals(day: dict[str, dict[str, float]]) -> dict[str, float]:
    return {f: sum(day[s][f] for s in TIME_SLOT_ORDER) for f in FIELDS}


def prior_same_weekdays(target_date: date, weeks: int) -> list[date]:
    return [target_date - timedelta(weeks=w) for w in range(1, weeks + 1)]


def median_or_none(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def mean_or_none(values: list[float]) -> float | None:
    return statistics.fmean(values) if values else None
