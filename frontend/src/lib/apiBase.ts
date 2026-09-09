/** Where `/api/*` requests are sent.
 *
 * Two supported deployments, chosen entirely by whether `VITE_API_BASE_URL`
 * is set at *build* time (Vite inlines it into the bundle -- changing it on
 * Vercel needs a redeploy, not just an env-var edit):
 *
 *  - **unset (default)** -- every request stays a same-origin relative path
 *    (`/api/kpis`). Locally that hits vite.config.ts's dev proxy; on Vercel it
 *    hits vercel.json's `/api/:path*` rewrite, which proxies to the Render
 *    backend. Same-origin means no CORS preflight and no backend change.
 *  - **set to an absolute origin** (e.g. `https://citimart3-store-backend.onrender.com`)
 *    -- the browser calls Render directly, skipping Vercel's proxy hop. Faster
 *    and immune to the platform's proxy response-size/timeout limits (the
 *    forecast `/compute` endpoints and the PDF/XLSX report exports are the ones
 *    that can bump into those), but the backend must then allow this origin via
 *    `CORS_ALLOW_ORIGINS` (see backend/config/env.py).
 *
 * Auth is a bearer token in a header, never a cookie, so neither mode needs
 * `credentials: "include"` -- which is why the direct mode can stay on a
 * simple non-credentialed CORS policy.
 */

// Trailing slashes are stripped so `apiUrl("/api/kpis")` can't produce "//api".
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

/** Resolves an absolute-from-root API path (always starting "/api/") against
 * the configured base. Returns it unchanged in same-origin mode. */
export function apiUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}
