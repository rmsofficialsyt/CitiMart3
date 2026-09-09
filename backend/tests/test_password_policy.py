from src.password_policy import is_valid, validate_password


def test_strong_password_passes():
    assert is_valid("Sample9-Harbor-Ledger", "ADMINISTRATOR")


def test_too_short_fails():
    errs = validate_password("Ab1!x", "u")
    assert any("12 characters" in e for e in errs)


def test_needs_three_classes():
    assert validate_password("abcdefghijklmnop", "u")  # all-lowercase -> violation


def test_rejects_username_match():
    assert validate_password("ADMINISTRATOR", "ADMINISTRATOR")


def test_rejects_common_word():
    assert validate_password("Password123!!xx", "u")


def test_rejects_leading_space():
    assert validate_password(" Sample9-Harbor-Ledger", "u")
