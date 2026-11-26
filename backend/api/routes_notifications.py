"""Role- and store-scoped Notification Center API routes (SPEC-06)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user, require_admin
from db.session import get_db
from src.audit import audit_event
from src.notifications.runner import run_notification_agents
from src.notifications.store import list_notifications, mark_all_read, mark_read
from src.rate_limiter import get_client_ip

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(40, ge=1, le=100),
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    return list_notifications(db, user, unread_only=unread_only, limit=limit)


@router.post("/{notif_id}/read")
def read_one_notification(
    notif_id: str,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    found, forbidden = mark_read(db, notif_id, user)
    if not found:
        raise HTTPException(status_code=404, detail="Notification not found.")
    if forbidden:
        raise HTTPException(status_code=403, detail="You do not have access to this notification.")
    return {"ok": True, "notif_id": notif_id}


@router.post("/read-all")
def read_all_notifications(
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    updated = mark_all_read(db, user)
    return {"ok": True, "marked_read": updated}


@router.post("/scan")
def trigger_scan(
    request: Request,
    db: Database = Depends(get_db),
    user: CurrentUser = Depends(require_admin),
):
    result = run_notification_agents(db)
    audit_event(
        "notification_agents_scan",
        db=db,
        username=user.username,
        ip=get_client_ip(request),
        target="notifications",
        details={"created_count": result["created_count"]},
    )
    return result
