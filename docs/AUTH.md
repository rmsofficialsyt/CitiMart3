# CITIMART Daily Operations — Authentication & Authorization Architecture (AUTH)

> **Core Philosophy:** Short-lived JWTs bound to revocable server-side sessions (Redis), Argon2id credential storage in MongoDB Atlas, and strict store-level multi-tenant isolation. Full endpoint reference: [APIS.md §1](APIS.md).

---

## 1. Identity & Account Model

CITIMART Daily Operations operates on a closed, fixed-account retail ecosystem. There is **no public registration or arbitrary sign-up endpoint**.

### 1.1 The Four Fixed Accounts
Defined in [`backend/config/auth_users.py`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/config/auth_users.py):

| Username | Role | Store Code | Store Display Name | Scope of Access |
|---|---|---|---|---|
| `ADMINISTRATOR` | `admin` | `None` | All Stores | Full cross-store analytics, directives creation, target uploads, KPI overrides, account switching |
| `CITIMART - NEW MARKET` | `manager` | `NM` | New Market | Isolated to New Market bills, footfall, NOB, requisitions, and chat |
| `CITIMART - HATIBAGAN` | `manager` | `HB` | Hatibagan | Isolated to Hatibagan bills, footfall, NOB, requisitions, and chat |
| `CITIMART - CHOWRINGHEE` | `manager` | `CHW` | Chowringhee | Isolated to Chowringhee bills, footfall, NOB, requisitions, and chat |

### 1.2 Account Seeding & Environment Variables
First-run passwords are seeded into MongoDB's `users` collection via [`src/user_store.py::seed_users()`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/src/user_store.py) during startup (`_seed_accounts_best_effort`):
- `ADMIN_INITIAL_PASSWORD` → Seeds `ADMINISTRATOR`
- `MANAGER_NM_INITIAL_PASSWORD` → Seeds `CITIMART - NEW MARKET`
- `MANAGER_HB_INITIAL_PASSWORD` → Seeds `CITIMART - HATIBAGAN`
- `MANAGER_CHW_INITIAL_PASSWORD` → Seeds `CITIMART - CHOWRINGHEE`

*Note:* In dev/test environments without explicit environment variables, high-entropy fallback passwords satisfying the password policy are generated in-memory.

---

## 2. Password Security & Storage

### 2.1 Hashing Specification (AUTH-02)
- **Algorithm:** **Argon2id** (`argon2-cffi`) for every new hash, at the OWASP minimum
  `m=19 MiB, t=2, p=1` (~25–35 ms per verify).
- **Legacy hashes:** PBKDF2-HMAC-SHA256 (`pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>`,
  600,000 iterations) still verify, and are **re-hashed to Argon2id on the next successful
  login** (`needs_rehash` → `upgrade_password_hash`), so they disappear on their own.
- **Timing parity (AUTH-01):** an unknown username still runs one verify against a dummy
  hash, so it answers no faster than a wrong password.
- **Bounded concurrency:** at most `PASSWORD_HASH_CONCURRENCY` hashes run at once per
  process (default `min(4, cpus)`). Each Argon2id hash holds 19 MiB; unbounded, a login
  burst OOM-killed every container in the compose load test.

### 2.2 Password Complexity Policy
Enforced in [`src/password_policy.py`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/src/password_policy.py):
- Minimum length: **12 characters**.
- Character composition: Requires at least 3 character classes (uppercase `[A-Z]`, lowercase `[a-z]`, digits `[0-9]`, and special symbols).
- Passwords failing this policy are rejected with HTTP 400.

---

## 3. Token Lifecycle & JWT Architecture

### 3.1 Sessions, Access Tokens & Refresh Tokens (AUTH-05)
Login creates a **server-side session** (`src/session_store.py`) and returns:
- **Access token:** HS256 JWT, **15 min** (`ACCESS_TOKEN_TTL_SECONDS=900`), bound to the session by `sid`.
- **Refresh token:** opaque 384-bit random value, stored server-side only as a SHA-256
  hash. Sent as the HttpOnly cookie `citimart_refresh` (`Path=/api/auth`, `SameSite=Lax`,
  `Secure`) and in the body. **Rotated on every use**; re-use of a rotated token after the
  20 s grace window revokes the session (theft detection), within it returns `409`
  (two tabs racing).
- **Absolute expiry:** `REFRESH_TOKEN_TTL_SECONDS` (12 h, one shift) from login, never
  extended by rotation. **Idle expiry:** `SESSION_IDLE_TIMEOUT_SECONDS` (2 h) without a refresh.
