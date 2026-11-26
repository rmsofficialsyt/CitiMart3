"""Persistence + aggregation for the Co-Pilot token usage window.

One `llm_usage` document per chat turn that actually called Gemini. Display
only -- nothing reads these to limit or block a call. Every read is scoped to
the caller's own `username`; session totals additionally require the caller
to own the session (same rule as reading its transcript), and an unowned or
unknown session yields `None` rather than an error, so session ids can't be
probed through this endpoint.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from pymongo.database import Database

from config.env import env
from db.models import LLM_USAGE
from src.chat.memory import SessionMemoryStore
from src.chat.state import SecurityContext
from src.chat.usage import TOKEN_FIELDS, TokenUsage

logger = logging.getLogger(__name__)


def configured_limits() -> dict[str, Any]:
    """The caps a turn runs under (env-driven). "Available" in the UI means these."""
    return {
        "context_window": env.llm_context_window_tokens,
        "max_output": {
            "short": env.llm_max_output_tokens_short,
            "medium": env.llm_max_output_tokens_medium,
            "long": env.llm_max_output_tokens,
        },
        "max_input_chars": env.chat_max_input_chars,
        "history_messages": env.chat_history_messages_sent,
    }


def turn_limits(tier: str) -> dict[str, Any]:
    caps = configured_limits()["max_output"]
    return {
        "context_window": env.llm_context_window_tokens,
        "tier": tier or None,
        "max_output_tokens": caps.get(tier) if tier else None,
    }


def record_turn(
    db: Database,
    *,
    meter: TokenUsage,
    sec_ctx: SecurityContext,
    session_id: str,
    store_code: str,
    tier: str,
    ist_date: date,
) -> None:
    """Store one turn's usage. Skipped when no LLM call happened; never raises."""
    if meter.llm_calls <= 0:
        return
    doc: dict[str, Any] = {
        "username": sec_ctx.username,
        "user_id": sec_ctx.user_id,
        "store_code": store_code,
        "session_id": session_id,
        "ist_date": ist_date.isoformat(),
        "tier": tier or None,
        "models": list(meter.models),
        "llm_calls": meter.llm_calls,
        "created_at": datetime.now(timezone.utc),
    }
    for name in TOKEN_FIELDS:
        doc[name] = getattr(meter, name)
    try:
        db[LLM_USAGE].insert_one(doc)
    except Exception as e:  # a usage write must never fail a chat turn
        logger.warning("Could not record LLM usage: %s", type(e).__name__)


def _sum(db: Database, match: dict[str, Any]) -> dict[str, int]:
    totals = {name: 0 for name in TOKEN_FIELDS}
    totals["llm_calls"] = 0
    totals["turns"] = 0
    for d in db[LLM_USAGE].find(match, {name: 1 for name in (*TOKEN_FIELDS, "llm_calls")}):
        for name in (*TOKEN_FIELDS, "llm_calls"):
            totals[name] += int(d.get(name) or 0)
        totals["turns"] += 1
    return totals


def _last_turn(db: Database, match: dict[str, Any]) -> dict[str, Any] | None:
    d = db[LLM_USAGE].find_one(match, sort=[("created_at", -1)])
    if not d:
        return None
    out: dict[str, Any] = {name: int(d.get(name) or 0) for name in TOKEN_FIELDS}
    out["llm_calls"] = int(d.get("llm_calls") or 0)
    out["models"] = list(d.get("models") or [])
    out["tier"] = d.get("tier")
    created = d.get("created_at")
    out["created_at"] = created.isoformat() if isinstance(created, datetime) else created
    return out


def usage_summary(
    db: Database,
    sec_ctx: SecurityContext,
    today: date,
    session_id: str | None = None,
) -> dict[str, Any]:
    mine = {"username": sec_ctx.username}
    session_totals = None
    last_turn = _last_turn(db, mine)
    if session_id and SessionMemoryStore._owned_session(db, session_id, sec_ctx):
        scoped = {**mine, "session_id": session_id}
        session_totals = _sum(db, scoped)
        last_turn = _last_turn(db, scoped)
    return {
        "model": env.gemini_model,
        "fallback_models": [m.strip() for m in (env.gemini_fallback_models or "").split(",") if m.strip()],
        "limits": configured_limits(),
        "today": _sum(db, {**mine, "ist_date": today.isoformat()}),
        "session": session_totals,
        "last_turn": last_turn,
    }
