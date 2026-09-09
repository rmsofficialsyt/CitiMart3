"""Password rules for the four dashboard accounts, enforced in one place.

Called by the admin "Manage Passwords" endpoint (api/routes_admin.py, Phase 2)
and the seed script, and mirrored client-side in
frontend/src/lib/passwordPolicy.ts for immediate feedback. NIST-leaning: length
matters more than arcane composition, but a modest class requirement is kept
because these are shared shop-floor logins.
"""
from __future__ import annotations

MIN_LENGTH = 12
MAX_LENGTH = 128

# Lowercase substrings that must not appear as (or dominate) a password.
# "citimart" is deliberately NOT here: the credentials the developer hands out
# (config/auth_users.DEFAULT_PASSWORDS) are brand-prefixed by design, and this
# module is the same gate the seed path runs through -- banning the brand would
# make the shipped passwords unseedable. The store names stay banned.
_DENYLIST = {
    "password", "passw0rd", "12345678", "qwerty",
    "admin", "letmein", "welcome", "newmarket", "hatibagan", "chowringhee",
}

_SYMBOLS = set("!@#$%^&*()-_=+[]{};:,.<>/?\\|`~\"'")


def validate_password(password: str, username: str = "") -> list[str]:
    """Return a list of human-readable rule violations. Empty list == valid."""
    errors: list[str] = []
    pw = password or ""

    if len(pw) < MIN_LENGTH:
        errors.append(f"Must be at least {MIN_LENGTH} characters.")
    if len(pw) > MAX_LENGTH:
        errors.append(f"Must be at most {MAX_LENGTH} characters.")
    if pw != pw.strip():
        errors.append("Must not start or end with a space.")
    if not pw.strip():
        errors.append("Must not be blank.")

    classes = sum([
        any(c.islower() for c in pw),
        any(c.isupper() for c in pw),
        any(c.isdigit() for c in pw),
        any(c in _SYMBOLS for c in pw),
    ])
    if classes < 3:
        errors.append("Must include at least 3 of: lowercase, uppercase, digit, symbol.")

    lowered = pw.lower()
    if username and lowered == username.strip().lower():
        errors.append("Must not be the same as the username.")
    if any(bad in lowered for bad in _DENYLIST):
        errors.append("Must not contain a common word or the store name.")

    return errors


def is_valid(password: str, username: str = "") -> bool:
    return not validate_password(password, username)
