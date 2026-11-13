"""Authentication + authorization primitives for every /api/* route.

An incoming bearer token is a short-lived HS256 JWT this app issued itself
in api/routes_auth.py (after checking the password against the MongoDB
`users` collection). We verify it here with PyJWT against `env.jwt_secret`
(fixed algorithm, exp/sub required, iss/aud checked) and read `role` /
`store_code` / `username` straight off its claims -- no MongoDB lookup.

The one lookup we do make is the session check (AUTH-05 server-side
revocation): a token carrying `sid` is only honored while
src/session_store.py still holds that session -- one Redis HMGET, or a dict
lookup in single-process mode. If Redis is configured but unreachable the
request is refused with 503 (INP-10 fail closed), never waved through.

Tokens without `sid` predate the session registry. They're accepted only
while env.session_id_required() is False (default outside
ENVIRONMENT=production; the test suite signs such tokens directly) and
can't be revoked early -- they simply run out their original TTL.

Enforcement points (wired in app.py + api/deps.py + api/routes_daily.py):
  * every router gets dependencies=[Depends(get_current_user)]  -> 401 without a token
  * admin-only routers additionally get Depends(require_admin)
  * parse_daily_chart_state clamps `stores` to allowed_stores(...)
  * every api/routes_daily.py handler calls require_store_access(store, user)
"""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config.auth_users import AUTH_USERS
from config.env import env
from config.settings import STORE_CODE_TO_NAME
from src import session_store

_bearer = HTTPBearer(auto_error=False)

# app roles we accept.
_ROLES = {"admin", "manager"}


@dataclass(frozen=True)
class CurrentUser:
    sub: str
    username: str
    role: str
    store_code: str | None  # None for admin
    switched_from: str | None = None  # Original admin username if switched
    sid: str | None = None  # server-side session id (None on legacy tokens)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @property
    def is_switched(self) -> bool:
        return bool(self.switched_from)

    def allowed_stores(self, all_codes: list[str]) -> list[str]:
        """Admin -> every store in the dataset. Manager -> exactly their one."""
        if self.is_admin:
            return list(all_codes)
        return [self.store_code] if self.store_code else []


_INVALID = "Invalid or expired session."


def mint_access_token(session: "session_store.Session") -> tuple[str, int]:
    """Short-lived access JWT bound to a server-side session. Returns
    (token, ttl_seconds)."""
    now = int(time.time())
    ttl = env.access_token_ttl_seconds
    claims = {
        "sub": session.user_id,
        "sid": session.sid,
        "jti": secrets.token_urlsafe(12),
        "iss": env.jwt_issuer,
        "aud": env.jwt_audience,
        "iat": now,
        "exp": now + ttl,
        "username": session.username,
        "role": session.role,
        "store_code": session.store_code,
    }
    if session.switched_from:
        claims["switched_from"] = session.switched_from
    return jwt.encode(claims, env.jwt_secret, algorithm="HS256"), ttl


def _decode(token: str) -> dict:
    try:
        claims = jwt.decode(
            token,
            env.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"], "verify_aud": False},
        )
    except jwt.PyJWTError as error:  # invalid signature / expired / malformed
        raise HTTPException(status_code=401, detail=_INVALID) from error
    # Session-bound tokens (everything minted since the registry) must carry
    # our iss/aud. Checked by hand rather than via jwt.decode(audience=...)
    # because that would also reject the legacy sid-less tokens outright.
    if "sid" in claims and (claims.get("iss") != env.jwt_issuer or claims.get("aud") != env.jwt_audience):
        raise HTTPException(status_code=401, detail=_INVALID)
    return claims


def _require_live_session(claims: dict) -> str | None:
    sid = claims.get("sid")
    if not sid:
        if env.session_id_required():
            raise HTTPException(status_code=401, detail=_INVALID)
        return None
    try:
        active = session_store.is_session_active(str(sid), str(claims.get("username") or ""))
    except session_store.SessionStoreUnavailable as error:
        raise HTTPException(status_code=503, detail="Session service temporarily unavailable.") from error
    if not active:
        raise HTTPException(status_code=401, detail=_INVALID)
    return str(sid)


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    if cred is None or not cred.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    claims = _decode(cred.credentials)
    sid = _require_live_session(claims)
    role = claims.get("role")
    store_code = claims.get("store_code")
    username = claims.get("username") or ""
    switched_from = claims.get("switched_from")

    if role not in _ROLES:
        raise HTTPException(status_code=403, detail="Account has no role assigned.")
    if role == "manager" and store_code not in STORE_CODE_TO_NAME:
        raise HTTPException(status_code=403, detail="Manager account has no valid store.")
    if role == "admin":
        store_code = None

    return CurrentUser(
        sub=str(claims["sub"]),
        username=str(username),
        role=role,
        store_code=store_code,
        switched_from=str(switched_from) if switched_from else None,
        sid=sid,
    )


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required.")
    return user


def require_store_access(store: str, user: CurrentUser) -> CurrentUser:
    """Call inside a handler once `store` is known (query param or payload).
    Admin passes for any store; a manager only for their own. A wrong
    store+row pairing therefore 403s here before any DB lookup, never leaking
    another store's not-found vs found distinction."""
    code = (store or "").strip()
    if code not in STORE_CODE_TO_NAME:
        raise HTTPException(status_code=400, detail=f"Unknown store code: {store!r}")
    if not user.is_admin and code != user.store_code:
        raise HTTPException(status_code=403, detail="You do not have access to that store.")
    return user


# Re-exported so app.py / tests can build the same account list without importing
# config.auth_users directly.
KNOWN_USERNAMES = tuple(AUTH_USERS)
