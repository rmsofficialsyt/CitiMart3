# CITIMART Daily Operations — Engineering Rules & Constraints (RULES)

Follow [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md) for every security review and every new feature.

---

## 1. Non-Negotiable Operational Rules

### Rule 1: Multi-Tenant Store Scoping (IDOR Prevention)
- **EVERY** protected route handling store data must invoke `require_store_access(store, user)` or `_guard(store, user)`.
- Store managers (`manager`) can **ONLY** read and write records for their designated store (`NM`, `HB`, or `CHW`).
- Any attempt by a manager to query another store's figures must return an immediate HTTP `403 Forbidden`.

### Rule 2: Administrative Privilege Verification
- Administrative endpoints (`POST /api/auth/switch-account`, `/api/targets/*`, `/api/kpi-thresholds/*`, `POST /api/directives`) must strictly declare `Depends(require_admin)`.
- Client-side visibility flags are considered cosmetic; authorization must be verified on the server.

### Rule 3: Zero Secret Commits
- Secrets, MongoDB Atlas URIs (`mongodb+srv://...`), JWT signing keys, and Gemini API keys must reside strictly in `.env` or cloud environment variables.
- Credentials files (`CREDENTIALS*.txt`, `LOGIN_CREDENTIALS*.txt`) must remain permanently git-ignored.

### Rule 4: Data Entry Operating Hours Constraint
- Operational logs must fall within store operating hours: **10:30 AM to 23:59 PM**.
- Time slot normalization must map into the four standardized bands.

### Rule 5: Regression Gate
- Run `pytest` before and after all modifications. All 162 tests must pass with zero failures.
