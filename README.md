# CITIMART Daily Operations System

A real-time retail operations & analytics platform for CITIMART's Kolkata stores (**New Market**, **Hatibagan**, and **Chowringhee**).

This sub-project powers live per-store KPI tracking, manual timestamped data entry, daily KPI overrides, sales target management, automated PDF/Excel exports, and time-slot-wise historical operations logging.

---

## 🌟 Key Features

### 1. Live Per-Store KPI Dashboard
- **Real-Time KPI Calculation**: Computes Net Sales, Sales Target, Achievement %, Remaining %, Footfall, Bill Quantity, NOB (Number of Buyers), ATV (Average Transaction Value), RPV (Revenue Per Visitor), Basket Size, and Conversion %.
- **Environmental Context**: Automatically integrates daily weather forecasts, holiday information, election notices, and day types (Weekday/Weekend).
- **Overall Blended View**: Admin summary blending live operations across all 3 stores simultaneously.

### 2. Manual Data Entry & Log Sync
- **Operating Hours & Time Slot Alignment**: Operating hours are strictly set from **10:30 AM to 23:59 PM**, perfectly aligning with CITIMART Kolkata store opening hours. Time slot bands start from 10:30 AM.
- **Timestamped Billing Logs**: Add, update, or remove individual bill logs (`bill_time`, `net_amount`, `bill_quantity`, `time_slot`).
- **Footfall & NOB Logs**: Time-stamped footfall visitor count and buyer (NOB) entries.
- **Unified Row Management**: "Logged Bills & NOB" displays a single consolidated **Edit** and **Delete** action per merged time-stamp row (rather than separate duplicate actions).
- **Manager KPI Overrides**: Store managers can overlay hand-entered ratio values (ATV, RPV, Conversion %, etc.) when needed.
- **In-App Layman's User Guide**: Expandable step-by-step manager guide for Footfall, Billing Details, and Remarks with clear dos and don'ts (also documented in [`MANUAL_DATA_ENTRY_GUIDE.md`](./MANUAL_DATA_ENTRY_GUIDE.md)).
- **Automatic Midnight Finalization**: Automated 00:00 night job automatically sets final submission if managers logged entries or targets but did not press the manual final button.

### 3. Historical Operations & Time-Slot Logs ("History")
- **Recorded Dates Archive**: Browse all past operational dates with instant summary metrics (defaults to the latest recorded operations date).
- **Time-Slot Aggregation**: View performance grouped by operational time slots (e.g., 10:30 AM - 01:00 PM, 01:00 PM - 03:00 PM, 03:00 PM - 06:00 PM, 06:00 PM - 09:00 PM, 09:00 PM - 11:59 PM).
- **Detailed Log Inspection**: Time-slot filtered views of every individual footfall, billing transaction, and NOB record.
- **Dual Access**: Fully available for both Administrators (all stores / store-switchable) and Store Managers (strictly store-scoped).

### 4. Sales Target Management
- Monthly/daily sales target configuration per store.
- Bulk target uploads and Excel file import.

### 5. Multi-Format Report Exports
- Export per-store daily operations logs in **Excel (`.xlsx`)** or **PDF (`.pdf`)** formats for single days or custom date ranges.
- **Resilient PDF Engine**: Parallel chart rasterization with graceful table fallbacks prevents timeouts and crashes.
- **All Rights Reserved**: Legal copyright condition embedded in PDF footers and across web portal pages.

---

## 🏗️ Architecture & Technology Stack

