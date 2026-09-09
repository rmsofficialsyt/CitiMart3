# CITIMART Sales KPI Dashboard — Frontend

React + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui + Framer Motion, consuming the
FastAPI backend's `/api/*` JSON routes (one level up). See the project root
[`README.md`](../README.md) for full setup, run instructions, and architecture notes.

Quick reference:

```
npm install
npm run dev      # Vite dev server on :5173, proxies /api to http://127.0.0.1:8000
npm run build    # outputs dist/, which app.py serves directly
```

## Deployment

This SPA deploys to **Vercel**; the backend deploys separately to **Render**
(`https://citimart3-store-backend.onrender.com`). `vercel.json` declares the build and
rewrites `/api/*` through to Render, so the frontend needs no environment
variables and the two stay same-origin (no CORS). See
[`DEPLOYMENT.md`](DEPLOYMENT.md) for the full setup, the optional direct-to-Render
mode (`VITE_API_BASE_URL`), and the backend env vars it requires.
