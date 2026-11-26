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


def _manager_target_store(requested: str, user: CurrentUser, *, allow_all: bool = True) -> str:
    """A manager may address only their own store or the Operational Head
    ("ADMIN"). On create, "ALL" keeps its old meaning for a manager -- their
    own store; any other store is refused rather than silently rewritten."""
    if requested == "ALL" and allow_all:
        return str(user.store_code)
    if requested in (user.store_code, "ADMIN"):
        return requested
    raise HTTPException(status_code=403, detail="Managers can only address their own store or the Operational Head.")


def _manager_author(user: CurrentUser) -> tuple[str, str]:
    """Server-derived author fields for a manager's directive -- never taken
    from the request body, so a manager can't sign as the Operational Head."""
    store_name = STORE_CODE_TO_NAME.get(user.store_code or "", user.store_code or "")
    return user.username, f"{store_name} Manager"


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
        # AC-02 / AC-04: a manager writes only to their own store or up to the
        # Operational Head, and always under their own identity. Without this,
        # one store's manager could post an "Operational Head" directive into
        # another store's feed.
        target_store = _manager_target_store(payload.target_store, user)
        author_name, author_title = _manager_author(user)
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
        created_by_user=user.username,
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

    is_author = (
        (existing.get("created_by_user") and existing.get("created_by_user") == user.username)
        or (user.username and user.username in existing.get("author_title", ""))
    )
    if not user.is_admin and not is_author:
        raise HTTPException(status_code=403, detail="Unauthorized to modify this directive.")

    updates = {k: v for k, v in payload.model_dump().items() if v is not None} if hasattr(payload, "model_dump") else {k: v for k, v in payload.dict().items() if v is not None}
    if not user.is_admin:
        # Same rule as create: a manager can't re-address their directive to
        # another store / ALL, nor rename its author.
        if "target_store" in updates:
            updates["target_store"] = _manager_target_store(updates["target_store"], user, allow_all=False)
        updates.pop("author_name", None)
        updates.pop("author_title", None)
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

    is_author = (
        (existing.get("created_by_user") and existing.get("created_by_user") == user.username)
        or (user.username and user.username in existing.get("author_title", ""))
    )
    if not user.is_admin and not is_author:
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
