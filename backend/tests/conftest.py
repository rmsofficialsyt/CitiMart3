"""Shared pytest fixtures.

db_session provides a pymongo-compatible Database backed by mongomock (an
in-memory fake MongoDB), for tests that exercise src/daily_dashboard_store.py
(db/models.py's BILLS/FOOTFALL/NOB/TARGETS collections). This is the Mongo
equivalent of the project's existing "in-memory, no real DB needed" testing
philosophy -- it covers the module's query/mutation logic correctly, but
mongomock doesn't enforce every real-MongoDB behavior (e.g. some aggregation
edge cases), so it isn't a substitute for testing against a real MongoDB
instance before deploying. Indexes are created directly via
db.models.ensure_indexes(), not through any migration step -- MongoDB is
schemaless, so there's no Alembic-equivalent to run first.

The `client` fixture builds a FastAPI TestClient for the HTTP-level auth/RBAC
tests. It deliberately does NOT enter the app's lifespan (which would seed
accounts against a real cluster and start the midnight job); it just overrides
get_db with the mongomock db_session. There is no synthetic-workbook fixture
here any more -- Daily Operations reads nothing but MongoDB, so mongomock is
the whole of its test substrate.
"""
from __future__ import annotations

import time as _time

import jwt
import mongomock
import pytest
from fastapi.testclient import TestClient

from db.models import ensure_indexes
from src import user_store
from src.user_store import resolved_seed_passwords, seed_users

TEST_JWT_SECRET = "test-secret"

# PBKDF2 at production strength (600k iterations) x four accounts per db_session
# fixture dominates the suite runtime; the hashing behaviour under test is
# iteration-count-independent. Same for Argon2id's memory/time cost.
user_store._ITERATIONS = 1000
user_store._ARGON2_TIME_COST = 1
user_store._ARGON2_MEMORY_COST = 1024


@pytest.fixture(autouse=True)
def _isolate_shared_state():
    """Session registry, rate-limit fallbacks and the Redis override are
    process-global; reset them so no test sees another's sessions or 429s.
    Tests run Redis-less unless they opt in via the `fake_redis` fixture."""
    from db.redis_client import set_redis_for_tests
    from src import rate_limiter, session_store

    set_redis_for_tests(None)
    session_store.reset_for_tests()
    for limiter in (
        rate_limiter.login_ip_limiter,
        rate_limiter.login_failure_limiter,
        rate_limiter.login_account_limiter,
        rate_limiter.chat_limiter,
    ):
        limiter.reset()
    yield
    set_redis_for_tests(None)
    session_store.reset_for_tests()


@pytest.fixture()
def fake_redis():
    """A fakeredis server (Lua-capable via lupa) wired in as REDIS_URL's
    client for the duration of one test. Yields the str-decoding client."""
    import fakeredis

    from db.redis_client import set_redis_for_tests

    server = fakeredis.FakeServer()
    text = fakeredis.FakeRedis(server=server, decode_responses=True)
    raw = fakeredis.FakeRedis(server=server, decode_responses=False)
    set_redis_for_tests(text, raw)
    try:
        yield text
    finally:
        set_redis_for_tests(None)


@pytest.fixture()
def db_session():
    from src.daily_dashboard_store import invalidate_dashboard_cache
    invalidate_dashboard_cache()
    client = mongomock.MongoClient()
    db = client["citimart"]
    ensure_indexes(db)
    # The four fixed accounts, so POST /api/auth/login works against this
    # in-memory DB exactly as it would against a real one.
    seed_users(db, resolved_seed_passwords())
    yield db
    invalidate_dashboard_cache()


def make_token(role: str, store_code: str | None, username: str, *, secret: str = TEST_JWT_SECRET, ttl: int = 3600) -> str:
    now = int(_time.time())
    return jwt.encode(
        {
            "sub": f"test-{username}",
            "iat": now,
            "exp": now + ttl,
            "username": username,
            "role": role,
            "store_code": store_code,
        },
        secret,
        algorithm="HS256",
    )


@pytest.fixture()
def client(db_session, monkeypatch):
    monkeypatch.setattr("config.env.env.jwt_secret", TEST_JWT_SECRET, raising=False)

    import app as app_module
    from db.session import get_db

    app_module.app.dependency_overrides[get_db] = lambda: db_session

    test_client = TestClient(app_module.app)  # no `with` -> lifespan not run
    try:
        yield test_client
    finally:
        app_module.app.dependency_overrides.clear()


@pytest.fixture()
def admin_headers():
    return {"Authorization": f"Bearer {make_token('admin', None, 'ADMINISTRATOR')}"}


@pytest.fixture()
def nw_headers():
    return {"Authorization": f"Bearer {make_token('manager', 'NM', 'CITIMART - NEW MARKET')}"}


@pytest.fixture()
def hb_headers():
    return {"Authorization": f"Bearer {make_token('manager', 'HB', 'CITIMART - HATIBAGAN')}"}
