# CITIMART Daily Operations — Development Lifecycle & Releases (PHASES)

**Release Model:** Semantic Versioning (v3.x)

---

## Phase Breakdown

### Phase 1: Migration to MongoDB Atlas (v1.0.0)
- Deprecated Postgres/Supabase stack.
- Migrated data structures to MongoDB BSON documents (`bills`, `footfall`, `nob`, `targets`, `users`).
- Implemented robust connection pooling in `db/engine.py`.

### Phase 2: Live KPI Dashboard & Manual Entry Portal (v2.0.0)
- Delivered live dashboard hero card, glossy gauges, and hourly timeslot pacing.
- Implemented inline manual bill/footfall logging with consolidated row management.
- Integrated automated Kolkata weather and public holiday context engine.

### Phase 3: Operations Suite: Directives & Requisitions (v2.5.0)
- Implemented store product requisition workflow with status transitions.
- Delivered executive broadcast directives modal for Raphael Sir.
- Added password-less account switching ("View as Store Manager").

### Phase 4: Multi-Lingual AI Copilot (v3.0.0)
- Integrated Google Gemini 2.5/1.5 Flash with live MongoDB context injection.
- Added native Bengali (বাংলা) and Hindi (हिंदी) natural language responses.
- Implemented high-precision domain fallback engine for offline reliability.

### Phase 5: Production Hardening & Security Compliance (v3.2.0 — Current)
- Implemented production security spec check suite.
- Added HTTP Security Headers (`nosniff`, `DENY`, Referrer-Policy, Permissions-Policy).
- Implemented in-memory sliding window rate limiting on login and chat routes.
- Enforced 10 MB maximum upload limits on Sales Target spreadsheets.
