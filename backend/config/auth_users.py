"""The four fixed accounts of the CITIMART dashboard, defined once in code.

There are exactly four -- three store managers (one per store, partial access
to only that store's Daily Operations) and one admin (full access). Usernames
are fixed forever and set here, never created through a UI. There is no email
field anywhere in the auth path: an account is a username, a role and a store,
nothing else (managers have no "forgot password" flow, so no address was ever
useful -- the developer hands out the password directly).

`store_code` is the real join key everywhere in the app; the display name is
cosmetic. The manager store names match config.settings.STORE_CODE_TO_NAME
exactly (note the spelling "CHOWRINGHEE", not the "CHOWRINGEE" that appeared in
an early spec draft) so there is only ever one spelling of each store in the
codebase.

Passwords are NOT stored in this file -- they live as PBKDF2 hashes in the
MongoDB `users` collection (src/user_store.py). Seed passwords are read
exclusively from environment variables (<SUFFIX>_INITIAL_PASSWORD); for
dev/test use only, a secure random fallback is generated when no env var is
set. Changing a password later (src/user_store.set_password) never touches
this file.
"""
from __future__ import annotations

import os
import secrets

from config.settings import STORE_CODE_TO_NAME

ADMIN_USERNAME = "ADMINISTRATOR"

# store_code -> the manager username shown on the login screen.
MANAGER_USERNAME_BY_STORE = {code: name for code, name in STORE_CODE_TO_NAME.items()}

# username -> (role, store_code | None)
AUTH_USERS: dict[str, tuple[str, str | None]] = {
    ADMIN_USERNAME: ("admin", None),
}
for _code, _name in STORE_CODE_TO_NAME.items():
    AUTH_USERS[_name] = ("manager", _code)

# username -> the <SUFFIX> in the <SUFFIX>_INITIAL_PASSWORD env var that
# supplies that account's first-run seed password.
ENV_PASSWORD_SUFFIX: dict[str, str] = {ADMIN_USERNAME: "ADMIN"}
for _username, (_role, _store_code) in AUTH_USERS.items():
    if _store_code:
        ENV_PASSWORD_SUFFIX[_username] = f"MANAGER_{_store_code}"


def _generate_fallback_password() -> str:
    """Generate a secure random password for dev/test use when no env var is
    set. The password satisfies src/password_policy (>=12 chars, 3+ character
    classes). These are generated fresh each process start -- they are NOT
    meant for production; set the *_INITIAL_PASSWORD env vars on Render."""
    # token_urlsafe(18) gives 24 chars of [A-Za-z0-9_-]; prefix ensures all
    # four character classes (upper, lower, digit, special) are always present.
    return "Dev_" + secrets.token_urlsafe(18) + "!1"


# Lazily-populated cache: passwords for dev/test fallback, stable within a
# single process lifetime so repeated calls (e.g. seed + print) are consistent.
_fallback_passwords: dict[str, str] = {}


def _get_fallback_password(username: str) -> str:
    """Return a stable-per-process random password for *username*."""
    if username not in _fallback_passwords:
        _fallback_passwords[username] = _generate_fallback_password()
    return _fallback_passwords[username]


def get_seed_password(username: str) -> str:
    """First-run seed password for *username*.

    1. If the corresponding <SUFFIX>_INITIAL_PASSWORD env var is set, use it.
    2. Otherwise generate a secure random password (dev/test fallback).

    Production deployments MUST set the env vars (on Render / in .env).
    """
    suffix = ENV_PASSWORD_SUFFIX.get(username)
    if suffix:
        override = os.environ.get(f"{suffix}_INITIAL_PASSWORD")
        if override:
            return override
    return _get_fallback_password(username)


# DEFAULT_PASSWORDS is kept as a public dict for backward compatibility with
# the test suite and scripts that import it. It is populated lazily from env
# vars / secure random fallback -- never from hardcoded plaintext.
DEFAULT_PASSWORDS: dict[str, str] = {}
for _username in AUTH_USERS:
    DEFAULT_PASSWORDS[_username] = get_seed_password(_username)


def resolve_username(raw: str) -> str | None:
    """Accept the exact username or a case-insensitive match, and return the
    canonical username key -- or None if unknown."""
    if not raw:
        return None
    candidate = raw.strip()
    if candidate in AUTH_USERS:
        return candidate
    lowered = candidate.lower()
    for username in AUTH_USERS:
        if username.lower() == lowered:
            return username
    return None
