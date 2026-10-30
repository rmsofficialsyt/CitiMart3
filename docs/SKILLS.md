# CITIMART Daily Operations — Agent Skills & Workflows (SKILLS)

**Skill Context:** Specialized operational routines and management tasks for AI agents.

---

## 1. Primary Operational Workflows

### Skill 1: User Account Seeding & Verification
- **Purpose:** Ensure the four fixed operational accounts exist in MongoDB Atlas.
- **Workflow:**
  1. Inspect `config/auth_users.py`.
  2. Execute seed script: `python scripts/seed_users.py`.
  3. Validate PBKDF2 hash generation and test credentials using `tests/test_auth.py`.

### Skill 2: Password Rotation Procedure
- **Purpose:** Securely rotate an account password.
- **Workflow:**
  1. Execute rotation script: `python scripts/rotate_passwords.py --username <USERNAME> --password <NEW_PASSWORD>`.
  2. Script validates password policy (>=12 chars, upper, lower, digit, symbol) and updates MongoDB document.

### Skill 3: Automated Midnight Job Verification
- **Purpose:** Test 00:00 UTC finalization job behavior.
- **Workflow:**
  1. Run targeted test: `pytest tests/test_daily_midnight_job.py`.
  2. Verify that open daily entries are transitioned to finalized snapshots.
