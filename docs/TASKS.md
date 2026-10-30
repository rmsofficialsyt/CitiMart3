# CITIMART Daily Operations — Task Tracking, Milestones & Backlog (TASKS)

> **Tracking:** Active roadmap, completed deliverables, and architectural tasks for the CITIMART Daily Operations retail platform.

---

## 1. Milestones Overview

| Milestone | Scope | Status | Completion Date |
|---|---|---|---|
| **Phase 1** | Core Data Engine & MongoDB Persistent Store | `COMPLETED` | September 2026 |
| **Phase 2** | Role-Based Access Control, Directives & Requisitions | `COMPLETED` | September 2026 |
| **Phase 3** | Automated Report Renderers (PDF / XLSX) & At-A-Glance KPIs | `COMPLETED` | October 2026 |
| **Phase 4** | Multilingual AI Copilot & Real-Time Domain Analytics Engine | `COMPLETED` | October 2026 |
| **Phase 5** | Production-Grade Security Hardening & Rate Limiting | `COMPLETED` | October 2026 |
| **Phase 6** | Enterprise Resiliency & Distributed Operations (Backlog) | `PLANNED` | Q4 2026 / Q1 2027 |

---

## 2. Completed Deliverables

### Phase 5: Production-Grade Security Hardening (October 2026)
- [x] **Rate Limiting Engine (`API-02`, `AUTH-01`, `AI-03`):**
  - Implemented thread-safe in-memory sliding window rate limiter in [`backend/src/rate_limiter.py`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/src/rate_limiter.py).
  - Protected `POST /api/auth/login` (capped at 25 req/min per IP) to mitigate brute-force credential attacks.
  - Protected `POST /api/daily/chat` (capped at 40 req/min per user/IP) to prevent API cost and computation exhaustion.
- [x] **Payload & File Upload Protection (`API-03`, `INP-06`):**
  - Enforced 10 MB maximum file size cap (`MAX_EXCEL_UPLOAD_BYTES = 10 * 1024 * 1024`) on `POST /api/targets/upload`.
  - Added strict filename extension check (allowing only `.xlsx` and `.xls`).
- [x] **HTTP Security Headers (`WEB-02`, `WEB-04`):**
  - Created and integrated `SecurityHeadersMiddleware` in [`backend/app.py`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/app.py).
  - Configured `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and HSTS.
  - Added mirror security headers in [`frontend/vercel.json`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/frontend/vercel.json) for static asset distribution.
- [x] **Production Information Disclosure Mitigation (`WEB-03`):**
  - Added environment-aware Swagger/ReDoc toggle (`ENABLE_DOCS`) in `backend/config/env.py` and `backend/app.py` to disable docs in production mode.
  - Created [`frontend/public/.well-known/security.txt`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/frontend/public/.well-known/security.txt).
- [x] **Automated Security Test Suite:**
  - Authored [`backend/tests/test_security_spec.py`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/tests/test_security_spec.py) with 100% pass rate.
  - Verified full test suite passes with zero regressions (162/162 passing).

### Phase 4: Multilingual AI Operations Copilot (October 2026)
- [x] **Gemini API & Domain Analytics Fallback:**
  - Integrated Gemini models for intelligent store operations queries.
  - Engineered zero-network local domain analytics fallback engine for offline or rate-limited scenarios.
- [x] **Multilingual Presets:**
  - Added quick-prompt support for English, Bengali, and Hindi.
- [x] **Benchmark Engine & At-A-Glance Layout:**
  - Implemented real-time achievement vs target benchmark computations.
  - Restructured responsive dashboard cards for cash desk displays (1366 × 768).

---

## 3. Active / In-Progress Tasks

- [x] **Documentation System Expansion:**
  - [x] Create [`docs/CODE-REVIEW.md`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CODE-REVIEW.md) specifying review gates, security checklists, and sign-off templates.
  - [x] Create [`docs/TESTING.md`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/TESTING.md) detailing test execution commands, fixture architecture, and QA protocols.
  - [x] Create [`docs/TASKS.md`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/TASKS.md) outlining project milestones, completed items, and future roadmap.
- [ ] **Git Synchronization:**
  - Stage and commit new documentation deliverables to the repository.

---

## 4. Future Roadmap & Backlog (Phase 6)

### 4.1 Distributed Rate Limiting & High Availability
- **Task ID:** `DO-TASK-601`
- **Priority:** Medium
- **Description:** Replace or augment the in-memory sliding window rate limiter with an optional Redis / Valkey adapter (`REDIS_URL`) when scaling Render backend services horizontally across multiple worker nodes.
- **Spec Reference:** `API-02`

### 4.2 Security Audit Logging Collection
- **Task ID:** `DO-TASK-602`
- **Priority:** High
- **Description:** Implement an immutable `audit_logs` collection in MongoDB to log all sensitive administrative actions (e.g., target spreadsheet uploads, user password resets, status threshold overrides) capturing timestamp, actor user ID, client IP, and affected entity.
- **Spec Reference:** `LOG-01`, `LOG-02`

### 4.3 Floor Terminal Offline Cache & Synchronization
- **Task ID:** `DO-TASK-603`
- **Priority:** Medium
- **Description:** Introduce IndexedDB caching and ServiceWorker background sync in the React frontend so floor cashiers can log customer bills and footfalls even during intermittent store internet outages.
- **Spec Reference:** Resiliency & Fault Tolerance

### 4.4 Automated Midnight Export Webhooks
- **Task ID:** `DO-TASK-604`
- **Priority:** Low
- **Description:** Extend `src/daily_midnight_job.py` to automatically dispatch daily PDF store reports to executive leadership via SMTP or Slack/Teams webhooks upon date rollover.
- **Spec Reference:** Automated Operations

---

## 5. Task Workflow Protocol

1. **Pick a Task:** Select an open item from Section 4 or define a new item aligned with [PRD.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/PRD.md).
2. **Review Security Spec:** Check applicable requirements in [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md).
3. **Execute & Test:** Build feature and ensure full test coverage in `backend/tests/`.
4. **Follow Review Checklist:** Run through the quality gates in [`docs/CODE-REVIEW.md`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CODE-REVIEW.md).
5. **Update Task Status:** Mark task completed in this file upon merge.
