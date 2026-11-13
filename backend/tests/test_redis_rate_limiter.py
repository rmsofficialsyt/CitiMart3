"""API-02: Redis-shared sliding-window rate limiting + login throttling."""
from __future__ import annotations

import pytest
import redis
from fastapi import HTTPException
from starlette.requests import Request

from config.auth_users import DEFAULT_PASSWORDS
from src import rate_limiter
from src.rate_limiter import RedisSlidingWindowRateLimiter, get_client_ip

ADMIN = "ADMINISTRATOR"


def _request(peer: str, xff: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    return Request({"type": "http", "client": (peer, 5555), "headers": headers})


def test_lua_window_blocks_with_retry_after(fake_redis):
    limiter = RedisSlidingWindowRateLimiter(3, 60, name="t", prefix="rl:t")
    for _ in range(3):
        limiter.check("k")
    with pytest.raises(HTTPException) as exc:
        limiter.check("k")
    assert exc.value.status_code == 429
    assert 1 <= int(exc.value.headers["Retry-After"]) <= 60
    # every key carries a TTL (Redis runs noeviction for BullMQ)
    assert 0 < fake_redis.pttl("rl:t:k") <= 60_000


def test_limit_is_shared_across_workers(fake_redis):
    """Two limiter instances = two worker processes on one Redis: the limit
    is global, not per-process (the bug with the old in-memory limiter)."""
    worker_a = RedisSlidingWindowRateLimiter(4, 60, name="t", prefix="rl:shared")
    worker_b = RedisSlidingWindowRateLimiter(4, 60, name="t", prefix="rl:shared")
    worker_a.check("ip")
    worker_b.check("ip")
    worker_a.check("ip")
    worker_b.check("ip")
    with pytest.raises(HTTPException):
        worker_a.check("ip")


def test_peek_does_not_count(fake_redis):
    limiter = RedisSlidingWindowRateLimiter(2, 60, name="t", prefix="rl:p")
    for _ in range(10):
        limiter.peek("k")
    limiter.hit("k")
    limiter.hit("k")
    with pytest.raises(HTTPException):
        limiter.peek("k")


class _BrokenRedis:
    def register_script(self, _script):
        def run(**_kwargs):
            raise redis.ConnectionError("down")

        return run

    def pipeline(self, **_kwargs):
        raise redis.ConnectionError("down")


def test_redis_outage_falls_back_to_in_process_limit():
    from db.redis_client import set_redis_for_tests

    set_redis_for_tests(_BrokenRedis())  # type: ignore[arg-type]
    limiter = RedisSlidingWindowRateLimiter(2, 60, name="t", prefix="rl:x")
    limiter.check("k")
    limiter.check("k")
    with pytest.raises(HTTPException) as exc:  # still enforced -- not fail-open
        limiter.check("k")
    assert exc.value.status_code == 429


def test_client_ip_ignores_xff_from_untrusted_peer():
    assert get_client_ip(_request("203.0.113.5", "1.2.3.4")) == "203.0.113.5"


def test_client_ip_walks_xff_right_to_left_from_trusted_proxy():
    # nginx (10.x) forwarded for 198.51.100.7, which itself was preceded by a
    # client-supplied (spoofable) leftmost entry -- the leftmost is ignored.
    req = _request("10.0.0.2", "6.6.6.6, 198.51.100.7, 10.0.0.9")
    assert get_client_ip(req) == "198.51.100.7"


def _ip_seen_behind_uvicorn(forwarded_allow_ips: str | None, peer: str, xff: str) -> str:
    """Run uvicorn's ProxyHeadersMiddleware exactly as the container's CMD
    configures it, then resolve the client IP the way the login route does."""
    import asyncio

    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

    seen: dict = {}

    async def app(scope, receive, send):
        seen["ip"] = get_client_ip(Request(scope))

    kwargs = {} if forwarded_allow_ips is None else {"trusted_hosts": forwarded_allow_ips}
    scope = {"type": "http", "client": (peer, 5555), "headers": [(b"x-forwarded-for", xff.encode())]}
    asyncio.run(ProxyHeadersMiddleware(app, **kwargs)(scope, None, None))
    return seen["ip"]


def test_spoofed_xff_cannot_pick_a_rate_limit_bucket_behind_nginx():
    """nginx ($proxy_add_x_forwarded_for) appends the real peer to whatever
    the caller sent. With uvicorn's default proxy trust (the Dockerfile CMD),
    the real client wins, not the caller's leftmost entry."""
    nginx, real, spoofed = "172.18.0.4", "198.51.100.7", "9.9.9.9"
    assert _ip_seen_behind_uvicorn(None, nginx, f"{spoofed}, {real}") == real


def test_dockerfile_does_not_trust_every_proxy():
    from pathlib import Path

    cmd = (Path(__file__).resolve().parent.parent / "Dockerfile").read_text()
    assert "--forwarded-allow-ips='*'" not in cmd and '--forwarded-allow-ips="*"' not in cmd
    # Documents why: '*' hands the leftmost (caller-written) entry to the app.
    assert _ip_seen_behind_uvicorn("*", "172.18.0.4", "9.9.9.9, 198.51.100.7") == "9.9.9.9"


@pytest.mark.parametrize("use_redis", [False, True])
def test_many_successful_logins_one_account_one_ip_are_not_throttled(client, request, use_redis):
    """A store network behind one NAT IP logging in repeatedly to the same
    account must not trip the per-account guard -- it counts failures only."""
    if use_redis:
        request.getfixturevalue("fake_redis")
    for _ in range(rate_limiter.login_failure_limiter.max_requests + 10):
        resp = client.post("/api/auth/login", json={"username": ADMIN, "password": DEFAULT_PASSWORDS[ADMIN]})
        assert resp.status_code == 200


@pytest.mark.parametrize("use_redis", [False, True])
def test_repeated_failures_lock_that_account_even_for_correct_password(client, request, monkeypatch, use_redis):
    if use_redis:
        request.getfixturevalue("fake_redis")
    monkeypatch.setattr(rate_limiter.login_failure_limiter, "max_requests", 5)
    monkeypatch.setattr(rate_limiter.login_failure_limiter._local, "max_requests", 5)
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": ADMIN, "password": "wrong"}).status_code == 401
    locked = client.post("/api/auth/login", json={"username": ADMIN, "password": DEFAULT_PASSWORDS[ADMIN]})
    assert locked.status_code == 429
    assert "Retry-After" in locked.headers
    # a different account from the same IP is unaffected
    other = "CITIMART - HATIBAGAN"
    assert client.post("/api/auth/login", json={"username": other, "password": DEFAULT_PASSWORDS[other]}).status_code == 200


def _from_ip(ip: str) -> dict:
    # The TestClient peer is "testclient" (not a trusted proxy), so XFF would
    # be ignored; patch the resolver to simulate distinct real client IPs.
    return {"X-Test-Client-IP": ip}


@pytest.mark.parametrize("use_redis", [False, True])
def test_failures_spread_across_ips_lock_the_account(client, request, monkeypatch, use_redis):
    """API-02 per-account: guesses from many IPs, each under its own
    (IP, username) cap, still trip the all-IPs account limit."""
    if use_redis:
        request.getfixturevalue("fake_redis")
    monkeypatch.setattr(rate_limiter, "get_client_ip", lambda req: req.headers.get("x-test-client-ip", "203.0.113.1"))
    monkeypatch.setattr(rate_limiter.login_account_limiter, "max_requests", 4)
    monkeypatch.setattr(rate_limiter.login_account_limiter._local, "max_requests", 4)
    for i in range(4):  # one failure per IP: never near the per-(IP, user) cap
        resp = client.post("/api/auth/login", json={"username": ADMIN, "password": "wrong"}, headers=_from_ip(f"198.51.100.{i}"))
        assert resp.status_code == 401
    locked = client.post(
        "/api/auth/login", json={"username": ADMIN, "password": DEFAULT_PASSWORDS[ADMIN]}, headers=_from_ip("198.51.100.99")
    )
    assert locked.status_code == 429
    assert "Retry-After" in locked.headers
    # other accounts are unaffected
    other = "CITIMART - HATIBAGAN"
    ok = client.post("/api/auth/login", json={"username": other, "password": DEFAULT_PASSWORDS[other]}, headers=_from_ip("198.51.100.99"))
    assert ok.status_code == 200


def test_unknown_usernames_do_not_get_an_account_bucket(client, monkeypatch, fake_redis):
    monkeypatch.setattr(rate_limiter.login_account_limiter, "max_requests", 1)
    for _ in range(3):
        client.post("/api/auth/login", json={"username": "nobody-here", "password": "x"})
    assert not [k for k in fake_redis.keys("rl:login:user:*")]


def test_successful_logins_do_not_count_toward_account_lockout(client, monkeypatch):
    monkeypatch.setattr(rate_limiter.login_account_limiter, "max_requests", 2)
    monkeypatch.setattr(rate_limiter.login_account_limiter._local, "max_requests", 2)
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": ADMIN, "password": DEFAULT_PASSWORDS[ADMIN]}).status_code == 200


def test_per_ip_burst_cap_counts_every_attempt(client, monkeypatch, fake_redis):
    monkeypatch.setattr(rate_limiter.login_ip_limiter, "max_requests", 3)
    for _ in range(3):
        client.post("/api/auth/login", json={"username": ADMIN, "password": DEFAULT_PASSWORDS[ADMIN]})
    resp = client.post("/api/auth/login", json={"username": ADMIN, "password": DEFAULT_PASSWORDS[ADMIN]})
    assert resp.status_code == 429


def test_unknown_user_and_wrong_password_answer_identically(client):
    a = client.post("/api/auth/login", json={"username": "nobody-here", "password": "x"})
    b = client.post("/api/auth/login", json={"username": ADMIN, "password": "x"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()
