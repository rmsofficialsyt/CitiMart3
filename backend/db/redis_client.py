"""Lazily-created, process-wide Redis clients.

Same contract as db/engine.py's MongoDB client: importing this module never
requires Redis. Every caller asks get_redis() and gets either a client or
None, and None means "REDIS_URL is not configured -- use your in-process
fallback". That fallback is what keeps the test suite (and a single-worker
dev run) dependency-free.

Deliberately the *sync* redis-py client, not redis.asyncio. Every route that
touches MongoDB here is a sync `def` (pymongo is sync), so FastAPI already
runs it in the threadpool; an asyncio pool would be a second pool whose
connections are bound to the event loop that created them, which breaks the
moment anything (TestClient, the BullMQ worker thread) runs a different loop.
redis-py with the hiredis parser costs the same ~0.3-0.5 ms per round trip
either way. The threadpool is widened in app.py's lifespan instead
(env.threadpool_size) so a login burst isn't capped at anyio's default 40.

Two clients share one URL: `get_redis()` decodes responses to str (sessions,
rate limits, JSON cache), `get_redis_bytes()` doesn't (report artifacts are
binary PDF/XLSX bytes).
"""
from __future__ import annotations

import logging
import threading

import redis

from config.env import env

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_client: redis.Redis | None = None
_bytes_client: redis.Redis | None = None
# Test hook: when set, returned instead of building a real client.
_override: tuple[redis.Redis, redis.Redis] | None = None


def _build(decode: bool) -> redis.Redis:
    pool = redis.BlockingConnectionPool.from_url(
        env.redis_url,
        max_connections=env.redis_max_connections,
        timeout=2,  # wait at most 2s for a free pooled connection
        decode_responses=decode,
        socket_connect_timeout=2,
        socket_timeout=2,
        health_check_interval=30,
        retry_on_timeout=True,
    )
    return redis.Redis(connection_pool=pool)


def get_redis() -> redis.Redis | None:
    """str-decoding client, or None when REDIS_URL is unset."""
    global _client
    if _override is not None:
        return _override[0]
    if not env.redis_url:
        return None
    if _client is None:
        with _lock:
            if _client is None:
                _client = _build(decode=True)
    return _client


def get_redis_bytes() -> redis.Redis | None:
    """bytes client (no decoding), or None when REDIS_URL is unset."""
    global _bytes_client
    if _override is not None:
        return _override[1]
    if not env.redis_url:
        return None
    if _bytes_client is None:
        with _lock:
            if _bytes_client is None:
                _bytes_client = _build(decode=False)
    return _bytes_client


def redis_configured() -> bool:
    return _override is not None or bool(env.redis_url)


def ping_redis() -> str:
    """'disabled' | 'ok' | 'degraded' -- non-sensitive, for /api/health."""
    client = get_redis()
    if client is None:
        return "disabled"
    try:
        return "ok" if client.ping() else "degraded"
    except redis.RedisError:
        return "degraded"


def warmup_redis() -> bool:
    """Open the first pooled connection at startup so the first request
    doesn't pay the TCP (+TLS) handshake."""
    return ping_redis() == "ok"


def close_redis() -> None:
    global _client, _bytes_client
    with _lock:
        for c in (_client, _bytes_client):
            if c is not None:
                try:
                    c.close()
                    c.connection_pool.disconnect()
                except Exception:  # noqa: BLE001 -- best-effort shutdown
                    pass
        _client = None
        _bytes_client = None


def set_redis_for_tests(text_client: redis.Redis | None, bytes_client: redis.Redis | None = None) -> None:
    """Test-only: route get_redis()/get_redis_bytes() to (fake) clients;
    pass None to restore normal REDIS_URL-driven behavior."""
    global _override
    if text_client is None:
        _override = None
    else:
        _override = (text_client, bytes_client or text_client)
