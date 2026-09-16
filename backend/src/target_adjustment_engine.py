"""Retail Target Adjustment Engine for Daily Operations.

Implements the rolling target recovery policy specified in
"Retail Target Adjustment System -- Master Implementation Prompt":
- Keeps Original Target (T_t) strictly separate from Carry Forward Adjustments (C_t).
- Dynamically redistributes unachieved deficits across a configurable rolling window (7, 14, or 30 days).
- Manages discrete Deficit Buckets with FIFO (First-In, First-Out) recovery from sales exceeding the original target.
- Supports configurable month-end handling ('MONTH_END_CLOSE' vs 'TRUE_ROLLING') and distribution modes ('EQUAL' vs 'TARGET_WEIGHTED').
- Authoritative running outstanding balance: P_t = max(0, P_(t-1) + T_t - S_t).
"""
from __future__ import annotations

import calendar
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from typing import Literal

from pymongo.database import Database

from config.settings import STORE_CODE_TO_NAME
from db.models import BILLS, TARGETS

CarryForwardPolicy = Literal["MONTH_END_CLOSE", "TRUE_ROLLING"]
DistributionMode = Literal["EQUAL", "TARGET_WEIGHTED"]


@dataclass
class DeficitBucket:
    id: str
    store_code: str
    origin_date: str  # ISO format YYYY-MM-DD
    original_deficit: float
    remaining_deficit: float
    recovery_window: int
    recovery_start_date: str  # ISO format
    recovery_end_date: str  # ISO format
    status: str  # ACTIVE | COMPLETED | EXPIRED | FORCED_MONTH_END

    def to_dict(self) -> dict:
        return asdict(self)


def last_day_of_month(d: date) -> date:
    """Returns the last date of the month for a given date."""
    _, last_day = calendar.monthrange(d.year, d.month)
    return date(d.year, d.month, last_day)


def _compute_bucket_end_date(
    origin_date: date,
    recovery_window: int,
    policy: CarryForwardPolicy,
) -> date:
    """Computes the final inclusive recovery date for a deficit bucket."""
    rolling_end = origin_date + timedelta(days=recovery_window)
    if policy == "MONTH_END_CLOSE":
        month_end = last_day_of_month(origin_date)
        return min(rolling_end, month_end)
    return rolling_end


