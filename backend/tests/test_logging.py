"""Unit tests for the centralized logging subsystem (config/logging_config.py)."""
from __future__ import annotations

import json
import logging
import os
import shutil
from pathlib import Path

import pytest

from config.logging_config import (
    CorrelationIdFilter,
    JsonLogFormatter,
    SensitiveDataMasker,
    get_request_id,
    reset_request_id,
    set_request_id,
    setup_logging,
)


@pytest.fixture()
def temp_logs_dir(tmp_path, monkeypatch):
    """Provide an isolated temporary logs directory for testing."""
    test_log_dir = tmp_path / "test_logs"
    test_log_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr("config.env.env.log_dir", str(test_log_dir))
    monkeypatch.setattr("config.env.env.log_to_file", True)
    monkeypatch.setattr("config.env.env.log_format_json", False)
    yield test_log_dir
    # Cleanup handlers to release file locks on Windows
    logging.getLogger().handlers.clear()
    logging.getLogger("citimart.access").handlers.clear()
    logging.getLogger("citimart.audit").handlers.clear()
    logging.getLogger("citimart.worker").handlers.clear()


def test_sensitive_data_masker():
    """Verify that sensitive tokens, passwords, and secrets are redacted."""
    masker = SensitiveDataMasker()

    # 1. Bearer token
    record1 = logging.LogRecord("test", logging.INFO, "test.py", 10, "User sent Bearer eyJhbGciOiJIUzI1NiJ9.abc.xyz token", (), None)
    masker.filter(record1)
    assert "[REDACTED_TOKEN]" in record1.msg
    assert "eyJhbGciOiJIUzI1NiJ9" not in record1.msg

    # 2. Raw JWT string
    jwt_sample = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    record2 = logging.LogRecord("test", logging.INFO, "test.py", 10, f"Token: {jwt_sample}", (), None)
    masker.filter(record2)
    assert "[REDACTED_JWT]" in record2.msg
    assert jwt_sample not in record2.msg

    # 3. JSON password field
    json_msg = '{"username": "admin", "password": "supersecretpassword123"}'
    record3 = logging.LogRecord("test", logging.INFO, "test.py", 10, json_msg, (), None)
    masker.filter(record3)
    assert '"password": "[REDACTED]"' in record3.msg
    assert "supersecretpassword123" not in record3.msg

    # 4. Query param / string format
    record4 = logging.LogRecord("test", logging.INFO, "test.py", 10, "Login attempt password=mypassword123 user=nm", (), None)
    masker.filter(record4)
    assert "password=[REDACTED]" in record4.msg
    assert "mypassword123" not in record4.msg

    # 5. Masking in record.args
    record5 = logging.LogRecord("test", logging.INFO, "test.py", 10, "User failed login with password %s", ("plain_secret_pass",), None)
    record5.args = ("password=plain_secret_pass",)
    masker.filter(record5)
    assert "password=[REDACTED]" in record5.args[0]


def test_correlation_id_propagation():
    """Verify correlation ID context tracking and filter attachment."""
    assert get_request_id() == "-"

    token = set_request_id("req_abc123")
    assert get_request_id() == "req_abc123"

    filt = CorrelationIdFilter()
    rec = logging.LogRecord("test", logging.INFO, "test.py", 10, "Hello", (), None)
    filt.filter(rec)
    assert rec.request_id == "req_abc123"

    reset_request_id(token)
    assert get_request_id() == "-"


def test_json_log_formatter():
    """Verify JSON log formatter structure."""
    formatter = JsonLogFormatter()
    rec = logging.LogRecord("citimart.test", logging.ERROR, "test.py", 42, "Something broke", (), None)
    rec.request_id = "req_test_99"

    output = formatter.format(rec)
    data = json.loads(output)
    assert data["level"] == "ERROR"
    assert data["logger"] == "citimart.test"
    assert data["message"] == "Something broke"
    assert data["request_id"] == "req_test_99"
    assert data["line"] == 42
    assert "ts" in data


def test_setup_logging_files_and_rotation(temp_logs_dir, monkeypatch):
    """Verify setup_logging creates expected log files and separates app, error, access, audit, and worker."""
    monkeypatch.setattr("config.env.env.log_max_bytes", 500)
    monkeypatch.setattr("config.env.env.log_backup_count", 3)

    setup_logging("worker")

    root_logger = logging.getLogger()
    access_logger = logging.getLogger("citimart.access")
    audit_logger = logging.getLogger("citimart.audit")
    worker_logger = logging.getLogger("citimart.worker")

    root_logger.info("Application starting up normally")
    root_logger.warning("Application warning occurred")
    root_logger.error("Application error occurred")

    access_logger.info("HTTP GET /api/meta 200 12.34ms client=127.0.0.1")
    audit_logger.info("audit action=login result=success user='admin'")
    worker_logger.info("worker processed report job #10")

    # Force handler flush
    for h in root_logger.handlers:
        h.flush()
    for h in access_logger.handlers:
        h.flush()
    for h in audit_logger.handlers:
        h.flush()
    for h in worker_logger.handlers:
        h.flush()

    app_log = temp_logs_dir / "app.log"
    error_log = temp_logs_dir / "error.log"
    access_log = temp_logs_dir / "access.log"
    audit_log = temp_logs_dir / "audit.log"
    worker_log = temp_logs_dir / "worker.log"

    assert app_log.exists()
    assert error_log.exists()
    assert access_log.exists()
    assert audit_log.exists()
    assert worker_log.exists()

    app_text = app_log.read_text(encoding="utf-8")
    assert "Application starting up normally" in app_text
    assert "Application warning occurred" in app_text
    assert "Application error occurred" in app_text

    error_text = error_log.read_text(encoding="utf-8")
    assert "Application starting up normally" not in error_text
    assert "Application warning occurred" in error_text
    assert "Application error occurred" in error_text

    access_text = access_log.read_text(encoding="utf-8")
    assert "HTTP GET /api/meta 200" in access_text

    audit_text = audit_log.read_text(encoding="utf-8")
    assert "audit action=login result=success" in audit_text

    worker_text = worker_log.read_text(encoding="utf-8")
    assert "worker processed report job #10" in worker_text

    # Test file rotation: write enough bytes to trigger rotation
    for i in range(25):
        root_logger.info("Fill line %d with additional text to exceed the 500 byte limit for rollover test", i)
    for h in root_logger.handlers:
        h.flush()

    # Check that rotated backup file exists
    rotated_files = list(temp_logs_dir.glob("app.log.*"))
    assert len(rotated_files) >= 1
