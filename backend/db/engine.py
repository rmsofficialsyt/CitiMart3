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
        _client = MongoClient(
            env.mongodb_uri,
            serverSelectionTimeoutMS=10_000,
            connectTimeoutMS=10_000,
        )
    return _client


def get_database() -> Database:
    return get_client()[env.mongodb_db_name]


def reset_engine_for_tests() -> None:
    """Test-only: drop the cached client so a test can point get_client() at
    a different MONGODB_URI (e.g. a per-test mock client) without inheriting
    whatever a previous test or the app already connected to."""
    global _client
    _client = None