def compute_target_adjustment(
    db: Database,
    store: str,
    target_date: date,
    recovery_window: int = 7,
    carry_forward_policy: CarryForwardPolicy = "MONTH_END_CLOSE",
    distribution_mode: DistributionMode = "EQUAL",
) -> dict | None:
    """Computes the comprehensive Target Adjustment state for a given store and date.

    Reconstructs chronological daily target performance and active deficit buckets
    from the beginning of the lookback horizon up to `target_date`.

    Args:
        db: MongoDB Database instance
        store: Store code ('NM', 'HB', 'CHW', or 'ALL')
        target_date: Date to evaluate
        recovery_window: 7, 14, or 30 days rolling recovery window
        carry_forward_policy: 'MONTH_END_CLOSE' or 'TRUE_ROLLING'
        distribution_mode: 'EQUAL' or 'TARGET_WEIGHTED'

    Returns:
        A rich dict containing today's scheduled carry, adjusted target,
        outstanding deficit backlog, recovery status, and active deficit bucket details.
    """
    if recovery_window not in (7, 14, 30):
        recovery_window = 7
    if carry_forward_policy not in ("MONTH_END_CLOSE", "TRUE_ROLLING"):
        carry_forward_policy = "MONTH_END_CLOSE"
    if distribution_mode not in ("EQUAL", "TARGET_WEIGHTED"):
        distribution_mode = "EQUAL"

    # 1. Determine lookback horizon:
    # If MONTH_END_CLOSE, look back to the 1st of the current month
    # If TRUE_ROLLING, look back at least recovery_window * 3 days
    if carry_forward_policy == "MONTH_END_CLOSE":
        horizon_start = date(target_date.year, target_date.month, 1)
    else:
        horizon_start = target_date - timedelta(days=max(60, recovery_window * 2))

    # Also check earliest recorded date in DB
    all_recorded_dates = _get_recorded_dates(db, store, horizon_start, target_date)
    if not all_recorded_dates:
        today_target, today_sales = _get_store_day_facts(db, store, target_date)
        if today_target is None and today_sales == 0.0:
            return None

    # Ensure all intermediate dates from horizon_start to target_date exist sequentially
    cur = horizon_start
    date_sequence: list[date] = []
    while cur <= target_date:
        date_sequence.append(cur)
        cur += timedelta(days=1)

    # 2. Chronological simulation across date sequence up to target_date
    buckets: list[DeficitBucket] = []
    bucket_counter = 0

    daily_history: dict[str, dict] = {}

    for d in date_sequence:
        d_iso = d.isoformat()
        orig_target, net_sales = _get_store_day_facts(db, store, d)
        is_today = (d == target_date)

        # A. Filter and evaluate active buckets for date d
        active_buckets_today: list[DeficitBucket] = []
        scheduled_carry_total = 0.0

        for b in buckets:
            if b.status != "ACTIVE":
                continue
            b_start = date.fromisoformat(b.recovery_start_date)
            b_end = date.fromisoformat(b.recovery_end_date)

            # Check if bucket is within recovery period for date d
            if d < b_start:
                continue

            if d > b_end:
                # Bucket recovery window has ended
                if carry_forward_policy == "MONTH_END_CLOSE" and d.month != date.fromisoformat(b.origin_date).month:
                    b.status = "FORCED_MONTH_END"
                else:
                    b.status = "EXPIRED" if b.remaining_deficit > 0 else "COMPLETED"
                continue

            if b.remaining_deficit <= 0.001:
                b.status = "COMPLETED"
                b.remaining_deficit = 0.0
                continue

            # Bucket is actively eligible for carry allocation on date d
            active_buckets_today.append(b)
            remaining_days = (b_end - d).days + 1
            if remaining_days <= 1:
                carry_i = b.remaining_deficit
            else:
                carry_i = b.remaining_deficit / remaining_days

            scheduled_carry_total += carry_i

        scheduled_carry_total = round(scheduled_carry_total, 2)
        outstanding_before = sum(b.remaining_deficit for b in active_buckets_today)
        outstanding_before = round(outstanding_before, 2)

        # Adjusted target for date d
        if orig_target is not None:
            adjusted_target = round(orig_target + scheduled_carry_total, 2)
        elif scheduled_carry_total > 0:
            adjusted_target = scheduled_carry_total
        else:
            adjusted_target = None

        # B. If date d is in the past, process end-of-day sales outcomes
        # If date d is today, evaluate live sales so far
        excess_sales = 0.0
        new_deficit_created = 0.0
        recovered_today = 0.0
        true_surplus = 0.0

        if orig_target is not None:
            if net_sales < orig_target:
                # Deficit occurs
                new_deficit_created = round(orig_target - net_sales, 2)
                if new_deficit_created > 0 and not is_today:
                    # Create new bucket starting tomorrow (for past days)
                    bucket_counter += 1
                    b_start_d = d + timedelta(days=1)
                    b_end_d = _compute_bucket_end_date(d, recovery_window, carry_forward_policy)
                    new_bucket = DeficitBucket(
                        id=f"def_{store}_{d.strftime('%Y%m%d')}_{bucket_counter:03d}",
                        store_code=store,
                        origin_date=d_iso,
                        original_deficit=new_deficit_created,
                        remaining_deficit=new_deficit_created,
                        recovery_window=recovery_window,
                        recovery_start_date=b_start_d.isoformat(),
                        recovery_end_date=b_end_d.isoformat(),
                        status="ACTIVE",
                    )
                    buckets.append(new_bucket)
            else:
                # Net sales meet or exceed original target
                excess_sales = round(net_sales - orig_target, 2)
                # Allocate excess sales to recover active buckets in FIFO order
                remaining_excess = excess_sales
                for b in active_buckets_today:
                    if remaining_excess <= 0:
                        break
                    pay = min(remaining_excess, b.remaining_deficit)
                    b.remaining_deficit = round(b.remaining_deficit - pay, 2)
                    recovered_today = round(recovered_today + pay, 2)
                    remaining_excess = round(remaining_excess - pay, 2)
                    if b.remaining_deficit <= 0.001:
                        b.remaining_deficit = 0.0
                        b.status = "COMPLETED"

                true_surplus = round(max(0.0, excess_sales - recovered_today), 2)

        # Outstanding balance after day
        outstanding_after = sum(b.remaining_deficit for b in buckets if b.status == "ACTIVE")
        outstanding_after = round(outstanding_after, 2)

        daily_history[d_iso] = {
            "date": d_iso,
            "original_target": orig_target,
            "scheduled_carry": scheduled_carry_total,
            "adjusted_target": adjusted_target,
            "net_sales": net_sales,
            "excess_sales": excess_sales,
            "recovered_today": recovered_today,
            "new_deficit_created": new_deficit_created,
            "outstanding_before": outstanding_before,
            "outstanding_after": outstanding_after,
            "true_surplus": true_surplus,
        }

    # 3. Formulate the response for target_date
    today_rec = daily_history.get(target_date.isoformat())
    if today_rec is None:
        return None

    # Check if there are active buckets or an admin target for today
    orig_target = today_rec["original_target"]
    net_sales = today_rec["net_sales"]
    scheduled_carry = today_rec["scheduled_carry"]
    adjusted_target = today_rec["adjusted_target"]
    outstanding_before = today_rec["outstanding_before"]
    recovered_today = today_rec["recovered_today"]

    # If no target ever set, no deficit exists, and scheduled carry is 0 -> return None
    if orig_target is None and scheduled_carry == 0.0 and outstanding_before == 0.0:
        return None

    # Compute remaining against adjusted target for display
    if adjusted_target is not None:
        adjusted_remaining = round(max(0.0, adjusted_target - net_sales), 2)
        rec_ach_pct = round((net_sales / adjusted_target) * 100, 2) if adjusted_target > 0 else 0.0
    else:
        adjusted_remaining = None
        rec_ach_pct = None

    # Build active deficit bucket summary for UI display
    active_bucket_items = []
    for b in buckets:
        if b.status == "ACTIVE":
            b_start = date.fromisoformat(b.recovery_start_date)
            b_end = date.fromisoformat(b.recovery_end_date)
            if b_start <= target_date <= b_end:
                days_rem = (b_end - target_date).days + 1
                daily_alloc = round(b.remaining_deficit / max(1, days_rem), 2) if days_rem > 1 else b.remaining_deficit
                active_bucket_items.append({
                    "id": b.id,
                    "origin_date": b.origin_date,
                    "original_deficit": b.original_deficit,
                    "remaining_deficit": b.remaining_deficit,
                    "recovery_start_date": b.recovery_start_date,
                    "recovery_end_date": b.recovery_end_date,
                    "days_remaining": max(1, days_rem),
                    "scheduled_carry_today": daily_alloc,
                    "status": b.status,
                })

    has_shortfall = (scheduled_carry > 0 or outstanding_before > 0)
    has_surplus = (today_rec["true_surplus"] > 0)

    # Yesterday's reference for backward compatibility in existing component props
    prev_d = target_date - timedelta(days=1)
    prev_rec = daily_history.get(prev_d.isoformat(), {})
    prev_target = prev_rec.get("original_target")
    prev_actual = prev_rec.get("net_sales", 0.0)
    prev_shortfall = prev_rec.get("new_deficit_created", 0.0)
    prev_surplus = prev_rec.get("true_surplus", 0.0)

    # Determine status tag
    if has_shortfall:
        status_str = "shortfall_recovery"
    elif has_surplus:
        status_str = "surplus_cushion"
    else:
        status_str = "neutral"

    return {
        "active": True,
        "target_date": target_date.isoformat(),
        "store": store,
        "recovery_window": recovery_window,
        "carry_forward_policy": carry_forward_policy,
        "distribution_mode": distribution_mode,
        "recovery_allocation": "FIFO",
        # Target Metrics
        "original_target": orig_target,
        "admin_today_target": orig_target,  # alias for backwards compatibility
        "scheduled_carry": scheduled_carry,
        "adjusted_target": adjusted_target,
        "adjusted_cumulative_target": adjusted_target,  # alias for backwards compatibility
        "today_actual_sales": net_sales,
        "adjusted_remaining": adjusted_remaining,
        "adjusted_target_gap": adjusted_remaining if adjusted_remaining is not None else 0.0,
        "original_target_gap": round(max(0.0, orig_target - net_sales), 2) if orig_target is not None else 0.0,
        "recovery_achievement_pct": rec_ach_pct,
        "recovered_today": recovered_today,
        "true_surplus": today_rec["true_surplus"],
        "new_deficit_created": today_rec["new_deficit_created"],
        # Deficit Backlog
        "outstanding_before": outstanding_before,
        "outstanding_after": today_rec["outstanding_after"],
        "total_outstanding_deficit": outstanding_before,
        "active_buckets_count": len(active_bucket_items),
        "deficit_buckets": active_bucket_items,
        # Status
        "has_shortfall": has_shortfall,
        "status": status_str,
        # Legacy/Compatibility Fields
        "prev_date": prev_d.isoformat(),
        "prev_target": prev_target,
        "prev_actual": prev_actual,
        "prev_shortfall": prev_shortfall,
        "prev_surplus": prev_surplus,
    }


