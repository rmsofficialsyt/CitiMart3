import { authFetch, handleUnauthorized } from "@/auth/tokenStore";
import { apiUrl } from "@/lib/apiBase";
import { toSearchParams } from "@/lib/filterParams";
import type {
  AdvisorBrief,
  AdvisorBriefKind,
  AdvisorChecklistItem,
  AdvisorExplain,
  AdvisorReplan,
  AdvisorResponse,
  AdvisorWhatIf,
  BillEntry,
  BillLogResponse,
  ChartFigure,
  DailyLiveSnapshot,
  DailyOverallSnapshot,
  FilterState,
  FootfallEntry,
  FootfallLogResponse,
  HistoryDateSummary,
  HistoryDetailsResponse,
  HistoryRangeResponse,
  KpiOverrideResult,
  KpiThresholdsResponse,
  LandingHeroResponse,
  NobEntry,
  NobLogResponse,
  OperationsLogResponse,
  OverridableDailyKpi,
  SaveEntryPayload,
  SaveEntryResult,
  StoreTargetEntry,
  StoreTargetsResponse,
  TargetAdjustmentAlert,
  Directive,
  DirectivesSummaryResponse,
  CreateDirectivePayload,
  UpdateDirectivePayload,
  ChatLink,
  ChatUsageSummary,
  TurnLimits,
  TurnUsage,
} from "@/lib/types";

export interface DashboardMeta {
  active_stores: string[];
  store_names: string[];
  /** Daily Operations has no historical workbook, so this is the live day
   * rather than a dataset coverage range (api/routes_meta.py). */
  date_range: string;
  last_refresh: string;
}

export interface SystemStatus {
  database: {
    status: "up" | "down";
    latency_ms: number | null;
    database_name: string;
    pool: {
      min_size: number;
      max_size: number;
    };
    error: string | null;
  };
  cache: {
    status: "up" | "disabled" | "down";
    latency_ms: number | null;
    mode: "redis" | "in-process";
  };
  server: {
    status: "up";
    started_at: string;
    uptime_seconds: number;
    checked_at: string;
  };
}

// FastAPI's HTTPException responses are {"detail": "..."} -- e.g. the clear
// "MONGODB_URI is not set" a misconfigured deployment returns. Surface that
// instead of a bare status code so toasts (and anything else reading
// error.message) tell the user what actually went wrong.
async function errorMessage(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
      return body.detail;
    }
  } catch {
    // response body wasn't JSON -- fall through to the generic message
  }
  return `${res.status} ${res.statusText}`;
}

