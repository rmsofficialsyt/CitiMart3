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

Passwords are NOT stored here -- they live as PBKDF2 hashes in the MongoDB
`users` collection (src/user_store.py). DEFAULT_PASSWORDS below is the seed
used by scripts/seed_users.py when no per-account initial password is supplied
via the environment; changing a password later (src/user_store.set_password)
never touches this file.
"""
from __future__ import annotations

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

# The real credentials the developer distributes to the admin and the three
# store managers -- these are the passwords a fresh database is seeded with
# (scripts/seed_users.py), not placeholders. A <SUFFIX>_INITIAL_PASSWORD env
# var still overrides any of them before the first seed, and an account that
# already exists is never re-seeded, so changing a value here does NOT change a
# live login -- use scripts/rotate_passwords.py / src.user_store.set_password
# for that. Each satisfies src/password_policy.validate_password.
DEFAULT_PASSWORDS: dict[str, str] = {
    ADMIN_USERNAME: "CitiMart_All@123",
}
_STORE_DEFAULT_PASSWORDS = {
    "NM": "CitiMart_NM@123",
    "HB": "CitiMart_HB@231",
    "CHW": "CitiMart_CHW@312",
}
for _username, (_role, _store_code) in AUTH_USERS.items():
    if _store_code:
        DEFAULT_PASSWORDS[_username] = _STORE_DEFAULT_PASSWORDS[_store_code]

# username -> the <SUFFIX> in the <SUFFIX>_INITIAL_PASSWORD env var that
# overrides that account's first-run seed password.
ENV_PASSWORD_SUFFIX: dict[str, str] = {ADMIN_USERNAME: "ADMIN"}
for _username, (_role, _store_code) in AUTH_USERS.items():
    if _store_code:
        ENV_PASSWORD_SUFFIX[_username] = f"MANAGER_{_store_code}"


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
