# CITIMART Daily Operations — Code Review Guidelines & Quality Gates (CODE-REVIEW)

> **Mandate:** All code modifications, API additions, and feature expansions must adhere to [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md) and pass all quality gates prior to staging or merging.

---

## 1. Review Philosophy & Golden Rules

1. **Evidence or it didn't happen:** Every code review approval and security check verification requires tangible proof (test results, diff verification, or log trace).
2. **Never claim "secure" or "100% compliant":** Assess risk objectively and verify defense-in-depth mitigations.
3. **Zero Regression Tolerance:** Run the automated test suite (`pytest`) before and after changes. All 160+ unit, integration, and security tests must pass.
4. **Small, Atomic Pull Requests:** Keep patches scoped to single concerns or closely linked sub-tasks.
5. **No Secret Ingestion:** Never commit API keys, database credentials, salts, or session tokens.

---

## 2. Security Review Checklist (Production Spec Alignment)

Every reviewer must systematically review code changes against these mandatory security gates:

### 2.1 Authentication & Authorization (AUTH & IDOR)
- [ ] **Bearer Token Enforcement:** All `/api/*` endpoints (except `/api/health`, `/api/auth/login`, and `/`) must be gated by `Depends(get_current_user)`.
- [ ] **Role-Based Access Control (RBAC):** Administrative routes (e.g., target upload, user management, status overrides) strictly require `Depends(require_admin)`.
- [ ] **Horizontal Privilege Escalation (IDOR Prevention):** Store-scoped endpoints must invoke `require_store_access(store_code, current_user)` to prevent cross-store visibility.
- [ ] **Stateless Verification:** JWT tokens are verified server-side on each request (`HS256`, algorithm strictly pinned, expiration enforced).

### 2.2 Input Safety & Upload Validation (INP & API)
- [ ] **Strict Pydantic Validation:** All request payloads must be defined with explicit Pydantic schemas with type bounds and field constraints.
- [ ] **File Upload Size Guard (INP-06):** Upload handlers must cap incoming data streams at `10 MB` (`MAX_EXCEL_UPLOAD_BYTES = 10 * 1024 * 1024`) and return `413 Payload Too Large` when exceeded.
- [ ] **Extension & MIME Whitelisting:** File uploads are restricted to `.xlsx` and `.xls` spreadsheets.
- [ ] **Injection Prevention:** No unsanitized string interpolations in database queries or system calls.

### 2.3 Rate Limiting & Denial of Service (API-02, AI-03)
- [ ] **Login Limiting:** `POST /api/auth/login` is governed by `login_limiter` (sliding window of 25 requests/min per client IP).
- [ ] **AI Endpoint Limiting:** `POST /api/daily/chat` is protected by `chat_limiter` (sliding window of 40 requests/min per user/IP combination).
- [ ] **Resource Limits:** Streaming responses and open connections must properly close within context managers.

### 2.4 Secrets & Environmental Hardening (SEC-01, WEB-02)
- [ ] **No Hardcoded Secrets:** `MONGODB_URI`, `JWT_SECRET`, and `GEMINI_API_KEY` are read exclusively from environment variables or `.env`.
- [ ] **Production Boot Gate:** `assert_production_secrets()` is invoked on application startup to halt execution if default dev secrets are used with an active database URI.
- [ ] **Modern Security Headers:** All responses send:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security` (when HTTPS)
- [ ] **Documentation Toggle:** Interactive OpenAPI docs (`/docs`, `/redoc`) are automatically suppressed in production environments unless explicitly overridden by `ENABLE_DOCS=true`.

---

## 3. Backend Code Standards (FastAPI & Python 3.14)

### 3.1 Module Structure & Imports
- Use `from __future__ import annotations` across all Python source and test modules.
- Maintain clean dependency separation:
  - `api/`: Route declarations, schema parsing, and authorization dependencies only.
  - `src/`: Core business logic, domain algorithms, report builders, and aggregations.
  - `db/`: Pymongo models, connection session management, and index definitions.
  - `config/`: Configuration settings and environmental validation.

### 3.2 Error Handling & Logging
- Raise explicit `HTTPException` with informative, sanitized error descriptions.
- Log operational errors with context using `logger.warning()` or `logger.exception()`.
- Never expose internal database stack traces or raw credentials in API error responses.

### 3.3 Database Operations
- All queries must leverage indexed fields (`store_code`, `entry_date`, `time_slot`).
- Use atomic update operators (`$set`, `$inc`, `$push`) rather than full document replacements where appropriate.
- Tests must continue using the `mongomock` in-memory engine to guarantee fast, zero-dependency CI runs.

---

## 4. Frontend Code Standards (React 18 & Vite)

### 4.1 Component Architecture & UX
- Components must be clean, modular, and use React functional components with explicit TypeScript / Prop validation.
- Responsive layout must scale gracefully across target display resolutions:
  - Floor cashier/manager terminals: **1366 × 768**
  - Standard store desktops: **1920 × 1080**
  - Executive wallboards: **4K / Ultra-wide**
- Interactive elements must provide accessible focus states, keyboard navigation, and immediate visual feedback.

### 4.2 State Management & Network Layer
- Centralize API calls in dedicated API utility services with centralized error interception.
- On token expiration (`401 Unauthorized`), the frontend must gracefully clear local session state and return to the account picker.
- Use optimistic UI updates with rollback on network failure for snappy operational feedback.

---

## 5. Code Review Sign-Off Template

When reviewing a PR or submitting a review log, copy and fill out the following block:

```markdown
### Code Review Sign-Off
- [ ] **Security Standards Checked:** AUTH, IDOR, SEC, INP, WEB verified against spec.
- [ ] **Test Coverage:** All 160+ existing tests pass, plus new tests added for new behavior.
- [ ] **No Secret Commits:** Verified diff contains no keys, passwords, or Atlas URIs.
- [ ] **Performance & Scaling:** Query indexes verified, payload sizes capped.
- [ ] **Documentation:** APIS.md, ARCHITECTURE.md, and relevant docs updated.
- **Verdict:** [APPROVED / CHANGES REQUESTED]
- **Reviewer:** <Name or Agent ID>
- **Date:** YYYY-MM-DD
```

