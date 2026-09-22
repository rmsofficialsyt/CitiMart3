"""Lazily-created pymongo client. get_client() (not a module-level global) is
deliberate -- see config/env.py's comment on why MONGODB_URI isn't enforced
at import time: importing this module (or anything that transitively
imports it) must never require a database to be configured, so the
historical-analytics code paths and their tests keep working untouched.
Only a caller that actually needs a connection pays that cost, and pays it
with a clear RuntimeError instead of a cryptic import-time crash.
"""
from __future__ import annotations

from pymongo import MongoClient
from pymongo.database import Database

from config.env import env

_client: MongoClient | None = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        if not env.mongodb_uri:
            raise RuntimeError(
                "MONGODB_URI is not set. Set it in the environment or a .env file "
                "before performing any database operation (see config/env.py)."
            )
        # Explicit, short timeouts so a misconfigured deployment fails fast with a
        # clear ServerSelectionTimeoutError instead of hanging a worker for
        # pymongo's 30s default. The usual cause in production is MongoDB Atlas
        # Network Access not allowing the app's egress IP -- a host without a
        # static outbound IP forces that list to be 0.0.0.0/0 (auth is
        # still SCRAM + TLS; TLS is implied by the mongodb+srv:// Atlas URI).
        # High-performance connection pool configuration:
        # Pre-warmed connection pool avoids SSL/TLS handshake latency on burst requests.
        # minPoolSize keeps active connections hot; maxPoolSize allows concurrent worker throughput.
        _client = MongoClient(
            env.mongodb_uri,
            minPoolSize=5,
            maxPoolSize=50,
            maxIdleTimeMS=60_000,
            serverSelectionTimeoutMS=8_000,
            connectTimeoutMS=8_000,
            socketTimeoutMS=15_000,
            retryWrites=True,
            retryReads=True,
            compressors="zlib",
        )
    return _client


def warmup_database() -> bool:
    """Best-effort connection warmup on startup so the first request doesn't pay
    the TLS handshake latency."""
    try:
        db = get_database()
        db.command("ping")
        return True
    except Exception:
        return False


def get_database() -> Database:
    return get_client()[env.mongodb_db_name]


def reset_engine_for_tests() -> None:
    """Test-only: drop the cached client so a test can point get_client() at
    a different MONGODB_URI (e.g. a per-test mock client) without inheriting
    whatever a previous test or the app already connected to."""
    global _client
    _client = None
