"""Sliding-window rate limiting for CITIMART API endpoints (API-02).

Mitigates:
- Brute-force credential guessing on POST /api/auth/login (AUTH-01 / API-02)
- Cost/resource abuse on POST /api/daily/chat (AI-03 / API-02)

Two backends behind one `check(key)` / `hit(key)` interface:

* Redis (REDIS_URL set) -- an atomic Lua script over a sorted set per key,
  shared by every worker and replica. API-02 requires a shared store in
  multi-instance deployments: with per-process counters, N workers would
  quietly multiply every limit by N.
* In-process (REDIS_URL unset, or Redis erroring) -- the original
  dict + Lock implementation. If Redis fails mid-flight we degrade to this
  rather than failing open (no limit at all) or failing closed (nobody can
  log in): the limit still holds per process.

Login uses two limiters with different semantics (see check_login_* below):
every attempt counts against the per-IP burst cap, but only FAILED attempts
count against the per-(IP, username) cap. There are only four accounts, so a
store network behind one NAT legitimately produces many successful logins
to the same username; it's repeated *failures* that signal guessing.
"""
from __future__ import annotations

import ipaddress
import logging
import time
import uuid
from collections import defaultdict
from functools import lru_cache
from threading import Lock

import redis
from fastapi import HTTPException, Request

from config.env import env
from db.redis_client import get_redis

logger = logging.getLogger(__name__)

# KEYS[1] = bucket. ARGV = window_ms, limit, member, record(1/0).
# Uses the Redis server clock (TIME), not the caller's, so replicas with
# skewed clocks still share one consistent window. Returns {allowed, retry_ms}.
_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local window_ms = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]
local record = ARGV[4] == '1'
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_ms = window_ms
  if oldest[2] then retry_ms = window_ms - (now - tonumber(oldest[2])) end
  return {0, retry_ms}
