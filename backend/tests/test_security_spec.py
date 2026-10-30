"""Tests verifying Production-grade Security Checks (WEB-02, API-02, API-03, INFRA-01)."""
from __future__ import annotations

import io
import pytest

from config.auth_users import DEFAULT_PASSWORDS
from src.rate_limiter import SlidingWindowRateLimiter, login_limiter, chat_limiter


def test_security_headers_present(client):
    """WEB-02 / WEB-04: Verify security headers returned on responses."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in resp.headers.get("Permissions-Policy", "")


def test_rate_limiter_unit():
    """API-02: Verify sliding window rate limiter triggers 429 when threshold exceeded."""
    limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=60, name="test_limiter")
    key = "192.168.1.100"
    limiter.check(key)
    limiter.check(key)
    limiter.check(key)
    with pytest.raises(Exception) as exc_info:
        limiter.check(key)
    assert "429" in str(exc_info.value) or exc_info.value.status_code == 429


def test_targets_upload_rejects_non_excel_files(client, admin_headers):
    """API-03 / INP-06: Upload rejects non-Excel extensions."""
    fake_file = io.BytesIO(b"malicious script or payload")
    resp = client.post(
        "/api/targets/upload?store=NM",
        files={"file": ("malicious.exe", fake_file, "application/octet-stream")},
        headers=admin_headers,
    )
    assert resp.status_code == 400
    assert "Only Excel" in resp.json()["detail"]


def test_targets_upload_rejects_oversized_files(client, admin_headers, monkeypatch):
    """API-03 / INP-06: Upload rejects files exceeding maximum size limit."""
    from api import routes_targets
    monkeypatch.setattr(routes_targets, "MAX_EXCEL_UPLOAD_BYTES", 50)
    oversized_file = io.BytesIO(b"X" * 100)
    resp = client.post(
        "/api/targets/upload?store=NM",
        files={"file": ("test.xlsx", oversized_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=admin_headers,
    )
    assert resp.status_code == 413
    assert "exceeds maximum allowed size" in resp.json()["detail"]
