/// <reference types="vite/client" />

/** Build-time env vars this app reads. Vite only exposes `VITE_`-prefixed
 * ones to client code, and **inlines them into the bundle** -- so nothing
 * secret ever belongs here; these are all public deployment settings.
 * See src/lib/apiBase.ts for how VITE_API_BASE_URL changes the request path. */
interface ImportMetaEnv {
  /** Absolute origin of the FastAPI backend (e.g.
   * "https://citimart3-store-backend.onrender.com"). Leave unset to use
   * same-origin relative `/api/*` paths + the dev proxy / Vercel rewrite. */
  readonly VITE_API_BASE_URL?: string;

  /** Dev-server only: where `npm run dev`'s /api proxy points. Read by
   * vite.config.ts via loadEnv (never by client code) -- declared here so the
   * two VITE_ vars this project understands are documented in one place. */
  readonly VITE_DEV_API_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
