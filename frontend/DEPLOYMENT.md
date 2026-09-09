# Deploying the CITIMART frontend to Vercel

The SPA in this repo is deployed to **Vercel**; the FastAPI backend is deployed
separately to **Render** at `https://citimart3-store-backend.onrender.com`.

This directory is its own git repository
(`yarrowtech-intern2/CITIMART-3-FRONTEND`), so on Vercel the **Root Directory is
the repo root** — leave that setting empty, do *not* set it to `frontend`.

---

## 1. Import the project

Vercel → **Add New… → Project** → import `CITIMART-3-FRONTEND`.

Everything Vercel asks for on that screen is already declared in
[`vercel.json`](vercel.json), so accept the defaults:

| Setting | Value | Source |
| --- | --- | --- |
| Framework Preset | Vite | `vercel.json` → `framework` |
| Build Command | `npm run build` | `vercel.json` → `buildCommand` |
| Output Directory | `dist` | `vercel.json` → `outputDirectory` |
| Install Command | `npm install` | `vercel.json` → `installCommand` |
| Root Directory | *(empty)* | repo root is this folder |
| Node version | 20 or 22 | Vercel default |

**No environment variables are required.** Deploy.

## 2. How the frontend reaches the backend

Every API call in the app is a relative path (`/api/kpis`, `/api/auth/login`, …),
resolved at request time by [`src/lib/apiBase.ts`](src/lib/apiBase.ts). Two modes:

### Proxy mode — the default, and what `vercel.json` sets up

```jsonc
"rewrites": [
  { "source": "/api/:path*", "destination": "https://citimart3-store-backend.onrender.com/api/:path*" },
  { "source": "/(.*)",       "destination": "/index.html" }
]
```

The first rule makes Vercel forward `/api/*` (method, query string, and the
`Authorization` bearer header included) to Render. The browser only ever sees a
**same-origin** request, so there is **no CORS preflight and no backend change
needed**.

The second rule is the SPA fallback: it serves `index.html` for any path that
isn't a real file, so a hard refresh on `/login` or `/daily/NM` doesn't 404.
Vercel evaluates `rewrites` only after the static filesystem check, so hashed
assets under `/assets/*` are still served directly.

### Direct mode — optional escape hatch

Set a **Production** (and Preview) environment variable in Vercel:

```
VITE_API_BASE_URL = https://citimart3-store-backend.onrender.com
```

then **redeploy** — Vite inlines `VITE_*` vars into the bundle at build time, so
changing the variable alone does nothing to an already-built deployment.

The browser then calls Render directly, skipping Vercel's proxy hop. Use it if
you hit the platform's proxy response-size or ~30s gateway timeout — the
forecast `/compute` endpoints and the PDF/XLSX report exports are the realistic
candidates. In exchange the requests become cross-origin, so Render must allow
the Vercel origin (step 3).

## 3. Backend env vars on Render

Required regardless of mode (already set on the live service):

```
MONGODB_URI=mongodb+srv://…
MONGODB_DB_NAME=citimart
JWT_SECRET=<long random value>
```

Only needed for **direct mode**:

```
CORS_ALLOW_ORIGINS=https://<your-project>.vercel.app
# optional: Vercel gives every preview deploy its own hostname
CORS_ALLOW_ORIGIN_REGEX=https://citimart-3-frontend-.*\.vercel\.app
```

Both are blank by default, in which case `app.py` installs no CORS middleware at
all and the service behaves exactly as it does today. `allow_credentials` is
`False` on purpose — auth is a bearer token in a header, never a cookie.

## 4. Local development is unchanged

```bash
npm run dev     # :5173, proxies /api -> http://127.0.0.1:8000 (vite.config.ts)
```

To develop the UI against the deployed backend without running Python locally,
put this in `.env.local` (gitignored — see [`.env.example`](.env.example)):

```
VITE_DEV_API_PROXY=https://citimart3-store-backend.onrender.com
```

## 5. Verifying a deployment

```bash
curl -s https://<your-project>.vercel.app/api/health
# {"status":"ok","dataset_loaded":true,...}   <- proxied through to Render
```

If that returns HTML instead of JSON, the `/api/:path*` rewrite isn't being
applied — check that `vercel.json` is at the repo root of the deployed project.

Then load the site and log in. A 401 on every call means the bearer token isn't
reaching Render; a browser-console CORS error means you're in direct mode with
`CORS_ALLOW_ORIGINS` unset on Render.

## Known caveats

- **Render free-tier cold starts.** An idle service sleeps and the first request
  can take ~50s to wake it. In proxy mode that request runs against Vercel's
  gateway timeout, so the very first page load after an idle period may fail and
  need a refresh.
- **CSV download buttons** (`DataTable`) use `window.location.assign(...)`, a
  plain navigation that carries no `Authorization` header. That is pre-existing
  behaviour, unchanged here, and it fails the same way in both modes.
- **`dist/` is gitignored** and rebuilt by Vercel — don't commit it.
