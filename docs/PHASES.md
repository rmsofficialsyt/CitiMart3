# CITIMART Daily Operations — Development Lifecycle & Releases (PHASES)

![Phases](https://img.shields.io/badge/CITIMART-Release%20Lifecycle-00D26A?style=for-the-badge&logo=git&logoColor=white)
![Version](https://img.shields.io/badge/Current%20Release-v3.2.0-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Lifecycle-Production%20Active-success?style=for-the-badge)

> **Architectural Milestones, Version History & Release Management**  
> Tracks the evolution from legacy architecture to the current high-concurrency, distributed operational platform.

---

## 📑 Release Milestones Overview

```
Phase 1 (v1.0.0) ──► MongoDB Atlas Migration (Collections & Indexing)
Phase 2 (v2.0.0) ──► Live KPI Engine, Gauges & Manual Logger Portal
Phase 3 (v2.5.0) ──► Executive Directives & Stock Shortfall Requisitions
Phase 4 (v3.0.0) ──► Multilingual AI Copilot (English, Bengali, Hindi)
Phase 5 (v3.2.0) ──► Distributed Redis Stack, Nginx L7 Gateway & Hardened Security (Current)
```

---

## 🚀 Detailed Phase History

### Phase 1: MongoDB Atlas Migration (v1.0.0)
* Deprecated legacy spreadsheet/relational stores in favor of **MongoDB Atlas**.
* Structured foundational BSON collections: `bills`, `footfall`, `nob`, `targets`, `users`.
* Configured thread-safe connection pooling in `db/engine.py`.

### Phase 2: Live KPI Dashboard & Manual Entry Portal (v2.0.0)
* Delivered live dashboard hero card, glossy visual gauges, and 4-timeslot pacing curves.
* Created unified inline data logger with atomic edit and delete actions.
* Integrated automated Kolkata weather and public holiday context engine.

### Phase 3: Operations Governance & Requisitions (v2.5.0)
* Delivered executive directives broadcast engine for Raphael Sir with read receipts.
* Implemented merchandise shortfall requisition workflow with priority routing.
* Added administrative account switcher ("View as Store Manager").

### Phase 4: Multilingual AI Copilot (v3.0.0)
* Integrated Google GenAI / Gemini engine with live MongoDB context injection.
* Added fluent trilingual responses in **English**, **Bengali (বাংলা)**, and **Hindi (हिंदी)**.
* Implemented domain anti-hallucination validation gate (`anti_hallucination.py`).

### Phase 5: High-Concurrency & Production Hardening (v3.2.0 — Current)
* **Distributed Architecture:** Integrated **Redis 7.4** for server-revocable sessions (`AUTH-05`), sliding-window rate limiters, and write-evicted L2 caching.
* **L7 API Gateway:** Deployed **Nginx** reverse proxy with dynamic Docker DNS resolution (`127.0.0.11`) and edge abuse protection.
* **Security Compliance:** Implemented modern security headers (`nosniff`, `DENY`), 10 MB upload ceilings, and Argon2id password hashing.
* **Testing Excellence:** Expanded automated pytest suite to 240+ unit, integration, and security tests.
