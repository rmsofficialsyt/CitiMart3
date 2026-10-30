# CITIMART Daily Operations — Engineering Memory & Technical Context (MEMORY)

**Context Type:** Subproject Technical Memory & Architectural Retrospective  
**Maintained For:** AI Coding Agents & Engineering Maintainers

---

## 1. Key Historical Decisions & Gotchas

1. **Retirement of PostgreSQL / Supabase:**
   - Early iterations used a portable PostgreSQL 17 instance with Alembic migrations and briefly tested Supabase auth.
   - Both were completely retired and replaced with **MongoDB Atlas** + in-house PBKDF2-HMAC-SHA256 password hashing.
   - Do NOT attempt to re-introduce SQLAlchemy, Alembic, or Supabase client libraries.

2. **The "CHOWRINGHEE" Canonical Spelling:**
   - Always spell Chowringhee as `CHOWRINGHEE` (`CHW`). Never use "CHOWRINGEE".

3. **Stateless JWT Claims & DB Independence:**
   - `api/auth.py::get_current_user` extracts `role`, `store_code`, and `username` directly from verified JWT claims.
   - It deliberately does NOT hit MongoDB on every API request. This ensures sub-millisecond route gating and protects Atlas connection pools.

4. **Self-Ping Keep-Alive on Render:**
   - Render's free tier spins down web instances after 15 minutes of inactivity.
   - `app.py` runs a background task sending an internal `GET /api/health` every 10 minutes to maintain active status.

5. **Split Deployment Architecture:**
   - The frontend is deployed independently to Vercel (`yarrowtech-intern2/CITIMART-3-FRONTEND`).
   - The backend runs on Render.
   - Cross-origin communication is handled via Vercel's `/api/*` rewrite proxy, keeping requests same-origin to the browser.
