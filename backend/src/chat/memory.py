"""Persistent Session Memory Store for CITIMART Copilot.

Stores conversations in MongoDB Atlas (`chat_sessions` and `chat_messages` collections)
with optional Redis caching and strict Multi-Tenant user isolation.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import secrets
from typing import Any
from pymongo.database import Database

from config.env import env
from db.redis_client import get_redis
from src.chat.state import SecurityContext

logger = logging.getLogger(__name__)

SESSIONS_COLLECTION = "chat_sessions"
MESSAGES_COLLECTION = "chat_messages"

# Chronological message order. `seq` is 0 for the user message and 1 for the
# assistant reply of the same turn; `_id` (insertion order) breaks any
# remaining tie, including turns stored before `seq` existed.
_MESSAGE_ORDER = (("timestamp", 1), ("seq", 1), ("_id", 1))


def _detect_retail_shift_phase() -> str:
    from datetime import datetime, timezone, timedelta
    kolkata_time = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    h = kolkata_time.hour
    if 10 <= h < 14:
        return "morning_briefing"
    elif 14 <= h < 17:
        return "midday_pacing"
    elif 17 <= h < 21:
        return "evening_surge"
    return "night_closing"


def _derive_retail_title(query: str, store_code: str) -> str:
    q_lower = query.lower()
    if any(k in q_lower for k in ["yesterday", "গতকালের", "कल"]):
        return f"📊 Yesterday's Sales Audit ({store_code})"
    if any(k in q_lower for k in ["7 days", "past week", "৭ দিন", "7 दिन"]):
        return f"📅 7-Day Trend Table ({store_code})"
    if any(k in q_lower for k in ["target adjustment", "carry forward", "rolling", "অ্যাডজাস্টমেন্ট", "समायोजन"]):
        return f"🎯 Target Deficit Recovery ({store_code})"
    if any(k in q_lower for k in ["peak", "evening", "surge", "পিক", "पीक"]):
        return f"⏰ Peak Surge Pacing ({store_code})"
    if any(k in q_lower for k in ["weather", "rain", "আবহাওয়া", "मौसम"]):
        return f"🌦️ Weather & Footfall ({store_code})"
    if any(k in q_lower for k in ["mtd", "month to date", "চলতি মাস", "इस महीने"]):
        return f"📆 MTD Monthly Pacing ({store_code})"
    return f"🏬 {store_code} Shift ({query[:30]}...)"


class SessionMemoryStore:
    """Manages role-isolated multi-turn conversational session history."""

    @staticmethod
    def get_or_create_session(
        db: Database,
        session_id: str | None,
        sec_ctx: SecurityContext,
        store_code: str,
        initial_title: str | None = None,
    ) -> str:
        """Fetch existing session if valid & owned, or create a new session."""
        now = datetime.now(timezone.utc).isoformat()
        if session_id:
            query = {"session_id": session_id}
            if not sec_ctx.is_admin:
                query["user_id"] = sec_ctx.user_id

            existing = db[SESSIONS_COLLECTION].find_one(query)
            # A session belongs to one store: its history (and the dates it
            # carried over) describe that store. Continuing it under another
            # store would mix two stores' figures in one conversation.
            if existing and (existing.get("store_code") or store_code) == store_code:
                db[SESSIONS_COLLECTION].update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"updated_at": now}},
                )
                return session_id

        # Create new retail-aware session
        new_sid = f"sess_{secrets.token_urlsafe(10)}"
        shift_phase = _detect_retail_shift_phase()
        title = _derive_retail_title(initial_title or "Operational Check", store_code) if initial_title else f"🏬 {store_code} Shift - {datetime.now(timezone.utc).strftime('%d %b %H:%M')}"
        doc = {
            "session_id": new_sid,
            "user_id": sec_ctx.user_id,
            "username": sec_ctx.username,
            "role": sec_ctx.role,
            "store_code": store_code,
            "shift_phase": shift_phase,
            "title": title[:70],
            "created_at": now,
            "updated_at": now,
        }
        db[SESSIONS_COLLECTION].insert_one(doc)
        return new_sid

    @staticmethod
    def append_messages(
        db: Database,
        session_id: str,
        user_message: str,
        assistant_reply: str,
        subagents: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Record a completed conversation turn into persistent storage.

        The two documents used to share one timestamp, and history sorted on
        timestamp alone -- so a restored chat could show an answer before its
        question. `seq` + `_MESSAGE_ORDER` (timestamp, seq, _id) make the order
        deterministic, and the `_id` tiebreak also fixes already-stored turns.
        """
        user_ts = datetime.now(timezone.utc)
        assistant_ts = user_ts + timedelta(microseconds=1)
        db[MESSAGES_COLLECTION].insert_many([
            {
                "session_id": session_id,
                "role": "user",
                "content": user_message,
                "timestamp": user_ts.isoformat(),
                "seq": 0,
            },
            {
                "session_id": session_id,
                "role": "assistant",
                "content": assistant_reply,
                "subagents": subagents or (metadata.get("subagents_executed") if metadata else []),
                "metadata": metadata or {},
                "timestamp": assistant_ts.isoformat(),
                "seq": 1,
            },
        ])

        # Also update Redis if configured
        r = get_redis()
        if r:
            try:
                r.setex(f"chat:sess:{session_id}:active", 86400, "1")
            except Exception as e:
                logger.debug("Redis session touch failed: %s", e)

    @staticmethod
    def get_history(
        db: Database,
        session_id: str,
        sec_ctx: SecurityContext,
        max_turns: int | None = None,
    ) -> list[dict[str, str]]:
        """Recent turns for the LLM context window (capped), checking ownership."""
        if not SessionMemoryStore._owned_session(db, session_id, sec_ctx):
            return []

        limit = (max_turns or env.chat_max_history_turns) * 2
        raw_msgs = SessionMemoryStore._messages(db, session_id, limit=limit, newest_first=True)
        raw_msgs.reverse()
        return [{"role": m.get("role", "user"), "content": m.get("content", "")} for m in raw_msgs]

    @staticmethod
    def get_full_transcript(
        db: Database,
        session_id: str,
        sec_ctx: SecurityContext,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        """Whole conversation for re-opening it in the UI (not capped to the LLM window)."""
        if not SessionMemoryStore._owned_session(db, session_id, sec_ctx):
            return []
        return [
            {
                "role": m.get("role", "user"),
                "content": m.get("content", ""),
                "timestamp": m.get("timestamp"),
                "metadata": m.get("metadata") or {},
            }
            for m in SessionMemoryStore._messages(db, session_id, limit=limit, newest_first=False)
        ]

    @staticmethod
    def get_last_assistant_metadata(
        db: Database,
        session_id: str,
        sec_ctx: SecurityContext,
    ) -> dict[str, Any] | None:
        """Metadata of the latest assistant turn (used to carry a date into follow-ups)."""
        if not SessionMemoryStore._owned_session(db, session_id, sec_ctx):
            return None
        for m in SessionMemoryStore._messages(db, session_id, limit=4, newest_first=True):
            if m.get("role") == "assistant":
                return m.get("metadata") or {}
        return None

    @staticmethod
    def _owned_session(db: Database, session_id: str, sec_ctx: SecurityContext) -> dict[str, Any] | None:
        sess_query: dict[str, Any] = {"session_id": session_id}
        if not sec_ctx.is_admin:
            sess_query["user_id"] = sec_ctx.user_id
        return db[SESSIONS_COLLECTION].find_one(sess_query)

    @staticmethod
    def _messages(db: Database, session_id: str, limit: int, newest_first: bool) -> list[dict[str, Any]]:
        direction = -1 if newest_first else 1
        order = [(field, direction) for field, _ in _MESSAGE_ORDER]
        return list(db[MESSAGES_COLLECTION].find({"session_id": session_id}).sort(order).limit(limit))

    @staticmethod
    def list_user_sessions(
        db: Database,
        sec_ctx: SecurityContext,
        limit: int = 20,
        store_code: str | None = None,
    ) -> list[dict[str, Any]]:
        """List past chat sessions accessible to the current user (optionally one store's)."""
        query: dict[str, Any] = {}
        if not sec_ctx.is_admin:
            query["user_id"] = sec_ctx.user_id
        if store_code:
            query["store_code"] = store_code.strip().upper()

        cursor = db[SESSIONS_COLLECTION].find(query).sort("updated_at", -1).limit(limit)
        return [
            {
                "session_id": s.get("session_id"),
                "store_code": s.get("store_code"),
                "title": s.get("title"),
                "created_at": s.get("created_at"),
                "updated_at": s.get("updated_at"),
            }
            for s in cursor
        ]

    @staticmethod
    def delete_session(db: Database, session_id: str, sec_ctx: SecurityContext) -> bool:
        """Delete a chat session and all associated turns."""
        query: dict[str, Any] = {"session_id": session_id}
        if not sec_ctx.is_admin:
            query["user_id"] = sec_ctx.user_id

        res = db[SESSIONS_COLLECTION].delete_one(query)
        if res.deleted_count > 0:
            db[MESSAGES_COLLECTION].delete_many({"session_id": session_id})
            return True
        return False
