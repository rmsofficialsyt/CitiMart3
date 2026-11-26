import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileDown, Moon, Sun, SunMedium } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { downloadAdvisorBrief } from "@/api/reportClient";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { ADVISOR_STRINGS } from "@/lib/advisorTranslations";
import { fmtCurrencyOrZero, fmtPercentOrZero } from "@/lib/format";
import type { AdvisorBriefKind, AdvisorBriefPace } from "@/lib/types";

const STATUS_TEXT: Record<string, string> = {
  red: "text-rose-500",
  yellow: "text-amber-500",
  green: "text-emerald-500",
};

const PACE_BADGE: Record<AdvisorBriefPace["status"], string> = {
  behind: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  on_pace: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  ahead: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  target_hit: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  no_pace_curve: "bg-muted text-muted-foreground border-border",
  no_target: "bg-muted text-muted-foreground border-border",
  no_data: "bg-muted text-muted-foreground border-border",
};

const KINDS: { kind: AdvisorBriefKind; icon: typeof Sun }[] = [
  { kind: "morning", icon: Sun },
  { kind: "midday", icon: SunMedium },
  { kind: "evening", icon: Moon },
];

/** The brief that fits the time of day: before noon, midday until 6 PM, then evening. */
function defaultKind(): AdvisorBriefKind {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "midday" : "evening";
}

/** Admin-only network brief (GET /api/advisor/brief): morning (yesterday),
 *  midday (today so far vs each store's pace curve), evening debrief (today). */
export function NetworkBrief() {
  const { language } = useLanguage();
  const s = ADVISOR_STRINGS[language];
  const [kind, setKind] = useState<AdvisorBriefKind>(defaultKind);
  const { data, isError } = useQuery({
    queryKey: ["daily-live", "ALL", "brief", kind],
    queryFn: () => api.advisorBrief(kind),
  });
  const download = useMutation({
    mutationFn: () => downloadAdvisorBrief(kind),
    onError: (e) => toast.error(`${s.downloadFailed}: ${(e as Error).message}`),
  });
  const isMidday = data?.kind === "midday";

  return (
    <div className="rounded-2xl border border-indigo-500/25 bg-card/60 p-4 sm:p-5 shadow-sm backdrop-blur-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{s.brief}</h3>
          {data && (
            <p className="text-[11px] text-muted-foreground">
              {isMidday && data.as_of ? s.asOf(data.as_of.slice(11, 16)) : s.reviewOf(data.review_date)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs cursor-pointer"
            disabled={download.isPending}
            onClick={() => download.mutate()}
          >
            <FileDown className="mr-1 h-3.5 w-3.5" />
            {download.isPending ? s.downloadingPdf : s.downloadPdf}
          </Button>
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            {KINDS.map(({ kind: k, icon: Icon }) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 cursor-pointer ${
                  kind === k ? "bg-indigo-500/15 text-indigo-400 font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {s[k]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isError && <p className="text-xs text-muted-foreground">{s.briefError}</p>}
      {data && (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            {s.network}: <strong className="text-foreground font-mono">{fmtCurrencyOrZero(data.network.net_sales)}</strong>
            {data.network.sales_target != null && (
              <>
                {" / "}
                <span className="font-mono">{fmtCurrencyOrZero(data.network.sales_target)}</span>
                {data.network.achievement_pct != null && ` · ${fmtPercentOrZero(data.network.achievement_pct)}`}
              </>
            )}
            {isMidday && data.network.projected_close != null && (
              <>
                {" · "}
                {s.projectedClose}: <strong className="text-foreground font-mono">{fmtCurrencyOrZero(data.network.projected_close)}</strong>
                {data.network.projected_achievement_pct != null && ` (${fmtPercentOrZero(data.network.projected_achievement_pct)})`}
              </>
            )}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {data.stores.map((st) => (
              <div key={st.store} className="rounded-xl border border-border/80 bg-background/60 p-3 text-xs min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="font-bold text-foreground truncate">{st.store_name}</span>
                  <span className={`font-mono font-bold ${st.achievement_status ? STATUS_TEXT[st.achievement_status] : "text-muted-foreground"}`}>
                    {st.achievement_pct != null ? fmtPercentOrZero(st.achievement_pct) : s.verdict[st.verdict]}
                  </span>
                </div>
                <div className="mb-2 font-mono text-muted-foreground">
                  {fmtCurrencyOrZero(st.net_sales)}
                  {st.sales_target != null && ` / ${fmtCurrencyOrZero(st.sales_target)}`}
                </div>
                {st.pace && (
                  <div className="mb-2 space-y-1">
                    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PACE_BADGE[st.pace.status]}`}>
                      {s.pace[st.pace.status]}
                    </span>
                    <div className="text-[11px] text-muted-foreground">
                      {st.pace.expected_achievement_pct != null && s.expectedNow(fmtPercentOrZero(st.pace.expected_achievement_pct))}
                      {st.pace.projected_close != null && (
                        <>
                          {st.pace.expected_achievement_pct != null && " · "}
                          {s.projectedClose}: <span className="font-mono text-foreground">{fmtCurrencyOrZero(st.pace.projected_close)}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {st.drivers.length > 0 && (
                  <ul className="mb-2 space-y-0.5">
                    {st.drivers.map((d) => (
                      <li key={d.driver} className="flex justify-between gap-2">
                        <span className="text-muted-foreground truncate">{s.reasons[`${d.driver}_${d.amount < 0 ? "down" : "up"}`]}</span>
                        <span className={`font-mono shrink-0 ${d.amount < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                          {d.amount < 0 ? "−" : "+"}
                          {fmtCurrencyOrZero(Math.abs(d.amount))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {st.watch_outs.length > 0 && (
                  <div className="text-[11px]">
                    <span className="font-semibold text-foreground">{s.watchOuts}: </span>
                    <span className="text-muted-foreground">
                      {st.watch_outs
                        .map((w) => (w.id === "holiday" && w.evidence.name ? `${s.reasons.holiday} (${w.evidence.name})` : s.reasons[w.id] ?? w.id))
                        .join(", ")}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {isMidday && <p className="mt-2 text-[10px] text-muted-foreground">{s.completedSlotsOnly}</p>}
        </>
      )}
    </div>
  );
}
