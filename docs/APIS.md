# CITIMART Daily Operations — REST API Reference (APIS)

**Base URL:** `https://citimart3-kolx.onrender.com/api` (Production) / `http://127.0.0.1:8000/api` (Local)  
**Authentication:** HTTP Bearer Header (`Authorization: Bearer <JWT>`)  
**Standard Error Format:** `{"detail": "Error description"}`

---

## 1. Authentication Endpoints

### 1.1 `POST /api/auth/login`
Public login endpoint validating username and password against MongoDB `users`.
- **Rate Limit:** 25 requests / minute per IP.
- **Request Body:** `{"username": "ADMINISTRATOR", "password": "..."}`
- **Response:**
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "expires_in": 43200,
    "user": {
      "username": "ADMINISTRATOR",
      "role": "admin",
      "store_code": null
    }
  }
  ```

### 1.2 `POST /api/auth/switch-account`
Admin-only account switching for "View as Store Manager" functionality.
- **Header:** `Authorization: Bearer <admin-jwt>`
- **Request Body:** `{"username": "CITIMART - NEW MARKET"}`
- **Response:** New JWT bearing `switched_from: "ADMINISTRATOR"`.

---

## 2. Daily KPI & Manual Entry Endpoints

### 2.1 `GET /api/daily/live`
Retrieve live KPIs for a store on a specific date.
- **Query Params:** `store=NM&date=2026-10-30`
- **Security:** Requires valid JWT. Managers can only request their assigned store (403 on mismatch).

### 2.2 `POST /api/daily/entry`
Log or update a timestamped manual entry (bill, footfall, or buyer count).
- **Request Body:**
  ```json
  {
    "store": "NM",
    "date": "2026-10-30",
    "time": "14:30",
    "net_amount": 18500.0,
    "bill_quantity": 12,
    "footfall": 45,
    "nob": 11,
    "remarks": "Mid-day rush"
  }
  ```

### 2.3 `DELETE /api/daily/entry`
Deletes a specific log record by ID.

---

## 3. Product Requisitions & Directives

### 3.1 `GET /api/requisitions` / `POST /api/requisitions`
Query and submit inventory requisition orders across departments.

### 3.2 `POST /api/directives`
Admin-only endpoint to broadcast executive directives to stores.

---

## 4. AI Operations Copilot

### 4.1 `POST /api/daily/chat`
Conversational AI advisor endpoint.
- **Rate Limit:** 40 requests / minute per user/IP.
- **Request Body:**
  ```json
  {
    "message": "What is our current target gap?",
    "store_code": "NM",
    "date_str": "2026-10-30",
    "language": "en"
  }
  ```
- **Response:**
  ```json
  {
    "reply": "For CITIMART - NEW MARKET on 30.10.2026, live net sales stand at ₹245,000 against target ₹300,000...",
    "engine": "gemini-2.5-flash",
    "store": "NM",
    "date": "2026-10-30"
  }
  ```
