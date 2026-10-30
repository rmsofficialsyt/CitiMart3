# CITIMART Daily Operations — System Architecture (ARCHITECTURE)

**Architecture Model:** Stateless REST API + MongoDB Atlas Persistent Store + React SPA  
**Deployment:** Split Architecture (Vercel Frontend + Render Backend)

---

## 1. System Topology & Data Flow

```
+-------------------------------------------------------------------------------+
|                                CLIENT SURFACES                                |
|   +-----------------------------------------------------------------------+   |
|   | Desktop & Floor Terminals: Store Managers (NM, HB, CHW) & Admin       |   |
|   | - Landing Page Account Picker                                         |   |
|   | - Live Store Dashboard & Glossy Gauges                                |   |
|   | - Manual Bill/Footfall Entry Grid & History View                      |   |
|   | - Product Requisitions & Executive Directives Modal                   |   |
|   | - Multilingual AI Operations Copilot Drawer                           |   |
|   +------------------------------------+----------------------------------+   |
+----------------------------------------|--------------------------------------+
                                         | HTTPS (Bearer Token)
                                         v
+-------------------------------------------------------------------------------+
|                            VERCEL EDGE NETWORK                                |
|   - Serves Static React Assets (HTML, CSS, JS, Fonts)                         |
|   - Rewrites /api/* -> https://citimart3-kolx.onrender.com/api/*             |
|   - Injects Edge Security Headers (nosniff, DENY, Referrer-Policy)            |
+----------------------------------------|--------------------------------------+
                                         | HTTPS Proxy Hop
                                         v
+-------------------------------------------------------------------------------+
|                         RENDER BACKEND SERVICE (FastAPI)                      |
|   +------------------------------------+----------------------------------+   |
|   | SecurityHeadersMiddleware -> GZipMiddleware -> CORSMiddleware         |   |
|   +------------------------------------+----------------------------------+   |
|   | api/auth.py: Stateless JWT Verification & RBAC Guard                  |   |
|   | src/rate_limiter.py: In-memory sliding window rate limiting           |   |
|   +-------------------+----------------+------------------+---------------+   |
|                       |                |                  |                   |
|                       v                v                  v                   |
|   +-----------------------+  +------------------+  +----------------------+   |
|   | Live Dashboard Store  |  | Directives Store |  | Requisitions Store  |   |
|   | (Real-Time Aggregate) |  | (Broadcast Alert)|  | (Inventory Demands)  |   |
|   +-----------------------+  +------------------+  +----------------------+   |
+----------------------------------------|--------------------------------------+
                                         | TLS Connection Pool
                                         v
+-------------------------------------------------------------------------------+
|                           MONGODB ATLAS CLOUD CLUSTER                         |
|   Collections: users, bills, footfall, nob, targets, requisitions, directives |
+-------------------------------------------------------------------------------+
```

---

## 2. Component Design & Roles

### 2.1 Authentication & Authorization Subsystem
- `api/auth.py`: Verifies HS256 JWT bearer token claims (`role`, `store_code`, `username`, `sub`).
- `api/routes_auth.py`: Public login verifying PBKDF2 hashes; admin-only switch-account route.
- `src/user_store.py`: Identity store interface and password policy verifier.

### 2.2 Operational Data Subsystem
- `src/daily_dashboard_store.py`: Central engine for real-time aggregation, manual entry mutations, and historical archive queries.
- `src/daily_midnight_job.py`: Asynchronous background task running at 00:00 UTC to finalize open operational logs.

### 2.3 Intelligent Copilot Subsystem
- `api/routes_chat.py`: Ingests live store context, formats multi-lingual prompt, calls Gemini 2.5 Flash API with fallback to local rule-based intelligence engine.
