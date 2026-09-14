import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, DollarSign, Users, ShoppingBag, Filter, Printer, CalendarRange, Eye } from "lucide-react";
import { useState, useEffect, useMemo } from "react";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { ChartPanel } from "@/components/ChartPanel";
import { DailyExportMenu } from "@/components/DailyExportMenu";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtCurrencyOrZero, fmtNumberOrZero, fmtPercentOrZero, fmtTime12Hour } from "@/lib/format";
import { emptyFilterState } from "@/lib/filterParams";
import { STORE_NAME_BY_CODE } from "@/lib/authUsers";

interface HistoryPageProps {
  storeCode?: string; // If undefined and admin, allows selecting store
}

const STORE_OPTIONS = [
  { code: "ALL", name: "All Stores (Blended)" },
  { code: "NM", name: "New Market" },
  { code: "HB", name: "Hatibagan" },
  { code: "CHW", name: "Chowringhee" },
];

export type HistoryRangePreset = "single" | "7days" | "14days" | "30days" | "all" | "custom";

const PRESET_OPTIONS: { id: HistoryRangePreset; label: string }[] = [
  { id: "single", label: "Single Day" },
  { id: "7days", label: "Previous 7 Days" },
  { id: "14days", label: "Previous 14 Days" },
  { id: "30days", label: "Previous 30 Days" },
  { id: "all", label: "All Available Dates" },
  { id: "custom", label: "Specific Date Range" },
];

