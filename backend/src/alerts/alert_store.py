"""MongoDB persistence for WhatsApp Alert settings & delivery logs (SPEC-05)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from config.env import env
from config.settings import STORE_CODE_TO_NAME
from db.models import ALERT_LOGS, ALERT_SETTINGS
from src.alerts.whatsapp_provider import normalize_indian_phone

_SETTINGS_DOC_ID = "whatsapp_alerts"

DEFAULT_SCHEDULES: dict[str, dict[str, bool]] = {
    "admin": {
        "hourly_pulse": True,
        "slot_summary": True,
        "daily_eod": True,
        "anomaly_pace": True,
        "closing_sprint": True,
    },
    "manager": {
        "hourly_pulse": True,
        "slot_summary": True,
        "daily_eod": True,
        "anomaly_pace": True,
        "closing_sprint": True,
    },
}


def _env_default_admin_recipients() -> list[str]:
    out: list[str] = []
    for raw in (env.whatsapp_admin_recipients or "").split(","):
        raw = raw.strip()
        if not raw:
            continue
        try:
            norm = normalize_indian_phone(raw)
            if norm not in out:
                out.append(norm)
        except ValueError:
            continue
    return out


def default_alert_settings() -> dict[str, Any]:
    return {
        "enabled": bool(env.whatsapp_alerts_enabled),
        "language": "en",
        "trading_start_hour": 11,
        "trading_end_hour": 23,
        "admin_recipients": _env_default_admin_recipients(),
        "manager_recipients": {code: [] for code in STORE_CODE_TO_NAME},
        "schedules": {
            "admin": dict(DEFAULT_SCHEDULES["admin"]),
            "manager": dict(DEFAULT_SCHEDULES["manager"]),
        },
        "updated_at": None,
        "updated_by": None,
    }


def get_alert_settings(db: Database) -> dict[str, Any]:
    doc = db[ALERT_SETTINGS].find_one({"_id": _SETTINGS_DOC_ID})
    base = default_alert_settings()
    if not doc:
        return base
    merged = {
        "enabled": bool(doc.get("enabled", base["enabled"])),
        "language": doc.get("language", "en") if doc.get("language") in {"en", "hi", "bn"} else "en",
        "trading_start_hour": int(doc.get("trading_start_hour", 11)),
        "trading_end_hour": int(doc.get("trading_end_hour", 23)),
        "admin_recipients": list(doc.get("admin_recipients") or []),
        "manager_recipients": {
            code: list((doc.get("manager_recipients") or {}).get(code) or [])
            for code in STORE_CODE_TO_NAME
        },
        "schedules": {
            aud: {
                k: bool(((doc.get("schedules") or {}).get(aud) or {}).get(k, DEFAULT_SCHEDULES[aud][k]))
                for k in DEFAULT_SCHEDULES[aud]
            }
            for aud in ("admin", "manager")
        },
        "updated_at": doc.get("updated_at"),
        "updated_by": doc.get("updated_by"),
    }
    return merged


def save_alert_settings(db: Database, payload: dict[str, Any], updated_by: str) -> dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    admin_nums = []
    for raw in payload.get("admin_recipients") or []:
        norm = normalize_indian_phone(raw)
        if norm not in admin_nums:
            admin_nums.append(norm)

    mgr_raw = payload.get("manager_recipients") or {}
    mgr_nums: dict[str, list[str]] = {}
    for code in STORE_CODE_TO_NAME:
        seen: list[str] = []
        for raw in mgr_raw.get(code) or []:
            norm = normalize_indian_phone(raw)
            if norm not in seen:
                seen.append(norm)
        mgr_nums[code] = seen

    sched_raw = payload.get("schedules") or {}
    schedules = {
        aud: {
            k: bool((sched_raw.get(aud) or {}).get(k, DEFAULT_SCHEDULES[aud][k]))
            for k in DEFAULT_SCHEDULES[aud]
        }
        for aud in ("admin", "manager")
    }

    lang = payload.get("language", "en")
    if lang not in {"en", "hi", "bn"}:
        raise ValueError("language must be 'en', 'hi', or 'bn'")

    start_h = int(payload.get("trading_start_hour", 11))
    end_h = int(payload.get("trading_end_hour", 23))
    if not (0 <= start_h <= 23 and 0 <= end_h <= 23 and start_h <= end_h):
        raise ValueError("trading_start_hour and trading_end_hour must be 0..23 with start <= end")

    doc = {
        "_id": _SETTINGS_DOC_ID,
        "enabled": bool(payload.get("enabled", False)),
        "language": lang,
        "trading_start_hour": start_h,
        "trading_end_hour": end_h,
        "admin_recipients": admin_nums,
        "manager_recipients": mgr_nums,
        "schedules": schedules,
        "updated_at": now_iso,
        "updated_by": updated_by,
    }
    db[ALERT_SETTINGS].replace_one({"_id": _SETTINGS_DOC_ID}, doc, upsert=True)
    return get_alert_settings(db)


def record_alert_log(
    db: Database,
    *,
    audience: str,
    store_code: str,
    alert_type: str,
    trigger_key: str,
    recipients: list[str],
    message_body: str,
    ai_used: bool,
    provider: str,
    status: str,
    results: list[dict[str, Any]],
    error: str | None = None,
) -> bool:
    """Persist an alert log entry. Returns False if trigger_key already exists."""
    doc = {
        "audience": audience,
        "store_code": store_code,
        "alert_type": alert_type,
        "trigger_key": trigger_key,
        "recipients": recipients,
        "message_body": message_body,
        "ai_used": ai_used,
        "provider": provider,
        "status": status,
        "results": results,
        "error": error,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        db[ALERT_LOGS].insert_one(doc)
        return True
    except DuplicateKeyError:
        return False


def list_alert_logs(
    db: Database,
    *,
    audience: str | None = None,
    store_code: str | None = None,
    limit: int = 30,
) -> list[dict[str, Any]]:
    query: dict[str, Any] = {}
    if audience in {"admin", "manager"}:
        query["audience"] = audience
    if store_code:
        query["store_code"] = store_code
    cursor = db[ALERT_LOGS].find(query, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 100)))
    return list(cursor)
