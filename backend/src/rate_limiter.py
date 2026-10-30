"""In-memory thread-safe sliding window rate limiter for CITIMART API endpoints.

Mitigates:
- Brute-force credential guessing on POST /api/auth/login (AUTH-01 / API-02)
- Cost/resource abuse on POST /api/daily/chat (AI-03 / API-02)
"""
from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 60, name: str = "rate_limit"):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.name = name
        self._history: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str) -> None:
        """Check if request under `key` is allowed. Raises HTTP 429 if limit exceeded."""
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            valid_timestamps = [t for t in self._history[key] if t > cutoff]
            if len(valid_timestamps) >= self.max_requests:
                self._history[key] = valid_timestamps
                retry_after = int(valid_timestamps[0] + self.window_seconds - now) + 1
                raise HTTPException(
                    status_code=429,
                    detail=f"Too many requests for {self.name}. Please wait {retry_after}s before retrying.",
                    headers={"Retry-After": str(max(1, retry_after))},
                )
            valid_timestamps.append(now)
            self._history[key] = valid_timestamps

    def reset(self) -> None:
        """Clear limiter state (for test fixtures)."""
        with self._lock:
            self._history.clear()


def get_client_ip(request: Request) -> str:
    """Extract client IP, inspecting X-Forwarded-For if behind a proxy/CDN."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# Pre-configured instances
login_limiter = SlidingWindowRateLimiter(max_requests=25, window_seconds=60, name="login")
chat_limiter = SlidingWindowRateLimiter(max_requests=40, window_seconds=60, name="chat")
