"""Server-side session registry: short-lived access JWTs + rotating refresh
tokens (AUTH-05) and a per-user session list (AUTH-06).

Model
-----
* Login creates a session `sid` and an opaque refresh token. The access JWT
  carries `sid`; api/auth.py checks the session is still live on every
  request (one HMGET, ~0.4 ms on Redis), which is what makes logout and
  "revoke this session" take effect immediately instead of at token expiry.
* POST /api/auth/refresh trades a refresh token for a new access JWT *and a
  new refresh token*; the old one is consumed. Presenting a consumed token
  again is treated as theft (RFC 9700 / OAuth BCP refresh-token rotation):
  the whole session is revoked -- unless it comes within REUSE_GRACE_SECONDS
  of the rotation, which is two browser tabs racing on the same cookie, not
  an attacker; that case gets RefreshConflict so the client retries with
  the cookie the winning tab just received.
* Absolute expiry = refresh_token_ttl_seconds from login, never extended by
  rotation. Idle expiry = session_idle_timeout_seconds without a refresh.

Storage
-------
Redis keys (every one with a TTL -- the shared Redis runs noeviction for
BullMQ, so an un-expiring key would leak forever):
  sess:{sid}            HASH username, role, store_code, switched_from, user_id,
                        ip, ua, created_at, last_seen_at, expires_at
  user_sess:{username}  SET of sids
  rt:{sha256(token)}    STRING "{sid}"            live refresh token
  rt_used:{sha256}      STRING "{sid}|{used_at}"  consumed refresh token
Refresh tokens are stored only as SHA-256 hashes (they're 384-bit random, so
a fast hash is the right tool -- this isn't a password).

With REDIS_URL unset, an in-process store with identical semantics is used
(single worker only; app.py warns when that's misconfigured). When Redis IS
configured and errors, operations raise SessionStoreUnavailable and callers
fail closed with 503 (INP-10) -- never "assume the session is fine".
"""
from __future__ import annotations

import hashlib
import secrets
import threading
import time
from dataclasses import dataclass

import redis

from config.env import env
from db.redis_client import get_redis

REUSE_GRACE_SECONDS = 20


class SessionStoreUnavailable(RuntimeError):
    """Redis is configured but unreachable -- callers must deny (INP-10)."""


class InvalidRefreshToken(Exception):
    """Unknown, expired, revoked or replayed refresh token."""


class RefreshConflict(Exception):
    """A just-rotated token was reused inside the grace window (racing tabs)."""


@dataclass(frozen=True)
class Session:
    sid: str
    username: str
    role: str
    store_code: str | None
    switched_from: str | None
    user_id: str
    created_at: int
    expires_at: int


@dataclass(frozen=True)
class IssuedSession:
    session: Session
    refresh_token: str


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> int:
    return int(time.time())


# Atomic rotation. KEYS: rt:{old}, rt_used:{old}, rt:{new}.
# ARGV: now, idle_timeout_seconds, reuse_grace_seconds.
# Returns {status, sid}: status 1=ok, 0=invalid, 2=conflict(grace), 3=replay(revoked)
_ROTATE_LUA = """
local now = tonumber(ARGV[1])
local idle = tonumber(ARGV[2])
local grace = tonumber(ARGV[3])
local sid = redis.call('GET', KEYS[1])
if not sid then
  local used = redis.call('GET', KEYS[2])
  if not used then return {0, ''} end
  local sep = string.find(used, '|', 1, true)
  local used_sid = string.sub(used, 1, sep - 1)
  local used_at = tonumber(string.sub(used, sep + 1))
  if now - used_at <= grace and redis.call('EXISTS', 'sess:' .. used_sid) == 1 then
    return {2, used_sid}
  end
  local uname = redis.call('HGET', 'sess:' .. used_sid, 'username')
  redis.call('DEL', 'sess:' .. used_sid)
  if uname then redis.call('SREM', 'user_sess:' .. uname, used_sid) end
  return {3, used_sid}
end
local skey = 'sess:' .. sid
local fields = redis.call('HMGET', skey, 'last_seen_at', 'expires_at')
if not fields[2] then
  redis.call('DEL', KEYS[1])
  return {0, ''}
end
local expires_at = tonumber(fields[2])
if now >= expires_at or now - tonumber(fields[1]) > idle then
  local uname = redis.call('HGET', skey, 'username')
  redis.call('DEL', skey, KEYS[1])
  if uname then redis.call('SREM', 'user_sess:' .. uname, sid) end
  return {0, ''}
end
local ttl = expires_at - now
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[2], sid .. '|' .. now, 'EX', ttl)
redis.call('SET', KEYS[3], sid, 'EX', ttl)
redis.call('HSET', skey, 'last_seen_at', now)
return {1, sid}
"""


