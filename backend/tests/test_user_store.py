"""src/user_store.py: PBKDF2 hashing + the MongoDB-backed credential store."""
from __future__ import annotations

from config.auth_users import AUTH_USERS
from src import user_store


def test_hash_verify_round_trip():
    encoded = user_store.hash_password("Sample9-Round-Trip", iterations=1000)
    assert encoded.startswith("pbkdf2_sha256$1000$")
    assert user_store.verify_password("Sample9-Round-Trip", encoded)
    assert not user_store.verify_password("wrong", encoded)


def test_verify_rejects_blank_and_malformed():
    assert not user_store.verify_password("x", None)
    assert not user_store.verify_password("x", "")
    assert not user_store.verify_password("x", "not-a-valid-hash")


def test_seed_users_is_idempotent(db_session):
    # conftest's db_session fixture already seeded all four.
    again = user_store.seed_users(db_session, user_store.resolved_seed_passwords())
    assert again == []
    assert db_session["users"].count_documents({}) == len(AUTH_USERS)


def test_seed_account_creates_once_then_is_a_noop(db_session):
    # conftest already seeded all four, so a repeat create is a no-op...
    assert user_store.seed_account(db_session, "ADMINISTRATOR", "Irrelevant9-Pass-Word") is False
    admin = user_store.get_user(db_session, "ADMINISTRATOR")
    assert not user_store.verify_password("Irrelevant9-Pass-Word", admin["password_hash"])
    # ...and a genuinely fresh account is created with the given password.
    db_session["users"].delete_one({"username": "CITIMART - HATIBAGAN"})
    assert user_store.seed_account(db_session, "CITIMART - HATIBAGAN", "Rebuilt9-Hb-Secret") is True
    hb = user_store.get_user(db_session, "CITIMART - HATIBAGAN")
    assert user_store.verify_password("Rebuilt9-Hb-Secret", hb["password_hash"])


def test_get_user_accepts_username_any_case_but_no_email(db_session):
    assert user_store.get_user(db_session, "ADMINISTRATOR")["role"] == "admin"
    assert user_store.get_user(db_session, "administrator")["role"] == "admin"
    # Accounts have no email at all -- the old synthetic alias is not a login.
    assert user_store.get_user(db_session, "administrator@citimart.local") is None
    assert user_store.get_user(db_session, "nobody") is None


def test_set_password_changes_only_that_account(db_session):
    assert user_store.set_password(db_session, "CITIMART - NEW MARKET", "Fresh9-Cobalt-Anchor")
    nw = user_store.get_user(db_session, "CITIMART - NEW MARKET")
    assert user_store.verify_password("Fresh9-Cobalt-Anchor", nw["password_hash"])
    assert not user_store.verify_password("Sample9-Round-Trip", nw["password_hash"])
    assert not user_store.set_password(db_session, "nobody", "Whatever1-Two-Three")
