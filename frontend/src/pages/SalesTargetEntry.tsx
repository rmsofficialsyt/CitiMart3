import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STORE_NAME_BY_CODE, type StoreCode } from "@/lib/authUsers";
import { fmtCurrency, fmtCurrencyOrZero, fmtPercentOrZero, todayLocalDate } from "@/lib/format";
import type { StoreTargetEntry } from "@/lib/types";

const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" });
const DAY_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });

function monthLabel(month: string): string {
  return MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`));
}

/** Every ISO date ("YYYY-MM-DD") in the given "YYYY-MM" month. */
function datesInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(y, m, 0).getDate(); // day 0 of the next month == last day of this one
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

function dayName(isoDate: string): string {
  return DAY_LABEL.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Admin-only "Sales Target" view under Daily Operations -> <store>. A whole
 * month of SALES TARGET at once: pick a month, fill an amount for each day,
 * "Save Month" bulk-writes every changed row (POST /api/targets/bulk). Each
 * row is targets.sales_target for that store+date -- the figure the store's
 * Daily Dashboard measures Remaining / Achievement % against -- and the
 * backend refreshes that day's KPI snapshot on every write. A blank cell
 * that previously had a target clears it; a blank cell that was already
 * empty is skipped. Net Sales / Achievement % are shown read-only for
 * target-vs-actual on days the store has already logged sales. */
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

  // Editable amount per ISO date (as typed). Re-seeded from the saved targets
  // whenever the month or the fetched data changes.
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const seed: Record<string, string> = {};
    for (const d of days) {
      const ex = existing.get(d);
      seed[d] = ex && ex.sales_target != null ? String(ex.sales_target) : "";
    }
    setValues(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, data]);

  const savedTotal = days.reduce((sum, d) => {
    const ex = existing.get(d);
    return sum + (ex && ex.sales_target != null ? ex.sales_target : 0);
  }, 0);
  const draftTotal = days.reduce((sum, d) => {
    const n = Number(values[d]);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows: { date: string; sales_target: number | null }[] = [];
      for (const d of days) {
        const raw = (values[d] ?? "").trim();
        const ex = existing.get(d);
        const current = ex && ex.sales_target != null ? ex.sales_target : null;
        if (raw === "") {
          if (current !== null) rows.push({ date: d, sales_target: null });
          continue;
        }
        const n = Number(raw);
        if (Number.isNaN(n) || n < 0) {
          throw new Error(`${d}: Sales Target must be a non-negative number.`);
        }
        if (n !== current) rows.push({ date: d, sales_target: n });
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
      // Reset the whole visible month: push sales_target: null for every day
      // that currently has a saved target (a blank cell that was already
      // empty is skipped -- same semantics as Save Month).
      const rows = days
        .filter((d) => {
          const ex = existing.get(d);
          return ex && ex.sales_target != null;
        })
        .map((d) => ({ date: d, sales_target: null }));
      if (rows.length === 0) return 0;
      await api.bulkStoreTargets({ store, rows });
      return rows.length;
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("No saved targets to clear this month.");
        return;
      }
      setValues(Object.fromEntries(days.map((d) => [d, ""])));
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
      toast.success(`Uploaded ${applied} day${applied === 1 ? "" : "s"} of Sales Target.`);
      queryClient.invalidateQueries({ queryKey: ["store-targets", store] });
      queryClient.invalidateQueries({ queryKey: ["daily-live", store] });
    },
    onError: (error) => toast.error(`Upload failed: ${(error as Error).message}`),
  });

  function fillDown() {
    // Copy the first non-empty value into every later blank cell -- quick way
    // to set a flat month then tweak the exceptions.
    const first = days.map((d) => (values[d] ?? "").trim()).find((v) => v !== "");
    if (!first) {
      toast.error("Enter an amount on the first day, then Fill Down.");
      return;
    }
    setValues((prev) => {
      const next = { ...prev };
      for (const d of days) if ((next[d] ?? "").trim() === "") next[d] = first;
      return next;
    });
  }

  return (
    <div>
      <Section title="Monthly Sales Target" className="mb-4">
        <p className="text-muted-foreground mb-3 text-sm">
          {STORE_NAME_BY_CODE[store as StoreCode] ?? store} — set one target per day for the selected month, then Save
          Month. Editing a day that already has a target overwrites it; clearing a cell removes that day's target.
        </p>
        {/* Two-up on a phone (the four controls would otherwise be four full
            lines), inline from `sm` up. */}
        <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <div className="col-span-2 sm:col-auto">
            <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Month</Label>
            <input
              type="month"
              className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm sm:w-auto"
              value={month}
              onChange={(e) => setMonth(e.target.value || todayLocalDate().slice(0, 7))}
            />
          </div>
          <Button variant="outline" onClick={fillDown} disabled={saveMutation.isPending || clearMutation.isPending}>
            Fill Down
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || clearMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save Month"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm(`Clear every saved Sales Target for ${monthLabel(month)}? This cannot be undone.`)) {
                clearMutation.mutate();
              }
            }}
            disabled={saveMutation.isPending || clearMutation.isPending}
          >
            {clearMutation.isPending ? "Clearing..." : "Clear Month"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // allow re-selecting the same file
              if (file) uploadMutation.mutate(file);
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={saveMutation.isPending || clearMutation.isPending || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload Excel"}
          </Button>
        </div>
        <p className="text-muted-foreground mt-3 text-sm">
          Month target (typed): <span className="text-foreground font-semibold">{fmtCurrency(draftTotal)}</span>
          {" · "}Currently saved: <span className="text-foreground font-semibold">{fmtCurrency(savedTotal)}</span>
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Upload Excel: a <code>.xlsx</code> with two columns — <code>Date</code> (YYYY-MM-DD) and{" "}
          <code>Sales Target</code>. The header row is skipped; a blank target clears that day. Rows for any month are
          applied, not just the one shown.
        </p>
      </Section>

      <Section title={monthLabel(month)}>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Sales Target (₹)</TableHead>
                  <TableHead>Net Sales</TableHead>
                  <TableHead>Achievement %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {days.map((d) => {
                  const ex = existing.get(d);
                  const isWeekend = [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
                  return (
                    <TableRow key={d}>
                      <TableCell className="whitespace-nowrap tabular-nums">{d.split("-").reverse().join(".")}</TableCell>
                      <TableCell className={isWeekend ? "text-muted-foreground" : ""}>{dayName(d)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="h-8 max-w-[12rem]"
                          value={values[d] ?? ""}
                          onChange={(e) => setValues((prev) => ({ ...prev, [d]: e.target.value }))}
                        />
                      </TableCell>
                      <TableCell>{ex ? fmtCurrencyOrZero(ex.net_sales) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{ex ? fmtPercentOrZero(ex.achievement_pct) : <span className="text-muted-foreground">—</span>}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
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
