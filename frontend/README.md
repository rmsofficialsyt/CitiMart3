# CITIMART Daily Operations — Frontend Portal

The client-side single-page application (SPA) for CITIMART's store floor managers and executive operations directors.

Governed by [Spec-Kit SPEC-01](file:///d:/Project%20CITIMART%20Sales%20Analysis/docs/specs/daily-operations-portal/spec.md) and [Taste-Skill Design Guidelines](file:///d:/Project%20CITIMART%20Sales%20Analysis/.agents/skills/taste-skill/SKILL.md).

---

## 🛠️ Tech Stack & Foundations
* **Framework:** React 18 + TypeScript built with Vite
* **Styling & Design System:** Tailwind CSS v4, Lucide icons, shadcn/ui foundation
* **State & Server Cache:** React Context API + TanStack React Query
* **Visual Charts:** Plotly and lightweight SVG visual gauges
* **Typography:** Tabular figures (`tabular-nums`) for currency, conversion rates, and targets

---

## 📂 Component Layout
```
frontend/src/
├── components/
│   ├── AccountSelector.tsx    # 4-card role landing grid (NM, HB, CHW, Admin)
│   ├── HeroSummaryCard.tsx    # Live Achievement %, ATV, RPV, and Gap metrics
│   ├── TimeslotPacingChart.tsx# 4-slot intraday pacing bar chart
│   ├── ManualDataEntryTable.tsx# Unified billing & footfall inline row logger
│   ├── ExecutiveDirectivesModal.tsx# Admin directive broadcast
│   ├── ProductRequisitionModal.tsx # Out-of-stock size request workflow
│   └── AICopilotDrawer.tsx    # Multi-lingual sales query assistant
├── context/
│   └── AuthContext.tsx        # Store-scoped token & user credentials state
└── services/
    └── api.ts                 # Axios / Fetch client with Bearer token injection
```

---

## 🚀 Development & Build

```bash
# Install dependencies
npm install

# Start Vite dev server on http://localhost:5173 (proxies /api to localhost:8000)
npm run dev

# Build production bundle to dist/
npm run build
```

---

## 🌐 Deployment
The frontend SPA deploys to **Vercel**; the backend runs on **Render**. `vercel.json` automatically proxies `/api/*` requests to the production backend endpoint without requiring cross-origin (CORS) changes. See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for full configuration.
