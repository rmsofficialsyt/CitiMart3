# CITIMART Daily Operations — Complete REST API Reference (APIS)

**Base URL:** `https://citimart3-kolx.onrender.com/api` (Production) / `http://127.0.0.1:8000/api` (Local)  
**Authentication:** HTTP Bearer Token (`Authorization: Bearer <JWT>`)  
**Standard Error Format:** `{"detail": "Descriptive error message"}`  
**Security & Access Control:**
- Gated by `Depends(get_current_user)`: Unauthenticated calls return `401 Unauthorized`.
- Store Scope Enforcement: Store managers access only their assigned store (`NM`, `HB`, or `CHW`); cross-store access returns `403 Forbidden`.
- Administrator Enforcement: Administrative endpoints gated by `Depends(require_admin)`; non-admin callers return `403 Forbidden`.
- Input & Payload Safety: Pydantic v2 validation models, max 10MB stream limits, and PBKDF2-HMAC-SHA256 password hashing.

---

## 1. Authentication Endpoints (`/api/auth`)

### 1.1 `POST /api/auth/login`
Public login endpoint validating credentials against the MongoDB `users` collection.
- **Access:** Public (Unauthenticated)
- **Rate Limit:** 25 requests / minute per client IP (`login_limiter`).
- **Request Body:**
  ```json
  {
    "username": "CITIMART - NEW MARKET",
    "password": "<STRONG_PASSWORD>"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "expires_in": 43200,
    "user": {
      "username": "CITIMART - NEW MARKET",
      "role": "manager",
      "store_code": "NM"
    }
  }
  ```
- **Error Codes:** `401 Unauthorized` on invalid username/password; `429 Too Many Requests` on exceeding rate limit.

### 1.2 `POST /api/auth/switch-account`
Allows executive administrators (`ADMINISTRATOR`) to switch session context to view the portal as a specific store floor manager without logging out.
- **Access:** Administrator only (`require_admin`)
- **Request Body:** `{"username": "CITIMART - NEW MARKET"}`
- **Response (`200 OK`):** Returns fresh JWT containing `switched_from: "ADMINISTRATOR"` claim and `store_code: "NM"`.

### 1.3 `POST /api/auth/logout`
Client-side session invalidation endpoint.
- **Access:** Authenticated user

---

## 2. Daily KPI, Pacing & Manual Entry Endpoints (`/api/daily`)

### 2.1 `GET /api/daily/landing-hero`
Provides network-wide top-level performance figures for executive summary cards.
- **Access:** Authenticated user
- **Query Params:** `date` (`YYYY-MM-DD`, optional, defaults to today in Asia/Kolkata).
- **Response (`200 OK`):** Aggregated network net sales, total footfall, bills, and active store counts.

### 2.2 `GET /api/daily/live`
Fetches live ratio KPIs, targets, and achievement metrics for a store on a given date.
- **Access:** Authenticated user (scoped by `require_store_access`).
- **Query Params:** `store=NM&date=2026-10-30`
- **Response (`200 OK`):**
  ```json
  {
    "store": "NM",
    "date": "2026-10-30",
    "net_sales": 245000.0,
    "sales_target": 300000.0,
    "achievement_pct": 81.67,
    "remaining": 55000.0,
    "footfall": 520,
    "nob": 115,
    "conversion_pct": 22.12,
    "atv": 2130.43,
    "rpv": 471.15,
    "basket_size": 2.4,
    "kpi_status": {
      "achievement": "amber",
      "conversion": "green",
      "atv": "green",
      "rpv": "amber"
    }
  }
  ```

### 2.3 `GET /api/daily/today-context`
Provides operational day context including holiday declarations (West Bengal calendar), election polling status, and current weather observations.
- **Query Params:** `store=NM&date=2026-10-30`

### 2.4 `GET /api/daily/timeslot-pacing`
Retrieves 4-timeslot intraday pacing performance:
- Slot 1: `11:00 AM - 01:59 PM` (Morning)
- Slot 2: `02:00 PM - 04:59 PM` (Afternoon)
- Slot 3: `05:00 PM - 07:59 PM` (Evening Rush)
- Slot 4: `08:00 PM - 11:59 PM` (Night Push)

### 2.5 `GET /api/daily/bills`
Lists granular timestamped manual billing entries for the store and date, sorted by time ascending.

### 2.6 `POST /api/daily/entry`
Logs a new intraday transaction bill or footfall record.
- **Access:** Manager (for own store) or Admin
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

### 2.7 `PUT /api/daily/entry`
Updates an existing intraday entry by `row` ID.

### 2.8 `DELETE /api/daily/entry`
Removes an errant intraday entry by `row` ID.

### 2.9 `GET /api/daily/report`
Generates downloadable, certified operational daily reports.
- **Query Params:** `store=NM&start=2026-10-01&end=2026-10-30&format=xlsx` (or `pdf`).
- **Response Headers:** `Content-Disposition: attachment; filename="..."`
- **Output:** Formatted workbook binary or ReportLab PDF with rasterized visuals.

### 2.10 `POST /api/daily/kpi-override` & `DELETE /api/daily/kpi-override`
Allows store managers to supply verified manual ratio adjustments (`atv`, `rpv`, `conversion_pct`, `basket_size`, `achievement_pct`) overlaying computed calculations.

