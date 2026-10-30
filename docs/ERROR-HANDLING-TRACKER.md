# CITIMART Daily Operations — Error Handling & Triage Tracker (ERROR-HANDLING-TRACKER)

---

## 1. Error Handling Matrix

| HTTP Status | Trigger Condition | Code Location | Client-Facing Detail |
|---|---|---|---|
| **400 Bad Request** | Invalid date format (not YYYY-MM-DD), invalid store code, or corrupted Excel upload | `api/routes_daily.py`, `api/routes_targets.py` | `"date must be YYYY-MM-DD."`, `"Only Excel spreadsheet files (.xlsx, .xls) are accepted."` |
| **401 Unauthorized** | Missing, malformed, or expired JWT bearer token | `api/auth.py::_decode` | `"Invalid or expired session."`, `"Not authenticated."` |
| **403 Forbidden** | Manager attempting to access peer store's data, or manager attempting admin action | `api/auth.py`, `api/deps.py` | `"You do not have access to store 'HB'."`, `"Administrator access required."` |
| **404 Not Found** | Record ID or target date not found | `api/routes_daily.py` | `"Record not found."` |
| **413 Payload Too Large** | Uploading Excel file exceeding 10 MB | `api/routes_targets.py` | `"Uploaded file exceeds maximum allowed size of 10 MB."` |
| **429 Too Many Requests** | Rate limit threshold exceeded on login or AI chat | `src/rate_limiter.py` | `"Too many requests for login. Please wait 45s before retrying."` with `Retry-After` header |
| **500 Server Error** | Unexpected unhandled exception | Handled gracefully | Generic message returned; detailed stack trace logged to server console only |

---

## 2. Regression Testing Suite
- Command: `pytest` (executed from `Daily Operations/backend/`).
- Coverage: 162 automated tests covering auth, IDOR, chat, midnight job, targets, and security headers.
