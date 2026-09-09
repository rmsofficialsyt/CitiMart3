import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { type Role, type StoreCode } from "@/lib/authUsers";
import { apiUrl } from "@/lib/apiBase";
import { setAuthToken, setUnauthorizedHandler } from "@/auth/tokenStore";

export interface AuthUser {
  username: string;
  role: Role;
  storeCode: StoreCode | null;
}

interface AuthContextShape {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextShape | null>(null);

const LS_KEY = "citimart.auth";

interface StoredSession {
  access_token: string;
  expires_at: number; // epoch seconds
}

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
  };
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.access_token || parsed.expires_at * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(LS_KEY, JSON.stringify(session));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* private mode / storage disabled -- session just won't persist */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const apply = useCallback((nextToken: string | null) => {
    setToken(nextToken);
    setAuthToken(nextToken);
    setUser(nextToken ? userFromToken(nextToken) : null);
  }, []);

  // Bootstrap the session on first mount from the stored JWT.
  useEffect(() => {
    mounted.current = true;
    const stored = readStored();
    if (mounted.current) {
      apply(stored?.access_token ?? null);
      setLoading(false);
    }
    return () => {
      mounted.current = false;
    };
  }, [apply]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? "Invalid username or password.");
      }
      const body = (await res.json()) as { access_token: string; expires_in: number };
      writeStored({ access_token: body.access_token, expires_at: Math.floor(Date.now() / 1000) + body.expires_in });
      apply(body.access_token);
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    writeStored(null);
    apply(null);
  }, [apply]);

  // Let the fetch layers bounce us out on a 401.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      writeStored(null);
      apply(null);
    });
    return () => setUnauthorizedHandler(null);
  }, [apply]);

  const value = useMemo<AuthContextShape>(
    () => ({ user, token, loading, signIn, signOut }),
    [user, token, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextShape {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
