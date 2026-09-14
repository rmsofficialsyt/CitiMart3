"""Directives and Executive Instructions from Raphael Sir (Boss / Operations Head).

Endpoints for broadcasting announcements, sales targets, operational notices,
remarks, and special directives. Admin accounts can create, update, toggle,
and delete directives; store managers can view targeted directives and mark
them as acknowledged/read.
"""
from __future__ import annotations

from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user
from db.session import get_db
from src import directives_store

router = APIRouter(prefix="/api/daily/directives", tags=["directives"])


class CreateDirectivePayload(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    message: str = Field(..., min_length=5, max_length=3000)
    priority: Literal["urgent", "high", "normal", "info"] = "high"
    category: Literal["sales_target", "special_notice", "operations", "announcement", "remarks"] = "sales_target"
    target_store: Literal["ALL", "NM", "HB", "CHW"] = "ALL"
    author_name: str = Field(default="Raphael Sir", max_length=100)
    author_title: str = Field(default="Executive Director / Operations Head", max_length=150)


class UpdateDirectivePayload(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    message: str | None = Field(default=None, min_length=5, max_length=3000)
    priority: Literal["urgent", "high", "normal", "info"] | None = None
    category: Literal["sales_target", "special_notice", "operations", "announcement", "remarks"] | None = None
    target_store: Literal["ALL", "NM", "HB", "CHW"] | None = None
    author_name: str | None = Field(default=None, max_length=100)
    author_title: str | None = Field(default=None, max_length=150)
    active: bool | None = None


@router.get("")
def get_directives(
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve directives summary tailored to current user role and store scope."""
    return directives_store.get_directives_summary(
        db=db,
        username=user.username,
        store_code=user.store_code,
        is_admin=user.is_admin,
    )


@router.post("")
def create_new_directive(
    payload: CreateDirectivePayload,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Create and broadcast a new executive directive (Admin only)."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Only Administrator can publish Boss directives.")

    created = directives_store.create_directive(
        db=db,
        title=payload.title,
        message=payload.message,
        priority=payload.priority,
        category=payload.category,
        target_store=payload.target_store,
        author_name=payload.author_name,
        author_title=payload.author_title,
    )
    return {"status": "ok", "directive": created}


@router.put("/{directive_id}")
def update_existing_directive(
    directive_id: int = Path(..., description="Directive ID"),
    payload: UpdateDirectivePayload = ...,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Update or toggle an existing directive (Admin only)."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Only Administrator can modify Boss directives.")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None} if hasattr(payload, "model_dump") else {k: v for k, v in payload.dict().items() if v is not None}
    updated = directives_store.update_directive(db, directive_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Directive not found.")

    return {"status": "ok", "directive": updated}


@router.delete("/{directive_id}")
def delete_existing_directive(
    directive_id: int = Path(..., description="Directive ID"),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Delete a directive permanently (Admin only)."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Only Administrator can delete directives.")

    success = directives_store.delete_directive(db, directive_id)
    if not success:
        raise HTTPException(status_code=404, detail="Directive not found.")

    return {"status": "ok", "deleted_id": directive_id}


@router.post("/{directive_id}/acknowledge")
def acknowledge_user_directive(
    directive_id: int = Path(..., description="Directive ID"),
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Mark a directive as read/acknowledged by the authenticated user."""
    updated = directives_store.acknowledge_directive(db, directive_id, user.username)
    if not updated:
        raise HTTPException(status_code=404, detail="Directive not found.")

    return {"status": "ok", "directive": updated}
