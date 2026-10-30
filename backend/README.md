# CITIMART Daily Operations — Backend Service

FastAPI REST API powering CITIMART's live store operations, intraday calculations, executive directives, and MongoDB Atlas persistence.

Governed by [Spec-Kit SPEC-01](file:///d:/Project%20CITIMART%20Sales%20Analysis/docs/specs/daily-operations-portal/spec.md), [SPEC-04: Multi-Tenant Security Gate](file:///d:/Project%20CITIMART%20Sales%20Analysis/docs/specs/multi-tenant-security-gate/spec.md), and [Constitution](file:///d:/Project%20CITIMART%20Sales%20Analysis/docs/specs/CONSTITUTION.md).

---

## 🛠️ Stack & Dependencies
* **Framework:** FastAPI (Python 3.11+)
* **Database Driver:** PyMongo / Motor async driver
* **Database:** MongoDB Atlas (Collections: `bills`, `footfall`, `nob`, `targets`, `users`, `directives`, `requisitions`)
* **Auth & Cryptography:** PyJWT (`HS256`), passlib (`bcrypt` / PBKDF2)
* **Testing:** Pytest, mongomock, HTTPX TestClient

---

## 📡 API Routing Structure
* `api/routes_auth.py`: Authentication, `/api/auth/login`, token refresh, account verification.
* `api/routes_daily.py`: Store intraday operations, `/api/daily/stores/{store_id}/summary`, manual data logging, history archive.
* `api/routes_directives.py`: Executive directive broadcasts and store read receipts.
* `api/routes_requisitions.py`: Store stock shortfall requisition workflows.
* `api/routes_chat.py`: In-app AI copilot answering sales pacing queries.
* `api/routes_targets.py`: Store target management and bulk Excel uploads.

---

## 🔒 Security & Quality Gates
* **Authentication:** All `/api/*` routes (except `/api/health` and `/api/auth/login`) require a valid Bearer JWT.
* **Store Boundary:** Enforces `require_store_access(store_id, current_user)` preventing cross-store BOLA/IDOR vulnerabilities.
* **Security Headers:** Middleware automatically emits `nosniff`, `DENY`, and `strict-origin`.

---

## 🚀 Running & Testing

```bash
# Setup virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run local development server
uvicorn app:app --reload --port 8000

# Run automated tests
pytest tests/ -v
```

