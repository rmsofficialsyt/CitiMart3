"""Chatbot state definitions, SecurityContext, and Agent schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


class SecurityContext(BaseModel):
    """Immutable RBAC Security Boundary passed to all coordinator and sub-agent nodes."""
    user_id: str
    username: str = "citimart_user"
    role: str = "store_manager"
    store_code: str | None = "NM"
    is_admin: bool = False
    allowed_stores: list[str] = Field(default_factory=lambda: ["NM"])  # e.g. ['NM'] for NM manager; ['NM', 'HB', 'CHW', 'ALL'] for admin

    def check_store_access(self, target_store: str) -> bool:
        """Validate whether the current user is authorized to inspect target_store."""
        if self.is_admin:
            return True
        return target_store.strip().upper() == (self.store_code or "").strip().upper()


class ChatTurn(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    subagent_traces: list[str] = Field(default_factory=list)
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ChatResponse(BaseModel):
    reply: str
    engine: str
    store: str = ""
    date: str = ""
    store_code: str = ""
    target_date: str = ""
    session_id: str
    subagents_invoked: list[str] = Field(default_factory=list)
    subagents_executed: list[str] = Field(default_factory=list)
    tools_executed: list[str] = Field(default_factory=list)
    # {kind: "app"|"source", label, href}, built by src.chat.links (never by the model).
    links: list[dict[str, str]] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    # Co-Pilot usage window (src/chat/usage.py): this turn's Gemini token counts,
    # the answer tier, and the configured caps it ran under. Display only.
    response_tier: str = ""
    usage: dict[str, Any] | None = None
    limits: dict[str, Any] | None = None

    def model_post_init(self, __context: Any) -> None:
        if not self.store and self.store_code:
            self.store = self.store_code
        if not self.store_code and self.store:
            self.store_code = self.store
        if not self.date and self.target_date:
            self.date = self.target_date
        if not self.target_date and self.date:
            self.target_date = self.date
        if not self.subagents_invoked and self.subagents_executed:
            self.subagents_invoked = self.subagents_executed
        if not self.subagents_executed and self.subagents_invoked:
            self.subagents_executed = self.subagents_invoked
