"""MongoDB database handles.

get_db() is the FastAPI Depends() entry point (`db: Database = Depends(get_db)`).
session_scope() is the equivalent for code with no per-request lifecycle --
src/daily_midnight_job.py's background asyncio task, one-off scripts under
scripts/.

MongoDB writes commit per-document immediately -- there's no unit-of-work to
commit or roll back -- so both functions below are thin wrappers around
db/engine.py's get_database() that make sure indexes exist (ensure_indexes()
is idempotent, so calling it on every handout is cheap and always safe).

MONGODB_URI is REQUIRED here, with no fallback. The old
TEST_DAILY_DASHBOARD.xlsx / db/xlsx_fallback.py escape hatch was retired when
the project split into two sub-projects: Daily Operations is now the
database-backed half by definition, so a missing URI is a configuration
mistake to surface loudly rather than something to paper over with a
workbook whose contents nobody else can see. get_database() already raises a
RuntimeError naming MONGODB_URI; it is re-raised untouched.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from pymongo.database import Database

from db.engine import get_database
from db.models import ensure_indexes

_indexes_ready = False


def _get_ready_database() -> Database:
    global _indexes_ready
    db = get_database()
    if not _indexes_ready:
        ensure_indexes(db)
        _indexes_ready = True
    return db


def get_db() -> Iterator[Database]:
    yield _get_ready_database()


@contextmanager
def session_scope() -> Iterator[Database]:
    yield _get_ready_database()


def reset_session_factory_for_tests() -> None:
    """Test-only: pairs with db.engine.reset_engine_for_tests() -- this
    module also caches whether ensure_indexes() has already run, so a test
    that points get_client() at a different MongoDB (e.g. a fresh mongomock
    instance) must reset this flag too, or the new instance would never get
    its indexes created."""
    global _indexes_ready
    _indexes_ready = False
