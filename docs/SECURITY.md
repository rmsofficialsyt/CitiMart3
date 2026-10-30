# CITIMART Daily Operations — Comprehensive Security Policy & Threat Defense (SECURITY)

> **Authority:** This document defines the security architecture, threat model, and defense-in-depth policies for CITIMART Daily Operations, adhering to [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md).

---

## 1. Threat Model & Retail Operational Context

CITIMART Daily Operations is deployed in a hybrid retail environment consisting of floor cashier terminals, store manager workstations (New Market, Hatibagan, Chowringhee), and executive dashboards. The threat landscape addresses:

1. **Terminal Sharing & Physical Proximity:** Cash desk terminals are accessible to floor staff. Unattended sessions must expire deterministically and deny privilege escalation.
2. **Cross-Store Data Leakage (IDOR):** Store managers must never view, compare, or manipulate another store's confidential performance metrics or targets.
3. **Credential Guessing & Brute Force:** Public login endpoints must mitigate automated brute-force attacks from external scanners.
4. **AI & Resource Exhaustion (DoS):** Gemini LLM operations copilot and reporting engines must be protected from computational and financial exhaustion.
5. **Malicious File Ingestion:** Target spreadsheet uploads must prevent zip-bombs, memory exhaustion, and arbitrary script injection.

---

## 2. Layered Defense-in-Depth Architecture

```
[ Internet / External Traffic ]
             |
             v
+-------------------------------------------------------------------------+
| Layer 1: Edge & Network Security (Vercel CDN + Cloudflare)              |
| - TLS 1.3 Strict HTTPS Enforcement                                     |
| - Edge Header Injection (HSTS, Content-Type-Options, Frame-Options)     |
| - Frontend Static File Isolation & Cache Segregation                   |
+-------------------------------------------------------------------------+
             |
             v
+-------------------------------------------------------------------------+
| Layer 2: HTTP Transport & Middleware (Render Backend)                   |
| - SecurityHeadersMiddleware: nosniff, DENY, strict-origin-when-cross    |
| - In-Memory Sliding Window Rate Limiter (src/rate_limiter.py)           |
| - GZip Compression Guard (minimum_size=500B)                            |
| - Environment-aware Swagger/ReDoc toggle (suppressed in production)    |
+-------------------------------------------------------------------------+
             |
             v
+-------------------------------------------------------------------------+
| Layer 3: Identity, Auth & RBAC (api/auth.py)                            |
| - Cryptographically Signed JWTs (HS256, pinned secret, 12h expiry)      |
| - Role Isolation (Admin vs Store Manager)                               |
| - IDOR Guard: require_store_access(store, user) on all tenant routes    |
+-------------------------------------------------------------------------+
             |
             v
+-------------------------------------------------------------------------+
| Layer 4: Application & Input Safety (Pydantic & Upload Boundaries)      |
| - Strict Type Boundaries & Schema Sanitization                          |
| - Excel Upload Ceiling: 10 MB limit & .xlsx/.xls extension validation   |
| - AI Copilot Safe Fallback Engine (Zero-network domain calculations)    |
+-------------------------------------------------------------------------+
             |
             v
+-------------------------------------------------------------------------+
| Layer 5: Persistence & Secrets (MongoDB Atlas + Environment Vars)       |
| - PBKDF2-HMAC-SHA256 (600,000 iterations, 16-byte random salt)          |
| - TLS Cluster Encryption (tls=true, Atlas IP Whitelisting)              |
| - Zero Credential Commits (.gitignore enforcement, assert_production)  |
+-------------------------------------------------------------------------+
```

---

## 3. Defense Mechanisms & Implementations

