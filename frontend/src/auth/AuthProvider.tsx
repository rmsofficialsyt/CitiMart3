import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { type Role, type StoreCode } from "@/lib/authUsers";
import { API_BASE_URL, apiUrl } from "@/lib/apiBase";
import { refreshSession, setAuthToken, setRefreshHandler, setUnauthorizedHandler } from "@/auth/tokenStore";

export interface AuthUser {
  username: string;
  role: Role;
  storeCode: StoreCode | null;
  switchedFrom?: string | null;
}

interface AuthContextShape {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  isSwitchedFromAdmin: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  switchAccount: (targetUsername?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Force a token refresh now (normally automatic). */
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextShape | null>(null);

// Pre-session-registry builds kept the 12h access token here. Tokens no
// longer touch storage (AUTH-05); the key is only cleared on load.
const LEGACY_LS_KEY = "citimart.auth";

/** Shape of /api/auth/login, /refresh and /switch-account responses. */
interface SessionResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

// Session model: a short-lived access token in memory + a rotating refresh
// token in an HttpOnly cookie (path /api/auth) the browser sends on its own.
// That cookie only flows in the default same-origin mode (vite proxy /
// Vercel rewrite). In direct cross-origin mode (VITE_API_BASE_URL set) it
// doesn't, so the refresh token from the response body is held in memory
// instead -- sessions then survive token expiry but not a page reload.
const DIRECT_MODE = Boolean(API_BASE_URL);
const AUTH_CREDENTIALS: RequestCredentials = "same-origin";

function decodeClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function userFromToken(token: string): AuthUser | null {
  const claims = decodeClaims(token);
  const role = claims?.role as Role | undefined;
  if (role !== "admin" && role !== "manager") return null;
  return {
    username: (claims?.username as string) ?? "",
    role,
    storeCode: role === "manager" ? ((claims?.store_code as StoreCode) ?? null) : null,
    switchedFrom: (claims?.switched_from as string) ?? null,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTokenRef = useRef<string | null>(null);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((nextToken: string | null) => {
    setToken(nextToken);
    setAuthToken(nextToken);
    setUser(nextToken ? userFromToken(nextToken) : null);
  }, []);

  const clearSession = useCallback(() => {
    if (renewTimer.current) clearTimeout(renewTimer.current);
    renewTimer.current = null;
    refreshTokenRef.current = null;
    apply(null);
  }, [apply]);

  // Install a session from any auth response, and schedule a proactive
  // renewal a minute before the access token expires so an active user
  // rarely sees the 401 -> refresh -> retry path at all.
  const install = useCallback(
    (body: SessionResponse) => {
      if (DIRECT_MODE && body.refresh_token) refreshTokenRef.current = body.refresh_token;
      apply(body.access_token);
      if (renewTimer.current) clearTimeout(renewTimer.current);
      const delayMs = Math.max(30, body.expires_in - 60) * 1000;
      renewTimer.current = setTimeout(() => void refreshSession(), delayMs);
    },
    [apply],
  );

  // The one refresh routine; tokenStore.refreshSession() single-flights it.
  const doRefresh = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(apiUrl("/api/auth/refresh"), {
        method: "POST",
        credentials: AUTH_CREDENTIALS,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refreshTokenRef.current ? { refresh_token: refreshTokenRef.current } : {}),
      }).catch(() => null);
      if (res?.ok) {
        install((await res.json()) as SessionResponse);
        return true;
      }
      // 409: another tab rotated the shared cookie a moment ago; the browser
      // now holds the new one, so retry once.
      if (res?.status === 409 && attempt === 0) {
        await sleep(300);
        continue;
      }
      return false;
    }
    return false;
  }, [install]);

  useEffect(() => {
    setRefreshHandler(doRefresh);
    return () => setRefreshHandler(null);
  }, [doRefresh]);

  // Bootstrap: no token is persisted, so a reload restores the session from
  // the HttpOnly refresh cookie (or lands on /login if there is none).
  useEffect(() => {
    let cancelled = false;
    try {
      localStorage.removeItem(LEGACY_LS_KEY);
    } catch {
      /* storage disabled -- nothing to clean */
    }
    void refreshSession().then((ok) => {
      if (cancelled) return;
      if (!ok) apply(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  useEffect(
    () => () => {
      if (renewTimer.current) clearTimeout(renewTimer.current);
    },
    [],
  );

  // Derived directly from the cryptographic JWT claims in the user object
  const isSwitchedFromAdmin = Boolean(user?.switchedFrom);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        credentials: AUTH_CREDENTIALS,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? "Invalid username or password.");
      }
      install((await res.json()) as SessionResponse);
    },
    [install],
  );

  const switchAccount = useCallback(
    async (targetUsername?: string) => {
      const payload = targetUsername ? { username: targetUsername } : {};
      const res = await fetch(apiUrl("/api/auth/switch-account"), {
        method: "POST",
        credentials: AUTH_CREDENTIALS,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? "Failed to switch account.");
      }
      install((await res.json()) as SessionResponse);
    },
    [install, token],
  );

  const signOut = useCallback(async () => {
    // Server-side revocation first (AUTH-05); clear locally regardless of
    // whether the network call succeeds.
    try {
      await fetch(apiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: AUTH_CREDENTIALS,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(refreshTokenRef.current ? { refresh_token: refreshTokenRef.current } : {}),
      });
    } catch {
      /* offline -- the session still expires server-side */
    }
    clearSession();
  }, [clearSession, token]);

  // Let the fetch layers bounce us out on an unrecoverable 401.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const value = useMemo<AuthContextShape>(
    () => ({ user, token, loading, isSwitchedFromAdmin, signIn, switchAccount, signOut, refreshSession }),
    [user, token, loading, isSwitchedFromAdmin, signIn, switchAccount, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextShape {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
