"""Auth endpoints.

Public (no access token needed):
  POST /api/auth/login    username + password -> session (access JWT +
                          rotating refresh token, also set as an HttpOnly
                          cookie scoped to /api/auth)
  POST /api/auth/refresh  refresh token (cookie, or JSON body for clients
                          that can't hold the cookie) -> new access JWT +
                          new refresh token; the old one is consumed
  POST /api/auth/logout   revokes the current session (identified by the
                          access token if valid, else the refresh token) and
                          clears the cookie; idempotent

Authenticated:
  POST   /api/auth/logout-all       revoke every session of the caller
  GET    /api/auth/sessions         the caller's live sessions (AUTH-06)
  DELETE /api/auth/sessions/{sid}   revoke one of the caller's sessions
  POST   /api/auth/switch-account   admin-only "View as Store Manager"

Session mechanics live in src/session_store.py, token minting/verification
in api/auth.py. Every handler here is a sync `def`: FastAPI runs it in the
threadpool, where the Argon2/PBKDF2 verify (C code that releases the GIL)
and the pymongo/redis calls can't stall the event loop.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from pymongo.database import Database

from api.auth import CurrentUser, _bearer, _decode, get_current_user, mint_access_token
from config.env import env
from db.session import get_db
from src import session_store
from src.audit import audit_event
from src.rate_limiter import check_login_rate_limit, get_client_ip, record_login_failure
from src.user_store import (
    burn_verify_time,
    get_user,
    get_user_cached,
    needs_rehash,
    upgrade_password_hash,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "citimart_refresh"
REFRESH_COOKIE_PATH = "/api/auth"
_INVALID_LOGIN = "Invalid username or password."


class LoginBody(BaseModel):
    username: str = Field(max_length=100)
    password: str = Field(max_length=256)


class RefreshBody(BaseModel):
    refresh_token: str | None = Field(default=None, max_length=256)


def _unavailable(error: Exception) -> HTTPException:
    return HTTPException(status_code=503, detail="Session service temporarily unavailable.")


def _cookie_secure(request: Request) -> bool:
    if env.refresh_cookie_secure is not None:
        return env.refresh_cookie_secure
    https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    return https or env.environment.lower() != "development"


def _set_refresh_cookie(response: Response, request: Request, token: str, expires_at: int) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=max(1, expires_at - int(time.time())),
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=_cookie_secure(request),
        samesite="lax",
    )


def _clear_refresh_cookie(response: Response, request: Request) -> None:
    response.delete_cookie(
        REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, httponly=True, secure=_cookie_secure(request), samesite="lax"
    )


def _session_response(issued: session_store.IssuedSession, request: Request, response: Response) -> dict:
    s = issued.session
    access_token, ttl = mint_access_token(s)
    _set_refresh_cookie(response, request, issued.refresh_token, s.expires_at)
    response.headers["Cache-Control"] = "no-store"
    user_payload = {"username": s.username, "role": s.role, "store_code": s.store_code}
    if s.switched_from:
        user_payload["switched_from"] = s.switched_from
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ttl,
        # Also in the body for clients that can't receive the HttpOnly cookie
        # (cross-origin direct mode, scripts). The SPA keeps it in memory only.
        "refresh_token": issued.refresh_token,
        "refresh_expires_in": max(0, s.expires_at - int(time.time())),
        "session_id": s.sid,
        "user": user_payload,
    }


def _start_session(user: dict, request: Request, switched_from: str | None = None) -> session_store.IssuedSession:
    try:
        return session_store.create_session(
            user_id=f"user-{user['_id']}",
            username=user["username"],
            role=user["role"],
            store_code=user.get("store_code"),
            switched_from=switched_from,
            ip=get_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
        )
    except session_store.SessionStoreUnavailable as error:
        raise _unavailable(error) from error


def issue_token(user: dict, switched_from: str | None = None, *, request: Request, response: Response) -> dict:
    """Start a session for an authenticated `users` document and build the
    login response."""
    return _session_response(_start_session(user, request, switched_from), request, response)


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response, db: Database = Depends(get_db)) -> dict:
    ip = check_login_rate_limit(request, body.username)
    user = get_user_cached(db, body.username)
    if user is None:
        burn_verify_time(body.password)  # same timing as a wrong password (AUTH-01)
        ok = False
    else:
        ok = verify_password(body.password, user.get("password_hash"))
    if not ok:
        record_login_failure(ip, body.username)
        audit_event("login_failed", db=db, username=body.username[:100], ip=ip, result="failure")
        raise HTTPException(status_code=401, detail=_INVALID_LOGIN)
    if needs_rehash(user.get("password_hash")):
        upgrade_password_hash(db, user["username"], body.password)
    result = issue_token(user, request=request, response=response)
    audit_event("login_success", db=db, username=user["username"], ip=ip, details={"sid": result["session_id"][:8]})
    return result


@router.post("/refresh")
def refresh(
    request: Request,
    response: Response,
    body: RefreshBody | None = Body(default=None),
    db: Database = Depends(get_db),
):
    token = request.cookies.get(REFRESH_COOKIE) or (body.refresh_token if body else None)
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token.")
    try:
        issued = session_store.rotate_refresh_token(token)
    except session_store.RefreshConflict:
        # A sibling tab rotated this token a moment ago; its response already
        # carried the new cookie, so the client should simply retry.
        raise HTTPException(status_code=409, detail="Refresh already in progress; retry.")
    except session_store.InvalidRefreshToken:
        audit_event("refresh_rejected", db=db, ip=get_client_ip(request), result="failure")
        # Returned (not raised) so the cookie-clearing header survives --
        # an HTTPException discards headers set on the injected Response.
        rejected = JSONResponse(status_code=401, content={"detail": "Session expired. Please sign in again."})
        _clear_refresh_cookie(rejected, request)
        return rejected
    except session_store.SessionStoreUnavailable as error:
        raise _unavailable(error) from error
    return _session_response(issued, request, response)


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    body: RefreshBody | None = Body(default=None),
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Database = Depends(get_db),
) -> dict:
    sid: str | None = None
    username: str | None = None
    if cred is not None and cred.credentials:
        try:
            claims = _decode(cred.credentials)
            sid, username = claims.get("sid"), claims.get("username")
        except HTTPException:
            pass  # expired access token -- fall back to the refresh token
    try:
        if not sid:
            token = request.cookies.get(REFRESH_COOKIE) or (body.refresh_token if body else None)
            sid = session_store.peek_refresh_session(token) if token else None
        revoked = session_store.revoke_session(sid) if sid else False
    except session_store.SessionStoreUnavailable as error:
        raise _unavailable(error) from error
    _clear_refresh_cookie(response, request)
    if revoked:
        audit_event("logout", db=db, username=username, ip=get_client_ip(request))
    return {"ok": True}


@router.post("/logout-all")
def logout_all(
    request: Request,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> dict:
    try:
        count = session_store.revoke_all_user_sessions(user.username)
    except session_store.SessionStoreUnavailable as error:
        raise _unavailable(error) from error
    _clear_refresh_cookie(response, request)
    audit_event("logout_all", db=db, username=user.username, ip=get_client_ip(request), details={"revoked": count})
    return {"ok": True, "revoked": count}


@router.get("/sessions")
def list_sessions(user: CurrentUser = Depends(get_current_user)) -> dict:
    try:
        rows = session_store.list_user_sessions(user.username)
    except session_store.SessionStoreUnavailable as error:
        raise _unavailable(error) from error
    return {
        "sessions": [
            {
                "sid": r["sid"],
                "ip": r.get("ip", ""),
                "user_agent": r.get("ua", ""),
                "created_at": int(r.get("created_at", 0)),
                "last_seen_at": int(r.get("last_seen_at", 0)),
                "expires_at": int(r.get("expires_at", 0)),
                "current": r["sid"] == user.sid,
            }
            for r in rows
        ]
    }


@router.delete("/sessions/{sid}")
def revoke_one_session(
    sid: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> dict:
    # Ownership check before acting (AC-02). Someone else's sid gets the same
    # 404 as a nonexistent one, so the endpoint can't probe for live sessions.
    try:
        if len(sid) > 64 or not session_store.session_belongs_to(sid, user.username):
            raise HTTPException(status_code=404, detail="Session not found.")
        session_store.revoke_session(sid)
    except session_store.SessionStoreUnavailable as error:
        raise _unavailable(error) from error
    audit_event("session_revoked", db=db, username=user.username, ip=get_client_ip(request), target=sid[:8])
    return {"ok": True, "current": sid == user.sid}


class SwitchAccountBody(BaseModel):
    username: str | None = Field(default=None, max_length=100)


@router.post("/switch-account")
@router.post("/switch-account/")
def switch_account(
    request: Request,
    response: Response,
    body: SwitchAccountBody | None = None,
    username: str | None = None,
    db: Database = Depends(get_db),
    caller: CurrentUser = Depends(get_current_user),
) -> dict:
    """Switch to another account's context. Requires either:
    1) An authenticated admin caller (caller.is_admin is True), OR
    2) An active switched session originally initiated by an admin (caller.switched_from is set).
    A standard manager account calling this without being in a switched admin session gets 403.

    The switch starts a fresh session for the target identity and revokes
    the caller's current one, so a switch never leaves an orphaned session
    (and the old access token stops working immediately)."""
    is_admin = caller.is_admin
    switched_from = caller.switched_from

    if not is_admin and not switched_from:
        raise HTTPException(status_code=403, detail="Only administrators can switch accounts.")

    target_username = ""
    if body and body.username:
        target_username = body.username.strip()
    elif username:
        target_username = username.strip()

    # If no target username is provided and the caller is in a switched session, default to returning to the root admin
    if not target_username and switched_from:
        target_username = switched_from

    if not target_username:
        raise HTTPException(status_code=400, detail="Missing required 'username' parameter.")

    user = get_user(db, target_username)
    if user is None:
        raise HTTPException(status_code=404, detail=f"User account '{target_username}' not found.")

    # Root admin identity
    root_admin = caller.username if is_admin else switched_from

    # If switching back to the admin account, clear the switched_from flag
    new_switched_from = None if user.get("role") == "admin" else root_admin

    result = issue_token(user, switched_from=new_switched_from, request=request, response=response)
    if caller.sid:
        try:
            session_store.revoke_session(caller.sid)
        except session_store.SessionStoreUnavailable as error:
            raise _unavailable(error) from error
    audit_event(
        "switch_account", db=db, username=root_admin, ip=get_client_ip(request),
        target=user["username"], details={"from": caller.username},
    )
    return result