- **Revocation:** logout, logout-all, `DELETE /api/auth/sessions/{sid}`, account switch
  (revokes the caller's old session) and password change (`set_password` revokes all of
  the account's sessions) all take effect on the very next request.

Storage is Redis when `REDIS_URL` is set (`sess:{sid}`, `user_sess:{username}`,
`rt:{hash}`, `rt_used:{hash}`, every key with a TTL), else an in-process dict, which is
correct for a **single worker only**. `app.py` logs an error at startup if
`WEB_CONCURRENCY > 1` without Redis.

### 3.2 Claims Schema
```json
{
  "sub": "user-1",
  "sid": "<session id>",
  "jti": "<token id>",
  "iss": "citimart-daily-ops",
  "aud": "citimart-api",
  "username": "CITIMART - NEW MARKET",
  "role": "manager",
  "store_code": "NM",
  "iat": 1730291400,
  "exp": 1730292300
}
```
`switched_from` is added only for an admin-switched session.

### 3.3 Verification on Every Request
1. `api/auth.py::_decode()` verifies signature (`HS256` only) and `exp`; a token carrying
   `sid` must also carry our `iss`/`aud`.
2. `_require_live_session()` checks the session still exists and belongs to the token's
   `username`: one Redis `HMGET` (~0.4 ms), no MongoDB access. If Redis is configured but
   unreachable the request gets `503` (INP-10 fail closed), never a pass.
3. Tokens **without** `sid` predate the session registry. They're accepted only while
   `REQUIRE_SESSION_ID` resolves false (default: false outside `ENVIRONMENT=production`)
   and can't be revoked early; they expire within their original 12 h.

### 3.4 Frontend Token Handling
The SPA keeps the access token **in memory only** (no `localStorage`; the legacy
`citimart.auth` key is deleted on load). After a reload, `AuthProvider` restores the
session by calling `/api/auth/refresh` with the cookie. `tokenStore.authFetch()` retries a
401 once after a **single-flight** refresh (concurrent 401s share one refresh, since
tokens rotate), and the provider also renews proactively a minute before expiry. In
direct cross-origin mode (`VITE_API_BASE_URL` set) the cookie isn't sent, so the refresh
token from the body is held in memory instead: sessions survive token expiry but not a reload.

---

## 4. Authorization Enforcement & Primitives

FastAPI dependency injection gates all backend endpoints:

### 4.1 Global Bearer Gate (`get_current_user`)
```python
@router.get("/api/daily/summary")
def get_daily_summary(user: CurrentUser = Depends(get_current_user)):
    ...
```
- Validates the `Authorization: Bearer <token>` header.
- Rejects missing, expired, or tampered tokens with `401 Unauthorized`.

### 4.2 Admin-Only Gate (`require_admin`)
```python
@router.post("/api/targets/upload")
def upload_targets(user: CurrentUser = Depends(require_admin)):
    ...
```
- Enforces `user.is_admin is True`.
- Rejects manager tokens with `403 Forbidden: Administrator access required`.

### 4.3 Multi-Tenant Store Isolation (`require_store_access`)
Protects against Insecure Direct Object References (IDOR):
```python
@router.post("/api/daily/entry")
def add_bill_entry(store: str, user: CurrentUser = Depends(get_current_user)):
    require_store_access(store, user)
    ...
```
- Admins pass for all stores (`NM`, `HB`, `CHW`).
- Store managers are strictly restricted to their own assigned `store_code`.
- Attempting to access another store immediately raises `403 Forbidden: You do not have access to that store`, aborting execution before touching MongoDB.

---

## 5. Account Switching ("View as Store Manager")

To support floor inspection and debugging, administrators can switch into any store manager account without needing the manager's password:

1. **Initiation:** Admin issues `POST /api/auth/switch-account` with `{ "username": "CITIMART - NEW MARKET" }`.
2. **Authorization:** Backend validates that the caller has `role == "admin"`.
3. **Token Issuance:** Backend self-issues a new manager JWT for the requested store, injecting:
   ```json
   "switched_from": "ADMINISTRATOR"
   ```
4. **Audit Trail:** The frontend UI displays an amber "Viewing as Store Manager" banner with a "Revert to Admin" button, and every switch is written to `audit_logs` (`switch_account`, actor = root admin).
5. **Revert:** Reverting switches back to the administrator. Each switch starts a new session and revokes the previous one, so a switched token can't be replayed after the switch.

---

## 6. Auth API Reference

### 6.1 User Login
`POST /api/auth/login`
- **Rate Limits:** all attempts per IP (default 2000/min, burst cap for NAT'd store networks) + **failed** attempts per (IP, username) (default 25/min); Redis-shared across replicas.
- **Request Body:**
  ```json
  {
    "username": "ADMINISTRATOR",
    "password": "Password123!@"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 900,
    "refresh_token": "<opaque>",
    "refresh_expires_in": 43200,
    "session_id": "<sid>",
    "user": {
      "username": "ADMINISTRATOR",
      "role": "admin",
      "store_code": null
    }
  }
  ```

### 6.2 Switch Account (Admin Only)
`POST /api/auth/switch-account`
- **Headers:** `Authorization: Bearer <admin_token>`
- **Request Body:**
  ```json
  {
    "username": "CITIMART - NEW MARKET"
  }
  ```
- **Response (200 OK):** Manager JWT with `switched_from: "ADMINISTRATOR"`.

