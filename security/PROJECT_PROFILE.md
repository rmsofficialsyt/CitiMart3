# Project Security Profile — CITIMART Daily Operations
Generated: 2026-11-25 by Claude Code (Opus 5.5)

## Flags
| Flag | Value | Evidence |
|---|---|---|
| WEB_FRONTEND | true | `frontend/` React + Vite SPA |
| BACKEND | true | `backend/app.py` FastAPI |
| DATABASE | true | pymongo → MongoDB Atlas (`db/engine.py`) |
| HAS_AUTH | true | `api/routes_auth.py`, `api/auth.py` (JWT + server sessions) |
| HAS_ADMIN | true | `require_admin`, admin-only routers (`app.py:350-352`) |
| HAS_API | true | REST under `/api/*` |
| FILE_UPLOAD | true | Sales-target Excel upload (`api/routes_targets.py:196`) |
| OUTBOUND_FETCH | false | Only fixed hosts (Open-Meteo, Gemini, Tavily, Meta/Twilio) |
| PII | true | Staff name/phone/email, attendance, WhatsApp recipients, chat transcripts, session IP/UA |
| SENSITIVE_PII | false | No IDs, health or bank data found |
| AI_LLM | true | Gemini Co-Pilot (`src/chat/`) |
| EMAIL_SMS | true | WhatsApp alerts (`src/alerts/whatsapp_provider.py`) |
| CONTAINERS | true | `backend/Dockerfile`, `docker-compose.yml`, `nginx/` |
| CLOUD | true | Render (backend), Vercel (`frontend/vercel.json`) |
| CI | false | No workflow files in this repo |
| INDIA_USERS | true | Kolkata stores, INR, hi/bn locales |
| GRAPHQL / WEBSOCKETS / PAYMENTS / MOBILE / DESKTOP / GAME / CMS / IAC | false | Not present |

## Stack
Python 3.13, FastAPI, Pydantic v2, pymongo 4.17, redis-py, BullMQ (optional), PyJWT 2.10, argon2-cffi, openpyxl, ReportLab, Kaleido. React 19 + TypeScript + Vite 8, TanStack Query. MongoDB Atlas, Redis (optional). Deploy: Render (API) + Vercel (SPA), or docker-compose behind Nginx. Tests: `cd backend && pytest` (553 tests, mongomock + fakeredis).

## Attack surface
### Endpoints (summary)
| Prefix | Auth | Role | Store scoping | Notes |
|---|---|---|---|---|
| `POST /api/auth/login, /refresh, /logout` | public | — | — | rate-limited |
| `/api/auth/sessions*, /logout-all, /switch-account` | bearer | any / admin for switch | own sessions | |
| `/api/daily/*` (live, logs, save-entry, report, history) | bearer | manager/admin | `_guard` → `require_store_access`; `ALL` admin-only | `kpi-override` lacks admin check |
| `/api/daily/live/overall` | bearer | admin | — | |
| `/api/daily/requisitions*` | bearer | manager/admin; status update admin | own store | |
| `/api/daily/stocks*`, `/api/daily/staff*` | bearer | manager/admin | `require_store_access` | staff PII |
| `/api/daily/directives*` | bearer | manager/admin | **manager can target other stores** | see report |
| `/api/chat*`, `/api/advisor*` | bearer | manager/admin | SecurityContext / `require_store_access` | LLM |
| `/api/notifications*` | bearer | any; scan admin | role + store filter | |
| `/api/charts/*`, `/api/meta` | bearer | any | clamped stores | |
| `/api/targets*`, `/api/kpi-thresholds*`, `/api/alerts*` | bearer | admin | — | Excel upload |
| `/api/health` | public | — | — | |

### Personal data inventory
| Data | Where stored | Purpose | Shared with | Retention |
|---|---|---|---|---|
| Staff name, phone, email, notes | `staff` collection | Workforce management | — | Undefined (NEEDS_HUMAN) |
| Attendance check-in/out | `staff_attendance` | Staffing signals | — | Undefined |
| Admin WhatsApp numbers | env / alerts settings | Sales alerts | Meta or Twilio | Undefined |
| Chat transcripts | chat sessions/messages | Co-Pilot memory | Google Gemini (prompt content), Tavily (search queries) | `CHAT_SESSION_TTL_DAYS` = 30 |
| Session IP + user agent | Redis / in-process | Session list (AUTH-06) | — | Session lifetime (≤ 12 h) |
| Audit log (username, IP) | `audit_logs` | Security audit | — | Undefined |

## Applicable check groups
SEC, AUTH, AC, INP, WEB, API, SUP, INFRA, CRYPTO, PRIV, LOG, OPS, AI, MSG, DESIGN
