"""Directives and Executive Instructions from Operational Head (Boss / Operations Head).

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


from config.settings import STORE_CODE_TO_NAME

class CreateDirectivePayload(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    message: str = Field(..., min_length=5, max_length=3000)
    priority: Literal["urgent", "high", "normal", "info"] = "high"
    category: Literal["sales_target", "special_notice", "operations", "announcement", "remarks", "complaint", "requirements"] = "sales_target"
    target_store: Literal["ALL", "NM", "HB", "CHW", "ADMIN"] = "ALL"
    author_name: str | None = Field(default=None, max_length=100)
    author_title: str | None = Field(default=None, max_length=150)


class UpdateDirectivePayload(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    message: str | None = Field(default=None, min_length=5, max_length=3000)
    priority: Literal["urgent", "high", "normal", "info"] | None = None
    category: Literal["sales_target", "special_notice", "operations", "announcement", "remarks", "complaint", "requirements"] | None = None
    target_store: Literal["ALL", "NM", "HB", "CHW", "ADMIN"] | None = None
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
    """Create and broadcast a new directive (Admin broadcasts executive instructions;
    Store Managers submit complaints, remarks, or requirements to Operational Head)."""
    if user.is_admin:
        author_name = payload.author_name or "Operational Head"
        author_title = payload.author_title or "Executive Director / Operations Head"
        target_store = payload.target_store
    elif user.store_code:
        store_name = STORE_CODE_TO_NAME.get(user.store_code, user.store_code)
        author_name = payload.author_name or f"{store_name} Store Manager"
        author_title = payload.author_title or f"{store_name} Manager ({user.username})"
        target_store = user.store_code if payload.target_store == "ALL" else payload.target_store
    else:
        raise HTTPException(status_code=403, detail="Unauthorized to submit directives.")

    created = directives_store.create_directive(
        db=db,
        title=payload.title,
        message=payload.message,
        priority=payload.priority,
        category=payload.category,
        target_store=target_store,
        author_name=author_name,
        author_title=author_title,
    )
    return {"status": "ok", "directive": created}


@router.put("/{directive_id}")
def update_existing_directive(
    directive_id: int = Path(..., description="Directive ID"),
    payload: UpdateDirectivePayload = ...,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Update or toggle an existing directive."""
    existing = db[directives_store.DIRECTIVES].find_one({"_id": directive_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Directive not found.")

    if not user.is_admin and user.username not in existing.get("author_title", "") and user.store_code != existing.get("target_store"):
        raise HTTPException(status_code=403, detail="Unauthorized to modify this directive.")

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
    """Delete a directive permanently."""
    existing = db[directives_store.DIRECTIVES].find_one({"_id": directive_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Directive not found.")

    if not user.is_admin and user.username not in existing.get("author_title", "") and user.store_code != existing.get("target_store"):
        raise HTTPException(status_code=403, detail="Unauthorized to delete this directive.")

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
