"""BullMQ worker process.  Run from backend/:

    python -m src.queue.worker

Consumes:
  reports             -> src/report_jobs.process_report_job
  audit-events        -> src/audit.persist_event (MongoDB `audit_logs`)
  midnight-finalizer  -> src/daily_midnight_job.finalize_day_once

and owns the midnight schedule. The Python bullmq client (unlike the Node
one) has no repeatable jobs / job schedulers, so the schedule is a small
loop here: at 00:00 IST it enqueues one job per target date with a
deterministic jobId (`midnight-<run>-<target>`). BullMQ ignores an add whose
jobId already exists, so N worker replicas enqueueing the same midnight
produce one job; finalize_day_once's Redis NX lock is the second guard, and
also covers API processes still running the in-process finalizer.

Handlers are plain sync functions (pymongo, reportlab) run via
asyncio.to_thread so one slow PDF never blocks the audit consumer.
Scale horizontally with more worker processes/containers.
"""
from __future__ import annotations

import asyncio
import logging
import signal
from datetime import date, datetime

from config.env import env
from src.queue import AUDIT_QUEUE, MIDNIGHT_QUEUE, REPORTS_QUEUE, WHATSAPP_ALERTS_QUEUE
from src.queue.bullmq_client import DEFAULT_JOB_OPTS

logger = logging.getLogger("citimart.worker")


def _handle_audit(data: dict) -> dict:
    from db.session import session_scope
    from src.audit import persist_event

    with session_scope() as db:
        persist_event(db, data)
    return {"ok": True}


def _handle_report(data: dict) -> dict:
    from src.report_jobs import process_report_job

    return process_report_job(data)


def _handle_midnight(data: dict) -> dict:
    from src.daily_midnight_job import finalize_day_once

    ran = finalize_day_once(date.fromisoformat(data["run_date"]), date.fromisoformat(data["target_date"]))
    return {"ran": ran}


def _handle_whatsapp_alert(data: dict) -> dict:
    from src.alerts.scheduler import process_whatsapp_alert_job

    return process_whatsapp_alert_job(data)


def _processor(handler):
    async def process(job, token):  # noqa: ARG001 -- bullmq passes the lock token
        return await asyncio.to_thread(handler, job.data)

    return process


async def _midnight_scheduler(stop: asyncio.Event) -> None:
    from bullmq import Queue

    from src.daily_midnight_job import IST, _seconds_until_next_midnight, midnight_targets

    queue = Queue(MIDNIGHT_QUEUE, {"connection": env.queue_redis_url()})
    try:
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=_seconds_until_next_midnight())
                break  # stop requested
            except asyncio.TimeoutError:
                pass
            run_date, finished, starting = midnight_targets(datetime.now(IST))
            for target in (finished, starting):
                job_id = f"midnight-{run_date.isoformat()}-{target.isoformat()}"
                data = {"run_date": run_date.isoformat(), "target_date": target.isoformat()}
                try:
                    await queue.add("finalize-day", data, {**DEFAULT_JOB_OPTS, "jobId": job_id})
                    logger.info("Enqueued %s.", job_id)
                except Exception:  # noqa: BLE001
                    logger.exception("Could not enqueue %s; the in-process finalizer (if enabled) still covers it.", job_id)
    finally:
        await queue.close()


async def _whatsapp_alert_scheduler(stop: asyncio.Event) -> None:
    from bullmq import Queue
    from db.session import session_scope
    from src.alerts.alert_store import get_alert_settings
    from src.alerts.scheduler import IST, due_scheduled_jobs

    queue = Queue(WHATSAPP_ALERTS_QUEUE, {"connection": env.queue_redis_url()})
    try:
        while not stop.is_set():
            now = datetime.now(IST)
            sleep_s = max(1.0, 60.0 - now.second)
            try:
                await asyncio.wait_for(stop.wait(), timeout=sleep_s)
                break
            except asyncio.TimeoutError:
                pass

            tick_now = datetime.now(IST)
            try:
                with session_scope() as db:
                    settings = get_alert_settings(db)
                if not settings.get("enabled"):
                    continue
                for job in due_scheduled_jobs(
                    tick_now,
                    start_hour=int(settings.get("trading_start_hour", 11)),
                    end_hour=int(settings.get("trading_end_hour", 23)),
                ):
                    job_id = f"wa-{job['trigger_key'].replace(':', '-')}"
                    await queue.add("send-whatsapp-alert", job, {**DEFAULT_JOB_OPTS, "jobId": job_id})
            except Exception:  # noqa: BLE001
                logger.exception("WhatsApp alert scheduler tick failed.")
    finally:
        await queue.close()


async def main() -> None:
    from bullmq import Worker

    url = env.queue_redis_url()
    if not url:
        raise SystemExit("REDIS_URL (or REDIS_QUEUE_URL) must be set to run the BullMQ worker.")

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):  # Windows event loops
            signal.signal(sig, lambda *_: loop.call_soon_threadsafe(stop.set))

    workers = [
        Worker(REPORTS_QUEUE, _processor(_handle_report), {"connection": url, "concurrency": 2}),
        Worker(AUDIT_QUEUE, _processor(_handle_audit), {"connection": url, "concurrency": 10}),
        Worker(MIDNIGHT_QUEUE, _processor(_handle_midnight), {"connection": url, "concurrency": 1}),
        Worker(WHATSAPP_ALERTS_QUEUE, _processor(_handle_whatsapp_alert), {"connection": url, "concurrency": 2}),
    ]
    scheduler = asyncio.create_task(_midnight_scheduler(stop))
    wa_scheduler = asyncio.create_task(_whatsapp_alert_scheduler(stop))
    from src.notifications.runner import run_in_process_notification_loop
    notif_scheduler = asyncio.create_task(run_in_process_notification_loop(stop))
    logger.info("BullMQ worker running: %s", ", ".join((REPORTS_QUEUE, AUDIT_QUEUE, MIDNIGHT_QUEUE, WHATSAPP_ALERTS_QUEUE)))
    await stop.wait()
    logger.info("Shutting down BullMQ worker...")
    await scheduler
    await wa_scheduler
    await notif_scheduler
    for w in workers:
        await w.close()


if __name__ == "__main__":
    from config.logging_config import setup_logging

    setup_logging("worker")
    asyncio.run(main())