function computeDaysAgo(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

export function HistoryPage({ storeCode }: HistoryPageProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const initialStore = (!isAdmin && user?.storeCode) ? user.storeCode : (storeCode || user?.storeCode || "ALL");

  const [selectedStore, setSelectedStore] = useState<string>(initialStore);
  const [rangeMode, setRangeMode] = useState<HistoryRangePreset>("single");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [timeSlotFilter, setTimeSlotFilter] = useState<string>("ALL");

  // Sync selectedStore if prop changes (e.g. admin switching store tabs in App.tsx)
  useEffect(() => {
    if (!isAdmin && user?.storeCode) {
      setSelectedStore(user.storeCode);
    } else if (storeCode) {
      setSelectedStore(storeCode);
    }
  }, [storeCode, isAdmin, user?.storeCode]);

  const effectiveStore = (!isAdmin && user?.storeCode) ? user.storeCode : (selectedStore || "ALL");

  // Fetch available recorded dates
  const { data: datesList, isLoading: datesLoading } = useQuery({
    queryKey: ["history-dates", effectiveStore],
    queryFn: () => api.historyDates(effectiveStore),
  });

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Reference (latest) date and earliest available date
  const latestDate = useMemo(() => {
    if (datesList && datesList.length > 0) {
      return datesList[0].date;
    }
    return today;
  }, [datesList, today]);

  const earliestDate = useMemo(() => {
    if (datesList && datesList.length > 0) {
      return datesList[datesList.length - 1].date;
    }
    return today;
  }, [datesList, today]);

  // Initialize selectedDate & custom dates when datesList loads
  useEffect(() => {
    if (datesList && datesList.length > 0) {
      const hasToday = datesList.some((d) => d.date === today);
      if (!selectedDate) {
        setSelectedDate(hasToday ? today : datesList[0].date);
      }
      if (!customEndDate) {
        setCustomEndDate(hasToday ? today : datesList[0].date);
      }
      if (!customStartDate) {
        setCustomStartDate(computeDaysAgo(hasToday ? today : datesList[0].date, 6));
      }
    }
  }, [datesList, selectedDate, customEndDate, customStartDate, today]);

  // Compute effective start and end dates based on active preset mode
  const { effectiveStartDate, effectiveEndDate } = useMemo(() => {
    const baseEnd = selectedDate || latestDate;
    if (rangeMode === "single") {
      const d = selectedDate || latestDate;
      return { effectiveStartDate: d, effectiveEndDate: d };
    }
    if (rangeMode === "7days") {
      return {
        effectiveStartDate: computeDaysAgo(latestDate, 6),
        effectiveEndDate: latestDate,
      };
    }
    if (rangeMode === "14days") {
      return {
        effectiveStartDate: computeDaysAgo(latestDate, 13),
        effectiveEndDate: latestDate,
      };
    }
    if (rangeMode === "30days") {
      return {
        effectiveStartDate: computeDaysAgo(latestDate, 29),
        effectiveEndDate: latestDate,
      };
    }
    if (rangeMode === "all") {
      return {
        effectiveStartDate: earliestDate,
        effectiveEndDate: latestDate,
      };
    }
    if (rangeMode === "custom") {
      const s = customStartDate || computeDaysAgo(baseEnd, 6);
      const e = customEndDate || baseEnd;
      return s <= e
        ? { effectiveStartDate: s, effectiveEndDate: e }
        : { effectiveStartDate: e, effectiveEndDate: s };
    }
    const d = selectedDate || latestDate;
    return { effectiveStartDate: d, effectiveEndDate: d };
  }, [rangeMode, selectedDate, latestDate, earliestDate, customStartDate, customEndDate]);

  const isMultiDay = effectiveStartDate !== effectiveEndDate;

  // Fetch range data from backend
  const { data: rangeData, isLoading: detailsLoading } = useQuery({
    queryKey: ["history-range", effectiveStore, effectiveStartDate, effectiveEndDate],
    queryFn: () => api.historyRange(effectiveStore, effectiveStartDate, effectiveEndDate),
    enabled: Boolean(effectiveStartDate && effectiveEndDate),
  });

  const kpis = rangeData?.kpis;
  const timeslots = rangeData?.timeslot_breakdown ?? [];
  const dailyBreakdown = rangeData?.daily_breakdown ?? [];
  const daysCount = rangeData?.days_count ?? (isMultiDay ? dailyBreakdown.length : 1);

  const historyFilters = {
    ...emptyFilterState(),
    stores: effectiveStore === "ALL" ? ["NM", "HB", "CHW"] : [effectiveStore],
    start: effectiveStartDate,
    end: effectiveEndDate,
  };

  // Filter logs by selected time slot
  const filteredBills = (rangeData?.bill_logs ?? []).filter(
    (b) => timeSlotFilter === "ALL" || b.time_slot === timeSlotFilter
  );
  const filteredFootfall = (rangeData?.footfall_logs ?? []).filter(
    (f) => timeSlotFilter === "ALL" || f.time_slot === timeSlotFilter
  );
  const filteredNob = (rangeData?.nob_logs ?? []).filter(
    (n) => timeSlotFilter === "ALL" || n.time_slot === timeSlotFilter
  );

  // Quick switch from multi-day breakdown to single day
  const handleInspectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    setRangeMode("single");
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Controls Card */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Historical Operations Logs</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Time-slot-wise breakdown and detailed footfall, billing, and sales logs for previous & current days.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Store Selector for Admin */}
            {isAdmin && !storeCode && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Store:</span>
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                  <SelectTrigger className="h-9 w-44 text-xs font-medium">
                    <SelectValue placeholder="Select Store" />
                  </SelectTrigger>
                  <SelectContent>
                    {STORE_OPTIONS.map((s) => (
                      <SelectItem key={s.code} value={s.code} className="text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Print & Export Actions */}
            <div className="flex items-center gap-2">
              <DailyExportMenu store={effectiveStore === "ALL" ? "NM" : effectiveStore} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="h-9 gap-1.5 text-xs font-medium"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </div>
        </div>

        {/* Date Range Presets & Filter Row */}
        <div className="flex flex-col gap-3 border-t border-border/60 pt-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">History Range:</span>
            {PRESET_OPTIONS.map((preset) => {
              const isActive = rangeMode === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setRangeMode(preset.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm cursor-default"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Date Selector Inputs for Single / Custom / Preset Range */}
          <div className="flex flex-wrap items-center gap-2.5">
            {rangeMode === "single" && (
              <>
                {/* Available Recorded Dates Dropdown */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Recorded Date:</span>
                  <Select
                    value={effectiveStartDate}
                    onValueChange={(d) => setSelectedDate(d)}
                  >
                    <SelectTrigger className="h-8.5 w-44 text-xs font-medium">
                      <SelectValue placeholder="Select Date" />
                    </SelectTrigger>
                    <SelectContent>
                      {datesList && datesList.length > 0 ? (
                        datesList.map((d) => (
                          <SelectItem key={d.date} value={d.date} className="text-xs">
                            {d.date} ({d.day_name.slice(0, 3)})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value={effectiveStartDate} className="text-xs">
                          {effectiveStartDate}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Single Date Calendar Picker */}
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={effectiveStartDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="h-8.5 w-36 text-xs"
                  />
                </div>
              </>
            )}

            {rangeMode === "custom" && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">From:</span>
                  <Input
                    type="date"
                    value={customStartDate || effectiveStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="h-8.5 w-34 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">To:</span>
                  <Input
                    type="date"
                    value={customEndDate || effectiveEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="h-8.5 w-34 text-xs"
                  />
                </div>
              </div>
            )}

            {(rangeMode === "7days" || rangeMode === "14days" || rangeMode === "30days" || rangeMode === "all") && (
              <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-1 text-xs text-foreground font-medium">
                <CalendarRange className="h-3.5 w-3.5 text-primary" />
                <span>
                  {effectiveStartDate} &rarr; {effectiveEndDate} ({daysCount} {daysCount === 1 ? "day" : "days"})
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {detailsLoading || datesLoading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Loading history logs for {isMultiDay ? `${effectiveStartDate} to ${effectiveEndDate}` : effectiveStartDate}...
        </div>
      ) : (
        <>
          {/* Day / Range Overview Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {isMultiDay ? "Total Net Sales" : "Net Sales"}
                </span>
                <DollarSign className="h-4 w-4 text-blue-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {fmtCurrencyOrZero(kpis?.net_sales)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Target: {kpis?.sales_target != null ? fmtCurrencyOrZero(kpis.sales_target) : "N/A"}
                {kpis?.achievement_pct != null && (
                  <span className="ml-1.5 font-semibold text-emerald-400">
                    ({fmtPercentOrZero(kpis.achievement_pct)})
                  </span>
                )}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {isMultiDay ? "Total Footfall & NOB" : "Footfall & NOB"}
                </span>
                <Users className="h-4 w-4 text-indigo-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {fmtNumberOrZero(kpis?.footfall)} <span className="text-xs font-normal text-muted-foreground">visitors</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Buyers (NOB): <span className="font-semibold text-foreground">{fmtNumberOrZero(kpis?.nob)}</span>
                {kpis?.conversion_pct != null && (
                  <span className="ml-1.5 font-semibold text-blue-400">
                    ({fmtPercentOrZero(kpis.conversion_pct)} conv.)
                  </span>
                )}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {isMultiDay ? "Total Items & Avg ATV" : "Billing & Quantity"}
                </span>
                <ShoppingBag className="h-4 w-4 text-amber-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {fmtNumberOrZero(kpis?.bill_quantity)} <span className="text-xs font-normal text-muted-foreground">items</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                ATV: <span className="font-semibold text-foreground">{fmtCurrencyOrZero(kpis?.atv)}</span>
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Date Context</span>
                <Clock className="h-4 w-4 text-purple-400" />
              </div>
              <p className="mt-2 text-lg font-bold text-foreground capitalize">
                {isMultiDay ? `${daysCount} Days Range` : (dailyBreakdown[0]?.day_name ?? "Single Day")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Store: <span className="font-semibold text-foreground">{effectiveStore === "ALL" ? "All Stores" : (STORE_NAME_BY_CODE as Record<string, string>)[effectiveStore] || effectiveStore}</span>
              </p>
            </div>
          </div>

          {/* Historical Charts (2-Column Horizontal View) */}
          {effectiveStore !== "ALL" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <Section
                title={`Historical Performance by Time Slot (${isMultiDay ? `${effectiveStartDate} to ${effectiveEndDate}` : effectiveStartDate})`}
                className="mb-0 h-full"
              >
                <ChartPanel chartId="daily_timeslot_breakdown" filters={historyFilters} className="h-[320px] sm:h-[400px] w-full" />
              </Section>
              <Section
                title={`Historical Footfall vs NOB (${isMultiDay ? `${effectiveStartDate} to ${effectiveEndDate}` : effectiveStartDate})`}
                className="mb-0 h-full"
              >
                <ChartPanel chartId="daily_footfall_nob" filters={historyFilters} className="h-[320px] sm:h-[400px] w-full" />
              </Section>
            </div>
          )}

          {/* Multi-Day Daily Breakdown Table (Only when multi-day range is selected) */}
          {isMultiDay && dailyBreakdown.length > 0 && (
            <Section
              title={`Daily Performance Breakdown (${effectiveStartDate} to ${effectiveEndDate} — ${daysCount} Days)`}
            >
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Day</TableHead>
                      <TableHead className="text-right font-semibold">Net Sales (₹)</TableHead>
                      <TableHead className="text-right font-semibold">Sales Target (₹)</TableHead>
                      <TableHead className="text-right font-semibold">Achievement %</TableHead>
                      <TableHead className="text-right font-semibold">Remaining (₹)</TableHead>
                      <TableHead className="text-right font-semibold">Bill Quantity</TableHead>
                      <TableHead className="text-right font-semibold">Footfall</TableHead>
                      <TableHead className="text-right font-semibold">NOB (Buyers)</TableHead>
                      <TableHead className="text-right font-semibold">Basket Size</TableHead>
                      <TableHead className="text-right font-semibold">ATV (₹)</TableHead>
                      <TableHead className="text-right font-semibold">RPV (₹)</TableHead>
                      <TableHead className="text-right font-semibold">Conversion %</TableHead>
                      <TableHead className="text-center font-semibold">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyBreakdown.map((day) => (
                      <TableRow key={day.date} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-semibold text-foreground">{day.date}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{day.day_name}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-400">
                          {fmtCurrencyOrZero(day.net_sales)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {day.sales_target != null ? fmtCurrencyOrZero(day.sales_target) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-indigo-300">
                          {fmtPercentOrZero(day.achievement_pct)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {fmtCurrencyOrZero(day.remaining)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {fmtNumberOrZero(day.bill_quantity)}
                        </TableCell>
                        <TableCell className="text-right">{fmtNumberOrZero(day.footfall)}</TableCell>
                        <TableCell className="text-right">{fmtNumberOrZero(day.nob)}</TableCell>
                        <TableCell className="text-right font-semibold text-amber-300">
                          {fmtNumberOrZero(day.basket_size)}
                        </TableCell>
                        <TableCell className="text-right">{fmtCurrencyOrZero(day.atv)}</TableCell>
                        <TableCell className="text-right">{fmtCurrencyOrZero(day.rpv)}</TableCell>
                        <TableCell className="text-right font-semibold text-blue-400">
                          {fmtPercentOrZero(day.conversion_pct)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleInspectDay(day.date)}
                            className="h-7 gap-1 px-2 text-xs text-primary hover:bg-primary/10"
                            title="Inspect this day in single-day view"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Summary Row */}
                    <TableRow className="bg-muted/70 font-bold border-t-2 border-border/80">
                      <TableCell colSpan={2} className="font-extrabold text-foreground uppercase tracking-wide text-xs">
                        Period Total / Summary ({daysCount} Days)
                      </TableCell>
                      <TableCell className="text-right text-emerald-400 font-bold">
                        {fmtCurrencyOrZero(kpis?.net_sales)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground font-bold">
                        {kpis?.sales_target != null ? fmtCurrencyOrZero(kpis.sales_target) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-indigo-300 font-bold">
                        {fmtPercentOrZero(kpis?.achievement_pct)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground font-bold">
                        {fmtCurrencyOrZero(kpis?.remaining)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        {fmtNumberOrZero(kpis?.bill_quantity)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        {fmtNumberOrZero(kpis?.footfall)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        {fmtNumberOrZero(kpis?.nob)}
                      </TableCell>
                      <TableCell className="text-right text-amber-300 font-bold">
                        {fmtNumberOrZero(kpis?.basket_size)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        {fmtCurrencyOrZero(kpis?.atv)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        {fmtCurrencyOrZero(kpis?.rpv)}
                      </TableCell>
                      <TableCell className="text-right text-blue-400 font-bold">
                        {fmtPercentOrZero(kpis?.conversion_pct)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Section>
          )}

          {/* Time Slot Wise Summary Table */}
          <Section
            title={
              isMultiDay
                ? `Time Slot Wise Performance Summary (Aggregated over ${daysCount} Days)`
                : "Time Slot Wise Performance Summary"
            }
          >
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-semibold">Time Slot</TableHead>
                    <TableHead className="text-right font-semibold">Net Sales (₹)</TableHead>
                    <TableHead className="text-right font-semibold">Remaining (₹)</TableHead>
                    <TableHead className="text-right font-semibold">Achievement %</TableHead>
                    <TableHead className="text-right font-semibold">Remaining %</TableHead>
                    <TableHead className="text-right font-semibold">Bill Quantity (units sold)</TableHead>
                    <TableHead className="text-right font-semibold">Footfall</TableHead>
                    <TableHead className="text-right font-semibold">NOB (Buyers)</TableHead>
                    <TableHead className="text-right font-semibold">Basket Size</TableHead>
                    <TableHead className="text-right font-semibold">ATV (₹)</TableHead>
                    <TableHead className="text-right font-semibold">RPV (₹)</TableHead>
                    <TableHead className="text-right font-semibold">Conversion %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeslots.map((t) => {
                    const rowBasketSize = (t.nob && t.nob > 0) ? (t.bill_quantity / t.nob) : 0;
                    const rowAtv = (t.nob && t.nob > 0) ? (t.net_sales / t.nob) : 0;
                    const rowRpv = (t.footfall && t.footfall > 0) ? (t.net_sales / t.footfall) : 0;
                    const rowConvPct = (t.footfall && t.footfall > 0) ? ((t.nob / t.footfall) * 100) : 0;

                    return (
                      <TableRow key={t.time_slot} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-foreground">{t.time_slot}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-400">
                          {fmtCurrencyOrZero(t.net_sales)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {fmtCurrencyOrZero(t.remaining)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-indigo-300">
                          {fmtPercentOrZero(t.achievement_pct)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {fmtPercentOrZero(t.remaining_pct)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {fmtNumberOrZero(t.bill_quantity)}
                        </TableCell>
                        <TableCell className="text-right">{fmtNumberOrZero(t.footfall)}</TableCell>
                        <TableCell className="text-right">{fmtNumberOrZero(t.nob)}</TableCell>
                        <TableCell className="text-right font-semibold text-amber-300">
                          {fmtNumberOrZero(rowBasketSize)}
                        </TableCell>
                        <TableCell className="text-right">{fmtCurrencyOrZero(rowAtv)}</TableCell>
                        <TableCell className="text-right">{fmtCurrencyOrZero(rowRpv)}</TableCell>
                        <TableCell className="text-right font-semibold text-blue-400">
                          {fmtPercentOrZero(rowConvPct)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {timeslots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                        No time slot data recorded for this selection.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (() => {
                      const totalNetSales = timeslots.reduce((acc, t) => acc + (t.net_sales || 0), 0);
                      const totalBillQty = timeslots.reduce((acc, t) => acc + (t.bill_quantity || 0), 0);
                      const totalFootfall = timeslots.reduce((acc, t) => acc + (t.footfall || 0), 0);
                      const totalNob = timeslots.reduce((acc, t) => acc + (t.nob || 0), 0);
                      const dailyTarget = kpis?.sales_target ?? null;
                      const totalRemaining = dailyTarget !== null ? Math.max(0, dailyTarget - totalNetSales) : null;
                      const totalAchievementPct = dailyTarget && dailyTarget > 0 ? (totalNetSales / dailyTarget) * 100 : null;
                      const totalRemainingPct = dailyTarget && dailyTarget > 0 ? (totalRemaining !== null ? (totalRemaining / dailyTarget) * 100 : null) : null;
                      const totalBasketSize = totalNob > 0 ? (totalBillQty / totalNob) : 0;
                      const totalAtv = totalNob > 0 ? (totalNetSales / totalNob) : 0;
                      const totalRpv = totalFootfall > 0 ? (totalNetSales / totalFootfall) : 0;
                      const totalConvPct = totalFootfall > 0 ? (totalNob / totalFootfall) * 100 : 0;

                      return (
                        <TableRow className="bg-muted/70 font-bold border-t-2 border-border/80">
                          <TableCell className="font-extrabold text-foreground uppercase tracking-wide text-xs">
                            {isMultiDay ? `Total / ${daysCount}-Day Summary` : "Total / Day Summary"}
                          </TableCell>
                          <TableCell className="text-right text-emerald-400 font-bold">
                            {fmtCurrencyOrZero(totalNetSales)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground font-bold">
                            {fmtCurrencyOrZero(totalRemaining)}
                          </TableCell>
                          <TableCell className="text-right text-indigo-300 font-bold">
                            {fmtPercentOrZero(totalAchievementPct)}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground font-bold">
                            {fmtPercentOrZero(totalRemainingPct)}
                          </TableCell>
                          <TableCell className="text-right font-bold text-foreground">
                            {fmtNumberOrZero(totalBillQty)}
                          </TableCell>
                          <TableCell className="text-right font-bold text-foreground">
                            {fmtNumberOrZero(totalFootfall)}
                          </TableCell>
                          <TableCell className="text-right font-bold text-foreground">
                            {fmtNumberOrZero(totalNob)}
                          </TableCell>
                          <TableCell className="text-right text-amber-300 font-bold">
                            {fmtNumberOrZero(totalBasketSize)}
                          </TableCell>
                          <TableCell className="text-right font-bold text-foreground">
                            {fmtCurrencyOrZero(totalAtv)}
                          </TableCell>
                          <TableCell className="text-right font-bold text-foreground">
                            {fmtCurrencyOrZero(totalRpv)}
                          </TableCell>
                          <TableCell className="text-right text-blue-400 font-bold">
                            {fmtPercentOrZero(totalConvPct)}
                          </TableCell>
                        </TableRow>
                      );
                    })()
                  )}
                </TableBody>
              </Table>
            </div>
          </Section>

          {/* Time Slot Wise Detailed Logs */}
          <Section
            title="Detailed Operations Logs (Time Slot Wise)"
            action={
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Filter Time Slot:</span>
                <Select value={timeSlotFilter} onValueChange={setTimeSlotFilter}>
                  <SelectTrigger className="h-8 w-48 text-xs">
                    <SelectValue placeholder="All Time Slots" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL" className="text-xs">
                      All Time Slots
                    </SelectItem>
                    {timeslots.map((t) => (
                      <SelectItem key={t.time_slot} value={t.time_slot} className="text-xs">
                        {t.time_slot}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          >
            <Tabs defaultValue="bills" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="bills" className="text-xs">
                  Billing Details ({filteredBills.length})
                </TabsTrigger>
                <TabsTrigger value="footfall" className="text-xs">
                  Footfall Logs ({filteredFootfall.length})
                </TabsTrigger>
                <TabsTrigger value="nob" className="text-xs">
                  Sales / NOB Logs ({filteredNob.length})
                </TabsTrigger>
              </TabsList>

              {/* Billing Details Tab */}
              <TabsContent value="bills">
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-16">Row #</TableHead>
                        {isMultiDay && <TableHead>Date</TableHead>}
                        {effectiveStore === "ALL" && <TableHead>Store</TableHead>}
                        <TableHead>Bill Time</TableHead>
                        <TableHead className="text-right">Net Sales Amount (₹)</TableHead>
                        <TableHead className="text-right">Bill Quantity (units sold)</TableHead>
                        <TableHead className="text-right">Time Slot</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBills.map((b) => (
                        <TableRow key={`${b.store ?? effectiveStore}-${b.date ?? ""}-${b.row}`} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs text-muted-foreground">{b.row}</TableCell>
                          {isMultiDay && (
                            <TableCell className="font-mono text-xs text-muted-foreground">{b.date ?? effectiveStartDate}</TableCell>
                          )}
                          {effectiveStore === "ALL" && (
                            <TableCell className="font-semibold text-xs text-blue-300">
                              {(STORE_NAME_BY_CODE as Record<string, string>)[b.store ?? ""] || b.store}
                            </TableCell>
                          )}
                          <TableCell className="font-medium text-foreground">{fmtTime12Hour(b.bill_time)}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-400">
                            {fmtCurrencyOrZero(b.net_amount)}
                          </TableCell>
                          <TableCell className="text-right">{fmtNumberOrZero(b.bill_quantity)}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{b.time_slot ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                      {filteredBills.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={effectiveStore === "ALL" ? (isMultiDay ? 7 : 6) : (isMultiDay ? 6 : 5)} className="h-20 text-center text-muted-foreground text-xs">
                            No billing entries logged for this date / filter.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Footfall Logs Tab */}
              <TabsContent value="footfall">
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-16">Row #</TableHead>
                        {isMultiDay && <TableHead>Date</TableHead>}
                        {effectiveStore === "ALL" && <TableHead>Store</TableHead>}
                        <TableHead>Entry Time</TableHead>
                        <TableHead className="text-right">Footfall Count</TableHead>
                        <TableHead className="text-right">Time Slot</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFootfall.map((f) => (
                        <TableRow key={`${f.store ?? effectiveStore}-${f.date ?? ""}-${f.row}`} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs text-muted-foreground">{f.row}</TableCell>
                          {isMultiDay && (
                            <TableCell className="font-mono text-xs text-muted-foreground">{f.date ?? effectiveStartDate}</TableCell>
                          )}
                          {effectiveStore === "ALL" && (
                            <TableCell className="font-semibold text-xs text-blue-300">
                              {(STORE_NAME_BY_CODE as Record<string, string>)[f.store ?? ""] || f.store}
                            </TableCell>
                          )}
                          <TableCell className="font-medium text-foreground">{fmtTime12Hour(f.time)}</TableCell>
                          <TableCell className="text-right font-semibold text-indigo-300">
                            {fmtNumberOrZero(f.footfall)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{f.time_slot ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                      {filteredFootfall.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={effectiveStore === "ALL" ? (isMultiDay ? 6 : 5) : (isMultiDay ? 5 : 4)} className="h-20 text-center text-muted-foreground text-xs">
                            No footfall entries logged for this date / filter.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Sales / NOB Logs Tab */}
              <TabsContent value="nob">
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-16">Row #</TableHead>
                        {isMultiDay && <TableHead>Date</TableHead>}
                        {effectiveStore === "ALL" && <TableHead>Store</TableHead>}
                        <TableHead>Entry Time</TableHead>
                        <TableHead className="text-right">NOB (Buyers) Count</TableHead>
                        <TableHead className="text-right">Time Slot</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredNob.map((n) => (
                        <TableRow key={`${n.store ?? effectiveStore}-${n.date ?? ""}-${n.row}`} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs text-muted-foreground">{n.row}</TableCell>
                          {isMultiDay && (
                            <TableCell className="font-mono text-xs text-muted-foreground">{n.date ?? effectiveStartDate}</TableCell>
                          )}
                          {effectiveStore === "ALL" && (
                            <TableCell className="font-semibold text-xs text-blue-300">
                              {(STORE_NAME_BY_CODE as Record<string, string>)[n.store ?? ""] || n.store}
                            </TableCell>
                          )}
                          <TableCell className="font-medium text-foreground">{fmtTime12Hour(n.time)}</TableCell>
                          <TableCell className="text-right font-semibold text-blue-400">
                            {fmtNumberOrZero(n.nob)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{n.time_slot ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                      {filteredNob.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={effectiveStore === "ALL" ? (isMultiDay ? 6 : 5) : (isMultiDay ? 5 : 4)} className="h-20 text-center text-muted-foreground text-xs">
                            No NOB / sales buyer entries logged for this date / filter.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </Section>
        </>
      )}
    </div>
  );
}