### 2.11 `GET /api/daily/target-alerts`
Returns automated deficit alerts, FIFO recovery projections, and dynamic target redistribution pacing across stores.

---

## 3. Product Requisitions & Inventory (`/api/requisitions`)

### 3.1 `GET /api/requisitions`
Lists store inventory requisitions with optional filtering by store, date range, or status.
- **Query Params:** `store_code=NM&status=pending`

### 3.2 `POST /api/requisitions`
Submits a new department product requisition order.
- **Request Body:**
  ```json
  {
    "store_code": "NM",
    "division": "LADIES APPAREL",
    "section": "ETHNIC WEAR",
    "department": "SAREES",
    "item_description": "Silk sarees high-demand stock replenishment",
    "quantity": 50,
    "urgency": "high"
  }
  ```

### 3.3 `PATCH /api/requisitions/{req_id}/status`
Admin endpoint to update requisition fulfillment status (`approved`, `rejected`, `fulfilled`).

### 3.4 `GET /api/requisitions/categories`
Provides product hierarchy taxonomy (`Division` $\rightarrow$ `Section` $\rightarrow$ `Department`) for auto-complete dropdown selectors.

---

## 4. Executive Directives (`/api/directives`)

### 4.1 `GET /api/directives`
Lists active executive announcements and operational instructions broadcasted by leadership.

### 4.2 `POST /api/directives`
Publishes a new executive directive to one or all stores.
- **Access:** Administrator only (`require_admin`).
- **Request Body:**
  ```json
  {
    "title": "Evening Peak Desk Staffing",
    "message": "All counters at NM and HB must maintain 100% cashier coverage between 5:00 PM and 8:00 PM.",
    "priority": "urgent",
    "target_store": "ALL"
  }
  ```

### 4.3 `PATCH /api/directives/{dir_id}/acknowledge`
Allows store managers to acknowledge receipt of an active directive.

---

## 5. Visual Chart Builders (`/api/charts`)

### 5.1 `GET /api/charts/{chart_id}`
Returns pre-formatted Plotly JSON specs serializing chart traces, color scales, thresholds, and responsive layout parameters.
- **Available `chart_id` Gauges:**
  - `daily_conversion_gauge`
  - `daily_achievement_gauge`
  - `daily_remaining_gauge`
  - `daily_atv_gauge`
  - `daily_rpv_gauge`
  - `daily_basket_size_gauge`
- **Available `chart_id` Timeslot Figures:**
  - `daily_timeslot_breakdown`
  - `daily_footfall_nob`

---

## 6. Monthly Sales Targets (`/api/targets`)

### 6.1 `GET /api/targets`
Retrieves daily sales target allocation for a store and month.
- **Query Params:** `store=NM&month=2026-10`

### 6.2 `PUT /api/targets`
Sets or updates a specific single-day sales target.
- **Access:** Administrator only.

### 6.3 `POST /api/targets/bulk`
Applies multi-day or monthly target tables in a single atomic transaction.

### 6.4 `POST /api/targets/upload`
Uploads monthly targets via Excel spreadsheet.
- **Access:** Administrator only (`require_admin`).
- **Safety Limits:** Max 10MB upload stream (`UPLOAD_MAX_BYTES`); strictly validates `.xlsx`/`.xls` content types.

---

## 7. AI Operations Copilot (`/api/daily/chat`)

### 7.1 `POST /api/daily/chat`
Conversational retail operations advisor grounded in live MongoDB metrics and historical YoY tally growth.
- **Rate Limit:** 40 requests / minute per client (`chat_limiter`).
- **Request Body:**
  ```json
  {
    "message": "How is Hatibagan tracking against yesterday's pacing?",
    "conversation_history": [],
    "store_code": "HB",
    "date_str": "2026-10-30",
    "language": "en"
  }
  ```
- **Languages Supported:**
  - `en`: English
  - `bn`: Bengali (বাংলা)
  - `hi`: Hindi (हिंदी)
- **Response (`200 OK`):**
  ```json
  {
    "reply": "### 📈 **YoY Tally Growth & Historical Comparison (Hatibagan)**\n\n- **Baseline Day (08.10.2026):** ₹182,400.00\n- **Previous Year Same Day (08.10.2025):** ₹165,000.00\n- **Pace:** **+10.5%**...",
    "engine": "gemini-2.5-flash",
    "store": "HB",
    "date": "2026-10-30"
  }
  ```

---

## 8. System & Metadata (`/api/meta` & `/api/health`)

### 8.1 `GET /api/meta`
Returns application header context:
- `active_stores`: Allowed store codes for current authenticated user.
- `store_names`: Full display store names.
- `date_range`: Formatted current date string (`DD.MM.YYYY`).
- `last_refresh`: Timestamp of request.

### 8.2 `GET /api/health`
Unauthenticated liveness probe for platform load balancers and container orchestrators (Render / Kubernetes).
- **Response (`200 OK`):**
  ```json
  {
    "status": "ok",
    "started_at": "2026-10-30T16:00:00.000000"
  }
  ```