# ---------------------------------------------------------------------------
# In-process fallback (REDIS_URL unset)
# ---------------------------------------------------------------------------

class _MemoryStore:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.sessions: dict[str, dict] = {}
        self.user_sessions: dict[str, set[str]] = {}
        self.refresh: dict[str, tuple[str, int]] = {}  # hash -> (sid, expires_at)
        self.used: dict[str, tuple[str, int, int]] = {}  # hash -> (sid, used_at, expires_at)

    def clear(self) -> None:
        with self.lock:
            self.sessions.clear()
            self.user_sessions.clear()
            self.refresh.clear()
            self.used.clear()

    def _drop(self, sid: str) -> None:
        data = self.sessions.pop(sid, None)
        if data:
            self.user_sessions.get(data["username"], set()).discard(sid)


_memory = _MemoryStore()


def reset_for_tests() -> None:
    _memory.clear()


def _redis_or_none() -> redis.Redis | None:
    return get_redis()


def _session_from_hash(sid: str, data: dict) -> Session:
    return Session(
        sid=sid,
        username=data["username"],
        role=data["role"],
        store_code=data.get("store_code") or None,
        switched_from=data.get("switched_from") or None,
        user_id=data.get("user_id", ""),
        created_at=int(data.get("created_at", 0)),
        expires_at=int(data.get("expires_at", 0)),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_session(
    *,
    user_id: str,
    username: str,
    role: str,
    store_code: str | None,
    switched_from: str | None = None,
    ip: str = "",
    user_agent: str = "",
) -> IssuedSession:
    sid = secrets.token_urlsafe(24)
    refresh_token = secrets.token_urlsafe(48)
    now = _now()
    ttl = env.refresh_token_ttl_seconds
    data = {
        "username": username,
        "role": role,
        "store_code": store_code or "",
        "switched_from": switched_from or "",
        "user_id": user_id,
        "ip": ip,
        "ua": (user_agent or "")[:200],
        "created_at": now,
        "last_seen_at": now,
        "expires_at": now + ttl,
    }
    client = _redis_or_none()
    if client is None:
        with _memory.lock:
            _memory.sessions[sid] = dict(data)
            _memory.user_sessions.setdefault(username, set()).add(sid)
            _memory.refresh[_hash(refresh_token)] = (sid, now + ttl)
    else:
        try:
            pipe = client.pipeline(transaction=True)
            pipe.hset(f"sess:{sid}", mapping=data)
            pipe.expire(f"sess:{sid}", ttl)
            pipe.sadd(f"user_sess:{username}", sid)
            pipe.expire(f"user_sess:{username}", ttl)
            pipe.set(f"rt:{_hash(refresh_token)}", sid, ex=ttl)
            pipe.execute()
        except redis.RedisError as error:
            raise SessionStoreUnavailable("session store unavailable") from error
    session = _session_from_hash(sid, {k: str(v) for k, v in data.items()})
    return IssuedSession(session=session, refresh_token=refresh_token)


def is_session_active(sid: str, username: str | None = None) -> bool:
    """Hot path for every authenticated request. True iff the session exists,
    hasn't hit its absolute expiry, and (when given) belongs to `username`."""
    if not sid:
        return False
    client = _redis_or_none()
    if client is None:
        with _memory.lock:
            data = _memory.sessions.get(sid)
            if not data:
                return False
            if _now() >= int(data["expires_at"]):
                _memory._drop(sid)
                return False
            return username is None or data["username"] == username
    try:
        stored_user, expires_at = client.hmget(f"sess:{sid}", "username", "expires_at")
    except redis.RedisError as error:
        raise SessionStoreUnavailable("session store unavailable") from error
    if stored_user is None or expires_at is None or _now() >= int(expires_at):
        return False
    return username is None or stored_user == username


def get_session(sid: str) -> Session | None:
    client = _redis_or_none()
    if client is None:
        with _memory.lock:
            data = _memory.sessions.get(sid)
            return _session_from_hash(sid, {k: str(v) for k, v in data.items()}) if data else None
    try:
        data = client.hgetall(f"sess:{sid}")
    except redis.RedisError as error:
        raise SessionStoreUnavailable("session store unavailable") from error
    return _session_from_hash(sid, data) if data else None


def rotate_refresh_token(refresh_token: str) -> IssuedSession:
    """Consume `refresh_token`, returning the session and a fresh token.
    Raises InvalidRefreshToken (also after revoking a replayed session) or
    RefreshConflict (benign concurrent reuse)."""
    if not refresh_token or len(refresh_token) > 256:
        raise InvalidRefreshToken()
    old_hash = _hash(refresh_token)
    new_token = secrets.token_urlsafe(48)
    new_hash = _hash(new_token)
    now = _now()
    client = _redis_or_none()

    if client is None:
        with _memory.lock:
            live = _memory.refresh.pop(old_hash, None)
            if live is None:
                used = _memory.used.get(old_hash)
                if used is None or now >= used[2]:
                    raise InvalidRefreshToken()
                used_sid, used_at, _ = used
                if now - used_at <= REUSE_GRACE_SECONDS and used_sid in _memory.sessions:
                    raise RefreshConflict()
                _memory._drop(used_sid)
                raise InvalidRefreshToken()
            sid, _ = live
            data = _memory.sessions.get(sid)
            if not data:
                raise InvalidRefreshToken()
            expires_at = int(data["expires_at"])
            if now >= expires_at or now - int(data["last_seen_at"]) > env.session_idle_timeout_seconds:
                _memory._drop(sid)
                raise InvalidRefreshToken()
            _memory.used[old_hash] = (sid, now, expires_at)
            _memory.refresh[new_hash] = (sid, expires_at)
            data["last_seen_at"] = now
            session = _session_from_hash(sid, {k: str(v) for k, v in data.items()})
        return IssuedSession(session=session, refresh_token=new_token)

    try:
        status, sid = client.eval(
            _ROTATE_LUA, 3, f"rt:{old_hash}", f"rt_used:{old_hash}", f"rt:{new_hash}",
            now, env.session_idle_timeout_seconds, REUSE_GRACE_SECONDS,
        )
    except redis.RedisError as error:
        raise SessionStoreUnavailable("session store unavailable") from error
    status = int(status)
    if status == 2:
        raise RefreshConflict()
    if status != 1:
        raise InvalidRefreshToken()
    session = get_session(sid)
    if session is None:  # revoked between the script and this read
        raise InvalidRefreshToken()
    return IssuedSession(session=session, refresh_token=new_token)


def peek_refresh_session(refresh_token: str) -> str | None:
    """The sid a still-live refresh token belongs to, without consuming it
    (used by logout when the caller has no valid access token)."""
    if not refresh_token or len(refresh_token) > 256:
        return None
    h = _hash(refresh_token)
    client = _redis_or_none()
    if client is None:
        with _memory.lock:
            live = _memory.refresh.get(h)
            return live[0] if live else None
    try:
        return client.get(f"rt:{h}")
    except redis.RedisError as error:
        raise SessionStoreUnavailable("session store unavailable") from error


def revoke_session(sid: str) -> bool:
    """Delete one session. Its refresh tokens die with it: rotation checks
    sess:{sid} exists before honoring any token."""
    client = _redis_or_none()
    if client is None:
        with _memory.lock:
            existed = sid in _memory.sessions
            _memory._drop(sid)
            return existed
    try:
        username = client.hget(f"sess:{sid}", "username")
        pipe = client.pipeline(transaction=True)
        pipe.delete(f"sess:{sid}")
        if username:
            pipe.srem(f"user_sess:{username}", sid)
        removed = pipe.execute()[0]
        return bool(removed)
    except redis.RedisError as error:
        raise SessionStoreUnavailable("session store unavailable") from error


def list_user_sessions(username: str) -> list[dict]:
    """Live sessions for `username`, newest first. Prunes stale set members."""
    client = _redis_or_none()
    out: list[dict] = []
    if client is None:
        with _memory.lock:
            for sid in list(_memory.user_sessions.get(username, set())):
                data = _memory.sessions.get(sid)
                if data and _now() < int(data["expires_at"]):
                    out.append({"sid": sid, **{k: str(v) for k, v in data.items()}})
    else:
        try:
            sids = list(client.smembers(f"user_sess:{username}"))
            pipe = client.pipeline(transaction=False)
            for sid in sids:
                pipe.hgetall(f"sess:{sid}")
            rows = pipe.execute() if sids else []
            stale = []
            for sid, data in zip(sids, rows):
                if data:
                    out.append({"sid": sid, **data})
                else:
                    stale.append(sid)
            if stale:
                client.srem(f"user_sess:{username}", *stale)
        except redis.RedisError as error:
            raise SessionStoreUnavailable("session store unavailable") from error
    out.sort(key=lambda d: int(d.get("created_at", 0)), reverse=True)
    return out


def session_belongs_to(sid: str, username: str) -> bool:
    s = get_session(sid)
    return s is not None and s.username == username


def revoke_all_user_sessions(username: str) -> int:
    """Revoke every session of `username` (logout-all, password change)."""
    count = 0
    for row in list_user_sessions(username):
        if revoke_session(row["sid"]):
            count += 1
    return count
