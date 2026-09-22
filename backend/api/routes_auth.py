"""Auth endpoints -- login is public; switch-account requires an admin JWT.

`POST /api/auth/login` -- validates a username + password against the MongoDB
                          `users` collection (src/user_store.py) and, on
                          success, self-issues an HS256 JWT (env.jwt_secret,
                          env.jwt_ttl_seconds) carrying role / store_code /
                          username. api/auth.py verifies that token on every
                          subsequent request with no further DB access.

`POST /api/auth/switch-account` -- admin-only password-less account switching
                                   for the "View as Store Manager" UI feature.

There is exactly one auth mode now: MongoDB-backed credentials + local JWT.
(The earlier Supabase path has been removed.)
"""
from __future__ import annotations

import time

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pymongo.database import Database

from config.env import env
from db.session import get_db
from src.user_store import get_user, verify_password
from api.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str
    password: str


def issue_token(user: dict, switched_from: str | None = None) -> dict:
    """Build the login response for an authenticated `users` document."""
    now = int(time.time())
    ttl = env.jwt_ttl_seconds
    claims = {
        "sub": f"user-{user['_id']}",
        "iat": now,
        "exp": now + ttl,
        "username": user["username"],
        "role": user["role"],
        "store_code": user.get("store_code"),
    }
    if switched_from:
        claims["switched_from"] = switched_from
    token = jwt.encode(claims, env.jwt_secret, algorithm="HS256")
    user_payload = {
        "username": user["username"],
        "role": user["role"],
        "store_code": user.get("store_code"),
    }
    if switched_from:
        user_payload["switched_from"] = switched_from
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ttl,
        "user": user_payload,
    }


@router.post("/login")
def login(body: LoginBody, db: Database = Depends(get_db)) -> dict:
    user = get_user(db, body.username)
    if user is None or not verify_password(body.password, user.get("password_hash")):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return issue_token(user)


class SwitchAccountBody(BaseModel):
    username: str | None = None


@router.post("/switch-account")
@router.post("/switch-account/")
def switch_account(
    body: SwitchAccountBody | None = None,
    username: str | None = None,
    db: Database = Depends(get_db),
    caller: CurrentUser = Depends(get_current_user),
) -> dict:
    """Switch to another account's context. Requires either:
    1) An authenticated admin caller (caller.is_admin is True), OR
    2) An active switched session originally initiated by an admin (caller.switched_from is set).
    A standard manager account calling this without being in a switched admin session gets 403."""
    is_admin = caller.is_admin
    switched_from = caller.switched_from

    if not is_admin and not switched_from:
        raise HTTPException(status_code=403, detail="Only administrators can switch accounts.")

    target_username = ""
    if body and body.username:
        target_username = body.username.strip()
    elif username:
        target_username = username.strip()

    if not target_username:
        raise HTTPException(status_code=400, detail="Missing required 'username' parameter.")

    user = get_user(db, target_username)
    if user is None:
        raise HTTPException(status_code=404, detail=f"User account '{target_username}' not found.")

    # Root admin identity
    root_admin = caller.username if is_admin else switched_from

    # If switching back to the admin account, clear the switched_from flag
    new_switched_from = None if user.get("role") == "admin" else root_admin

    return issue_token(user, switched_from=new_switched_from)



