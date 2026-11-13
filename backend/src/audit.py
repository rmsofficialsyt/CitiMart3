"""Security audit trail (LOG-01).

audit_event() records who did what, from where, with what result, in UTC:
login success/failure, logout, session revocation, refresh-token replay,
account switches, password changes, target uploads.

Delivery: with BullMQ active the event is enqueued fire-and-forget to the
`audit-events` queue (the worker persists it), so the login hot path never
waits on a MongoDB write. Otherwise -- or if the enqueue can't even be
submitted -- it's inserted into `audit_logs` directly. Every event is also
emitted as one structured log line, which is what reaches an off-host log
drain.

Never raises: an audit-store outage must not turn a successful login into a
500. LOG-02: callers pass identifiers only -- never passwords, tokens or
request bodies -- and `details` is restricted to short scalar values.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from pymongo.database import Database

from db.models import AUDIT_LOGS

logger = logging.getLogger("citimart.audit")

_MAX_DETAIL_LEN = 200


def _clean_details(details: dict | None) -> dict:
    out: dict = {}
    for key, value in (details or {}).items():
        if isinstance(value, (int, float, bool)) or value is None:
            out[str(key)[:50]] = value
        else:
            out[str(key)[:50]] = str(value)[:_MAX_DETAIL_LEN]
    return out


def build_event(action: str, *, username: str | None, ip: str | None, result: str, target: str | None = None, details: dict | None = None) -> dict:
    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "username": username or "",
        "ip": ip or "",
        "result": result,
        "target": target or "",
        "details": _clean_details(details),
    }


def persist_event(db: Database, event: dict) -> None:
    db[AUDIT_LOGS].insert_one(dict(event))


def audit_event(
    action: str,
    *,
    db: Database | None = None,
    username: str | None = None,
    ip: str | None = None,
    result: str = "success",
    target: str | None = None,
    details: dict | None = None,
) -> None:
    event = build_event(action, username=username, ip=ip, result=result, target=target, details=details)
    try:
        logger.info(
            "audit action=%s result=%s user=%r ip=%s target=%r",
            event["action"], event["result"], event["username"], event["ip"], event["target"],
        )
        from src.queue import AUDIT_QUEUE
        from src.queue.bullmq_client import enqueue

        if enqueue(AUDIT_QUEUE, action, event, wait=False) is not None:
            return
        if db is not None:
            persist_event(db, event)
    except Exception:  # noqa: BLE001 -- auditing must never break the request
        logger.warning("Audit event %s could not be recorded.", action, exc_info=True)
