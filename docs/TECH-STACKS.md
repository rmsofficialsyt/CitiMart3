# CITIMART Daily Operations — Technology Stack Specification (TECH-STACKS)

**Stack Version:** 2026.3  
**Architecture:** Split Deployment (Vercel Frontend + Render Backend + MongoDB Atlas)

---

## 1. Backend Service Stack

| Technology | Version / Spec | Role in Architecture |
|---|---|---|
| **Python** | 3.11+ (tested on 3.14.7) | High-performance asynchronous backend runtime |
| **FastAPI** | 0.115+ | Web framework providing typed schema validation and OpenAPI |
| **Starlette** | Core ASGI | Middleware processing (Security Headers, GZip, CORS) |
| **PyMongo** | 4.8+ | Native high-speed MongoDB driver with connection pooling |
| **PyJWT** | 2.10 | HS256 access tokens (15 min, `iss`/`aud`, bound to a session `sid`) |
| **redis-py + hiredis** | 5.2.1 | Sessions, distributed rate limits, L2 dashboard cache, weather cache, midnight lock (`db/redis_client.py`, sync client) |
| **bullmq (Python)** | 2.14.0 | Job queues: `reports`, `audit-events`, `midnight-finalizer` (`src/queue/`). No repeatable jobs in the Python port; the worker schedules midnight itself |
| **argon2-cffi** | 23.1.0 | Argon2id password hashing (AUTH-02) |
| **Redis** | 7.4 | Shared state for multi-worker / multi-replica deployments (`maxmemory-policy noeviction`; every app key has a TTL) |
| **Nginx** | 1.27.5 | L7 gateway + `least_conn` load balancer for the Docker stack (`nginx/nginx.conf`) |
| **OpenPyXL** | 3.1+ | Sales target Excel upload processor |
| **ReportLab** | 4.2+ | Headless PDF engine generating certified daily reports |
| **Pydantic** | v2 | Request/Response schema validation and settings management |
| **Requests / HTTPX** | Latest | Outbound communication to Google Gemini Generative AI endpoints |
| **Pytest** | 9.1+ | Automated test runner (234 tests; mongomock + fakeredis/lupa, no external services) |

---

## 2. Frontend Application Stack

| Technology | Version / Spec | Role in Architecture |
|---|---|---|
| **React** | 18.3.1 | Core UI view layer |
| **TypeScript** | 5.5+ | Full end-to-end type safety |
| **Vite** | 8.2+ / modern | Development server, bundling, and asset pipeline |
| **Tailwind CSS** | 4.0+ | Modern styling system |
| **Lucide React** | Latest | Consistent icon system |
| **Radix UI** | Modern primitives | Dialogs, popovers, select menus, scroll areas |
| **Sonner** | Latest | Toast notification system |
| **Plotly.js / Recharts** | Latest | Glossy gauge and timeseries pacing charts |

---

## 3. Database & Hosting Infrastructure

- **Database:** MongoDB Atlas M0/M10 Cluster (`citimart` database) hosted in AWS/GCP Mumbai/Singapore region.
- **Backend PaaS:** Render Web Service (`citimart3-kolx.onrender.com`).
- **Frontend CDN:** Vercel Edge Network (`citimart.vercel.app` / custom domains) with `/api/*` proxy rewrite.
- **Self-hosted / horizontally scaled alternative:** `docker-compose.yml` — Redis 7 + N
  FastAPI replicas + M BullMQ workers behind Nginx (MongoDB stays external). See
  [ARCHITECTURE.md §3](ARCHITECTURE.md).
