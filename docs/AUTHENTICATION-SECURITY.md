# CITIMART Daily Operations — Authentication & Security Architecture (AUTHENTICATION-SECURITY)

Follow [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md) for every security review and every new feature.

---

## 1. Authentication Architecture

### 1.1 Credential Verification & Password Hashing
- Passwords stored in MongoDB `users` collection as PBKDF2-HMAC-SHA256 hashes (`src/user_store.py`).
- Security parameters: **600,000 iterations**, 16-byte cryptographically secure random salt (`os.urandom(16)`).
- Verification uses `hmac.compare_digest()` for timing-attack immunity.
- Password policy enforced via `src/password_policy.py`: Minimum 12 characters, requiring uppercase, lowercase, numbers, and special symbols.

### 1.2 Token Architecture (JWT)
- Algorithm: HS256 with explicit server validation.
- Token lifetime: Default 12 hours (`JWT_TTL_SECONDS=43200`).
- Token claims:
  - `sub`: Unique user subject (`user-<id>`).
  - `username`: Operator username.
  - `role`: Role (`admin` or `manager`).
  - `store_code`: Scoped store code (`NM`, `HB`, `CHW`, or `None` for admin).
  - `switched_from`: Set when an administrator uses "View as Store Manager".
- Tokens are transmitted via `Authorization: Bearer <token>` header, completely eliminating cookie CSRF vulnerabilities.

---

## 2. Authorization & RBAC Enforcement

- **Route Gating:** Gated by FastAPI dependency injection `Depends(get_current_user)`.
- **Administrative Privileges:** Admin routes require `Depends(require_admin)` returning 403 Forbidden for managers.
- **Store-Level Isolation (IDOR Protection):** Handlers invoke `require_store_access(store, user)` preventing managers from accessing peers' data.

---

## 3. Defense-in-Depth Protections

1. **HTTP Security Headers:** `SecurityHeadersMiddleware` sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.
2. **Rate Limiting:** In-memory sliding window limiter (`src/rate_limiter.py`) caps `/api/auth/login` at 25 req/min and `/api/daily/chat` at 40 req/min.
3. **Upload Constraints:** Excel target upload capped at 10 MB and restricted strictly to `.xlsx` / `.xls` files.
4. **Secret Boot Gate:** `assert_production_secrets()` prevents boot if the default dev secret is detected while `MONGODB_URI` is configured.
