import { authFetch, handleUnauthorized } from "@/auth/tokenStore";
import { apiUrl } from "@/lib/apiBase";
import { toSearchParams } from "@/lib/filterParams";
import type {
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
} from "@/lib/types";

export interface DashboardMeta {
  active_stores: string[];
  store_names: string[];
  /** Daily Operations has no historical workbook, so this is the live day
   * rather than a dataset coverage range (api/routes_meta.py). */
  date_range: string;
  last_refresh: string;
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
    conversation_history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    store_code?: string;
    date_str?: string;
    language?: "en" | "hi" | "bn";
  }) =>
    postJSON<{
      reply: string;
      engine: string;
      store: string;
      date: string;
    }>("/api/daily/chat", payload),

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

  getRequisitionExportUrl: (params?: {
    store_code?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    search?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.store_code) q.set("store_code", params.store_code);
    if (params?.start_date) q.set("start_date", params.start_date);
    if (params?.end_date) q.set("end_date", params.end_date);
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return apiUrl(qs ? `/api/daily/requisitions/export/xlsx?${qs}` : "/api/daily/requisitions/export/xlsx");
  },

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

  updateStaffMember: (staffId: string, storeCode: string, payload: any) =>
    putJSON<{ status: string; staff: any }>(`/api/daily/staff/members/${staffId}?store_code=${storeCode}`, payload),

  getDailyAttendance: (storeCode: string, date: string) =>
    getJSON<{ store_code: string; date: string; total_active_staff: number; logged_count: number; records: any[] }>(
      `/api/daily/staff/attendance?store_code=${storeCode}&date=${date}`
    ),

  saveBatchAttendance: (payload: { store_code: string; date: string; records: any[] }) =>
    postJSON<{ status: string; saved_count: number; records: any[] }>("/api/daily/staff/attendance/batch", payload),
};
