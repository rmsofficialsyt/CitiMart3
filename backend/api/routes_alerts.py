"""Admin-only API routes for WhatsApp AI Sales Alerts (SPEC-05).

All endpoints are gated by `Depends(require_admin)` in app.py (401 without
token, 403 for store managers).
"""
from __future__ import annotations

from datetime import date as _date
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from pymongo.database import Database

from api.auth import CurrentUser, require_admin
from config.settings import STORE_CODE_TO_NAME
from db.session import get_db
from src.alerts.alert_store import get_alert_settings, list_alert_logs, save_alert_settings
from src.alerts.whatsapp_alert_agent import WhatsAppAlertAgent
from src.alerts.whatsapp_provider import normalize_indian_phone, provider_status
from src.audit import audit_event
from src.rate_limiter import get_client_ip

router = APIRouter(prefix="/api/alerts/whatsapp", tags=["whatsapp-alerts"])


class AudienceSchedule(BaseModel):
    hourly_pulse: bool = True
    slot_summary: bool = True
    daily_eod: bool = True
    anomaly_pace: bool = True
    closing_sprint: bool = True


class SchedulesPayload(BaseModel):
    admin: AudienceSchedule = Field(default_factory=AudienceSchedule)
    manager: AudienceSchedule = Field(default_factory=AudienceSchedule)


class AlertConfigUpdate(BaseModel):
    enabled: bool = False
    language: Literal["en", "hi", "bn"] = "en"
    trading_start_hour: int = Field(11, ge=0, le=23)
    trading_end_hour: int = Field(23, ge=0, le=23)
    admin_recipients: list[str] = Field(default_factory=list, max_length=20)
    manager_recipients: dict[str, list[str]] = Field(default_factory=dict)
    schedules: SchedulesPayload = Field(default_factory=SchedulesPayload)

    @field_validator("admin_recipients")
    @classmethod
    def _validate_admin_phones(cls, v: list[str]) -> list[str]:
        return [normalize_indian_phone(item) for item in v if item.strip()]

    @field_validator("manager_recipients")
    @classmethod
    def _validate_manager_phones(cls, v: dict[str, list[str]]) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for store_code, phones in v.items():
            if store_code not in STORE_CODE_TO_NAME:
                raise ValueError(f"Unknown store code: {store_code!r}")
            if len(phones) > 20:
                raise ValueError(f"Too many recipients for {store_code} (max 20)")
            out[store_code] = [normalize_indian_phone(p) for p in phones if p.strip()]
        return out


class SendAlertRequest(BaseModel):
    audience: Literal["admin", "manager"] = "admin"
    store_code: str = Field("ALL", max_length=8)
    alert_type: Literal[
        "hourly_pulse",
        "slot_summary",
        "daily_eod",
        "anomaly_pace",
        "closing_sprint",
        "custom_on_demand",
    ] = "custom_on_demand"
    date: str | None = Field(None, max_length=10)
    language: Literal["en", "hi", "bn"] | None = None
    use_ai: bool = True
    preview_only: bool = False


@router.get("/config")
def get_config(
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(require_admin),  # noqa: ARG001
):
    return {
        "settings": get_alert_settings(db),
        "provider": provider_status(),
    }


@router.put("/config")
def update_config(
    payload: AlertConfigUpdate,
    request: Request,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
):
    if payload.trading_start_hour > payload.trading_end_hour:
        raise HTTPException(status_code=422, detail="trading_start_hour must be <= trading_end_hour")
    try:
        saved = save_alert_settings(db, payload.model_dump(), updated_by=user.username)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    audit_event(
        "whatsapp_alert_config_updated",
        db=db,
        username=user.username,
        ip=get_client_ip(request),
        target="whatsapp_alerts",
        details={
            "enabled": saved["enabled"],
            "language": saved["language"],
            "admin_count": len(saved["admin_recipients"]),
            "manager_counts": {k: len(v) for k, v in saved["manager_recipients"].items()},
        },
    )
    return {"settings": saved, "provider": provider_status()}


@router.post("/send")
def send_alert(
    payload: SendAlertRequest,
    request: Request,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
):
    if payload.audience == "manager" and payload.store_code not in STORE_CODE_TO_NAME:
        raise HTTPException(status_code=422, detail="Manager report requires store_code in NM, HB, or CHW.")

    target_date: _date | None = None
    if payload.date:
        try:
            target_date = _date.fromisoformat(payload.date)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD") from exc

    store = payload.store_code if payload.audience == "manager" else "ALL"
    trigger_key = f"manual:{payload.alert_type}:{payload.audience}:{store}:{secrets.token_hex(6)}"

    agent = WhatsAppAlertAgent()
    result = agent.send_report(
        db,
        audience=payload.audience,
        store_code=store,
        alert_type=payload.alert_type,
        trigger_key=trigger_key,
        target_date=target_date,
        language=payload.language,
        use_ai=payload.use_ai,
        preview_only=payload.preview_only,
    )

    if not payload.preview_only:
        audit_event(
            "whatsapp_alert_sent",
            db=db,
            username=user.username,
            ip=get_client_ip(request),
            target=f"{payload.audience}:{store}",
            details={
                "alert_type": payload.alert_type,
                "status": result.get("status"),
                "provider": result.get("provider"),
                "recipient_count": len(result.get("recipients") or []),
            },
        )
    return result


@router.get("/logs")
def get_logs(
    audience: Literal["admin", "manager"] | None = Query(None),
    store_code: str | None = Query(None, max_length=8),
    limit: int = Query(30, ge=1, le=100),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(require_admin),  # noqa: ARG001
):
    if store_code and store_code != "ALL" and store_code not in STORE_CODE_TO_NAME:
        raise HTTPException(status_code=422, detail=f"Unknown store_code: {store_code!r}")
    return {"logs": list_alert_logs(db, audience=audience, store_code=store_code, limit=limit)}
