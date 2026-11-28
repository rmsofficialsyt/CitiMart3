"""Header metadata for the TopBar.

The Analytics & Forecasting version of this route reports DATASET.xlsx's date
coverage and when the workbook was last parsed. Daily Operations has no
workbook: its data is whatever is in MongoDB right now, so `date_range`
describes the live day and `last_refresh` is the moment of the request. The
response keeps the same four keys so frontend/src/api/client.ts's
DashboardMeta shape is unchanged between the two sub-projects.
"""
from __future__ import annotations

from datetime import UTC, datetime
import time
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends

from api.auth import CurrentUser, get_current_user
from config.env import env
from config.settings import STORE_CODE_TO_NAME
from db.engine import get_database
from db.redis_client import get_redis, ping_redis

router = APIRouter(prefix="/api/meta", tags=["meta"])
_STARTED_AT = datetime.now(UTC)

# Every store, every log entry and the midnight finalize job are all on
# Asia/Kolkata -- the header must not drift to the server's UTC clock, or a
# manager in Kolkata sees "yesterday" for the first 5.5 hours of their day.
IST = ZoneInfo("Asia/Kolkata")


@router.get("")
def get_meta(user: CurrentUser = Depends(get_current_user)):
    """Store scope + a live timestamp. A manager sees only their own store
    named here, matching the single store their whole nav is pinned to."""
    now = datetime.now(IST)
    codes = user.allowed_stores(list(STORE_CODE_TO_NAME))
    return {
        "active_stores": codes,
        "store_names": [STORE_CODE_TO_NAME.get(code, code) for code in codes],
        "date_range": now.strftime("%d.%m.%Y"),
        "last_refresh": now.strftime("%d.%m.%Y %H:%M"),
    }


@router.get("/status")
def get_system_status(_user: CurrentUser = Depends(get_current_user)):
    """Authenticated database, cache, and server uptime telemetry for TopBar."""
    now_utc = datetime.now(UTC)
    now_ist = now_utc.astimezone(IST)

    # 1. MongoDB live ping & latency
    db_status = "down"
    db_latency_ms: float | None = None
    db_error: str | None = None
    t0 = time.perf_counter()
    try:
        db = get_database()
        db.command("ping")
        db_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        db_status = "up"
    except Exception as exc:
        db_error = type(exc).__name__

    # 2. Redis cache / session bus ping & latency
    redis_raw = ping_redis()
    redis_latency_ms: float | None = None
    if redis_raw == "ok":
        rt0 = time.perf_counter()
        try:
            client = get_redis()
            if client is not None:
                client.ping()
                redis_latency_ms = round((time.perf_counter() - rt0) * 1000, 2)
        except Exception:
            redis_raw = "degraded"

    redis_status = "up" if redis_raw == "ok" else ("disabled" if redis_raw == "disabled" else "down")

    return {
        "database": {
            "status": db_status,
            "latency_ms": db_latency_ms,
            "database_name": env.mongodb_db_name,
            "pool": {
                "min_size": env.mongo_min_pool_size,
                "max_size": env.mongo_max_pool_size,
            },
            "error": db_error,
        },
        "cache": {
            "status": redis_status,
            "latency_ms": redis_latency_ms,
            "mode": "redis" if redis_status != "disabled" else "in-process",
        },
        "server": {
            "status": "up",
            "started_at": _STARTED_AT.astimezone(IST).strftime("%d.%m.%Y %H:%M:%S IST"),
            "uptime_seconds": max(0, int((now_utc - _STARTED_AT).total_seconds())),
            "checked_at": now_ist.strftime("%H:%M:%S IST"),
        },
    }
