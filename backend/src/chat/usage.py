"""Per-turn Gemini token metering for the Co-Pilot usage window.

`generate_llm_response` returns plain text, and several callers (coordinator,
intent router, WhatsApp agent) depend on that, so usage is collected out of band
via a context variable: `client.py` calls `record()` after every model response,
and a caller that wants the totals wraps its work in `metering()`. With no meter
active, `record()` is a no-op.

Display only: nothing here limits or blocks a call.
"""
from __future__ import annotations

import contextvars
import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Iterator

# (snake_case SDK attribute, camelCase REST key) per field.
_FIELDS: dict[str, tuple[str, str]] = {
    "input_tokens": ("prompt_token_count", "promptTokenCount"),
    "output_tokens": ("candidates_token_count", "candidatesTokenCount"),
    "thinking_tokens": ("thoughts_token_count", "thoughtsTokenCount"),
    "cached_tokens": ("cached_content_token_count", "cachedContentTokenCount"),
    "total_tokens": ("total_token_count", "totalTokenCount"),
}
TOKEN_FIELDS: tuple[str, ...] = tuple(_FIELDS)


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    cached_tokens: int = 0
    total_tokens: int = 0
    llm_calls: int = 0
    models: list[str] = field(default_factory=list)
    # Sub-agents run in a thread pool (with a copied context), so adds can race.
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def add(self, counts: dict[str, int], model: str = "") -> None:
        with self._lock:
            self._add(counts, model)

    def _add(self, counts: dict[str, int], model: str) -> None:
        for name in TOKEN_FIELDS:
            setattr(self, name, getattr(self, name) + int(counts.get(name, 0) or 0))
        self.llm_calls += 1
        if model and model not in self.models:
            self.models.append(model)

    def as_dict(self) -> dict[str, Any]:
        out = {name: getattr(self, name) for name in TOKEN_FIELDS}
        out["llm_calls"] = self.llm_calls
        out["models"] = list(self.models)
        return out


_current: contextvars.ContextVar[TokenUsage | None] = contextvars.ContextVar("llm_usage_meter", default=None)


def _read(meta: Any, snake: str, camel: str) -> int:
    if meta is None:
        return 0
    if isinstance(meta, dict):
        value = meta.get(camel, meta.get(snake))
    else:
        value = getattr(meta, snake, None)
        if value is None:
            value = getattr(meta, camel, None)
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def parse_usage(meta: Any) -> dict[str, int]:
    """Token counts from an SDK `usage_metadata` object or a REST `usageMetadata` dict."""
    counts = {name: _read(meta, snake, camel) for name, (snake, camel) in _FIELDS.items()}
    if not counts["total_tokens"]:
        counts["total_tokens"] = counts["input_tokens"] + counts["output_tokens"] + counts["thinking_tokens"]
    return counts


def record(meta: Any, model: str = "") -> None:
    """Add one model response's usage to the active meter, if any. Never raises."""
    meter = _current.get()
    if meter is None:
        return
    try:
        meter.add(parse_usage(meta), model)
    except Exception:  # metering must never break a chat turn
        pass


@contextmanager
def metering() -> Iterator[TokenUsage]:
    """Collect usage of every LLM call made inside the block."""
    meter = TokenUsage()
    token = _current.set(meter)
    try:
        yield meter
    finally:
        _current.reset(token)
