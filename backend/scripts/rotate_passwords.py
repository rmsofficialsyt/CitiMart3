"""Rotate the four dashboard accounts' passwords to fresh random values.

Run from the project root, with MONGODB_URI set (in .env or the environment):

    python scripts/rotate_passwords.py                 # rotate all four
    python scripts/rotate_passwords.py ADMINISTRATOR    # rotate just one (by username)

Unlike scripts/seed_users.py this *overwrites* the existing password hash for
every account it touches (via src.user_store.set_password). It then rewrites the
gitignored CREDENTIALS.txt with the new values and prints them once. Use this
after a suspected credential exposure, or on any regular rotation schedule.

Each generated password satisfies src/password_policy.validate_password.
"""
from __future__ import annotations

import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.auth_users import ADMIN_USERNAME, AUTH_USERS, resolve_username  # noqa: E402
from db.session import session_scope  # noqa: E402
from scripts.seed_users import OUT, render_credentials_file  # noqa: E402
from src.password_policy import validate_password  # noqa: E402
from src.user_store import set_password  # noqa: E402

# Ambiguous glyphs (0/O, 1/l/I) left out so a printed password transcribes cleanly.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
_SYMBOLS = "!@#$%^&*-_=+"


def _generate(username: str, length: int = 24) -> str:
    """A random password that passes validate_password for this username."""
    for _ in range(1000):
        body = "".join(secrets.choice(_ALPHABET) for _ in range(length - 4))
        candidate = "-".join(
            (
                secrets.choice(_SYMBOLS),
                body[: length // 2],
                body[length // 2 :],
                str(secrets.randbelow(90) + 10),
            )
        )
        if not validate_password(candidate, username):
            return candidate
    raise RuntimeError("could not generate a policy-valid password")  # pragma: no cover


def main() -> None:
    args = sys.argv[1:]
    if args:
        targets = []
        for raw in args:
            canonical = resolve_username(raw)
            if canonical is None:
                raise SystemExit(f"Unknown account: {raw!r}")
            targets.append(canonical)
    else:
        targets = list(AUTH_USERS)

    new_passwords = {u: _generate(u) for u in targets}

    with session_scope() as db:
        for username in targets:
            if not set_password(db, username, new_passwords[username]):
                raise SystemExit(f"Account not found in DB (seed it first): {username!r}")

    # CREDENTIALS.txt shows every account; keep untouched accounts' lines accurate
    # by reading their current seed value only when we didn't just rotate them.
    from src.user_store import seed_password_for

    all_lines = {u: new_passwords.get(u, seed_password_for(u)) for u in AUTH_USERS}
    # Put the admin first, same order render_credentials_file expects.
    ordered = {ADMIN_USERNAME: all_lines[ADMIN_USERNAME]}
    ordered.update({u: all_lines[u] for u in AUTH_USERS if u != ADMIN_USERNAME})
    OUT.write_text(render_credentials_file(ordered), encoding="utf-8")

    print(f"Rotated {len(targets)} account(s): {', '.join(targets)}")
    for username in targets:
        print(f"  {username:<24} {new_passwords[username]}")
    print(f"\nNew values written to {OUT} (gitignored). Distribute them out-of-band.")
    print("Accounts not rotated here keep their existing password; the file's line")
    print("for them may be stale if it was ever changed from the seed value.")


if __name__ == "__main__":
    main()
