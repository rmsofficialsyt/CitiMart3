import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { SlidersHorizontal } from "lucide-react";

import { api } from "@/api/client";
import type { AdvisorStrings } from "@/lib/advisorTranslations";
import { fmtCurrencyOrZero, fmtPercentOrZero } from "@/lib/format";
import type { AdvisorWhatIfClose } from "@/lib/types";

type Levers = { conversion_pp: number; atv_delta: number; footfall_pct: number };
const ZERO: Levers = { conversion_pp: 0, atv_delta: 0, footfall_pct: 0 };

// Slider ranges stay inside the backend's LIMITS (src/advisor/whatif.py).
const SLIDERS: { key: keyof Levers; min: number; max: number; step: number; label: (s: AdvisorStrings) => string; unit: string }[] = [
  { key: "conversion_pp", min: -20, max: 20, step: 1, label: (s) => s.whatIfConv, unit: " pp" },
  { key: "atv_delta", min: -500, max: 1000, step: 50, label: (s) => s.whatIfAtv, unit: "" },
  { key: "footfall_pct", min: -50, max: 50, step: 5, label: (s) => s.whatIfFootfall, unit: "%" },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function CloseRow({ label, c, s }: { label: string; c: AdvisorWhatIfClose | null; s: AdvisorStrings }) {
  const fmt = (v: number | null | undefined) => (v == null ? "—" : fmtCurrencyOrZero(v));
  const pct = (v: number | null | undefined) => (v == null ? "" : ` (${fmtPercentOrZero(v)})`);
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">
        <span className="text-muted-foreground">{s.base}: {fmt(c?.base_close)}{pct(c?.base_achievement_pct)}</span>
        {"  →  "}
        <strong className="text-foreground">{s.scenario}: {fmt(c?.scenario_close)}{pct(c?.scenario_achievement_pct)}</strong>
      </span>
    </div>
  );
}

/** Conversion / ATV / footfall levers -> projected day & month close (backend-computed). */
export function AdvisorWhatIf({ storeCode, date, s }: { storeCode: string; date: string; s: AdvisorStrings }) {
  const [levers, setLevers] = useState<Levers>(ZERO);
  const debounced = useDebounced(levers, 400);
  const { data } = useQuery({
    queryKey: ["daily-live", storeCode, date, "whatif", debounced],
    queryFn: () => api.advisorWhatIf(storeCode, date, debounced),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="rounded-xl border border-border/80 bg-background/60 p-3.5 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wide text-foreground">{s.whatIf}</span>
        </div>
        <button
          type="button"
          onClick={() => setLevers(ZERO)}
          className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {s.reset}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {SLIDERS.map((sl) => (
          <label key={sl.key} className="text-[11px] text-muted-foreground">
            <span className="flex justify-between">
              <span>{sl.label(s)}</span>
              <span className="font-mono text-foreground">
                {levers[sl.key] > 0 ? "+" : ""}
                {sl.key === "atv_delta" ? fmtCurrencyOrZero(levers[sl.key]) : levers[sl.key]}
                {sl.unit}
              </span>
            </span>
            <input
              type="range"
              min={sl.min}
              max={sl.max}
              step={sl.step}
              value={levers[sl.key]}
              onChange={(e) => setLevers((prev) => ({ ...prev, [sl.key]: Number(e.target.value) }))}
              className="mt-1 w-full accent-indigo-500 cursor-pointer"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {data && data.available && data.day ? (
          <>
            <CloseRow label={s.dayClose} c={data.day} s={s} />
            <CloseRow label={s.monthClose} c={data.month} s={s} />
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">{s.whatIfUnavailable}</p>
        )}
      </div>
    </div>
  );
}
