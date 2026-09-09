"""Regenerate CREDENTIALS.txt from config.auth_users WITHOUT touching MongoDB.

Run from the project root:  python scripts/print_credentials.py

This only re-renders the file from the seed passwords (env overrides + the
defaults in config/auth_users.py); it does NOT seed the database. Use
scripts/seed_users.py to actually create the accounts.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.seed_users import OUT, render_credentials_file  # noqa: E402
from src.user_store import resolved_seed_passwords  # noqa: E402


def main() -> None:
    OUT.write_text(render_credentials_file(resolved_seed_passwords()), encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
