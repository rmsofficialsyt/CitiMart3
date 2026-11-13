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
from db.models import BILLS, FOOTFALL, NOB
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
    iso_date = target_date.isoformat()
    for store in STORE_CODE_TO_NAME:
        try:
            with session_scope() as db:
                has_target = daily_dashboard_store.read_store_target(db, store, target_date) is not None
                has_entries = (
                    db[BILLS].count_documents({"store_code": store, "entry_date": iso_date}, limit=1) > 0
                    or db[FOOTFALL].count_documents({"store_code": store, "entry_date": iso_date}, limit=1) > 0
                    or db[NOB].count_documents({"store_code": store, "entry_date": iso_date}, limit=1) > 0
                )
                if not has_target and not has_entries:
                    # Neither an admin target nor any manager-logged entry for this store/date -- skip
                    continue
                daily_dashboard_store.save_target_entry(db, store, target_date, None)
            logger.info("Midnight auto-finalize: %s %s done.", store, target_date)
        except Exception:
            logger.exception("Midnight auto-finalize failed for %s %s.", store, target_date)


# Held (never released) for an hour: long enough that every replica/worker
# firing at the same midnight -- even a slow or late one -- sees it taken.
MIDNIGHT_LOCK_TTL_SECONDS = 3600


def acquire_midnight_lock(run_date: date, target_date: date) -> bool:
    """Exactly-once guard across processes: True for the first caller per
    (midnight run, target date). Without Redis -- or if Redis errors -- it
    returns True and the run proceeds; finalize_day is idempotent, so a
    duplicate is wasted work, never wrong data."""
    from db.redis_client import get_redis

    client = get_redis()
    if client is None:
        return True
    try:
        return bool(client.set(f"lock:midnight:{run_date.isoformat()}:{target_date.isoformat()}", "1", nx=True, ex=MIDNIGHT_LOCK_TTL_SECONDS))
    except Exception:  # noqa: BLE001
        logger.warning("Midnight lock unavailable; finalizing %s anyway (idempotent).", target_date, exc_info=True)
        return True


def finalize_day_once(run_date: date, target_date: date) -> bool:
    """finalize_day behind the cross-process lock. Returns whether it ran."""
    if not acquire_midnight_lock(run_date, target_date):
        logger.info("Midnight auto-finalize for %s already claimed by another process.", target_date)
        return False
    finalize_day(target_date)
    return True


def midnight_targets(now: datetime) -> tuple[date, date, date]:
    """(run_date, finished_date, starting_date) for a midnight tick."""
    finished_date = (now - timedelta(minutes=1)).date()
    return now.date(), finished_date, now.date()


async def run_midnight_finalizer() -> None:
    """Runs forever as a background task (started from app.py's lifespan
    unless RUN_IN_PROCESS_MIDNIGHT_JOB=false, in which case the BullMQ
    worker's scheduler owns it); cancel it on shutdown. Blocking DB I/O
    (pymongo is a sync driver) is offloaded via asyncio.to_thread so a slow
    query never stalls the event loop or other requests.

    Safe with any number of replicas once REDIS_URL is set: each one wakes
    at midnight, but finalize_day_once's Redis NX lock lets exactly one of
    them do each date's work."""
    while True:
        await asyncio.sleep(_seconds_until_next_midnight())
        run_date, finished_date, starting_date = midnight_targets(datetime.now(IST))
        logger.info("Midnight auto-finalize starting for %s (ended) and %s (starting).", finished_date, starting_date)
        await asyncio.to_thread(finalize_day_once, run_date, finished_date)
        await asyncio.to_thread(finalize_day_once, run_date, starting_date)
