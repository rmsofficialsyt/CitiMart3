// URL scheme for the in-app views: /app?store=&view=&date=&chat=
// Mirrored by backend/src/chat/links.py::app_href (the Co-Pilot's link chips).
// A URL only *selects* a view: App.tsx still forces a manager onto their own
// store and downgrades role-restricted views, and every API re-checks access.
import type { DailyStoreSel, DailyView } from "@/components/NavigationSidebar";
import { DAILY_STORE_ID_BY_CODE, type StoreCode } from "@/lib/authUsers";

export const DAILY_VIEWS: readonly DailyView[] = [
  "dashboard", "manual", "target", "history", "requisition", "stocks", "staff",
];
const STORE_SELS: readonly DailyStoreSel[] = ["overall", "nm", "hb", "chw"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isDailyView(v: string | null): v is DailyView {
  return !!v && (DAILY_VIEWS as readonly string[]).includes(v);
}

export function isStoreSel(v: string | null): v is DailyStoreSel {
  return !!v && (STORE_SELS as readonly string[]).includes(v);
}

export function isIsoDate(v: string | null): v is string {
  return !!v && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));
}

/** "NM" -> "nm", "ALL" -> "overall"; unknown codes -> undefined. */
export function storeSelForCode(code: string | undefined | null): DailyStoreSel | undefined {
  const c = (code || "").trim().toUpperCase();
  if (c === "ALL") return "overall";
  return DAILY_STORE_ID_BY_CODE[c as StoreCode];
}

export function appHref(opts: { store?: DailyStoreSel; view?: DailyView; date?: string; chat?: string }): string {
  const p = new URLSearchParams();
  if (opts.store) p.set("store", opts.store);
  if (opts.view) p.set("view", opts.view);
  if (opts.date) p.set("date", opts.date);
  if (opts.chat) p.set("chat", opts.chat);
  const qs = p.toString();
  return qs ? `/app?${qs}` : "/app";
}

/** True for a same-origin in-app link ("/app" or "/app?…"). */
export function isAppHref(href: string | undefined | null): href is string {
  return !!href && (href === "/app" || href.startsWith("/app?"));
}

/** True for an absolute http(s) URL. */
export function isHttpUrl(href: string | undefined | null): href is string {
  if (!href) return false;
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