// A 401 means the session is stale/absent -- clear it and bounce to /login
// (AuthProvider wired the handler) before surfacing the error to the caller.
function checkAuth(res: Response): void {
  if (res.status === 401) handleUnauthorized();
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await authFetch(apiUrl(url));
  if (!res.ok) {
    checkAuth(res);
    throw new Error(await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await authFetch(apiUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    checkAuth(res);
    throw new Error(await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

async function putJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await authFetch(apiUrl(url), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    checkAuth(res);
    throw new Error(await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

async function deleteJSON<T>(url: string): Promise<T> {
  const res = await authFetch(apiUrl(url), { method: "DELETE" });
  if (!res.ok) {
    checkAuth(res);
    throw new Error(await errorMessage(res));
  }
  return res.json() as Promise<T>;
}

export const api = {
  systemStatus: async (): Promise<SystemStatus & { api_roundtrip_ms: number }> => {
    const t0 = performance.now();
    const data = await getJSON<SystemStatus>("/api/meta/status");
    return { ...data, api_roundtrip_ms: Math.round(performance.now() - t0) };
  },

  advisor: (store: string, date: string) =>
    getJSON<AdvisorResponse>(`/api/advisor?${new URLSearchParams({ store, date })}`),

  setAdvisorAction: (body: { store: string; date: string; action_key: string; done: boolean }) =>
    putJSON<AdvisorChecklistItem>("/api/advisor/actions", body),

  advisorExplain: (store: string, date: string) =>
    getJSON<AdvisorExplain>(`/api/advisor/explain?${new URLSearchParams({ store, date })}`),

  advisorWhatIf: (store: string, date: string, levers: { conversion_pp: number; atv_delta: number; footfall_pct: number }) =>
    getJSON<AdvisorWhatIf>(
      `/api/advisor/whatif?${new URLSearchParams({
        store,
        date,
        conversion_pp: String(levers.conversion_pp),
        atv_delta: String(levers.atv_delta),
        footfall_pct: String(levers.footfall_pct),
      })}`,
    ),

  advisorBrief: (kind: AdvisorBriefKind) =>
    getJSON<AdvisorBrief>(`/api/advisor/brief?${new URLSearchParams({ kind })}`),

  advisorReplan: (store: string, month: string) =>
    getJSON<AdvisorReplan>(`/api/advisor/replan?${new URLSearchParams({ store, month })}`),

  kpiThresholds: () => getJSON<KpiThresholdsResponse>("/api/kpi-thresholds"),

  putKpiThresholds: (patch: Record<string, Record<string, number>>) =>
    putJSON<KpiThresholdsResponse>("/api/kpi-thresholds", patch),

  resetKpiThreshold: (kpi?: string) =>
    deleteJSON<KpiThresholdsResponse>(`/api/kpi-thresholds${kpi ? `?${new URLSearchParams({ kpi })}` : ""}`),

  chart: (chartId: string, state: FilterState, extra: Record<string, string | number | undefined> = {}) =>
    getJSON<ChartFigure>(`/api/charts/${chartId}?${toSearchParams(state, extra)}`),

  meta: () => getJSON<DashboardMeta>("/api/meta"),

  dailyLive: (
    store: string,
    date: string,
    params?: { recovery_window?: number; carry_forward_policy?: string; distribution_mode?: string },
  ) => {
    const q = new URLSearchParams({ store, date });
    if (params?.recovery_window != null) q.set("recovery_window", String(params.recovery_window));
    if (params?.carry_forward_policy != null) q.set("carry_forward_policy", params.carry_forward_policy);
    if (params?.distribution_mode != null) q.set("distribution_mode", params.distribution_mode);
    return getJSON<DailyLiveSnapshot>(`/api/daily/live?${q}`);
  },

  dailyLiveOverall: (
    date: string,
    params?: { recovery_window?: number; carry_forward_policy?: string; distribution_mode?: string },
  ) => {
    const q = new URLSearchParams({ date });
    if (params?.recovery_window != null) q.set("recovery_window", String(params.recovery_window));
    if (params?.carry_forward_policy != null) q.set("carry_forward_policy", params.carry_forward_policy);
    if (params?.distribution_mode != null) q.set("distribution_mode", params.distribution_mode);
    return getJSON<DailyOverallSnapshot>(`/api/daily/live/overall?${q}`);
  },

  operationsLog: (store: string, date: string) =>
    getJSON<OperationsLogResponse>(`/api/daily/operations-log?${new URLSearchParams({ store, date })}`),

  billLog: (store: string, date: string) =>
    getJSON<BillLogResponse>(`/api/daily/bill-log?${new URLSearchParams({ store, date })}`),

  addBillEntry: (payload: { store: string; date: string; bill_time: string; net_amount: number; bill_quantity: number }) =>
    postJSON<BillEntry>("/api/daily/bill-log", payload),

  updateBillEntry: (payload: { store: string; row: number; bill_time: string; net_amount: number; bill_quantity: number }) =>
    putJSON<BillEntry>("/api/daily/bill-log", payload),

  deleteBillEntry: (store: string, row: number) =>
    deleteJSON<{ deleted: boolean }>(`/api/daily/bill-log?${new URLSearchParams({ store, row: String(row) })}`),

  footfallLog: (store: string, date: string) =>
    getJSON<FootfallLogResponse>(`/api/daily/footfall-log?${new URLSearchParams({ store, date })}`),

  addFootfallEntry: (payload: { store: string; date: string; time: string; footfall: number }) =>
    postJSON<FootfallEntry>("/api/daily/footfall-log", payload),

  updateFootfallEntry: (payload: { store: string; row: number; time: string; footfall: number }) =>
    putJSON<FootfallEntry>("/api/daily/footfall-log", payload),

  deleteFootfallEntry: (store: string, row: number) =>
    deleteJSON<{ deleted: boolean }>(`/api/daily/footfall-log?${new URLSearchParams({ store, row: String(row) })}`),

  nobLog: (store: string, date: string) =>
    getJSON<NobLogResponse>(`/api/daily/nob-log?${new URLSearchParams({ store, date })}`),

  addNobEntry: (payload: { store: string; date: string; time: string; nob: number }) =>
    postJSON<NobEntry>("/api/daily/nob-log", payload),

  updateNobEntry: (payload: { store: string; row: number; time: string; nob: number }) =>
    putJSON<NobEntry>("/api/daily/nob-log", payload),

  deleteNobEntry: (store: string, row: number) =>
    deleteJSON<{ deleted: boolean }>(`/api/daily/nob-log?${new URLSearchParams({ store, row: String(row) })}`),

  saveTargetEntry: (payload: SaveEntryPayload) => postJSON<SaveEntryResult>("/api/daily/save-entry", payload),

  setKpiOverride: (payload: { store: string; date: string; field: OverridableDailyKpi; value: number }) =>
    putJSON<KpiOverrideResult>("/api/daily/kpi-override", payload),

  clearKpiOverride: (store: string, date: string, field: OverridableDailyKpi) =>
    deleteJSON<KpiOverrideResult>(`/api/daily/kpi-override?${new URLSearchParams({ store, date, field })}`),

  // Admin-only "Sales Targets" page.
  storeTargets: (store: string) =>
    getJSON<StoreTargetsResponse>(`/api/targets?${new URLSearchParams({ store })}`),

  putStoreTarget: (payload: { store: string; date: string; sales_target: number | null; prev_year_net_sales?: number | null }) =>
    putJSON<StoreTargetEntry & { store: string }>("/api/targets", payload),

  bulkStoreTargets: (payload: { store: string; rows: { date: string; sales_target: number | null; prev_year_net_sales?: number | null }[] }) =>
    postJSON<{ store: string; applied: number; entries: StoreTargetEntry[] }>("/api/targets/bulk", payload),

  uploadStoreTargets: async (store: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    // No Content-Type header -- the browser sets the multipart boundary.
    const res = await authFetch(apiUrl(`/api/targets/upload?${new URLSearchParams({ store })}`), {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      checkAuth(res);
      throw new Error(await errorMessage(res));
    }
    return res.json() as Promise<{ store: string; applied: number; entries: StoreTargetEntry[] }>;
  },

  deleteStoreTarget: (store: string, date: string) =>
    deleteJSON<{ store: string; date: string; cleared: boolean }>(
      `/api/targets?${new URLSearchParams({ store, date })}`,
    ),

  landingHero: (date?: string) =>
    getJSON<LandingHeroResponse>(date ? `/api/daily/landing-hero?${new URLSearchParams({ date })}` : "/api/daily/landing-hero"),

  targetAdjustment: (
    store: string,
    date: string,
    params?: { recovery_window?: number; carry_forward_policy?: string; distribution_mode?: string },
  ) => {
    const q = new URLSearchParams({ store, date });
    if (params?.recovery_window != null) q.set("recovery_window", String(params.recovery_window));
    if (params?.carry_forward_policy != null) q.set("carry_forward_policy", params.carry_forward_policy);
    if (params?.distribution_mode != null) q.set("distribution_mode", params.distribution_mode);
    return getJSON<TargetAdjustmentAlert | null>(`/api/daily/target-adjustment?${q}`);
  },

  historyDates: (store: string = "ALL") =>
    getJSON<HistoryDateSummary[]>(`/api/daily/history/dates?${new URLSearchParams({ store })}`),

  historyDetails: (store: string, date: string) =>
    getJSON<HistoryDetailsResponse>(`/api/daily/history/details?${new URLSearchParams({ store, date })}`),

  historyRange: (store: string, startDate: string, endDate: string) =>
    getJSON<HistoryRangeResponse>(
      `/api/daily/history/range?${new URLSearchParams({ store, start_date: startDate, end_date: endDate })}`,
    ),

  directives: () => getJSON<DirectivesSummaryResponse>("/api/daily/directives"),

  createDirective: (payload: CreateDirectivePayload) =>
    postJSON<{ status: string; directive: Directive }>("/api/daily/directives", payload),

  updateDirective: (directiveId: number, payload: UpdateDirectivePayload) =>
    putJSON<{ status: string; directive: Directive }>(`/api/daily/directives/${directiveId}`, payload),

  deleteDirective: (directiveId: number) =>
    deleteJSON<{ status: string; deleted_id: number }>(`/api/daily/directives/${directiveId}`),

  acknowledgeDirective: (directiveId: number) =>
    postJSON<{ status: string; directive: Directive }>(`/api/daily/directives/${directiveId}/acknowledge`, {}),

  sendChatMessage: (payload: {
    message: string;
    session_id?: string | null;
    store_code?: string;
    target_date?: string;
    language?: string;
    conversation_history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  }) =>
    postJSON<{
      session_id?: string;
      reply: string;
      subagents_executed?: string[];
      tools_executed?: string[];
      engine?: string;
      store_code?: string;
      target_date?: string;
      links?: ChatLink[];
      suggestions?: string[];
      response_tier?: string;
      usage?: TurnUsage | null;
      limits?: TurnLimits | null;
    }>("/api/daily/chat", payload),

  // Caller's own Gemini token usage (display only, nothing enforced).
  getChatUsage: (sessionId?: string | null) => {
    const qs = sessionId ? `?${new URLSearchParams({ session_id: sessionId })}` : "";
    return getJSON<ChatUsageSummary>(`/api/daily/chat/usage${qs}`);
  },

  // Product Requisitions
  requisitionCategories: () =>
    getJSON<import("@/lib/types").CategoryHierarchyResponse>("/api/daily/requisitions/categories"),

  requisitionsList: (params?: {
    store_code?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    search?: string;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.store_code) q.set("store_code", params.store_code);
    if (params?.start_date) q.set("start_date", params.start_date);
    if (params?.end_date) q.set("end_date", params.end_date);
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return getJSON<import("@/lib/types").RequisitionsListResponse>(qs ? `/api/daily/requisitions?${qs}` : "/api/daily/requisitions");
  },

  createRequisition: (payload: import("@/lib/types").CreateRequisitionPayload) =>
    postJSON<{ status: string; requisition: import("@/lib/types").RequisitionSlip }>("/api/daily/requisitions", payload),

  getRequisition: (reqId: number) =>
    getJSON<{ status: string; requisition: import("@/lib/types").RequisitionSlip }>(`/api/daily/requisitions/${reqId}`),

  updateRequisitionStatus: (reqId: number, payload: import("@/lib/types").UpdateRequisitionStatusPayload) =>
    putJSON<{ status: string; requisition: import("@/lib/types").RequisitionSlip }>(`/api/daily/requisitions/${reqId}/status`, payload),

  deleteRequisition: (reqId: number) =>
    deleteJSON<{ status: string; deleted: boolean }>(`/api/daily/requisitions/${reqId}`),

  // The .xlsx export is api/reportClient.ts::downloadRequisitionsXlsx -- it
  // needs the bearer header, which a plain <a href> link can't send.

  // Stocks Management API
  getStocksSummary: (storeCode?: string) =>
    getJSON<any>(storeCode && storeCode !== "ALL" ? `/api/daily/stocks/summary?store_code=${storeCode}` : "/api/daily/stocks/summary"),

  listInventory: (params?: {
    store_code?: string;
    search?: string;
    division?: string;
    department?: string;
    low_stock_only?: boolean;
    limit?: number;
    skip?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.store_code && params.store_code !== "ALL") q.set("store_code", params.store_code);
    if (params?.search) q.set("search", params.search);
    if (params?.division) q.set("division", params.division);
    if (params?.department) q.set("department", params.department);
    if (params?.low_stock_only) q.set("low_stock_only", "true");
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.skip) q.set("skip", String(params.skip));
    const qs = q.toString();
    return getJSON<any>(qs ? `/api/daily/stocks/inventory?${qs}` : "/api/daily/stocks/inventory");
  },

  recordInwardGRN: (payload: any) =>
    postJSON<{ status: string; recorded_count: number; items: any[] }>("/api/daily/stocks/inward", payload),

  recordStockAdjustment: (payload: any) =>
    postJSON<{ status: string; item: any }>("/api/daily/stocks/adjustment", payload),

  listStockMovements: (storeCode?: string, barcode?: string) => {
    const q = new URLSearchParams();
    if (storeCode && storeCode !== "ALL") q.set("store_code", storeCode);
    if (barcode) q.set("barcode", barcode);
    const qs = q.toString();
    return getJSON<any[]>(qs ? `/api/daily/stocks/movements?${qs}` : "/api/daily/stocks/movements");
  },

  listTransfers: (storeCode?: string, status?: string) => {
    const q = new URLSearchParams();
    if (storeCode && storeCode !== "ALL") q.set("store_code", storeCode);
    if (status) q.set("status", status);
    const qs = q.toString();
    return getJSON<any[]>(qs ? `/api/daily/stocks/transfers?${qs}` : "/api/daily/stocks/transfers");
  },

  createTransfer: (payload: any) =>
    postJSON<{ status: string; transfer: any }>("/api/daily/stocks/transfers", payload),

  dispatchTransfer: (transferId: string) =>
    putJSON<{ status: string; transfer: any }>(`/api/daily/stocks/transfers/${transferId}/dispatch`, {}),

  receiveTransfer: (transferId: string) =>
    putJSON<{ status: string; transfer: any }>(`/api/daily/stocks/transfers/${transferId}/receive`, {}),

  cancelOrRejectTransfer: (transferId: string, reason?: string) =>
    putJSON<{ status: string; transfer: any }>(`/api/daily/stocks/transfers/${transferId}/cancel`, { reason }),

  // Staff Management API
  getStaffSummary: (storeCode?: string, date?: string) => {
    const q = new URLSearchParams();
    if (storeCode && storeCode !== "ALL") q.set("store_code", storeCode);
    if (date) q.set("date", date);
    const qs = q.toString();
    return getJSON<any>(qs ? `/api/daily/staff/summary?${qs}` : "/api/daily/staff/summary");
  },

  listStaff: (params?: { store_code?: string; status?: string; department?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.store_code && params.store_code !== "ALL") q.set("store_code", params.store_code);
    if (params?.status) q.set("status", params.status);
    if (params?.department) q.set("department", params.department);
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return getJSON<{ total: number; items: any[] }>(qs ? `/api/daily/staff/members?${qs}` : "/api/daily/staff/members");
  },

  createStaffMember: (payload: any) =>
    postJSON<{ status: string; staff: any }>("/api/daily/staff/members", payload),

  getStaffMember: (staffId: string, storeCode: string) =>
    getJSON<any>(`/api/daily/staff/members/${staffId}?store_code=${storeCode}`),

  updateStaffMember: (staffId: string, storeCode: string, payload: any) =>
    putJSON<{ status: string; staff: any }>(`/api/daily/staff/members/${staffId}?store_code=${storeCode}`, payload),

  getDailyAttendance: (storeCode: string, date: string) =>
    getJSON<{ store_code: string; date: string; total_active_staff: number; logged_count: number; records: any[] }>(
      `/api/daily/staff/attendance?store_code=${storeCode}&date=${date}`
    ),

  saveBatchAttendance: (payload: { store_code: string; date: string; records: any[] }) =>
    postJSON<{ status: string; saved_count: number; records: any[] }>("/api/daily/staff/attendance/batch", payload),

  listChatSessions: (storeCode?: string) => {
    const qs = storeCode ? `?store_code=${storeCode}` : "";
    return getJSON<{ sessions: any[] }>(`/api/daily/chat/sessions${qs}`);
  },

  getChatSessionHistory: (sessionId: string) =>
    getJSON<{ session_id: string; messages: any[] }>(`/api/daily/chat/sessions/${sessionId}`),

  deleteChatSession: (sessionId: string) =>
    authFetch(apiUrl(`/api/daily/chat/sessions/${sessionId}`), { method: "DELETE" }),

  // Deletes only the caller's OWN conversations (for one store when given),
  // never another user's -- even for an admin.
  clearChatSessions: (storeCode?: string) => {
    const qs = storeCode ? `?store_code=${encodeURIComponent(storeCode)}` : "";
    return deleteJSON<{ status: string; deleted: number }>(`/api/daily/chat/sessions${qs}`);
  },

  // WhatsApp AI Sales Alerts (Admin-only, SPEC-05)
  getWhatsAppAlertConfig: () =>
    getJSON<{
      settings: {
        enabled: boolean;
        language: "en" | "hi" | "bn";
        trading_start_hour: number;
        trading_end_hour: number;
        admin_recipients: string[];
        manager_recipients: Record<string, string[]>;
        schedules: {
          admin: Record<string, boolean>;
          manager: Record<string, boolean>;
        };
        updated_at: string | null;
        updated_by: string | null;
      };
      provider: {
        configured_provider: string;
        active_provider: string;
        meta_ready: boolean;
        twilio_ready: boolean;
        alerts_enabled_env: boolean;
      };
    }>("/api/alerts/whatsapp/config"),

  updateWhatsAppAlertConfig: (payload: {
    enabled: boolean;
    language: "en" | "hi" | "bn";
    trading_start_hour: number;
    trading_end_hour: number;
    admin_recipients: string[];
    manager_recipients: Record<string, string[]>;
    schedules: {
      admin: Record<string, boolean>;
      manager: Record<string, boolean>;
    };
  }) => putJSON<any>("/api/alerts/whatsapp/config", payload),

  triggerWhatsAppAlert: (payload: {
    audience: "admin" | "manager";
    store_code: string;
    alert_type: string;
    date?: string;
    language?: "en" | "hi" | "bn";
    use_ai?: boolean;
    preview_only?: boolean;
  }) => postJSON<any>("/api/alerts/whatsapp/send", payload),

  getWhatsAppAlertLogs: (params?: { audience?: "admin" | "manager"; store_code?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.audience) q.set("audience", params.audience);
    if (params?.store_code) q.set("store_code", params.store_code);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return getJSON<{ logs: any[] }>(qs ? `/api/alerts/whatsapp/logs?${qs}` : "/api/alerts/whatsapp/logs");
  },

  // Notification & Log Handling Agents (SPEC-06)
  listNotifications: (params?: { unread_only?: boolean; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.unread_only) q.set("unread_only", "true");
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return getJSON<{ unread_count: number; items: any[] }>(qs ? `/api/notifications?${qs}` : "/api/notifications");
  },

  markNotificationRead: (notifId: string) =>
    postJSON<{ ok: boolean; notif_id: string }>(`/api/notifications/${notifId}/read`, {}),

  markAllNotificationsRead: () =>
    postJSON<{ ok: boolean; marked_read: number }>("/api/notifications/read-all", {}),

  scanNotifications: () =>
    postJSON<{ created_count: number; created: any[]; errors: string[] }>("/api/notifications/scan", {}),
};
