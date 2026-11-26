"""Network morning brief / evening debrief (Advisor Tier 3).

Per store: the reviewed day against its target and its own same-weekday
baseline, the top drivers of the gap (``drivers.decompose``), and the
watch-outs for the next trading day. All deterministic; the Co-Pilot only
narrates it.

- morning: reviews yesterday, watch-outs for today
- midday:  reviews today so far against the store's learned pace curve
           (expected achievement by now, projected close); drivers compare the
           completed slots only. Today-only, it is live.
- evening: reviews today, watch-outs for tomorrow
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from pymongo.database import Database

from config import kpi_thresholds as th
from config.settings import STORE_CODE_TO_NAME, _TIME_SLOT_BANDS
from db.models import STAFF_ATTENDANCE, STAFF_MEMBERS, STOCK_INVENTORY, TARGETS
from src import daily_dashboard_store
from src.advisor import context as advisor_context
from src.advisor.drivers import day_baseline, decompose, slots_totals
from src.advisor.engine import PACE_AHEAD_PP, PACE_BEHIND_PP, _minutes_into_day, day_projection, ist_now
from src.advisor.history import slot_facts
from src.kpi_engine import safe_divide

KINDS = ("morning", "midday", "evening")
TOP_DRIVERS = 3


def _completed_slots(minutes: int) -> list[str]:
    return [label for label, _start, end in _TIME_SLOT_BANDS if end <= minutes]


def store_review(db: Database, store: str, day: date, slots: list[str] | None = None) -> dict:
    """Day result vs target and vs the store's usual same weekdays. With
    ``slots`` (the midday brief), the baseline comparison and the drivers use
    only those completed slots -- a half day is never compared with a full one.
    Net sales / target / achievement are always the live day-so-far figures."""
    kpis = daily_dashboard_store.compute_live_kpis(db, store, day)
    baseline = day_baseline(db, store, day, slots=slots)
    if slots is None:
        current = kpis
    else:
        today = slot_facts(db, store, day, day).get(day.isoformat())
        current = slots_totals(today, slots) if today else None
    decomposition = decompose(current, baseline) if current else None
    ach = kpis.get("achievement_pct")
    target = kpis.get("sales_target")
    net = kpis.get("net_sales") or 0.0
    if not (net or kpis.get("footfall") or kpis.get("nob")):
        verdict = "no_data"
    elif not target:
        verdict = "no_target"
    else:
        verdict = "hit" if net >= target else "missed"
    compared_net = net if slots is None else (current or {}).get("net_sales", 0.0)
    vs_base = safe_divide(compared_net - baseline["net_sales"], baseline["net_sales"]) if baseline else None
    return {
        "store": store,
        "store_name": STORE_CODE_TO_NAME.get(store, store),
        "date": day.isoformat(),
        "verdict": verdict,
        "net_sales": net,
        "sales_target": target,
        "achievement_pct": ach,
        "achievement_status": th.achievement_status(ach) if ach is not None else None,
        "gap_to_target": (target - net) if target else None,
        "footfall": kpis.get("footfall"),
        "nob": kpis.get("nob"),
        "conversion_pct": kpis.get("conversion_pct"),
        "atv": kpis.get("atv"),
        "baseline": baseline,
        "vs_baseline_pct": vs_base * 100 if vs_base is not None else None,
        "delta_vs_baseline": decomposition["delta_sales"] if decomposition else None,
        "drivers": decomposition["drivers"][:TOP_DRIVERS] if decomposition else [],
        "slots_compared": slots,
    }


def midday_review(db: Database, store: str, day: date, now: datetime) -> dict:
    """Today so far: pace against the store's learned curve (the same
    ``day_projection`` the Advisor panel uses) and drivers over the slots
    already completed."""
    review = store_review(db, store, day, slots=_completed_slots(_minutes_into_day(day, now)))
    p = day_projection(db, store, day, now)
    target, ach, net = review["sales_target"], review["achievement_pct"], review["net_sales"]
    expected = p["share"] * 100 if p["share"] is not None and target else None
    projected_ratio = safe_divide(p["projected_close"], target)

    if review["verdict"] in ("no_data", "no_target"):
        status = review["verdict"]
    elif net >= target:
        status = "target_hit"
    elif expected is None or ach is None:
        status = "no_pace_curve"
    elif ach < expected - PACE_BEHIND_PP:
        status = "behind"
    elif ach >= expected + PACE_AHEAD_PP:
        status = "ahead"
    else:
        status = "on_pace"
    # Mid-day a store has not "missed" anything yet.
    if review["verdict"] == "missed":
        review["verdict"] = "in_progress"
    review["pace"] = {
        "status": status,
        "expected_achievement_pct": expected,
        "pace_gap_pp": (ach - expected) if expected is not None and ach is not None else None,
        "projected_close": p["projected_close"],
        "projected_achievement_pct": projected_ratio * 100 if projected_ratio is not None else None,
        "curve_days": p["curve"]["days_used"],
    }
    return review


def watch_outs(db: Database, store: str, day: date, today: date) -> list[dict]:
    """Things to plan for on ``day``. Stock and attendance are live
    snapshots, so they are only reported when ``day`` is today."""
    items: list[dict] = []
    target_doc = db[TARGETS].find_one({"store_code": store, "entry_date": day.isoformat()}, {"sales_target": 1})
    if not target_doc or target_doc.get("sales_target") is None:
        items.append({"id": "no_target", "evidence": {"date": day.isoformat()}})
    tags = advisor_context.day_tags(day)
    if tags["holiday"]:
        items.append({"id": "holiday", "evidence": {"name": tags["holiday"]}})
    if tags["election"]:
        items.append({"id": "election", "evidence": {"label": tags["election"]}})
    if tags["rainy"]:
        items.append({"id": "rain", "evidence": {}})
    if tags["day_type"] == "Weekend":
        items.append({"id": "weekend", "evidence": {}})
    if day == today:
        out = db[STOCK_INVENTORY].count_documents({"store_code": store, "current_stock": {"$lte": 0}})
        if out:
            items.append({"id": "stock_out", "evidence": {"count": out}})
        active = db[STAFF_MEMBERS].count_documents({"store_code": store, "status": "ACTIVE"})
        marked = db[STAFF_ATTENDANCE].count_documents({"store_code": store, "date": day.isoformat()})
        if active and not marked:
            items.append({"id": "attendance_missing", "evidence": {"active_staff": active}})
    return items


def build_brief(db: Database, stores: list[str], today: date, kind: str, now: datetime | None = None) -> dict:
    now = now or ist_now()
    if kind == "morning":
        review_day, watch_day = today - timedelta(days=1), today
    elif kind == "midday":
        review_day = watch_day = today  # today so far; watch-outs for the rest of today
    else:
        review_day, watch_day = today, today + timedelta(days=1)
    rows = []
    for store in stores:
        review = midday_review(db, store, today, now) if kind == "midday" else store_review(db, store, review_day)
        review["watch_outs"] = watch_outs(db, store, watch_day, today)
        rows.append(review)
    net = sum(r["net_sales"] or 0.0 for r in rows)
    with_target = [r for r in rows if r["sales_target"]]
    target = sum(r["sales_target"] for r in with_target) if with_target else None
    # Achievement only over stores that have a target, so a store without
    # one never inflates the network figure.
    ach = safe_divide(sum(r["net_sales"] or 0.0 for r in with_target), target)
    network = {"net_sales": net, "sales_target": target, "achievement_pct": ach * 100 if ach is not None else None}
    if kind == "midday":
        # Weakest *against its own pace* first; a store at 40% at 3 PM can be fine.
        rows.sort(key=lambda r: (r["pace"]["pace_gap_pp"] is None,
                                 r["pace"]["pace_gap_pp"] if r["pace"]["pace_gap_pp"] is not None else 0))
        projections = [r["pace"]["projected_close"] for r in with_target]
        # Network projection only when every store with a target has one -- a
        # partial sum would read as a shortfall.
        projected = sum(projections) if with_target and all(p is not None for p in projections) else None
        proj_ratio = safe_divide(projected, target)
        network.update(projected_close=projected,
                       projected_achievement_pct=proj_ratio * 100 if proj_ratio is not None else None)
    else:
        # Weakest first, so the admin reads the store that needs attention first.
        rows.sort(key=lambda r: (r["achievement_pct"] is None, r["achievement_pct"] if r["achievement_pct"] is not None else 0))
    return {
        "kind": kind,
        "review_date": review_day.isoformat(),
        "watch_date": watch_day.isoformat(),
        "as_of": now.isoformat(timespec="minutes") if kind == "midday" else None,
        "network": network,
        "stores": rows,
    }
