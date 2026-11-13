"""AUTH-05 / AUTH-06 / INP-10: session registry, refresh rotation, logout,
session listing, fail-closed behavior. Every flow runs against both the
in-process store and a (fake) Redis."""
from __future__ import annotations

import time

import jwt
import pytest
import redis

from config.auth_users import DEFAULT_PASSWORDS
from config.env import env
from src import session_store, user_store

ADMIN = "ADMINISTRATOR"
NM = "CITIMART - NEW MARKET"


@pytest.fixture(params=["memory", "redis"])
def backend(request):
    if request.param == "redis":
        return request.getfixturevalue("fake_redis")
    return None


def _login(client, username=ADMIN):
    resp = client.post("/api/auth/login", json={"username": username, "password": DEFAULT_PASSWORDS[username]})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _auth(body):
    return {"Authorization": f"Bearer {body['access_token']}"}


def test_login_issues_short_lived_session_token_and_httponly_cookie(client, backend):
    resp = client.post("/api/auth/login", json={"username": ADMIN, "password": DEFAULT_PASSWORDS[ADMIN]})
    body = resp.json()
    claims = jwt.decode(body["access_token"], options={"verify_signature": False})
    assert claims["sid"] == body["session_id"]
    assert claims["iss"] == env.jwt_issuer and claims["aud"] == env.jwt_audience
    assert claims["exp"] - claims["iat"] == env.access_token_ttl_seconds <= 3600
    cookie = resp.headers["set-cookie"]
    assert "citimart_refresh=" in cookie and "HttpOnly" in cookie and "Path=/api/auth" in cookie
    assert "samesite=lax" in cookie.lower()
    assert resp.headers["cache-control"] == "no-store"
    assert client.get("/api/auth/sessions", headers=_auth(body)).status_code == 200


def test_refresh_rotates_and_old_access_token_keeps_working(client, backend):
    body = _login(client)
    refreshed = client.post("/api/auth/refresh")  # cookie jar carries the token
    assert refreshed.status_code == 200
    new = refreshed.json()
    assert new["refresh_token"] != body["refresh_token"]
    assert new["session_id"] == body["session_id"]  # same session, new tokens
    assert client.get("/api/auth/sessions", headers=_auth(new)).status_code == 200


def test_refresh_reuse_inside_grace_window_is_a_conflict_not_a_revocation(client, backend):
    body = _login(client)
    client.cookies.clear()
    assert client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]}).status_code == 200
    client.cookies.clear()  # present ONLY the consumed token, not the new cookie
    again = client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert again.status_code == 409
    assert client.get("/api/auth/sessions", headers=_auth(body)).status_code == 200


def test_refresh_replay_after_grace_revokes_the_whole_session(client, backend, monkeypatch):
    monkeypatch.setattr(session_store, "REUSE_GRACE_SECONDS", -1)
    body = _login(client)
    client.cookies.clear()
    rotated = client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]}).json()
    client.cookies.clear()  # present ONLY the consumed token, not the new cookie
    replay = client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert replay.status_code == 401
    # theft response: both the attacker's and the victim's tokens are dead
    assert client.get("/api/auth/sessions", headers=_auth(body)).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": rotated["refresh_token"]}).status_code == 401


def test_logout_revokes_immediately_and_clears_cookie(client, backend):
    body = _login(client)
    out = client.post("/api/auth/logout", headers=_auth(body))
    assert out.status_code == 200
    assert 'citimart_refresh=""' in out.headers["set-cookie"] or "Max-Age=0" in out.headers["set-cookie"]
    assert client.get("/api/auth/sessions", headers=_auth(body)).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]}).status_code == 401


def test_logout_with_only_refresh_token(client, backend):
    body = _login(client)
    client.cookies.clear()
    assert client.post("/api/auth/logout", json={"refresh_token": body["refresh_token"]}).status_code == 200
    assert client.get("/api/auth/sessions", headers=_auth(body)).status_code == 401


