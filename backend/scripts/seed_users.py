"""Seed the four fixed dashboard accounts into MongoDB, and (re)write
CREDENTIALS.txt to match.

Run from the project root, with MONGODB_URI set (in .env or the environment):

    python scripts/seed_users.py

Each account's first-run password comes from its <SUFFIX>_INITIAL_PASSWORD env
var if set (ADMIN_INITIAL_PASSWORD / MANAGER_NM_INITIAL_PASSWORD /
MANAGER_HB_INITIAL_PASSWORD / MANAGER_CHW_INITIAL_PASSWORD), otherwise the
distributed default in config/auth_users.DEFAULT_PASSWORDS. Seeding is idempotent:
an account that already exists is left untouched -- change its password with
the admin screen / src.user_store.set_password, never by re-running this.

CREDENTIALS.txt lists whatever password each account was *seeded* with (env
override or default); once a password is changed in the database this file no
longer reflects it -- that's expected, it's a first-run convenience only.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.auth_users import ADMIN_USERNAME, AUTH_USERS  # noqa: E402
from db.session import session_scope  # noqa: E402
from src.user_store import resolved_seed_passwords, seed_users  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "CREDENTIALS.txt"


def render_credentials_file(passwords: dict[str, str]) -> str:
    lines = [
        "=" * 72,
        "CITIMART DASHBOARD -- SEEDED ACCOUNT CREDENTIALS",
        "=" * 72,
        "",
        "These are the passwords the four accounts were SEEDED with by",
        "scripts/seed_users.py (from <SUFFIX>_INITIAL_PASSWORD env vars, or the",
        "defaults in config/auth_users.py). They live as PBKDF2 hashes in",
        "the MongoDB `users` collection. Once a password is changed in the",
        "database this file is stale -- it is a first-run convenience only.",
        "",
        "Log in with the USERNAME and password below. Accounts have no email.",
        "",
    ]
    order = [ADMIN_USERNAME] + [u for u in AUTH_USERS if u != ADMIN_USERNAME]
    for username in order:
        role, store_code = AUTH_USERS[username]
        lines += [
            "-" * 72,
            f"  Username : {username}",
            f"  Password : {passwords[username]}",
            f"  Role     : {role}",
            f"  Store    : {store_code or 'ALL STORES (full access)'}",
        ]
    lines += ["-" * 72, ""]
    return "\n".join(lines)


def main() -> None:
    try:
        passwords = resolved_seed_passwords()
    except ValueError as error:
        raise SystemExit(f"Refusing to seed: {error}")

    with session_scope() as db:
        created = seed_users(db, passwords)
    if created:
        print(f"Seeded {len(created)} account(s): {', '.join(created)}")
    else:
        print("All four accounts already exist -- nothing to seed.")

    OUT.write_text(render_credentials_file(passwords), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