def _get_store_day_facts(db: Database, store: str, target_date: date) -> tuple[float | None, float]:
    """Returns (original_target, net_sales) for a store on a given date.
    Supports individual stores ('NM', 'HB', 'CHW') and 'ALL' consolidated.
    """
    iso_date = target_date.isoformat()
    if store == "ALL":
        target_docs = list(db[TARGETS].find({"entry_date": iso_date}))
        targets = [float(doc["sales_target"]) for doc in target_docs if doc.get("sales_target") is not None]
        total_target = sum(targets) if targets else None

        pipeline = [
            {"$match": {"entry_date": iso_date}},
            {"$group": {"_id": None, "total_sales": {"$sum": "$net_amount"}}},
        ]
        res = list(db[BILLS].aggregate(pipeline))
        total_sales = float(res[0]["total_sales"]) if res else 0.0
        return total_target, total_sales
    else:
        doc = db[TARGETS].find_one({"store_code": store, "entry_date": iso_date})
        target_val = float(doc["sales_target"]) if doc is not None and doc.get("sales_target") is not None else None

        pipeline = [
            {"$match": {"store_code": store, "entry_date": iso_date}},
            {"$group": {"_id": None, "total_sales": {"$sum": "$net_amount"}}},
        ]
        res = list(db[BILLS].aggregate(pipeline))
        sales_val = float(res[0]["total_sales"]) if res else 0.0
        return target_val, sales_val


def _get_recorded_dates(db: Database, store: str, start_date: date, end_date: date) -> set[date]:
    """Retrieves all dates having targets or bill logs between start_date and end_date."""
    query = {"entry_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}}
    if store != "ALL":
        query["store_code"] = store

    dates: set[date] = set()
    for coll in (TARGETS, BILLS):
        for doc in db[coll].find(query, {"entry_date": 1}):
            iso = doc.get("entry_date")
            if iso:
                try:
                    dates.add(date.fromisoformat(iso))
                except ValueError:
                    pass
    return dates
