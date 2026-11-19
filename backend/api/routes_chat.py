"""CITIMART AI Chatbot & Autonomous Multi-Agent Copilot Route.

Powered by Google GenAI (gemini-2.5-flash), LangGraph Multi-Agent Orchestration,
Target Adjustment (7/14/30-day rolling recovery), MongoDB Atlas, and Persistent Session Memory.
"""
from __future__ import annotations

from datetime import date
import logging
from typing import Any, Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo.database import Database

from api.auth import CurrentUser, get_current_user
from config.settings import STORE_CODE_TO_NAME
from db.session import get_db
from src.chat.coordinator import run_copilot_turn
from src.chat.memory import SessionMemoryStore
from src.chat.state import SecurityContext
from src.chat.tools.history_tools import ist_today
from src.rate_limiter import chat_limiter, get_client_ip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/daily/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: str | None = None
    conversation_history: list[ChatMessage] = Field(default_factory=list)
    store_code: str | None = None  # "NM", "HB", "CHW", "ALL"
    date_str: str | None = None  # "YYYY-MM-DD"
    target_date: str | None = None  # "YYYY-MM-DD" (alias)
    language: Literal["en", "hi", "bn"] = "en"


def _build_security_context(user: CurrentUser) -> SecurityContext:
    """Build immutable security context for multi-agent RBAC enforcement."""
    all_codes = list(STORE_CODE_TO_NAME.keys())
    allowed = user.allowed_stores(all_codes)
    if user.is_admin and "ALL" not in allowed:
        allowed.append("ALL")

    return SecurityContext(
        user_id=user.sub,
        username=user.username,
        role=user.role,
        store_code=user.store_code,
        is_admin=user.is_admin,
        allowed_stores=allowed,
    )


@router.post("")
def chat_with_copilot(
    payload: ChatRequest,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Execute conversational turn via Coordinator Agent managing 5 dedicated sub-agents.
    
    Supports Google GenAI (gemini-2.5-flash, temp=0.2), Target Adjustment queries,
    real-time MongoDB data, and persistent session memory with multi-tenant RBAC.
    """
    client_ip = get_client_ip(request)
    limiter_key = f"{user.sub}:{client_ip}"
    chat_limiter.check(limiter_key)

    # "today" is the Kolkata business day, not the server clock's (UTC on Render).
    target_date = ist_today()
    raw_date = payload.target_date or payload.date_str
    if raw_date:
        try:
            target_date = date.fromisoformat(raw_date)
        except ValueError:
            pass

    sec_ctx = _build_security_context(user)

    response = run_copilot_turn(
        db=db,
        query=payload.message,
        sec_ctx=sec_ctx,
        target_date=target_date,
        requested_store=payload.store_code,
        session_id=payload.session_id,
        language=payload.language,
    )

    return response.model_dump()


@router.get("/sessions")
def list_chat_sessions(
    store_code: str | None = None,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """List previous chat sessions accessible to the authenticated user,
    optionally only one store's (the drawer passes the active store)."""
    sec_ctx = _build_security_context(user)
    if store_code and store_code.strip().upper() not in sec_ctx.allowed_stores:
        raise HTTPException(status_code=403, detail="Store not accessible.")
    sessions = SessionMemoryStore.list_user_sessions(db, sec_ctx, store_code=store_code)
    return {"sessions": sessions}


@router.get("/sessions/{session_id}")
def get_chat_session_history(
    session_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Retrieve the full conversation of a session (not capped to the LLM context window)."""
    sec_ctx = _build_security_context(user)
    history = SessionMemoryStore.get_full_transcript(db, session_id, sec_ctx)
    if not history:
        raise HTTPException(status_code=404, detail="Session not found or access restricted.")
    return {"session_id": session_id, "messages": history}


@router.delete("/sessions/{session_id}")
def delete_chat_session(
    session_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
):
    """Delete a chat session and all associated turns."""
    sec_ctx = _build_security_context(user)
    success = SessionMemoryStore.delete_session(db, session_id, sec_ctx)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found or access restricted.")
    return {"status": "ok", "message": "Session deleted successfully."}