```
Daily Operations/
├── backend/                  # FastAPI + PyMongo + MongoDB
│   ├── api/                  # REST API Endpoints
│   │   ├── auth.py           # JWT Authentication & RBAC middleware
│   │   ├── routes_auth.py    # Login / Logout routes
│   │   ├── routes_daily.py   # Live KPIs, Logs, History & Report routes
│   │   ├── routes_targets.py # Sales Target management routes
│   │   └── routes_meta.py    # System metadata
│   ├── config/               # App settings & KPI threshold definitions
│   ├── db/                   # MongoDB connection & indexes (`bills`, `footfall`, `nob`, `targets`)
│   ├── src/                  # Core domain logic
│   │   ├── daily_dashboard_store.py  # Live KPI engine & history aggregation
│   │   ├── daily_context.py          # Weather & holiday data engine
│   │   └── daily_report.py           # PDF & XLSX report generation
│   ├── tests/                # Automated Pytest test suite
│   └── app.py                # FastAPI entry point
│
└── frontend/                 # Vite + React 18 + TypeScript
    ├── src/
    │   ├── api/              # API Client (Fetch + React Query)
    │   ├── auth/             # Token storage & Auth Provider
    │   ├── components/       # UI Components (TopBar, LoggedDailyEntries, GlossyGauge, etc.)
    │   ├── pages/            # Page Views (Landing, LoginPage, StoreDailyDashboard, HistoryPage, etc.)
    │   ├── App.tsx           # Main application routing & view switcher
    │   └── main.tsx          # React application root
    ├── package.json
    └── vite.config.ts
```

---

## 🔐 Role-Based Access Control (RBAC)

| User Role | Credentials / Code | Scope & Capabilities |
| :--- | :--- | :--- |
| **Administrator** | `admin` | Full access: Overall Stores Summary, Store Switching, Sales Targets, KPI Overrides, Exports, and History across all stores. |
| **New Market Manager** | `NM` | Scoped access to New Market store: Live Dashboard, Manual Entry, History Logs. |
| **Hatibagan Manager** | `HB` | Scoped access to Hatibagan store: Live Dashboard, Manual Entry, History Logs. |
| **Chowringhee Manager** | `CHW` | Scoped access to Chowringhee store: Live Dashboard, Manual Entry, History Logs. |

---

## 📡 API Reference Summary

### Authentication
- `POST /api/auth/login`: Authenticate user and issue JWT bearer token.
- `GET /api/auth/me`: Fetch current authenticated user session details.

### Daily Operations & Live KPIs
- `GET /api/daily/live`: Get live KPIs and context for a specific store and date (`?store=NM&date=2026-08-20`).
- `GET /api/daily/live/overall`: Get blended live KPIs across all stores (Admin only).
- `PUT /api/daily/kpi-override`: Apply a manual ratio override.
- `DELETE /api/daily/kpi-override`: Reset a ratio override.

### Manual Data Entry Logs
- `GET / POST / PUT / DELETE /api/daily/bill-log`: Manage timestamped billing entries.
- `GET / POST / PUT / DELETE /api/daily/footfall-log`: Manage timestamped footfall entries.
- `GET / POST / PUT / DELETE /api/daily/nob-log`: Manage timestamped NOB (buyer) entries.
- `POST /api/daily/save-entry`: Save daily summary notes & lock live calculation.

### History Logs (New)
- `GET /api/daily/history/dates`: List all available historical dates with daily summary metrics (`?store=NM` or `?store=ALL`).
- `GET /api/daily/history/details`: Retrieve time-slot-wise breakdown and detailed footfall, billing, and sales logs for a specified date and store.

### Export Reports
- `GET /api/daily/report`: Generate Excel (`xlsx`) or PDF (`pdf`) reports (`?store=NM&format=pdf&start=2026-08-01&end=2026-08-20`).

---

## 🚀 Local Setup & Installation

### Prerequisites
- **Python**: 3.10+
- **Node.js**: 18+
- **MongoDB**: Running instance locally or MongoDB Atlas URI

### 1. Backend Setup

```bash
cd "Daily Operations/backend"

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Copy .env.example to .env and set MONGODB_URI (defaults to mongodb://localhost:27017)
cp .env.example .env

# Run FastAPI server
uvicorn app:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd "Daily Operations/frontend"

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

The frontend will run at `http://localhost:5173`.

---

## 🧪 Running Tests

To run the backend test suite:

```bash
cd "Daily Operations/backend"
pytest
```

---

## 📄 License & Attribution

Internal retail analytics workspace for **CITIMART** Kolkata stores.
