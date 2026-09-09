"""db/session.py's configuration guard.

Daily Operations is the database-backed half of the project, so an unset
MONGODB_URI must surface as a clear, named error -- there is no workbook
fallback to quietly engage instead (db/xlsx_fallback.py was retired when the
project split in two).
"""
from __future__ import annotations

import pytest

import db.engine
import db.session


@pytest.fixture()
def no_mongo(monkeypatch):
    """No MONGODB_URI and no cached client -- get_database() will raise, the
    same state a fresh Render deploy is in before its env vars are filled."""
    monkeypatch.setattr(db.engine, "_client", None)
    monkeypatch.setattr("config.env.env.mongodb_uri", None, raising=False)
    db.session.reset_session_factory_for_tests()
    yield
    db.engine.reset_engine_for_tests()
    db.session.reset_session_factory_for_tests()


def test_missing_mongo_raises_error_naming_the_variable(no_mongo):
    with pytest.raises(RuntimeError, match="MONGODB_URI is not set"):
        db.session._get_ready_database()


def test_indexes_are_created_once_per_process(monkeypatch):
    """ensure_indexes() is idempotent but not free -- session.py caches that
    it has run, and every later handout must skip it."""
    calls: list[object] = []
    sentinel = object()
    monkeypatch.setattr(db.session, "get_database", lambda: sentinel)
    monkeypatch.setattr(db.session, "ensure_indexes", lambda db: calls.append(db))
    db.session.reset_session_factory_for_tests()

    assert db.session._get_ready_database() is sentinel
    assert db.session._get_ready_database() is sentinel
    assert calls == [sentinel]

    db.session.reset_session_factory_for_tests()
