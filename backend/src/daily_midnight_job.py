"""Midnight auto-finalize job for the Daily Dashboard (Asia/Kolkata).

At 00:00 IST every day, for each store, re-runs the equivalent of a Manual
Daily Entry Final Submission for both the day that just ended AND the day
that's just starting -- refreshing NET SALES/FOOTFALL/NOB/ATV/RPV/Basket
Size/Conversion %/Achievement % against each day's live bill/footfall/NOB
logs (all three are always live sums, so they never need a manual resubmit
either), while leaving Remarks exactly as last entered (finalize_day passes
reason=None, and save_target_entry's None-means-"leave unchanged" semantics
apply to it). Finalizing the day that just ended is the safety net for "if
you forget to click Update/Final Submission, the system submits it for
you"; finalizing the day that's just starting means a fresh day gets a
non-N/A achievement_pct/remaining_pct from the moment the store opens,
instead of only retroactively the following midnight.

A store/date with no admin-set SALES TARGET is skipped outright. The old
auto-assigned historical-median estimate (daily_context.suggested_daily_target
over DATASET.xlsx) is gone with the two-sub-project split -- this half of the
project has no workbook to estimate from, and fabricating a target would
produce an Achievement % that means nothing. Targets are now always set
explicitly by an admin through Daily Operations -> <store> -> Sales Target
(api/routes_targets.py), which is the whole point of that view existing.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from config.settings import STORE_CODE_TO_NAME
from db.session import session_scope
from src import daily_dashboard_store

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")


def _seconds_until_next_midnight(now: datetime | None = None) -> float:
    now = now or datetime.now(IST)
    next_midnight = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), tzinfo=IST)
    return (next_midnight - now).total_seconds()


def finalize_day(target_date: date) -> None:
    # One session_scope() per store, not one shared session for the whole
    # loop -- an isolated session per store means one store's failure can't
    # also discard another store's already-computed finalize in the same run.
    # No per-request `Depends(get_db)` is available here (this isn't a
    # FastAPI request) -- session_scope() is db/session.py's equivalent for
    # exactly this kind of background-task/script caller.
    for store in STORE_CODE_TO_NAME:
        try:
            with session_scope() as db:
                if daily_dashboard_store.read_store_target(db, store, target_date) is None:
                    # No admin-set target for this store/date -- nothing to
                    # finalize against, and no estimate is ever invented here.
                    continue
                daily_dashboard_store.save_target_entry(db, store, target_date, None)
            logger.info("Midnight auto-finalize: %s %s done.", store, target_date)
        except Exception:
            logger.exception("Midnight auto-finalize failed for %s %s.", store, target_date)


async def run_midnight_finalizer() -> None:
    """Runs forever as a background task (started from app.py's lifespan);
    cancel it on shutdown. Blocking DB I/O (pymongo is a sync driver) is
    offloaded via asyncio.to_thread so a slow query never stalls the event
    loop or other requests.

    Correct as long as the deployed app is a single instance -- if this
    ever runs as multiple replicas, each one starts this same in-process
    task, and all of them would fire finalize_day at the same midnight,
    redundantly (each save_target_entry call is idempotent, so this isn't a
    correctness bug today, just wasted duplicate work) -- moving to a
    platform cron hitting a protected endpoint, or a MongoDB-level mutex
    document, is the real fix if that happens."""
    while True:
        await asyncio.sleep(_seconds_until_next_midnight())
        now = datetime.now(IST)
        finished_date = (now - timedelta(minutes=1)).date()
        starting_date = now.date()
        logger.info("Midnight auto-finalize starting for %s (ended) and %s (starting).", finished_date, starting_date)
        await asyncio.to_thread(finalize_day, finished_date)
        await asyncio.to_thread(finalize_day, starting_date)
