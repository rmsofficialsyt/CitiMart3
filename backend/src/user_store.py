"""The MongoDB-backed credential store for the four fixed dashboard accounts.

Identity (which usernames exist, their role and store) is still owned by
config/auth_users.py; this module only adds the password hash and the
read/verify/seed operations against the `users` collection (db/models.USERS).

Password hashing is stdlib PBKDF2-HMAC-SHA256 (no third-party dependency,
identical behaviour on every platform). The stored string is Django-style:

    pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>

api/routes_auth.py::login is the only reader in the request path;
get_current_user (api/auth.py) never touches this collection -- it trusts the
signed JWT -- so authenticating a request stays a zero-database operation and
Historical Analytics / Forecasting keep working with no MongoDB configured.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
from datetime import datetime, timezone

from pymongo.database import Database

from config.auth_users import (
    AUTH_USERS,
    DEFAULT_PASSWORDS,
    ENV_PASSWORD_SUFFIX,
    resolve_username,
)
from db.models import USERS

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 600_000
_SALT_BYTES = 16


def hash_password(password: str, *, iterations: int | None = None) -> str:
    # Read the module global at call time (not as a param default) so the test
    # suite can dial it down -- 600k iterations x four seeded accounts per
    # fixture is otherwise the slowest thing in the suite.
    iterations = iterations if iterations is not None else _ITERATIONS
    salt = os.urandom(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "{}${}${}${}".format(
        _ALGORITHM,
        iterations,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, encoded: str | None) -> bool:
    """Constant-time check of a candidate password against a stored hash."""
    if not encoded:
        return False
    try:
        algorithm, iter_str, salt_b64, hash_b64 = encoded.split("$", 3)
        if algorithm != _ALGORITHM:
            return False
        iterations = int(iter_str)
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
    except (ValueError, TypeError):
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate, expected)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_user(db: Database, username: str) -> dict | None:
    """Look up an account by exact or case-insensitive username
    (config/auth_users.resolve_username), returning the stored document or
    None. Username is the only login identifier -- there is no email."""
    canonical = resolve_username(username)
    if canonical is None:
        return None
    return db[USERS].find_one({"username": canonical})


def set_password(db: Database, username: str, new_password: str) -> bool:
    """Replace one account's password hash. Returns False for an unknown
    username. (Password *policy* is enforced by the caller -- the admin
    endpoint / seed script -- via src/password_policy.py.)"""
    canonical = resolve_username(username)
    if canonical is None:
        return False
    result = db[USERS].update_one(
        {"username": canonical},
        {"$set": {"password_hash": hash_password(new_password), "updated_at": _now()}},
    )
    return result.matched_count == 1


def seed_password_for(username: str) -> str:
    """First-run password for one account: its <SUFFIX>_INITIAL_PASSWORD env
    var if set, else the public default in config/auth_users.DEFAULT_PASSWORDS."""
    suffix = ENV_PASSWORD_SUFFIX.get(username)
    if suffix:
        override = os.environ.get(f"{suffix}_INITIAL_PASSWORD")
        if override:
            return override
    return DEFAULT_PASSWORDS[username]


def resolved_seed_passwords() -> dict[str, str]:
    """Every account's first-run password, each validated against
    src/password_policy.py. Raises ValueError if any fails policy."""
    from src.password_policy import validate_password  # local: keep import graph flat

    passwords: dict[str, str] = {}
    for username in AUTH_USERS:
        pw = seed_password_for(username)
        errors = validate_password(pw, username)
        if errors:
            raise ValueError(f"initial password for {username!r} fails policy: " + "; ".join(errors))
        passwords[username] = pw
    return passwords


def seed_account(db: Database, username: str, password: str) -> bool:
    """Create one fixed account if it doesn't exist yet. Returns True if it was
    created, False if it already existed (an existing account is left completely
    untouched -- its password is never reset here). Password *policy* is the
    caller's responsibility. Raises KeyError for a username not in AUTH_USERS.
    """
    from db.models import next_id  # local import: avoids a cycle at module load

    role, store_code = AUTH_USERS[username]
    if db[USERS].find_one({"username": username}):
        return False
    db[USERS].insert_one(
        {
            "_id": next_id(db, USERS),
            "username": username,
            "role": role,
            "store_code": store_code,
            "password_hash": hash_password(password),
            "created_at": _now(),
            "updated_at": _now(),
        }
    )
    return True


def seed_users(db: Database, passwords: dict[str, str]) -> list[str]:
    """Idempotently create any of the four fixed accounts that don't exist yet,
    using `passwords[username]` for each. An account that already exists is left
    completely untouched. Returns the list of usernames actually created.

    `passwords` must supply an entry for every username in AUTH_USERS that is
    missing from the collection; a missing key raises KeyError rather than
    creating a password-less account. app.py's startup seeder does NOT go
    through here -- it calls seed_account() per account so one bad initial
    password can't block the other three.
    """
    created: list[str] = []
    for username in AUTH_USERS:
        if db[USERS].find_one({"username": username}):
            continue
        if seed_account(db, username, passwords[username]):
            created.append(username)
    return created
