"""Collection names and index setup for the Daily Dashboard's live data --
bills/footfall/nob/targets -- backed by MongoDB (db/engine.py's
get_database()) since the Postgres -> MongoDB migration.
src/daily_dashboard_store.py is the module that reads/writes these
documents; config/settings.py's TIME_SLOT_ORDER/time_slot_for_time is still
the single source of truth for each document's time_slot field, computed
the same way at insert time as before.

MongoDB has no schema/CHECK-constraint enforcement -- store codes are
validated in application code instead (daily_dashboard_store._validate_store,
against config/settings.py's STORE_CODE_TO_NAME) rather than at the database
layer.

Document shapes (all fields besides _id are plain str/float/None -- BSON has
no bare date/time type, so entry_date is stored as an ISO "YYYY-MM-DD"
string and bill_time/entry_time as "HH:MM" strings, matching exactly what
daily_dashboard_store.py's _bill_to_dict/_timed_entry_to_dict already
produce for the API):

    bills:    {_id, store_code, entry_date, bill_time, net_amount,
               bill_quantity, time_slot, created_at, updated_at}
    footfall: {_id, store_code, entry_date, entry_time, footfall,
               time_slot, created_at, updated_at}
    nob:      {_id, store_code, entry_date, entry_time, nob,
               time_slot, created_at, updated_at}
    targets:  {_id, store_code, entry_date, sales_target, net_sales,
               remaining, footfall, nob, atv, rpv, basket_size,
               conversion_pct, achievement_pct, reason, created_at,
               updated_at, overrides}
              -- `overrides` is an optional sub-document
              {atv?, rpv?, basket_size?, conversion_pct?, achievement_pct?}
              of a manager's hand-entered values for those five ratio KPIs
              (daily_dashboard_store.set_kpi_override), overlaid onto the
              computed figures by compute_live_kpis / _apply_overrides.
              Absent until the first override is set for that store+date.
    counters: {_id: <collection name>, seq: <int>} -- backs next_id()'s
              auto-incrementing integer ids. MongoDB's own _id would
              otherwise default to an ObjectId, but frontend/src/lib/types.ts
              (BillEntry.row etc.) and api/routes_daily.py's
              int(payload.get("row")) both expect a plain int, matching the
              old SQL auto-increment primary key -- this preserves that
              contract without touching either of those files.
    users:    {_id, username, role, store_code, password_hash,
               created_at, updated_at} -- the four fixed dashboard accounts
               (config/auth_users.py is the source of identity; this
               collection only adds the password hash). Written by
               src/user_store.py / scripts/seed_users.py, read by
               api/routes_auth.py::login. A unique index on `username`.
               get_current_user never touches this collection -- it verifies
               the JWT signature and reads role/store_code straight off the
               token claims -- so every non-Daily-Operations route stays
               database-free.
"""
from __future__ import annotations

from pymongo import ReturnDocument
from pymongo.database import Database

BILLS = "bills"
FOOTFALL = "footfall"
NOB = "nob"
TARGETS = "targets"
COUNTERS = "counters"
USERS = "users"


def ensure_indexes(db: Database) -> None:
    """Idempotent -- create_index() is a no-op if the index already exists
    with the same spec. Called once per Database, the first time db/session.py
    hands one out (replaces what Alembic's migrations/versions/ used to
    provision for Postgres)."""
    db[BILLS].create_index([("store_code", 1), ("entry_date", 1)])
    db[FOOTFALL].create_index([("store_code", 1), ("entry_date", 1)])
    db[NOB].create_index([("store_code", 1), ("entry_date", 1)])
    db[TARGETS].create_index([("store_code", 1), ("entry_date", 1)], unique=True)
    db[USERS].create_index([("username", 1)], unique=True)


def next_id(db: Database, collection_name: str) -> int:
    """Atomic auto-incrementing integer id -- see the module docstring's
    `counters` entry for why this exists instead of a bare ObjectId."""
    doc = db[COUNTERS].find_one_and_update(
        {"_id": collection_name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return doc["seq"]
