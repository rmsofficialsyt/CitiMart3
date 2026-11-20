# CITIMART Daily Operations — Error Handling & Triage Tracker (ERROR-HANDLING-TRACKER)

![Error Tracker](https://img.shields.io/badge/CITIMART-Error%20Tracker-00D26A?style=for-the-badge&logo=bugatti&logoColor=white)
![Standard](https://img.shields.io/badge/Standard-RFC%207807-blue?style=for-the-badge)
![Reliability](https://img.shields.io/badge/Reliability-Production%20Hardened-success?style=for-the-badge)

> **Exhaustive Error Code Catalog, Triage Procedures, and Correlation Tracing**  
> Formulates deterministic HTTP responses, client-facing messaging, and automated incident triage workflows.

---

## 📑 Table of Contents
1. [Deterministic HTTP Error Response Matrix](#1-deterministic-http-error-response-matrix)
2. [Standardized Error Schema (RFC 7807)](#2-standardized-error-schema-rfc-7807)
3. [Correlation ID Tracing & Logging](#3-correlation-id-tracing--logging)
4. [Rate Limiting & 429 Triage](#4-rate-limiting--429-triage)
5. [Automated Pytest Regression Suite](#5-automated-pytest-regression-suite)

---

## 1. Deterministic HTTP Error Response Matrix

| HTTP Status | Trigger Condition | Code Origin | Client Message | Resolution Action |
|:---|:---|:---|:---|:---|
| **`400 Bad Request`** | Malformed date (not `YYYY-MM-DD`), negative sales values, invalid store ID | `api/routes_daily.py`, `api/routes_targets.py` | `"date must be YYYY-MM-DD."` or `"Sales values must be non-negative."` | Correct input format and resubmit. |
| **`401 Unauthorized`** | Missing, malformed, or expired JWT bearer token | `api/auth.py::_decode` | `"Invalid or expired session. Please log in again."` | Client automatically calls `/api/auth/refresh` or redirects to login. |
| **`403 Forbidden`** | Cross-store tenant access attempt (IDOR/BOLA) or non-admin target mutation | `api/auth.py`, `api/deps.py` | `"You do not have access to store 'HB'."` | Verify account credentials and designated store scope. |
| **`404 Not Found`** | Requested entry ID, store code, or target date does not exist | `api/routes_daily.py` | `"Operational record not found."` | Refresh table to confirm latest MongoDB state. |
| **`413 Payload Too Large`**| Uploading target Excel file exceeding 10 MB | `api/routes_targets.py` | `"Uploaded file exceeds maximum allowed size of 10 MB."` | Compress or trim unnecessary worksheets from workbook. |
| **`429 Too Many Requests`**| Exceeded sliding-window rate limit on login or AI copilot | `src/rate_limiter.py` | `"Too many requests. Please wait 45s before retrying."` | Respect `Retry-After` header before submitting new requests. |
| **`500 Internal Error`** | Unhandled server exception | Global exception handler | `"An internal operational error occurred. Incident logged."` | Inspect `logs/error.log` with `X-Correlation-ID`. |
| **`503 Service Unavailable`**| Redis cluster unreachable while validating active session | `api/auth.py` | `"Session validation service temporarily unreachable."` | Check Redis cluster connectivity and container status. |

---

## 2. Standardized Error Schema (RFC 7807)

All non-2xx responses emit a standardized JSON error payload:

```json
{
  "type": "https://citimart.local/errors/forbidden",
  "title": "Forbidden Store Access",
  "status": 403,
  "detail": "Access denied: Account 'new_market' cannot access Hatibagan ('HB') telemetry.",
  "instance": "/api/daily/stores/HB/summary",
  "correlation_id": "c7a8b9f1-3d2e-4b5a-9f8e-123456789abc",
  "timestamp": "2026-11-20T14:30:00Z"
}
```

---

## 3. Correlation ID Tracing & Logging

* **Header Injection:** Middleware generates or extracts an `X-Correlation-ID` header.
* **Trace Propagation:** The correlation ID is logged alongside database queries, Redis cache lookups, and error stack traces.
* **Log Location:** All error traces are stored in [`logs/error.log`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/logs/README.md).

---

## 4. Rate Limiting & 429 Triage

When a client hits a rate limit:
1. The server returns HTTP `429 Too Many Requests`.
2. The response includes a `Retry-After: <seconds>` header.
3. The frontend displays an amber countdown toast and disables the submit button until the window resets.

---

## 5. Automated Pytest Regression Suite

Execute the regression suite to verify all error handling and status code assertions:

```powershell
# From Daily Operations/backend:
pytest tests/test_security_spec.py -v       # Validates 401, 403, 429 responses
pytest tests/test_daily_authz.py -v         # Validates multi-tenant IDOR guards
pytest tests/test_redis_rate_limiter.py -v  # Validates sliding-window throttling
```