### 3.1 HTTP Security Headers (`WEB-02`, `WEB-04`)
Implemented centrally in `backend/app.py` via `SecurityHeadersMiddleware` and mirrored on the Vercel edge in `frontend/vercel.json`:
- `X-Content-Type-Options: nosniff`: Prevents MIME-type sniffing by browsers.
- `X-Frame-Options: DENY`: Prevents UI redressing and clickjacking across all frames.
- `Referrer-Policy: strict-origin-when-cross-origin`: Restricts referrer data leakage across origin boundaries.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`: Disables browser hardware access.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`: Enforces HTTPS transport.

### 3.2 Rate Limiting & DoS Protection (`API-02`, `AI-03`)
Implemented via [`backend/src/rate_limiter.py`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/src/rate_limiter.py):
- **`login_limiter`:** Capped at **25 requests per 60 seconds** per client IP. Protects against dictionary and brute-force attacks.
- **`chat_limiter`:** Capped at **40 requests per 60 seconds** per user/IP key. Guards Gemini API budget and GPU/CPU inference costs.
- **Header Protocol:** Exceeded quotas return HTTP `429 Too Many Requests` with an explicit `Retry-After: <seconds>` header.

### 3.3 File Upload Security (`API-03`, `INP-06`)
Enforced in `backend/api/routes_targets.py`:
- **Payload Size Cap:** Max 10 MB (`MAX_EXCEL_UPLOAD_BYTES = 10 * 1024 * 1024`). Requests exceeding 10 MB immediately abort with `413 Payload Too Large` before parsing.
- **Extension Whitelist:** Files must end with `.xlsx` or `.xls`; executable files (`.exe`, `.sh`, `.bat`) and scripts are rejected with `400 Bad Request`.
- **Safe Parsing:** Workbooks load in `read_only=True` and `data_only=True` mode, neutralizing embedded macro execution and formula-based exploits.

### 3.4 Production Secret Gates (`SEC-01`, `ENV-01`)
- **Startup Secret Validation:** On boot, `assert_production_secrets()` checks if `MONGODB_URI` is configured. If an active database is detected alongside the default insecure secret (`INSECURE_JWT_SECRET_DEFAULT`), the process halts with `RuntimeError`.
- **Git Ignore Safeguard:** `.gitignore` excludes `.env`, `LOGIN_CREDENTIALS*.txt`, `CREDENTIALS*.txt`, and all certificates/keys.

---

## 4. Vulnerability Disclosure Policy

In compliance with RFC 9116, security disclosure details are published at:
`https://<domain>/.well-known/security.txt`

```text
Contact: mailto:security@citimart.local
Expires: 2027-10-30T00:00:00.000Z
Preferred-Languages: en, bn, hi
Canonical: https://citimart.local/.well-known/security.txt
Policy: Follow Production-grade-Security-checks-spec-check.md
```

### 4.1 Reporting a Vulnerability
- Send vulnerability details to `security@citimart.local` with reproduction steps, affected endpoints, and impact assessment.
- Do not publicly disclose vulnerabilities before a patch is released and deployed.
- Target response time: 24 hours for triage; 72 hours for critical remediation.

---

## 5. Security Incident Response Protocol

```
+----------------+      +-------------------+      +-------------------+      +----------------+
|  1. IDENTIFY   | ---> |   2. CONTAIN      | ---> |   3. REMEDIATE    | ---> | 4. POST-MORTEM |
| Log anomaly or |      | Revoke JWT Secret |      | Patch code / test |      | Write root-    |
| report triage  |      | or block IP       |      | deploy via CI/CD  |      | cause summary  |
+----------------+      +-------------------+      +-------------------+      +----------------+
```

1. **Immediate Containment:**
   - To invalidate all active sessions instantly, update `JWT_SECRET` in Render environment settings and trigger redeployment.
   - To block malicious IPs, configure firewall rules on Vercel/Cloudflare.
2. **Investigation & Triage:**
   - Review Render logs and MongoDB query histories for unauthorized store access attempts.
3. **Remediation & Testing:**
   - Apply fixes and run the security test suite (`backend/tests/test_security_spec.py`).
