# CITIMART Daily Operations — Authentication & Authorization Architecture (AUTH)

> **Core Philosophy:** Stateless JWT token verification for sub-millisecond API authorization, backed by PBKDF2 credential storage in MongoDB Atlas with strict store-level multi-tenant isolation.

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

### 2.1 Hashing Specification
- **Algorithm:** PBKDF2-HMAC-SHA256.
- **Salt:** 16 bytes of cryptographically secure randomness generated via `os.urandom(16)`.
- **Work Factor:** **600,000 iterations** (`_ITERATIONS = 600_000`) in production.
- **Encoded Format:** Standard modular format:
  ```text
  pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>
  ```
- **Constant-Time Verification:** Handled using `hmac.compare_digest()` to completely eliminate timing side-channel attacks during password evaluation.

### 2.2 Password Complexity Policy
Enforced in [`src/password_policy.py`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/src/password_policy.py):
- Minimum length: **12 characters**.
- Character composition: Requires at least 3 character classes (uppercase `[A-Z]`, lowercase `[a-z]`, digits `[0-9]`, and special symbols).
- Passwords failing this policy are rejected with HTTP 400.

---

## 3. Token Lifecycle & JWT Architecture

### 3.1 Token Generation
Upon successful authentication at `POST /api/auth/login`, the server issues a signed JSON Web Token (JWT):
- **Algorithm:** `HS256` (HMAC with SHA-256).
- **Signing Secret:** Pinned strictly to `env.jwt_secret`.
- **Token Expiration (TTL):** Default 12 hours (`JWT_TTL_SECONDS = 43200`), aligned with a full retail store operating shift.

### 3.2 Claims Schema
```json
{
  "sub": "user-1",
  "username": "CITIMART - NEW MARKET",
  "role": "manager",
  "store_code": "NM",
  "switched_from": null,
  "iat": 1730291400,
  "exp": 1730334600
}
```

- `sub`: Canonical user identifier (`user-<id>`).
- `username`: Operator identity.
- `role`: Role string (`admin` or `manager`).
- `store_code`: Assigned store identifier (`NM`, `HB`, `CHW`, or `None` for admin).
- `switched_from`: Non-null only if token was generated via administrative account switching.
- `iat` / `exp`: Issue time and UNIX timestamp expiry.

### 3.3 Zero-Database Verification
When a request arrives at the backend:
1. `api/auth.py::_decode()` verifies the JWT signature and expiration locally.
2. The `CurrentUser` object is constructed directly from token claims.
3. **No database query is performed for authentication**, maintaining high throughput and low database connection pool utilization.

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
4. **Audit Trail:** The frontend UI displays an amber "Viewing as Store Manager" banner with a "Revert to Admin" button.
5. **Revert:** Reverting simply switches back to the administrator's token.

---

## 6. Auth API Reference

### 6.1 User Login
`POST /api/auth/login`
- **Rate Limit:** 25 requests/min per IP.
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
    "expires_in": 43200,
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

