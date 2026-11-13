"""The MongoDB-backed credential store for the four fixed dashboard accounts.

Identity (which usernames exist, their role and store) is still owned by
config/auth_users.py; this module only adds the password hash and the
read/verify/seed operations against the `users` collection (db/models.USERS).

Password hashing (AUTH-02): new hashes are Argon2id (argon2-cffi, the
spec's preferred algorithm) at the OWASP minimum m=19 MiB, t=2, p=1 --
roughly 25-35 ms per verify, deliberately slow. Hashes written before that
are Django-style PBKDF2-HMAC-SHA256:

    pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>

verify_password() accepts both; needs_rehash() flags anything that isn't
current-parameter Argon2id, and api/routes_auth.py::login re-hashes on the
next successful login (the spec's "re-hash on next successful login, keep
old verifier temporarily"). PBKDF2 hashes therefore disappear on their own.

api/routes_auth.py::login is the only reader in the request path, through
get_user_cached(): a 5-minute Redis read-through cache of just the fields
login needs, so a login burst doesn't pay a MongoDB Atlas round trip per
attempt. set_password() evicts it and revokes every session of the account
(AUTH-03: "invalidate all sessions after reset"). get_current_user
(api/auth.py) never touches this collection.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import threading
from datetime import datetime, timezone

import redis
from argon2 import PasswordHasher
from argon2 import exceptions as argon2_exceptions
from pymongo.database import Database

from config.auth_users import (
    AUTH_USERS,
    DEFAULT_PASSWORDS,
    ENV_PASSWORD_SUFFIX,
    resolve_username,
)
from db.models import USERS

logger = logging.getLogger(__name__)

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 600_000
_SALT_BYTES = 16

# Argon2id parameters, read at call time so the test suite can dial them
# down (tests/conftest.py) exactly like _ITERATIONS.
_ARGON2_TIME_COST = 2
_ARGON2_MEMORY_COST = 19_456  # KiB = 19 MiB
_ARGON2_PARALLELISM = 1

# Concurrent password hashes per process (PASSWORD_HASH_CONCURRENCY).
# Hashing is CPU-bound, so more at once than the cores this process can
# actually use adds no throughput -- and each Argon2id hash holds 19 MiB, so
# an unbounded login burst across a 100-thread pool got every container
# OOM-killed in the compose load test. Excess logins queue here for a few
# ms instead. With several workers/replicas sharing one host, set it to
# roughly cores / (workers on that host).
def _hash_slots() -> int:
    from config.env import env

    return env.password_hash_concurrency or max(2, min(4, os.cpu_count() or 2))


_HASH_SLOTS = threading.BoundedSemaphore(_hash_slots())

USER_CACHE_TTL_SECONDS = 300
_USER_CACHE_FIELDS = ("_id", "username", "role", "store_code", "password_hash")


def _hasher() -> PasswordHasher:
    return PasswordHasher(
        time_cost=_ARGON2_TIME_COST,
        memory_cost=_ARGON2_MEMORY_COST,
        parallelism=_ARGON2_PARALLELISM,
    )


def hash_password(password: str, *, iterations: int | None = None) -> str:
    """Argon2id by default. Passing `iterations` produces a legacy PBKDF2
    hash instead (tests and migration tooling only)."""
    with _HASH_SLOTS:
        if iterations is None:
            return _hasher().hash(password)
        return _hash_pbkdf2(password, iterations)


def _hash_pbkdf2(password: str, iterations: int) -> str:
    salt = os.urandom(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return "{}${}${}${}".format(
        _ALGORITHM,
        iterations,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, encoded: str | None) -> bool:
    """Constant-time check of a candidate password against a stored hash
    (Argon2id or legacy PBKDF2)."""
    if not encoded:
        return False
    with _HASH_SLOTS:
        return _verify_unbounded(password, encoded)


def _verify_unbounded(password: str, encoded: str) -> bool:
    if encoded.startswith("$argon2"):
        try:
            return _hasher().verify(encoded, password)
        except (argon2_exceptions.VerificationError, argon2_exceptions.InvalidHashError):
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


def needs_rehash(encoded: str | None) -> bool:
    """True for a legacy PBKDF2 hash or Argon2 with outdated parameters."""
    if not encoded or not encoded.startswith("$argon2"):
        return True
    try:
        return _hasher().check_needs_rehash(encoded)
    except argon2_exceptions.InvalidHashError:
        return True


# A real hash of a random throwaway password, verified against when the
# username doesn't exist so that response doesn't come back measurably
# faster than a wrong password for a real account (AUTH-01 timing parity).
_DUMMY_HASH: str | None = None


def burn_verify_time(password: str) -> None:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(os.urandom(16).hex())
    verify_password(password, _DUMMY_HASH)


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


def _user_cache_key(canonical: str) -> str:
    return f"auth:user:{canonical}"


def get_user_cached(db: Database, username: str) -> dict | None:
    """get_user() behind a Redis read-through cache (login hot path).
    Only the fields login needs are cached. Redis trouble just means a
    MongoDB read -- this cache is an optimisation, never a dependency."""
    from db.redis_client import get_redis  # local: keep import graph flat

    canonical = resolve_username(username)
    if canonical is None:
        return None
    client = get_redis()
    if client is not None:
        try:
            raw = client.get(_user_cache_key(canonical))
            if raw:
                return json.loads(raw)
        except (redis.RedisError, ValueError):
            logger.warning("User cache read failed; falling back to MongoDB.", exc_info=True)
    doc = db[USERS].find_one({"username": canonical}, {f: 1 for f in _USER_CACHE_FIELDS})
    if doc is not None and client is not None:
        try:
            client.set(_user_cache_key(canonical), json.dumps({f: doc.get(f) for f in _USER_CACHE_FIELDS}), ex=USER_CACHE_TTL_SECONDS)
        except (redis.RedisError, TypeError):
            logger.warning("User cache write failed.", exc_info=True)
    return doc


def invalidate_user_cache(username: str) -> None:
    from db.redis_client import get_redis

    canonical = resolve_username(username) or username
    client = get_redis()
    if client is not None:
        try:
            client.delete(_user_cache_key(canonical))
        except redis.RedisError:
            logger.warning("User cache eviction failed for an account; it expires within %ss.", USER_CACHE_TTL_SECONDS)


def upgrade_password_hash(db: Database, username: str, password: str) -> None:
    """Re-hash a just-verified password with current Argon2id parameters.
    Called only after a successful verify; failure is logged, never raised
    (the user is already authenticated with the old hash)."""
    canonical = resolve_username(username)
    if canonical is None:
        return
    try:
        db[USERS].update_one(
            {"username": canonical},
            {"$set": {"password_hash": hash_password(password), "updated_at": _now()}},
        )
        invalidate_user_cache(canonical)
    except Exception:  # noqa: BLE001
        logger.warning("Password hash upgrade failed; will retry on next login.", exc_info=True)


def set_password(db: Database, username: str, new_password: str) -> bool:
    """Replace one account's password hash, evict its cached copy and revoke
    every live session (AUTH-03). Returns False for an unknown username.
    (Password *policy* is enforced by the caller -- the admin endpoint /
    seed script -- via src/password_policy.py.)"""
    canonical = resolve_username(username)
    if canonical is None:
        return False
    result = db[USERS].update_one(
        {"username": canonical},
        {"$set": {"password_hash": hash_password(new_password), "updated_at": _now()}},
    )
    if result.matched_count != 1:
        return False
    invalidate_user_cache(canonical)
    from src import session_store  # local: avoid an import cycle at module load

    session_store.revoke_all_user_sessions(canonical)
    return True


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

    from pymongo.errors import DuplicateKeyError

    role, store_code = AUTH_USERS[username]
    if db[USERS].find_one({"username": username}):
        return False
    try:
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
    except DuplicateKeyError:
        # Another replica/worker seeded it between our find_one and insert
        # (every process seeds at startup); the unique username index makes
        # that a clean no-op.
        return False
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
