# CITIMART Daily Operations — Frontend Deployment Guide

![Vercel](https://img.shields.io/badge/Vercel-Frontend%20CDN-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Render](https://img.shields.io/badge/Render-Backend%20PaaS-46E3B7?style=for-the-badge&logo=render&logoColor=white)
![Status](https://img.shields.io/badge/Status-Production%20Verified-success?style=for-the-badge)

> **Complete Split-Deployment Operational Guide: Vercel Frontend + Render Backend**  
> Describes project importation, environment settings, reverse-proxy rewrite rules, direct mode options, and production verification procedures.

---

## 📑 Table of Contents
1. [Architecture & Split Topology](#-architecture--split-topology)
2. [Vercel Project Configuration](#-vercel-project-configuration)
3. [Network Routing Modes (Proxy vs Direct)](#-network-routing-modes-proxy-vs-direct)
4. [Backend Environment Variables (Render)](#-backend-environment-variables-render)
5. [Local Development Verification](#-local-development-verification)
6. [Smoke Tests & Validation Checklist](#-smoke-tests--validation-checklist)
7. [Troubleshooting & Caveats](#-troubleshooting--caveats)

---

## 🏗️ Architecture & Split Topology

The frontend single-page application (SPA) deploys on **Vercel's global edge network**, while the FastAPI backend service runs on **Render**:

```
[ Browser Client ]
        │
        ├── (1) Static Files & Assets (/*) ──────► [ Vercel Edge CDN ]
        │                                                │
        └── (2) Operational API (/api/*) ────────────────┤ (Proxy Rewrite in vercel.json)
                                                         ▼
                                             [ Render Backend PaaS ]
                                          https://citimart3-kolx.onrender.com
                                                         │
                                           ┌─────────────┴─────────────┐
                                           ▼                           ▼
                                    [ MongoDB Atlas ]          [ Redis Cluster ]
```

---

## 🚀 Vercel Project Configuration

When importing `Daily Operations/frontend` into Vercel:

1. **Root Directory:** Leave **empty** (the repository root is the frontend directory when linked directly).
2. **Framework Preset:** `Vite` (automatically detected from `vercel.json`).
3. **Build & Output Settings:**

| Build Setting | Production Value | Source Configuration |
|:---|:---|:---|
| **Build Command** | `npm run build` | `vercel.json` $\to$ `buildCommand` |
| **Output Directory** | `dist` | `vercel.json` $\to$ `outputDirectory` |
| **Install Command** | `npm install` | `vercel.json` $\to$ `installCommand` |
| **Node.js Version** | `20.x` or `22.x` | Vercel Project Settings |

---

## 🌐 Network Routing Modes (Proxy vs Direct)

### Mode 1: Transparent Proxy Mode (Default & Recommended)
Defined in [`vercel.json`](vercel.json):
```jsonc
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://citimart3-kolx.onrender.com/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```
* **Benefits:** Zero CORS preflight requests; the browser treats all `/api/*` endpoints as same-origin.
* **SPA Fallback:** All non-file routes cleanly resolve to `index.html`.

### Mode 2: Direct Mode (Escape Hatch for Heavy Exports)
For large PDF/XLSX export downloads that may exceed Vercel's proxy execution limits:
1. In Vercel Project Settings, add:
   ```env
   VITE_API_BASE_URL=https://citimart3-kolx.onrender.com
   ```
2. Redeploy the frontend so Vite bakes the URL into the client bundle.
3. Configure `CORS_ALLOW_ORIGINS` on Render to authorize the Vercel domain.

---

## ⚙️ Backend Environment Variables (Render)

Configure these parameters in the Render Dashboard under **Environment**:

```env
# MongoDB Atlas
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/citimart?retryWrites=true&w=majority
MONGO_DB_NAME=citimart

# Security & Sessions
JWT_SECRET=your_32_character_cryptographically_random_secret
ACCESS_TOKEN_EXPIRE_MINUTES=15
REDIS_URL=rediss://default:<password>@<redis-host>:6379

# Direct Mode CORS (Only if Mode 2 is activated)
CORS_ALLOW_ORIGINS=https://citimart.vercel.app
CORS_ALLOW_ORIGIN_REGEX=https://citimart-.*\.vercel\.app
```

> [!NOTE]
> Render health check endpoint must be configured as **`/api/health`** (never `/`, which returns 404 on the standalone backend).

---

## 🧪 Smoke Tests & Validation Checklist

Execute these terminal checks against the live deployment:

```bash
# 1. Health Probe via Vercel Edge Proxy
curl -s https://<your-project>.vercel.app/api/health
# Expected Output: {"status":"healthy","database":"connected","timestamp":"..."}

# 2. Verify Security Headers
curl -I https://<your-project>.vercel.app/
# Check for: X-Content-Type-Options: nosniff
# Check for: X-Frame-Options: DENY

# 3. Verify SPA Deep Link Fallback
curl -I https://<your-project>.vercel.app/login
# Expected: HTTP 200 (Serving index.html)
```

---

## ⚠️ Troubleshooting & Caveats

* **Render Free Tier Cold Starts:** Idle backends can take ~45–50 seconds to boot on first request. The frontend displays an informative waiting toast rather than crashing.
* **Stale Token Expiry:** If a manager leaves the screen open overnight, the refresh token automatically exchanges a new access token without requiring re-login.
