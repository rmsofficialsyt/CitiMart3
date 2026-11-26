import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchCheck } from "lucide-react";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import type { AdvisorStrings } from "@/lib/advisorTranslations";
import { fmtCurrencyOrZero, fmtPercentOrZero } from "@/lib/format";
import type { AdvisorReason } from "@/lib/types";

function reasonDetail(r: AdvisorReason): string {
  const e = r.evidence;
  const parts: string[] = [];
  if (typeof e.change_pct === "number") parts.push(`${e.change_pct > 0 ? "+" : ""}${e.change_pct.toFixed(1)}%`);
  if (typeof e.slot === "string") parts.push(e.slot);
  if (typeof e.present === "number" && typeof e.usual === "number") parts.push(`${e.present} / ${e.usual.toFixed(1)}`);
  if (typeof e.count === "number") parts.push(String(e.count));
  if (typeof e.label === "string") parts.push(e.label);
  return parts.join(" · ");
}

/** "Why did we miss / beat target?" -- driver attribution from src/advisor/explain.py. */
export function AdvisorExplain({ storeCode, date, s }: { storeCode: string; date: string; s: AdvisorStrings }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError } = useQuery({
    queryKey: ["daily-live", storeCode, date, "explain"],
    queryFn: () => api.advisorExplain(storeCode, date),
    enabled: open,
  });

  return (
    <div className="rounded-xl border border-border/80 bg-background/60 p-3.5 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
            <SearchCheck className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-foreground">{s.explain}</span>
        </div>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs cursor-pointer" onClick={() => setOpen((v) => !v)}>
          {open ? s.hideExplain : s.explainBtn}
        </Button>
      </div>
      {open && (
        <div className="mt-3 text-xs">
          {isError && <p className="text-muted-foreground">{s.explainError}</p>}
          {isFetching && !data && <p className="text-muted-foreground">…</p>}
          {data && (
            <>
              <p className="mb-2 font-semibold text-foreground">
                {s.verdict[data.review.verdict]}
                {data.review.achievement_pct != null && ` · ${fmtPercentOrZero(data.review.achievement_pct)}`}
                {data.review.vs_baseline_pct != null && data.review.baseline && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {s.vsUsual(`${data.review.vs_baseline_pct > 0 ? "+" : ""}${data.review.vs_baseline_pct.toFixed(1)}%`, data.review.baseline.days_used)}
                  </span>
                )}
              </p>
              {data.reasons.length ? (
                <ul className="space-y-1">
                  {data.reasons.map((r, i) => (
                    <li key={`${r.id}-${i}`} className="flex flex-wrap justify-between gap-2 border-t border-border/50 pt-1">
                      <span className="text-foreground">{s.reasons[r.id] ?? r.id}</span>
                      <span className="font-mono text-muted-foreground">
                        {r.impact != null && (
                          <strong className={r.impact < 0 ? "text-rose-500" : "text-emerald-500"}>
                            {r.impact < 0 ? "−" : "+"}
                            {fmtCurrencyOrZero(Math.abs(r.impact))}{" "}
                          </strong>
                        )}
                        {reasonDetail(r)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">{s.noReasons}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
