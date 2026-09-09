// The single seam through which every fetch layer (api/client.ts,
// api/forecastClient.ts, api/reportClient.ts) picks up the bearer token.
// AuthProvider owns the token and pushes it here on every session change, so
// the non-React client modules never need it prop-drilled in.

let _token: string | null = null;
let _onUnauthorized: (() => void) | null = null;

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

// Called by the fetch layers when a request comes back 401 -- the token is
// stale/invalid, so drop the session and bounce to /login.
export function handleUnauthorized(): void {
  _token = null;
  _onUnauthorized?.();
}