end
if record then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window_ms)
end
return {1, 0}
"""


def _too_many(name: str, retry_after: int) -> HTTPException:
    retry_after = max(1, retry_after)
    return HTTPException(
        status_code=429,
        detail=f"Too many requests for {name}. Please wait {retry_after}s before retrying.",
        headers={"Retry-After": str(retry_after)},
    )


class SlidingWindowRateLimiter:
    """In-process sliding window. Correct for exactly one worker process."""

    def __init__(self, max_requests: int, window_seconds: int = 60, name: str = "rate_limit"):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.name = name
        self._history: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def _evaluate(self, key: str, record: bool) -> None:
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            valid = [t for t in self._history[key] if t > cutoff]
            if len(valid) >= self.max_requests:
                self._history[key] = valid
                raise _too_many(self.name, int(valid[0] + self.window_seconds - now) + 1)
            if record:
                valid.append(now)
            if valid:
                self._history[key] = valid
            else:
                self._history.pop(key, None)

    def check(self, key: str) -> None:
        """Count this request and raise HTTP 429 if `key` is over its limit."""
        self._evaluate(key, record=True)

    def peek(self, key: str) -> None:
        """Raise 429 if `key` is already at its limit, without counting."""
        self._evaluate(key, record=False)

    def hit(self, key: str) -> None:
        """Record one event for `key` without enforcing (e.g. a failed login)."""
        now = time.time()
        with self._lock:
            self._history[key].append(now)

    def reset(self) -> None:
        """Clear limiter state (for test fixtures)."""
        with self._lock:
            self._history.clear()


class RedisSlidingWindowRateLimiter:
    """Redis-shared sliding window with an in-process fallback.

    Uses Redis whenever get_redis() returns a client; otherwise -- or if a
    Redis call raises -- delegates to an in-process SlidingWindowRateLimiter
    with the same parameters."""

    def __init__(self, max_requests: int, window_seconds: int = 60, name: str = "rate_limit", prefix: str | None = None):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.name = name
        self.prefix = prefix or f"rl:{name}"
        self._local = SlidingWindowRateLimiter(max_requests, window_seconds, name)
        self._script = None
        self._script_client = None

    def _redis_eval(self, key: str, record: bool) -> tuple[int, int] | None:
        client = get_redis()
        if client is None:
            return None
        try:
            if self._script is None or self._script_client is not client:
                self._script = client.register_script(_SLIDING_WINDOW_LUA)
                self._script_client = client
            allowed, retry_ms = self._script(
                keys=[f"{self.prefix}:{key}"],
                args=[self.window_seconds * 1000, self.max_requests, f"{time.time_ns()}-{uuid.uuid4().hex[:8]}", "1" if record else "0"],
            )
            return int(allowed), int(retry_ms)
        except redis.RedisError:
            logger.warning("Rate limiter %s: Redis unavailable, using in-process fallback.", self.name, exc_info=True)
            return None

    def _enforce(self, key: str, record: bool) -> None:
        result = self._redis_eval(key, record)
        if result is None:
            (self._local.check if record else self._local.peek)(key)
            return
        allowed, retry_ms = result
        if not allowed:
            raise _too_many(self.name, (retry_ms + 999) // 1000)

    def check(self, key: str) -> None:
        self._enforce(key, record=True)

    def peek(self, key: str) -> None:
        self._enforce(key, record=False)

    def hit(self, key: str) -> None:
        client = get_redis()
        if client is not None:
            try:
                bucket = f"{self.prefix}:{key}"
                now_ms = int(time.time() * 1000)
                pipe = client.pipeline(transaction=True)
                pipe.zadd(bucket, {f"{time.time_ns()}-{uuid.uuid4().hex[:8]}": now_ms})
                pipe.pexpire(bucket, self.window_seconds * 1000)
                pipe.execute()
                return
            except redis.RedisError:
                logger.warning("Rate limiter %s: Redis unavailable, using in-process fallback.", self.name, exc_info=True)
        self._local.hit(key)

    def reset(self) -> None:
        """Test helper: clears the in-process fallback only."""
        self._local.reset()


@lru_cache(maxsize=8)
def _trusted_networks(spec: str) -> tuple[ipaddress._BaseNetwork, ...]:
    nets = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            nets.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            logger.warning("Ignoring invalid TRUSTED_PROXY_IPS entry: %r", part)
    return tuple(nets)


def _is_trusted(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in _trusted_networks(env.trusted_proxy_ips))


def get_client_ip(request: Request) -> str:
    """The caller's IP for rate-limit keys.

    X-Forwarded-For is only believed when the direct peer is a trusted proxy
    (TRUSTED_PROXY_IPS). Then the chain is walked right-to-left -- each hop
    appends the address it received from -- and the first address that is
    NOT itself a trusted proxy is the client. Taking the *leftmost* entry
    (the previous behavior) let any caller pick their own bucket by sending
    `X-Forwarded-For: <random>`."""
    peer = request.client.host if request.client else "127.0.0.1"
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded or not _is_trusted(peer):
        return peer
    hops = [h.strip() for h in forwarded.split(",") if h.strip()]
    for hop in reversed(hops):
        if not _is_trusted(hop):
            return hop
    return hops[0] if hops else peer


# Pre-configured instances.
login_ip_limiter = RedisSlidingWindowRateLimiter(env.login_rate_limit_per_ip, 60, name="login", prefix="rl:login:ip")
login_failure_limiter = RedisSlidingWindowRateLimiter(env.login_rate_limit_per_account, 60, name="login", prefix="rl:login:acct")
login_account_limiter = RedisSlidingWindowRateLimiter(
    env.login_failure_limit_per_account_global,
    env.login_account_lockout_window_seconds,
    name="this account",
    prefix="rl:login:user",
)
chat_limiter = RedisSlidingWindowRateLimiter(env.chat_rate_limit, 60, name="chat", prefix="rl:chat")
# Back-compat alias: the per-IP login limiter.
login_limiter = login_ip_limiter


def _account_key(ip: str, username: str) -> str:
    return f"{ip}:{(username or '').strip().casefold()}"


def _known_account(username: str) -> str | None:
    """Canonical username, or None for a name that isn't a real account --
    those get no all-IPs bucket (locking a nonexistent account protects
    nothing, and random names would otherwise each mint a new key)."""
    from config.auth_users import resolve_username

    return resolve_username(username or "")


def check_login_rate_limit(request: Request, username: str) -> str:
    """Before verifying a password: count the attempt against the per-IP
    burst cap, and refuse outright if this (IP, username) -- or the account
    across all IPs -- already has too many recent failures. Returns the
    resolved client IP."""
    ip = get_client_ip(request)
    login_ip_limiter.check(ip)
    login_failure_limiter.peek(_account_key(ip, username))
    account = _known_account(username)
    if account is not None:
        login_account_limiter.peek(account)
    return ip


def record_login_failure(ip: str, username: str) -> None:
    login_failure_limiter.hit(_account_key(ip, username))
    account = _known_account(username)
    if account is not None:
        login_account_limiter.hit(account)
