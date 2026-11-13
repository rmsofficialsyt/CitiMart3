# CITIMART Daily Operations — Authentication & Security Architecture (AUTHENTICATION-SECURITY)

Follow [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md) for every security review and every new feature.

---

## 1. Authentication Architecture

### 1.1 Credential Verification & Password Hashing (AUTH-01, AUTH-02)
- New hashes are **Argon2id** (`m=19 MiB, t=2, p=1`); legacy PBKDF2-HMAC-SHA256 (600k
  iterations) hashes still verify and are re-hashed to Argon2id on the next successful login.
- Unknown usernames run a dummy verify, so they're indistinguishable from a wrong password
  by response body and (roughly) timing.
- Concurrent hashing is capped per process (`PASSWORD_HASH_CONCURRENCY`) to bound memory.
- Password policy enforced via `src/password_policy.py`: Minimum 12 characters, requiring uppercase, lowercase, numbers, and special symbols.
- `set_password` revokes every session of the account (AUTH-03).

### 1.2 Sessions & Tokens (AUTH-05, AUTH-06)
- Access token: HS256 JWT, **15 min**, fixed algorithm, `exp`/`sub` required, `iss`/`aud`
  checked, bound to a server-side session by `sid`.
- Refresh token: opaque, rotated on every use, stored hashed, delivered as an
  `HttpOnly; Secure; SameSite=Lax` cookie scoped to `/api/auth`. Re-use of a rotated token
  revokes the session (theft detection).
- Absolute expiry 12 h, idle expiry 2 h. Logout, logout-all and per-session revocation take
  effect on the next request. Users can list and revoke their own sessions.
- The SPA keeps the access token in memory only (no `localStorage`).
- API calls carry the access token in the `Authorization` header (no cookie → no CSRF on
  the API). The only cookie is the refresh token, which `SameSite=Lax` keeps off
  cross-site POSTs.
- Session checks fail **closed**: if Redis is configured but unreachable, authenticated
  requests return 503 (INP-10). Details in [AUTH.md](AUTH.md) §3.

---

## 2. Authorization & RBAC Enforcement

- **Route Gating:** Gated by FastAPI dependency injection `Depends(get_current_user)`.
- **Administrative Privileges:** Admin routes require `Depends(require_admin)` returning 403 Forbidden for managers.
- **Store-Level Isolation (IDOR Protection):** Handlers invoke `require_store_access(store, user)` preventing managers from accessing peers' data.

---

## 3. Defense-in-Depth Protections

1. **HTTP Security Headers:** `SecurityHeadersMiddleware` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
2. **Rate Limiting (API-02):** sliding-window limiter (`src/rate_limiter.py`), an atomic
   Redis Lua script shared by every worker/replica (in-process fallback without Redis or if
   Redis errors, so it never fails open). Login: all attempts per IP (2000/min) + **failed**
   attempts per (IP, username) (25/min). Chat: 40/min per user+IP. `X-Forwarded-For` is
   only trusted from `TRUSTED_PROXY_IPS` and walked right-to-left, so clients can't spoof
   a fresh bucket. Nginx adds a coarse C-level edge limit in front (docker-compose stack).
3. **Upload Constraints:** Excel target upload capped at 10 MB and restricted strictly to `.xlsx` / `.xls` files.
4. **Secret Boot Gate:** `assert_production_secrets()` prevents boot if the default dev secret is detected while `MONGODB_URI` is configured.
5. **Audit Logging (LOG-01/02):** `src/audit.py` records login success/failure, logout,
   logout-all, session revocation, refresh rejection, account switches and target uploads
   (UTC timestamp, username, IP, action, target, result; never passwords or tokens) to
   MongoDB `audit_logs`, via the BullMQ `audit-events` queue when enabled, plus a
   structured log line for off-host shipping.
6. **Containers (INFRA-06):** `backend/Dockerfile` uses a pinned slim base, a non-root
   user and a healthcheck; `.dockerignore` keeps `.env` / `CREDENTIALS.txt` out of layers.
