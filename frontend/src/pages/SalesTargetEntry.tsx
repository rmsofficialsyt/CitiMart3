import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Upload, Trash2, ArrowDown } from "lucide-react";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STORE_NAME_BY_CODE, type StoreCode } from "@/lib/authUsers";
import {
  fmtCurrency,
  fmtCurrencyOrZero,
  fmtNumberOrZero,
  fmtPercentOrZero,
  todayLocalDate,
} from "@/lib/format";
import type { StoreTargetEntry } from "@/lib/types";

const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" });
const DAY_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });

function monthLabel(month: string): string {
  return MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));
}

/** Every ISO date ("YYYY-MM-DD") in the given "YYYY-MM" month. */
function datesInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function dayName(isoDate: string): string {
  return DAY_LABEL.format(new Date(`${isoDate}T00:00:00Z`));
}

function SalesTargetEntry({ store }: { store: string }) {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => todayLocalDate().slice(0, 7));

  const { data, isLoading } = useQuery({
    queryKey: ["store-targets", store],
    queryFn: () => api.storeTargets(store),
  });

  const existing = useMemo(() => {
    const map = new Map<string, StoreTargetEntry>();
    for (const entry of data?.entries ?? []) map.set(entry.date, entry);
    return map;
  }, [data]);

  const days = useMemo(() => datesInMonth(month), [month]);

  // Editable target & prev year sales amounts per ISO date
  const [targetValues, setTargetValues] = useState<Record<string, string>>({});
  const [prevYearValues, setPrevYearValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const targetSeed: Record<string, string> = {};
    const prevYearSeed: Record<string, string> = {};
    for (const d of days) {
      const ex = existing.get(d);
      targetSeed[d] = ex && ex.sales_target != null ? String(ex.sales_target) : "";
      prevYearSeed[d] = ex && ex.prev_year_net_sales != null ? String(ex.prev_year_net_sales) : "";
    }
    setTargetValues(targetSeed);
    setPrevYearValues(prevYearSeed);
  }, [month, data, days, existing]);

  const savedTargetTotal = days.reduce((sum, d) => {
    const ex = existing.get(d);
    return sum + (ex && ex.sales_target != null ? ex.sales_target : 0);
  }, 0);

  const draftTargetTotal = days.reduce((sum, d) => {
    const n = Number(targetValues[d]);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const savedPrevYearTotal = days.reduce((sum, d) => {
    const ex = existing.get(d);
    return sum + (ex && ex.prev_year_net_sales != null ? ex.prev_year_net_sales : 0);
  }, 0);

  const draftPrevYearTotal = days.reduce((sum, d) => {
    const n = Number(prevYearValues[d]);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows: { date: string; sales_target: number | null; prev_year_net_sales: number | null }[] = [];
      for (const d of days) {
        const rawTarget = (targetValues[d] ?? "").trim();
        const rawPrev = (prevYearValues[d] ?? "").trim();
        const ex = existing.get(d);
        const currentTarget = ex && ex.sales_target != null ? ex.sales_target : null;
        const currentPrev = ex && ex.prev_year_net_sales != null ? ex.prev_year_net_sales : null;

        const targetNum = rawTarget === "" ? null : Number(rawTarget);
        const prevNum = rawPrev === "" ? null : Number(rawPrev);

        if (targetNum !== null && (Number.isNaN(targetNum) || targetNum < 0)) {
          throw new Error(`${d}: Sales Target must be a non-negative number.`);
        }
        if (prevNum !== null && (Number.isNaN(prevNum) || prevNum < 0)) {
          throw new Error(`${d}: Previous Year Net Sales must be a non-negative number.`);
        }

        if (targetNum !== currentTarget || prevNum !== currentPrev) {
          rows.push({ date: d, sales_target: targetNum, prev_year_net_sales: prevNum });
        }
      }
      if (rows.length === 0) return 0;
      await api.bulkStoreTargets({ store, rows });
      return rows.length;
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("No changes to save.");
        return;
      }
      toast.success(`Saved ${count} day${count === 1 ? "" : "s"} for ${monthLabel(month)}.`);
      queryClient.invalidateQueries({ queryKey: ["store-targets", store] });
      queryClient.invalidateQueries({ queryKey: ["daily-live", store] });
    },
    onError: (error) => toast.error(`Save failed: ${(error as Error).message}`),
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const rows = days
        .filter((d) => {
          const ex = existing.get(d);
          return ex && (ex.sales_target != null || ex.prev_year_net_sales != null);
        })
        .map((d) => ({ date: d, sales_target: null, prev_year_net_sales: null }));
      if (rows.length === 0) return 0;
      await api.bulkStoreTargets({ store, rows });
      return rows.length;
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("No saved targets or previous year sales to clear this month.");
        return;
      }
      setTargetValues(Object.fromEntries(days.map((d) => [d, ""])));
      setPrevYearValues(Object.fromEntries(days.map((d) => [d, ""])));
      toast.success(`Cleared ${count} day${count === 1 ? "" : "s"} for ${monthLabel(month)}.`);
      queryClient.invalidateQueries({ queryKey: ["store-targets", store] });
      queryClient.invalidateQueries({ queryKey: ["daily-live", store] });
    },
    onError: (error) => toast.error(`Clear failed: ${(error as Error).message}`),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadStoreTargets(store, file),
    onSuccess: ({ applied }) => {
      toast.success(`Uploaded ${applied} day${applied === 1 ? "" : "s"} of targets & previous year sales.`);
      queryClient.invalidateQueries({ queryKey: ["store-targets", store] });
      queryClient.invalidateQueries({ queryKey: ["daily-live", store] });
    },
    onError: (error) => toast.error(`Upload failed: ${(error as Error).message}`),
  });

  function fillDownTargets() {
    const first = days.map((d) => (targetValues[d] ?? "").trim()).find((v) => v !== "");
    if (!first) {
      toast.error("Enter a Sales Target on the first day, then Fill Down.");
      return;
    }
    setTargetValues((prev) => {
      const next = { ...prev };
      for (const d of days) if ((next[d] ?? "").trim() === "") next[d] = first;
      return next;
    });
    toast.success("Sales Targets filled down across month.");
  }

  function fillDownPrevYear() {
    const first = days.map((d) => (prevYearValues[d] ?? "").trim()).find((v) => v !== "");
    if (!first) {
      toast.error("Enter a Previous Year Net Sales figure on the first day, then Fill Down.");
      return;
    }
    setPrevYearValues((prev) => {
      const next = { ...prev };
      for (const d of days) if ((next[d] ?? "").trim() === "") next[d] = first;
      return next;
    });
    toast.success("Previous Year Net Sales filled down across month.");
  }

  return (
    <div className="space-y-6">
      {/* Top Banner Control Section */}
      <div className="rounded-3xl border border-border bg-card/90 dark:bg-[#18181D]/90 p-5 sm:p-6 shadow-xl backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground tracking-tight sm:text-xl">
                Monthly Sales Target & Comparative Planning
              </h2>
              <span className="rounded-full bg-primary/15 border border-primary/30 px-3 py-0.5 text-xs font-semibold text-primary">
                {STORE_NAME_BY_CODE[store as StoreCode] ?? store}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Active manual data entry for Sales Targets & Previous Year Net Sales with comprehensive store KPI tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Month:</Label>
            <input
              type="month"
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
              value={month}
              onChange={(e) => setMonth(e.target.value || todayLocalDate().slice(0, 7))}
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fillDownTargets}
            disabled={saveMutation.isPending || clearMutation.isPending}
            className="rounded-xl border-border text-xs font-semibold cursor-pointer hover:bg-muted"
          >
            <ArrowDown className="mr-1.5 h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
            Fill Target Down
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fillDownPrevYear}
            disabled={saveMutation.isPending || clearMutation.isPending}
            className="rounded-xl border-border text-xs font-semibold cursor-pointer hover:bg-muted"
          >
            <ArrowDown className="mr-1.5 h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            Fill Prev. Sales Down
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || clearMutation.isPending}
            className="rounded-xl bg-gradient-to-r from-orange-500 to-coral-500 text-white font-bold text-xs shadow-md shadow-orange-500/20 cursor-pointer"
          >
            {saveMutation.isPending ? "Saving Changes..." : "Save Month Targets"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Clear every saved Sales Target & Previous Year figure for ${monthLabel(month)}?`)) {
                clearMutation.mutate();
              }
            }}
            disabled={saveMutation.isPending || clearMutation.isPending}
            className="rounded-xl text-xs font-semibold cursor-pointer"
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {clearMutation.isPending ? "Clearing..." : "Clear Month"}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) uploadMutation.mutate(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={saveMutation.isPending || clearMutation.isPending || uploadMutation.isPending}
            className="rounded-xl border-border text-xs font-semibold ml-auto cursor-pointer hover:bg-muted"
          >
            <Upload className="mr-1.5 h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
            {uploadMutation.isPending ? "Uploading..." : "Upload Excel (.xlsx)"}
          </Button>
        </div>

        {/* Monthly Summary Statistics Pills */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mt-4 pt-4 border-t border-border">
          <div className="rounded-2xl border border-border/80 bg-muted/40 dark:bg-black/25 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Month Target (Typed)</div>
            <div className="mt-1 font-mono text-base font-extrabold text-orange-600 dark:text-orange-400 sm:text-lg">
              {fmtCurrency(draftTargetTotal)}
            </div>
            <div className="text-[10px] text-muted-foreground">Saved: {fmtCurrency(savedTargetTotal)}</div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-muted/40 dark:bg-black/25 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prev. Year Total (Typed)</div>
            <div className="mt-1 font-mono text-base font-extrabold text-cyan-600 dark:text-cyan-400 sm:text-lg">
              {fmtCurrency(draftPrevYearTotal)}
            </div>
            <div className="text-[10px] text-muted-foreground">Saved: {fmtCurrency(savedPrevYearTotal)}</div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-muted/40 dark:bg-black/25 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Target vs Prev Growth</div>
            <div className="mt-1 font-mono text-base font-extrabold text-foreground sm:text-lg">
              {draftPrevYearTotal > 0
                ? `${(((draftTargetTotal - draftPrevYearTotal) / draftPrevYearTotal) * 100).toFixed(1)}%`
                : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground">Planned Growth Pace</div>
          </div>

          <div className="rounded-2xl border border-border/80 bg-muted/40 dark:bg-black/25 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Excel Format Support</div>
            <div className="mt-1 text-xs font-semibold text-foreground">
              4-Col or 2-Col
            </div>
            <div className="text-[10px] text-muted-foreground">Auto Date Matching</div>
          </div>
        </div>
      </div>

      {/* Target Table with Active Data Entry & All KPIs */}
      <div className="rounded-3xl border border-border bg-card/90 dark:bg-[#18181D]/90 p-4 sm:p-6 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-500 dark:text-orange-400" />
            Target Plan & Full KPI Matrix: {monthLabel(month)}
          </h3>
          <span className="text-xs text-muted-foreground">Showing {days.length} Days</span>
        </div>

        {isLoading ? (
          <Skeleton className="h-96 w-full rounded-2xl" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader className="bg-muted/60 dark:bg-black/40">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-bold text-muted-foreground text-xs">Prev. Date</TableHead>
                  <TableHead className="font-bold text-cyan-600 dark:text-cyan-400 text-xs min-w-[140px]">
                    Net Sales (Prev. Year) (₹)
                  </TableHead>
                  <TableHead className="font-bold text-foreground text-xs">Date</TableHead>
                  <TableHead className="font-bold text-muted-foreground text-xs">Day</TableHead>
                  <TableHead className="font-bold text-orange-600 dark:text-orange-400 text-xs min-w-[140px]">
                    Sales Target (₹)
                  </TableHead>
                  <TableHead className="text-right font-bold text-foreground text-xs min-w-[110px]">
                    Present Net Sales
                  </TableHead>
                  <TableHead className="text-right font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                    Ach %
                  </TableHead>
                  <TableHead className="text-right font-bold text-muted-foreground text-xs">
                    Footfall
                  </TableHead>
                  <TableHead className="text-right font-bold text-muted-foreground text-xs">
                    NOB
                  </TableHead>
                  <TableHead className="text-right font-bold text-muted-foreground text-xs">
                    Bill Qty
                  </TableHead>
                  <TableHead className="text-right font-bold text-muted-foreground text-xs">
                    ATV
                  </TableHead>
                  <TableHead className="text-right font-bold text-muted-foreground text-xs">
                    Basket Size
                  </TableHead>
                  <TableHead className="text-right font-bold text-muted-foreground text-xs">
                    Conv %
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => {
                  const ex = existing.get(d);
                  const isWeekend = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
                  const [y, m, dayNum] = d.split("-").map(Number);
                  const prevYearDate = `${y - 1}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                  const prevYearDisplay = prevYearDate.split("-").reverse().join(".");
                  const presentYearDisplay = d.split("-").reverse().join(".");

                  return (
                    <TableRow key={d} className="border-border/60 hover:bg-muted/40 transition-colors">
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {prevYearDisplay}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="h-8 max-w-[12rem] rounded-xl border-cyan-500/40 bg-cyan-500/10 dark:bg-cyan-950/20 font-mono font-bold text-cyan-800 dark:text-cyan-300 text-xs focus:ring-2 focus:ring-cyan-500"
                          placeholder="0"
                          value={prevYearValues[d] ?? ""}
                          onChange={(e) => setPrevYearValues((prev) => ({ ...prev, [d]: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-bold text-foreground">
                        {presentYearDisplay}
                      </TableCell>
                      <TableCell className={`text-xs font-semibold ${isWeekend ? "text-amber-600 dark:text-amber-400 font-bold" : "text-muted-foreground"}`}>
                        {dayName(d)}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="h-8 max-w-[12rem] rounded-xl border-orange-500/40 bg-orange-500/10 dark:bg-orange-950/20 font-mono font-bold text-orange-800 dark:text-orange-300 text-xs focus:ring-2 focus:ring-orange-500"
                          placeholder="0"
                          value={targetValues[d] ?? ""}
                          onChange={(e) => setTargetValues((prev) => ({ ...prev, [d]: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                        {ex && ex.net_sales != null ? fmtCurrencyOrZero(ex.net_sales) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {ex && ex.achievement_pct != null ? fmtPercentOrZero(ex.achievement_pct) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-foreground/80 dark:text-slate-300">
                        {ex && ex.footfall != null ? fmtNumberOrZero(ex.footfall) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-foreground/80 dark:text-slate-300">
                        {ex && ex.nob != null ? fmtNumberOrZero(ex.nob) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-foreground/80 dark:text-slate-300">
                        {ex && ex.bill_quantity != null ? fmtNumberOrZero(ex.bill_quantity) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-foreground/80 dark:text-slate-300">
                        {ex && ex.atv != null ? fmtCurrencyOrZero(ex.atv) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-foreground/80 dark:text-slate-300">
                        {ex && ex.basket_size != null ? ex.basket_size.toFixed(2) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-foreground/80 dark:text-slate-300">
                        {ex && ex.conversion_pct != null ? fmtPercentOrZero(ex.conversion_pct) : <span className="text-muted-foreground/40">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

export function SalesTargetNM() {
  return <SalesTargetEntry store="NM" />;
}

export function SalesTargetHB() {
  return <SalesTargetEntry store="HB" />;
}

export function SalesTargetCHW() {
  return <SalesTargetEntry store="CHW" />;
}
