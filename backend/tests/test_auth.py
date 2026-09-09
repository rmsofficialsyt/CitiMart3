"""HTTP-level authentication tests: the global bearer gate + MongoDB-backed login."""
from __future__ import annotations

import pytest

from config.auth_users import DEFAULT_PASSWORDS
from config.env import INSECURE_JWT_SECRET_DEFAULT, assert_production_secrets
from tests.conftest import make_token


def test_assert_production_secrets_rejects_default_secret_with_db(monkeypatch):
    monkeypatch.setattr("config.env.env.mongodb_uri", "mongodb://localhost:27017", raising=False)
    monkeypatch.setattr("config.env.env.jwt_secret", INSECURE_JWT_SECRET_DEFAULT, raising=False)
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        assert_production_secrets()


def test_assert_production_secrets_ok_without_db_or_with_real_secret(monkeypatch):
    # No MONGODB_URI -> Historical-Analytics-only / test use, default is fine.
    monkeypatch.setattr("config.env.env.mongodb_uri", None, raising=False)
    monkeypatch.setattr("config.env.env.jwt_secret", INSECURE_JWT_SECRET_DEFAULT, raising=False)
    assert_production_secrets()
    # MONGODB_URI set but a real secret -> also fine.
    monkeypatch.setattr("config.env.env.mongodb_uri", "mongodb://localhost:27017", raising=False)
    monkeypatch.setattr("config.env.env.jwt_secret", "a-genuinely-random-secret-value", raising=False)
    assert_production_secrets()


def test_unauthenticated_request_is_401(client):
    assert client.get("/api/meta").status_code == 401


def test_garbage_bearer_is_401(client):
    r = client.get("/api/meta", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


def test_token_signed_with_wrong_secret_is_401(client):
    bad = make_token("admin", None, "ADMINISTRATOR", secret="some-other-secret")
    r = client.get("/api/meta", headers={"Authorization": f"Bearer {bad}"})
    assert r.status_code == 401


def test_expired_token_is_401(client):
    stale = make_token("admin", None, "ADMINISTRATOR", ttl=-10)
    r = client.get("/api/meta", headers={"Authorization": f"Bearer {stale}"})
    assert r.status_code == 401


def test_admin_token_reaches_admin_route(client, admin_headers):
    assert client.get("/api/meta", headers=admin_headers).status_code == 200


def test_login_success_and_failure(client):
    ok = client.post(
        "/api/auth/login",
        json={"username": "ADMINISTRATOR", "password": DEFAULT_PASSWORDS["ADMINISTRATOR"]},
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "admin"
    # the freshly minted token works against a real route
    token = body["access_token"]
    assert client.get("/api/meta", headers={"Authorization": f"Bearer {token}"}).status_code == 200

    bad = client.post("/api/auth/login", json={"username": "ADMINISTRATOR", "password": "wrong"})
    assert bad.status_code == 401


def test_login_manager_scoped_token(client):
    r = client.post(
        "/api/auth/login",
        json={"username": "CITIMART - NEW MARKET", "password": DEFAULT_PASSWORDS["CITIMART - NEW MARKET"]},
    )
    assert r.status_code == 200
    assert r.json()["user"] == {
        "username": "CITIMART - NEW MARKET",
        "role": "manager",
        "store_code": "NM",
    }


def test_manager_blocked_from_admin_only_router(client, nw_headers):
    """The two admin-only routers in this sub-project: status-band editing and
    Sales Target entry. A store manager logs data; they never set either."""
    assert client.get("/api/kpi-thresholds", headers=nw_headers).status_code == 403
    assert client.get("/api/targets", headers=nw_headers, params={"store": "NM", "month": "2026-09"}).status_code == 403


def test_admin_allowed_on_admin_only_router(client, admin_headers):
    assert client.get("/api/kpi-thresholds", headers=admin_headers).status_code == 200
