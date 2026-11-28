import { authFetch, handleUnauthorized } from "@/auth/tokenStore";
import { apiUrl } from "@/lib/apiBase";

/** Daily Operations has exactly one export: the per-store report at
 * GET /api/daily/report, assembled entirely on the backend from the live
 * MongoDB logs (src/daily_report.py).
 *
 * The Historical Analytics side of this file -- filtersSummaryText,
 * buildReportBlocks, downloadReport and the whole frontend-assembled block
 * model (lib/reportTypes.ts, lib/reportManifests.ts, ReportBuilder.tsx) --
 * moved to the Analytics & Forecasting sub-project along with the tabs it
 * exported. Nothing here assembles blocks in the browser. */

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // Non-JSON error body (a proxy timeout page, say) -- fall through to the
    // status line rather than masking the failure.
  }
  return `${res.status} ${res.statusText}`;
}

async function triggerDownload(res: Response, fallbackName: string): Promise<void> {
  const blob = await res.blob();
  // The server-supplied filename carries the store and timestamp; reading it
  // needs Content-Disposition in the backend's CORS expose_headers when the
  // SPA calls Render directly (VITE_API_BASE_URL mode) -- see app.py.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  // Quoted or bare: the requisition export sends `filename=CITIMART_...xlsx`.
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Admin network morning brief / evening debrief as a PDF
 * (GET /api/advisor/brief/pdf, backend src/advisor/brief_report.py). */
export async function downloadAdvisorBrief(kind: "morning" | "midday" | "evening"): Promise<void> {
  const res = await authFetch(apiUrl(`/api/advisor/brief/pdf?${new URLSearchParams({ kind })}`));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(await errorMessage(res));
  }
  await triggerDownload(res, `citimart-${kind}-brief.pdf`);
}

/** Requisition slips as .xlsx (GET /api/daily/requisitions/export/xlsx).
 * Must go through authFetch: the old plain `<a href download>` link sent no
 * bearer token, so every click got a 401 instead of a file. */
export async function downloadRequisitionsXlsx(params: {
  store_code?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  search?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const qs = q.toString();
  const res = await authFetch(apiUrl(`/api/daily/requisitions/export/xlsx${qs ? `?${qs}` : ""}`));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(await errorMessage(res));
  }
  await triggerDownload(res, "citimart-requisitions.xlsx");
}

/** Per-store Daily Operations export (GET /api/daily/report). `start`/`end`
 * are the optional inclusive date window (both equal = a single day);
 * omitting them keeps the default "every recorded date" export. */
export async function downloadDailyReport(
  store: string,
  format: "xlsx" | "pdf",
  range?: { start?: string; end?: string },
): Promise<void> {
  const params = new URLSearchParams({ store, format });
  if (range?.start) params.set("start", range.start);
  if (range?.end) params.set("end", range.end);

  const res = await authFetch(apiUrl(`/api/daily/report?${params}`));
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    throw new Error(await errorMessage(res));
  }
  await triggerDownload(res, `daily-report.${format}`);
}
