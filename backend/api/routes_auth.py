"""Auth endpoints -- mounted WITHOUT the global auth gate (app.py).

`POST /api/auth/login` -- validates a username + password against the MongoDB
                          `users` collection (src/user_store.py) and, on
                          success, self-issues an HS256 JWT (env.jwt_secret,
                          env.jwt_ttl_seconds) carrying role / store_code /
                          username. api/auth.py verifies that token on every
                          subsequent request with no further DB access.

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

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str
    password: str


def issue_token(user: dict) -> dict:
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
    token = jwt.encode(claims, env.jwt_secret, algorithm="HS256")
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ttl,
        "user": {
            "username": user["username"],
            "role": user["role"],
            "store_code": user.get("store_code"),
        },
    }


@router.post("/login")
def login(body: LoginBody, db: Database = Depends(get_db)) -> dict:
    user = get_user(db, body.username)
    if user is None or not verify_password(body.password, user.get("password_hash")):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return issue_token(user)
