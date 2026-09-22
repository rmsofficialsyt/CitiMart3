"""Authentication + authorization primitives for every /api/* route.

An incoming bearer token is an HS256 JWT this app issued itself in
api/routes_auth.py (after checking the password against the MongoDB `users`
collection). We verify it here with PyJWT against `env.jwt_secret` -- no
network round-trip, and no database lookup: `role` / `store_code` /
`username` are read straight off the token's own claims, so *verifying* a
request costs nothing beyond a signature check even though every route it
guards goes on to read MongoDB.

Enforcement points (wired in app.py + api/deps.py + api/routes_daily.py):
  * every router gets dependencies=[Depends(get_current_user)]  -> 401 without a token
  * admin-only routers additionally get Depends(require_admin)
  * parse_daily_chart_state clamps `stores` to allowed_stores(...)
  * every api/routes_daily.py handler calls require_store_access(store, user)
"""
from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config.auth_users import AUTH_USERS
from config.env import env
from config.settings import STORE_CODE_TO_NAME

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


def _decode(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            env.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError as error:  # invalid signature / expired / malformed
        raise HTTPException(status_code=401, detail="Invalid or expired session.") from error


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    if cred is None or not cred.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    claims = _decode(cred.credentials)
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
