"""Centralized Logging Configuration for CITIMART Daily Operations.

Provides production-grade logging:
  - Rotated log files in logs/ (app.log, error.log, access.log, audit.log, worker.log)
  - Correlation ID injection via contextvars for request tracing
  - Sensitive data masking (passwords, JWTs, bearer tokens, cookies)
  - Dual output: human-readable file & console streams (optional JSON lines)
  - Controlled by backend/config/env.py and backend/config/settings.py
"""
from __future__ import annotations

import contextvars
import json
import logging
import re
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

from config.env import env

# Correlation ID context variable for tracing requests across async/threaded flows
_REQUEST_ID_CTX: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")


def get_request_id() -> str:
    """Return the current active request ID or '-' if outside a request context."""
    return _REQUEST_ID_CTX.get()


def set_request_id(request_id: str) -> contextvars.Token:
    """Set the current active request ID in contextvars."""
    return _REQUEST_ID_CTX.set(request_id)


def reset_request_id(token: contextvars.Token) -> None:
    """Reset the request ID context variable using the returned token."""
    _REQUEST_ID_CTX.reset(token)


class CorrelationIdFilter(logging.Filter):
    """Injects `request_id` into every LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id") or record.request_id == "-":
            record.request_id = get_request_id()
        return True


class SensitiveDataMasker(logging.Filter):
    """Redacts sensitive credentials, tokens, and secrets from log messages (LOG-02)."""

    # Patterns for redacting sensitive values
    _PATTERNS = [
        # Bearer tokens
        (re.compile(r"(Bearer\s+)[A-Za-z0-9_\-\.]+", re.IGNORECASE), r"\1[REDACTED_TOKEN]"),
        # JWT-like three-segment dot-separated strings (min 15 chars in header/payload)
        (
            re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_\-\.]+"),
            "[REDACTED_JWT]",
        ),
        # JSON / query password fields: "password": "...", password=...
        (
            re.compile(r'("(?:password|new_password|current_password|initial_password|secret|jwt_secret)":\s*")[^"]+(")', re.IGNORECASE),
            r'\1[REDACTED]\2',
        ),
        (
            re.compile(r'((?:password|new_password|secret|jwt_secret)=)[^\s&,]+', re.IGNORECASE),
            r"\1[REDACTED]",
        ),
        # Authorization header in string representations
        (
            re.compile(r"('Authorization':\s*'Bearer\s+)[^']+", re.IGNORECASE),
            r"\1[REDACTED]",
        ),
    ]

    def _mask_text(self, text: str) -> str:
        for pattern, replacement in self._PATTERNS:
            text = pattern.sub(replacement, text)
        return text

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self._mask_text(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: (self._mask_text(v) if isinstance(v, str) else v)
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    self._mask_text(arg) if isinstance(arg, str) else arg
                    for arg in record.args
                )
        return True


class JsonLogFormatter(logging.Formatter):
    """Structured JSON formatter for off-host log shippers (Datadog, ELK, CloudWatch)."""

    def format(self, record: logging.LogRecord) -> str:
        data: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "module": record.module,
            "line": record.lineno,
        }
        if record.exc_info:
            data["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(data)


_LOGGING_INITIALIZED = False


def setup_logging(component: str = "api") -> logging.Logger:
    """Initialize centralized logging with console and rotating file handlers in logs/.

    Parameters:
      component: 'api' for FastAPI backend, 'worker' for BullMQ worker.
    """
    global _LOGGING_INITIALIZED

    log_level_name = (env.log_level or "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO)

    # Base filters
    correlation_filter = CorrelationIdFilter()
    masker_filter = SensitiveDataMasker()

    # Formatter selection
    if env.log_format_json:
        formatter: logging.Formatter = JsonLogFormatter()
    else:
        log_format = "%(asctime)s [%(levelname)s] [%(request_id)s] %(name)s: %(message)s"
        formatter = logging.Formatter(log_format, datefmt="%Y-%m-%d %H:%M:%S")

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Avoid duplicate handlers if setup_logging is called multiple times
    root_logger.handlers.clear()

    # 1. Console / stdout Handler (always active for docker logs & terminal)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(correlation_filter)
    console_handler.addFilter(masker_filter)
    root_logger.addHandler(console_handler)

    # 2. File Handlers (if log_to_file is enabled)
    if env.log_to_file:
        logs_dir: Path = env.resolved_log_dir()
        logs_dir.mkdir(parents=True, exist_ok=True)

        max_bytes = env.log_max_bytes
        backup_count = env.log_backup_count

        # A) app.log: All application logs >= INFO
        app_log_path = logs_dir / "app.log"
        app_file_handler = RotatingFileHandler(
            app_log_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
            delay=True,
        )
        app_file_handler.setLevel(log_level)
        app_file_handler.setFormatter(formatter)
        app_file_handler.addFilter(correlation_filter)
        app_file_handler.addFilter(masker_filter)
        root_logger.addHandler(app_file_handler)

        # B) error.log: Warnings, Errors & Critical only
        error_log_path = logs_dir / "error.log"
        error_file_handler = RotatingFileHandler(
            error_log_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
            delay=True,
        )
        error_file_handler.setLevel(logging.WARNING)
        error_file_handler.setFormatter(formatter)
        error_file_handler.addFilter(correlation_filter)
        error_file_handler.addFilter(masker_filter)
        root_logger.addHandler(error_file_handler)

        # C) access.log: HTTP requests & latencies
        access_logger = logging.getLogger("citimart.access")
        access_logger.handlers.clear()
        access_logger.setLevel(logging.INFO)
        access_logger.propagate = False  # Keep access logs dedicated to access.log + console

        access_log_path = logs_dir / "access.log"
        access_file_handler = RotatingFileHandler(
            access_log_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
            delay=True,
        )
        access_file_handler.setLevel(logging.INFO)
        access_file_handler.setFormatter(formatter)
        access_file_handler.addFilter(correlation_filter)
        access_file_handler.addFilter(masker_filter)
        access_logger.addHandler(access_file_handler)
        # Also mirror access to console
        access_logger.addHandler(console_handler)

        # D) audit.log: Security audit events
        audit_logger = logging.getLogger("citimart.audit")
        audit_logger.handlers.clear()
        audit_logger.setLevel(logging.INFO)
        audit_logger.propagate = False  # Dedicated audit log + console

        audit_log_path = logs_dir / "audit.log"
        audit_file_handler = RotatingFileHandler(
            audit_log_path,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
            delay=True,
        )
        audit_file_handler.setLevel(logging.INFO)
        audit_file_handler.setFormatter(formatter)
        audit_file_handler.addFilter(correlation_filter)
        audit_file_handler.addFilter(masker_filter)
        audit_logger.addHandler(audit_file_handler)
        audit_logger.addHandler(console_handler)

        # E) worker.log: Dedicated BullMQ worker log
        if component == "worker":
            worker_logger = logging.getLogger("citimart.worker")
            worker_logger.handlers.clear()
            worker_logger.setLevel(log_level)
            worker_logger.propagate = True

            worker_log_path = logs_dir / "worker.log"
            worker_file_handler = RotatingFileHandler(
                worker_log_path,
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding="utf-8",
                delay=True,
            )
            worker_file_handler.setLevel(log_level)
            worker_file_handler.setFormatter(formatter)
            worker_file_handler.addFilter(correlation_filter)
            worker_file_handler.addFilter(masker_filter)
            worker_logger.addHandler(worker_file_handler)

    # Silence overly verbose external loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    _LOGGING_INITIALIZED = True
    return root_logger
