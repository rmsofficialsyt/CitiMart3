"""Runner & 15-minute scheduler for Notification & Log Handling Agents (SPEC-06)."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from pymongo.database import Database

from db.redis_client import get_redis
from db.session import session_scope
from src.notifications.agents import ALL_NOTIFICATION_AGENTS
from src.notifications.store import create_notification

logger = logging.getLogger(__name__)
IST = ZoneInfo("Asia/Kolkata")
SCAN_INTERVAL_SECONDS = 900  # 15 minutes


def acquire_notif_scan_lock(bucket: str) -> bool:
    client = get_redis()
    if client is None:
        return True
    try:
        return bool(client.set(f"lock:notif_scan:{bucket}", "1", nx=True, ex=600))
    except Exception:  # noqa: BLE001
        return True


def run_notification_agents(db: Database, now: datetime | None = None) -> dict[str, Any]:
    """Run all 6 notification/log agents and persist new deduplicated events."""
    now = now or datetime.now(IST)
    created: list[dict[str, Any]] = []
    errors: list[str] = []

    for agent in ALL_NOTIFICATION_AGENTS:
        try:
            events = agent.evaluate(db, now)
            for ev in events:
                doc = create_notification(
                    db,
                    agent=ev.agent,
                    audience=ev.audience,
                    store_code=ev.store_code,
                    severity=ev.severity,
                    title=ev.title,
                    message=ev.message,
                    dedupe_key=ev.dedupe_key,
                    action_link=ev.action_link,
                    metadata=ev.metadata,
                )
                if doc is not None:
                    created.append(doc)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Notification agent %s failed.", agent.name)
            errors.append(f"{agent.name}: {exc}")

    return {"created_count": len(created), "created": created, "errors": errors}


async def run_in_process_notification_loop(stop: asyncio.Event | None = None) -> None:
    """Background 15-minute notification scan loop."""
    logger.info("Notification & Log Handling Agents loop started (interval=%ds).", SCAN_INTERVAL_SECONDS)
    while True:
        now = datetime.now(IST)
        bucket = f"{now.strftime('%Y-%m-%d-%H')}-{now.minute // 15}"
        try:
            if acquire_notif_scan_lock(bucket):
                def _run():
                    with session_scope() as db:
                        return run_notification_agents(db, now)
                res = await asyncio.to_thread(_run)
                if res["created_count"] > 0:
                    logger.info("Notification scan created %d alert(s).", res["created_count"])
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Notification agent loop iteration failed.")

        if stop is not None:
            try:
                await asyncio.wait_for(stop.wait(), timeout=SCAN_INTERVAL_SECONDS)
                break
            except asyncio.TimeoutError:
                pass
        else:
            await asyncio.sleep(SCAN_INTERVAL_SECONDS)
