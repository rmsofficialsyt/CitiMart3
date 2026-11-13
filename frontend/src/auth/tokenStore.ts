// The single seam through which every fetch layer (api/client.ts,
// api/reportClient.ts) picks up the bearer token -- and, via authFetch(),
// silently renews it.
//
// AuthProvider owns the session and pushes the access token here on every
// change, and registers the refresh routine. The token lives only in module
// memory (never localStorage -- AUTH-05); after a page reload AuthProvider
// re-derives it from the HttpOnly refresh cookie.
//
// Access tokens are short-lived (~15 min). When a request comes back 401,
// authFetch() runs ONE refresh -- shared by every request that failed at the
// same moment (single-flight), since refresh tokens rotate and a second
// concurrent refresh would present an already-consumed token -- then retries
// the request once with the new token.

let _token: string | null = null;
let _onUnauthorized: (() => void) | null = null;
let _refresh: (() => Promise<boolean>) | null = null;
let _inflight: Promise<boolean> | null = null;

export function setAuthToken(token: string | null): void {
  _token = token;
}

export function getAuthToken(): string | null {
  return _token;
}

export function authHeaders(): Record<string, string> {
  return _token ? { Authorization: `Bearer ${_token}` } : {};
}

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  _onUnauthorized = fn;
}

export function setRefreshHandler(fn: (() => Promise<boolean>) | null): void {
  _refresh = fn;
}

/** Runs the registered refresh at most once at a time; concurrent callers
 * share the same promise. Resolves true if a new access token was applied. */
export function refreshSession(): Promise<boolean> {
  if (!_refresh) return Promise.resolve(false);
  if (!_inflight) {
    _inflight = _refresh()
      .catch(() => false)
      .finally(() => {
        _inflight = null;
      });
  }
  return _inflight;
}

/** fetch() with the bearer token attached, plus one transparent
 * refresh-and-retry on 401. A 401 that survives the retry is returned to
 * the caller as-is (the fetch layers then call handleUnauthorized). */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const send = () =>
    fetch(input, {
      ...init,
      headers: { ...((init.headers as Record<string, string> | undefined) ?? {}), ...authHeaders() },
    });
  const res = await send();
  if (res.status !== 401 || !_token) return res;
  return (await refreshSession()) ? send() : res;
}

// Called by the fetch layers when a request is still 401 after the refresh
// attempt -- the session is gone, so drop it and bounce to /login.
export function handleUnauthorized(): void {
  _token = null;
  _onUnauthorized?.();
}
