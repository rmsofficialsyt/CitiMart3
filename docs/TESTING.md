# CITIMART Daily Operations — Testing Strategy & QA Guide (TESTING)

> **Mandate:** Always run `pytest` before and after any code modifications or feature additions to ensure **zero regressions**.

---

## 1. Testing Philosophy & Architecture

The testing suite for CITIMART Daily Operations is designed around three foundational principles:
1. **Zero External Infrastructure Dependency:** All persistence tests execute against `mongomock` (an in-memory, thread-safe MongoDB mock). No live MongoDB Atlas connection or network is required for CI/CD or local test runs.
2. **Sub-Minute Feedback Loop:** Password hashing in tests uses optimized iteration counts (`user_store._ITERATIONS = 1000` rather than the production 600,000) to allow the entire 160+ test suite to finish in seconds.
3. **Comprehensive Defense-in-Depth Testing:** Tests validate authentication gates, role-based access controls (RBAC), multi-tenant store isolation (IDOR), file upload constraints, HTTP security headers, and rate limiting.

---

## 2. Test Suite Layout

Tests reside in [`Daily Operations/backend/tests/`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/tests):

```text
backend/tests/
├── conftest.py                   # Central fixture definitions, mock DB, and auth tokens
├── test_auth.py                  # Token issuance, validation, expiration, and login route
├── test_charts_gauge.py          # SVG/Canvas gauge calculations and band colors
├── test_chat_routes.py           # AI Copilot endpoint, rate limits, and fallback analytics
├── test_daily_authz.py           # Multi-store isolation and IDOR route protections
├── test_daily_context.py         # Weather, holidays, and mid-week/weekend indicators
├── test_daily_dashboard_store.py # Bill, footfall, NOB aggregation logic & MongoDB queries
├── test_daily_midnight_job.py    # Midnight snapshot finalizer and rollover jobs
├── test_daily_report.py          # Daily PDF and Excel dispatch report generators
├── test_db_session.py            # MongoDB connection manager and failover handling
├── test_directives.py            # Operational head directives, broadcast alerts & ACK
├── test_formatting.py            # Currency, percentages, and timestamp display formatters
├── test_history_routes.py        # Historical date queries and day-level aggregates
├── test_kpi_thresholds.py        # Target status bands (Red/Yellow/Green) and overrides
├── test_password_policy.py       # Password strength rules and complexity validation
├── test_requisitions.py          # Inter-store requisition workflows and status tracking
├── test_requisitions_hierarchy.py# Division -> Section -> Department categorization
├── test_security_spec.py         # Production security spec: headers, rate limits, upload caps
├── test_targets.py               # Target Excel parser, upload limits, and matrix storage
├── test_theme.py                 # UI theme configurations and color tokens
└── test_user_store.py            # PBKDF2 hashing, salt generation, and user CRUD
```

---

## 3. Executing Tests

### 3.1 Standard Test Execution
From the `Daily Operations` workspace root using the project virtual environment:

```powershell
# Run the complete test suite
& "../.venv/Scripts/python.exe" -m pytest

# Run with verbose reporting and timing
& "../.venv/Scripts/python.exe" -m pytest -v --durations=10

# Run a specific test file
& "../.venv/Scripts/python.exe" -m pytest backend/tests/test_security_spec.py -v

# Run a targeted test case by name
& "../.venv/Scripts/python.exe" -m pytest -k "test_security_headers_present"
```

### 3.2 Sandbox / Windows Execution Note
FastAPI's `TestClient` uses `anyio`'s `BlockingPortal` internally to coordinate synchronous test calls with async Starlette middleware. On Windows, `anyio` communicates across threads via local IPC loopback sockets. If running inside restricted environments that block loopback sockets, `BypassSandbox: true` must be enabled for commands running `TestClient`.

---

## 4. Fixture Ecosystem ([`conftest.py`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/backend/tests/conftest.py))

| Fixture | Scope | Description |
|---|---|---|
| `db_session` | Function | Fresh in-memory `mongomock.MongoClient` database (`citimart`), indexed via `ensure_indexes()` and seeded with the four standard demo accounts. |
| `client` | Function | `fastapi.testclient.TestClient` configured with `app.dependency_overrides[get_db] = lambda: db_session`. Lifespan is bypassed so real cluster background tasks do not run. |
| `admin_headers` | Function | HTTP headers containing `Authorization: Bearer <token>` for `ADMINISTRATOR` (role: `admin`, store: `None`). |
| `nw_headers` | Function | HTTP headers containing `Authorization: Bearer <token>` for `CITIMART - NEW MARKET` (role: `manager`, store: `NM`). |
| `hb_headers` | Function | HTTP headers containing `Authorization: Bearer <token>` for `CITIMART - HATIBAGAN` (role: `manager`, store: `HB`). |

---

## 5. Security & Regression Quality Checklist

When authoring or verifying new features, add tests covering:

1. **Authentication Gate:** Verify unauthenticated requests to the new endpoint return `401 Unauthorized`.
2. **Authorization Boundary:** If the route is admin-only, verify manager tokens receive `403 Forbidden`.
3. **IDOR Store Isolation:** If the route accepts a `store` query or body parameter, verify managers cannot query or mutate data belonging to other stores.
4. **Input Size & Type Boundaries:** For uploads or large payloads, test that exceeding size limits triggers `413 Payload Too Large` and invalid file formats return `400 Bad Request`.
5. **Rate Limiting:** Verify that exceeding the sliding window threshold triggers `429 Too Many Requests` with a valid `Retry-After` header.
6. **Security Headers:** Verify responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin`.

---

## 6. Continuous Verification Protocol

Before opening a pull request or pushing to the main branch:
```powershell
# 1. Verify clean git working tree
git status

# 2. Run full test suite with zero failures
& "../.venv/Scripts/python.exe" -m pytest

# 3. Verify no credentials or .env files are staged
git diff --staged --name-only
```