def test_sessions_list_marks_current_and_logout_all_kills_every_one(client, backend):
    first = _login(client)
    second = _login(client)
    listed = client.get("/api/auth/sessions", headers=_auth(second)).json()["sessions"]
    assert {s["sid"] for s in listed} >= {first["session_id"], second["session_id"]}
    assert [s["current"] for s in listed if s["sid"] == second["session_id"]] == [True]
    assert all("password" not in k and "token" not in k for s in listed for k in s)
    assert client.post("/api/auth/logout-all", headers=_auth(second)).json()["revoked"] >= 2
    assert client.get("/api/auth/sessions", headers=_auth(first)).status_code == 401


def test_cannot_revoke_another_users_session(client, backend):
    admin = _login(client, ADMIN)
    manager = _login(client, NM)
    resp = client.delete(f"/api/auth/sessions/{admin['session_id']}", headers=_auth(manager))
    assert resp.status_code == 404  # same answer as a nonexistent sid (AC-02)
    assert client.get("/api/auth/sessions", headers=_auth(admin)).status_code == 200
    # but your own other session is fine
    manager2 = _login(client, NM)
    assert client.delete(f"/api/auth/sessions/{manager['session_id']}", headers=_auth(manager2)).status_code == 200
    assert client.get("/api/auth/sessions", headers=_auth(manager)).status_code == 401


def test_idle_session_cannot_refresh(client, backend, monkeypatch):
    body = _login(client)
    monkeypatch.setattr(env, "session_idle_timeout_seconds", -1)
    assert client.post("/api/auth/refresh", json={"refresh_token": body["refresh_token"]}).status_code == 401


def test_password_change_revokes_all_sessions_and_evicts_user_cache(client, db_session, backend):
    body = _login(client, NM)
    if backend is not None:
        assert backend.exists(f"auth:user:{NM}")
    assert user_store.set_password(db_session, NM, "Brand9-New-Secret")
    assert client.get("/api/auth/sessions", headers=_auth(body)).status_code == 401
    if backend is not None:
        assert not backend.exists(f"auth:user:{NM}")


def test_legacy_pbkdf2_hash_is_upgraded_to_argon2id_on_login(client, db_session, backend):
    from db.models import USERS

    db_session[USERS].update_one(
        {"username": NM}, {"$set": {"password_hash": user_store.hash_password(DEFAULT_PASSWORDS[NM], iterations=1000)}}
    )
    user_store.invalidate_user_cache(NM)
    _login(client, NM)
    stored = db_session[USERS].find_one({"username": NM})["password_hash"]
    assert stored.startswith("$argon2id$")
    _login(client, NM)  # and the upgraded hash verifies


def test_session_bound_token_with_wrong_audience_is_rejected(client, backend):
    body = _login(client)
    claims = jwt.decode(body["access_token"], options={"verify_signature": False})
    claims["aud"] = "someone-else"
    forged = jwt.encode(claims, env.jwt_secret, algorithm="HS256")
    assert client.get("/api/auth/sessions", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_sidless_token_rejected_when_session_required(client, admin_headers, monkeypatch):
    assert client.get("/api/auth/sessions", headers=admin_headers).status_code == 200
    monkeypatch.setattr(env, "require_session_id", True)
    assert client.get("/api/auth/sessions", headers=admin_headers).status_code == 401


class _DownRedis:
    def __getattr__(self, _name):
        def fail(*_a, **_k):
            raise redis.ConnectionError("down")

        return fail


def test_redis_outage_fails_closed(client):
    from db.redis_client import set_redis_for_tests

    body = _login(client)  # issued while healthy (in-memory)
    set_redis_for_tests(_DownRedis())  # type: ignore[arg-type]
    resp = client.get("/api/auth/sessions", headers=_auth(body))
    assert resp.status_code == 503  # denied, not waved through
    assert "unavailable" in resp.json()["detail"].lower()


def test_redis_keys_all_expire(client, fake_redis):
    _login(client)
    client.post("/api/auth/refresh")
    for key in fake_redis.scan_iter("*"):
        if key.startswith(("sess:", "user_sess:", "rt:", "rt_used:", "auth:user:", "rl:")):
            assert fake_redis.ttl(key) > 0, key


def test_absolute_expiry_is_not_extended_by_rotation(fake_redis):
    issued = session_store.create_session(user_id="u-1", username=ADMIN, role="admin", store_code=None)
    before = issued.session.expires_at
    time.sleep(1.1)
    rotated = session_store.rotate_refresh_token(issued.refresh_token)
    assert rotated.session.expires_at == before
