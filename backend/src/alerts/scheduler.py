"""Scheduled trigger evaluation & Redis NX exactly-once runner for WhatsApp alerts (SPEC-05)."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from config.settings import STORE_CODE_TO_NAME
from db.redis_client import get_redis
from db.session import session_scope
from src.advisor.engine import build_advice
from src.alerts.alert_store import get_alert_settings
from src.alerts.whatsapp_alert_agent import WhatsAppAlertAgent

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")
ALERT_LOCK_TTL_SECONDS = 7200

# End-of-slot trigger times in IST (hour, minute, slot_tag)
_SLOT_CLOSE_TIMES = (
    (14, 0, "slot1"),
    (17, 0, "slot2"),
    (20, 0, "slot3"),
    (23, 59, "slot4"),
)


def acquire_alert_lock(lock_key: str, ttl_seconds: int = ALERT_LOCK_TTL_SECONDS) -> bool:
    """Exactly-once guard across replicas/workers via Redis SET NX."""
    client = get_redis()
    if client is None:
        return True
    try:
        return bool(client.set(f"lock:wa_alert:{lock_key}", "1", nx=True, ex=ttl_seconds))
    except Exception:  # noqa: BLE001
        logger.warning("WhatsApp alert lock unavailable for %s; proceeding.", lock_key, exc_info=True)
        return True


def due_scheduled_jobs(now: datetime | None = None, start_hour: int = 11, end_hour: int = 23) -> list[dict[str, str]]:
    """Return scheduled alert jobs due at `now` (IST)."""
    now = now or datetime.now(IST)
    iso_date = now.date().isoformat()
    jobs: list[dict[str, str]] = []

    if now.minute == 0 and start_hour <= now.hour <= end_hour:
        jobs.append({
            "alert_type": "hourly_pulse",
            "trigger_key": f"hourly_pulse:{iso_date}:{now.hour:02d}",
            "date": iso_date,
        })
        jobs.append({
            "alert_type": "anomaly_pace",
            "trigger_key": f"anomaly_pace:{iso_date}:{now.hour:02d}",
            "date": iso_date,
        })

    for h, m, tag in _SLOT_CLOSE_TIMES:
        if now.hour == h and now.minute == m:
            jobs.append({
                "alert_type": "slot_summary",
                "trigger_key": f"slot_summary:{iso_date}:{tag}",
                "date": iso_date,
            })

    if now.hour == 21 and now.minute == 30:
        jobs.append({
            "alert_type": "closing_sprint",
            "trigger_key": f"closing_sprint:{iso_date}",
            "date": iso_date,
        })

    if now.hour == 23 and now.minute == 59:
        jobs.append({
            "alert_type": "daily_eod",
            "trigger_key": f"daily_eod:{iso_date}",
            "date": iso_date,
        })

    return jobs


def process_whatsapp_alert_job(data: dict[str, Any]) -> dict[str, Any]:
    """Execute one scheduled WhatsApp alert job across eligible Admin & Manager audiences."""
    alert_type = str(data.get("alert_type") or "")
    base_key = str(data.get("trigger_key") or "")
    if not alert_type or not base_key:
        return {"ran": False, "reason": "invalid_payload"}

    now = datetime.now(IST)
    agent = WhatsAppAlertAgent()
    dispatched: list[dict[str, Any]] = []

    with session_scope() as db:
        settings = get_alert_settings(db)
        if not settings.get("enabled"):
            return {"ran": False, "reason": "disabled"}

        schedules = settings.get("schedules") or {}

        # 1. Admin granular report (network + all stores)
        if (schedules.get("admin") or {}).get(alert_type, False):
            admin_key = f"{base_key}:admin:ALL"
            should_send = True
            if alert_type == "anomaly_pace":
                # Only fire Admin anomaly if at least one store has an urgent insight
                urgent_any = any(
                    any(ins.get("severity") == "urgent" for ins in (build_advice(db, c, now.date(), now).get("insights") or []))
                    for c in STORE_CODE_TO_NAME
                )
                should_send = urgent_any
            if should_send and acquire_alert_lock(admin_key):
                res = agent.send_report(
                    db,
                    audience="admin",
                    store_code="ALL",
                    alert_type=alert_type,
                    trigger_key=admin_key,
                    now=now,
                )
                dispatched.append({"audience": "admin", "store_code": "ALL", "status": res["status"]})

        # 2. Manager granular reports (strictly per-store isolated)
        if (schedules.get("manager") or {}).get(alert_type, False):
            for store_code in STORE_CODE_TO_NAME:
                mgr_key = f"{base_key}:manager:{store_code}"
                should_send = True
                if alert_type == "anomaly_pace":
                    adv = build_advice(db, store_code, now.date(), now)
                    should_send = any(ins.get("severity") == "urgent" for ins in (adv.get("insights") or []))
                if should_send and acquire_alert_lock(mgr_key):
                    res = agent.send_report(
                        db,
                        audience="manager",
                        store_code=store_code,
                        alert_type=alert_type,
                        trigger_key=mgr_key,
                        now=now,
                    )
                    dispatched.append({"audience": "manager", "store_code": store_code, "status": res["status"]})

    return {"ran": True, "dispatched": dispatched}


async def run_in_process_alert_scheduler(stop: asyncio.Event | None = None) -> None:
    """In-process minute-tick scheduler when BullMQ worker is disabled."""
    logger.info("In-process WhatsApp alert scheduler started (Asia/Kolkata).")
    while True:
        now = datetime.now(IST)
        sleep_s = max(1.0, 60.0 - now.second)
        if stop is not None:
            try:
                await asyncio.wait_for(stop.wait(), timeout=sleep_s)
                break
            except asyncio.TimeoutError:
                pass
        else:
            await asyncio.sleep(sleep_s)

        tick_now = datetime.now(IST)
        try:
            with session_scope() as db:
                settings = get_alert_settings(db)
            if not settings.get("enabled"):
                continue
            jobs = due_scheduled_jobs(
                tick_now,
                start_hour=int(settings.get("trading_start_hour", 11)),
                end_hour=int(settings.get("trading_end_hour", 23)),
            )
            for job in jobs:
                await asyncio.to_thread(process_whatsapp_alert_job, job)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("In-process WhatsApp alert scheduler tick failed.")
