# CITIMART Daily Operations Portal

A real-time retail floor operations, live KPI pacing, and store management platform for CITIMART's three department stores in Kolkata: **New Market (`NM`)**, **Hatibagan (`HB`)**, and **Chowringhee (`CHW`)**.

Governed by [Spec-Kit SPEC-01: Live Daily Operations Portal](file:///d:/Project%20CITIMART%20Sales%20Analysis/docs/specs/daily-operations-portal/spec.md) and [Constitution](file:///d:/Project%20CITIMART%20Sales%20Analysis/docs/specs/CONSTITUTION.md).

---

## 🌟 Key Functional Capabilities

### 1. Live Intraday KPI Dashboard & Hero Card
* **Real-Time KPI Calculations:** Computes Net Sales, Sales Target, Achievement %, Remaining Deficit Gap, Footfall, Bill Quantity, NOB (Number of Buyers), ATV (Average Transaction Value), RPV (Revenue Per Visitor), Basket Size, and Conversion Rate.
* **Intraday Pacing Chart:** 4-Timeslot pacing breakdown across store operating hours:
  * Morning (10:30 AM – 01:00 PM)
  * Afternoon (01:00 PM – 04:00 PM)
  * Evening (04:00 PM – 08:00 PM)
  * Night (08:00 PM – 11:59 PM)
* **Status Thresholds:** Visual indicators with color-coded status badges:
  * 🟢 Emerald ($\ge 100\%$ Target Achievement)
  * ⚪ Neutral Slate ($95\% - 99\%$)
  * 🟡 Amber ($85\% - 94\%$)
  * 🔴 Rose ($< 85\%$ Deficit Alert)

### 2. Manual Data Logger & Inline Row Management
* **Operating Hours Alignment:** Operating hours strictly enforced from **10:30 AM to 11:59 PM**.
* **Consolidated Billing & Footfall Logging:** Single unified row management with atomic inline **Edit** and **Delete** actions per timestamp.
* **Input Boundaries:** Pydantic schemas enforce non-negative numbers, positive footfall counts, and validated departments.
* **Automatic Midnight Finalization:** Nightly cron worker automatically finalizes and seals open uncommitted manager entries at 00:00.
* **Layman's In-App Guide:** Built-in modal and documentation in [`MANUAL_DATA_ENTRY_GUIDE.md`](./MANUAL_DATA_ENTRY_GUIDE.md) guiding floor staff.

### 3. Store Governance & Executive Operations
* **Executive Directives:** Raphael Sir (Executive Operations Head) can broadcast high-priority operational directives to individual stores or across all stores.
* **Product Shortfall Requisitions:** Floor managers can log out-of-stock sizes and critical merchandise shortages with priority tags (`Urgent`, `High`, `Normal`).
* **Multi-Lingual AI Copilot:** In-app assistant drawer answering real-time store pacing queries in English, Bengali, and Hindi grounded directly in live MongoDB operational data.

### 4. Certified Multi-Format Reports
* One-click export of verified operational logs into **Excel (`.xlsx`)** or **PDF (`.pdf`)**.
* Parallel chart rasterization with graceful table fallback to prevent export timeouts.

---

## 🏗️ Architecture & Stack

```
Daily Operations/
├── backend/                  # FastAPI + PyMongo + MongoDB Atlas
│   ├── api/                  # Modular REST routers (auth, daily, directives, requisitions, chat)
│   ├── config/               # Environment & KPI threshold configurations
│   ├── db/                   # MongoDB connection lifecycle & compound index definitions
│   ├── src/                  # Domain business logic (KPI engine, report generator, AI drawer)
│   ├── tests/                # Automated pytest suite (unit, auth, and negative tests)
│   └── app.py                # FastAPI ASGI application entrypoint
└── frontend/                 # React 18 + Vite + TypeScript + Tailwind CSS
    ├── src/components/       # Hero cards, data entry tables, charts, directives modal
    ├── src/context/          # Auth context & store state providers
    └── vercel.json           # Vercel deployment & API proxy configuration
```

---

## 🔒 Security Architecture (SPEC-04 Alignment)
* **Zero Unauthenticated Routes:** All operational endpoints require a signed `HS256` Bearer JWT via `Depends(get_current_user)`.
* **Multi-Tenant / Store Isolation:** Store managers are strictly restricted to their assigned store using server-enforced `require_store_access(store_id, current_user)`.
* **Rate Limiting & Security Headers:** Auth and chat endpoints are protected by rate limiters; responses carry `nosniff`, `DENY`, and `strict-origin` headers.

---

## 🚀 Running Daily Operations

```bash
# 1. Start Backend
cd backend
python -m venv .venv
source .venv/bin/activate  # Or .\.venv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt
uvicorn app:app --reload --port 8000

# 2. Start Frontend
cd ../frontend
npm install
npm run dev                # Available at http://localhost:5173
```
