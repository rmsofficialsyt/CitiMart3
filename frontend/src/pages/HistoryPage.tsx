import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, DollarSign, Users, ShoppingBag, Filter } from "lucide-react";
import { useState, useEffect } from "react";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Section } from "@/components/Section";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtCurrencyOrZero, fmtNumberOrZero, fmtPercentOrZero, fmtTime12Hour } from "@/lib/format";
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

export function HistoryPage({ storeCode }: HistoryPageProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const initialStore = (!isAdmin && user?.storeCode) ? user.storeCode : (storeCode || user?.storeCode || "ALL");

  const [selectedStore, setSelectedStore] = useState<string>(initialStore);
  const [selectedDate, setSelectedDate] = useState<string>("");
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

  // Fetch available dates
  const { data: datesList, isLoading: datesLoading } = useQuery({
    queryKey: ["history-dates", effectiveStore],
    queryFn: () => api.historyDates(effectiveStore),
  });

  // Default selected date to today if present, or the latest available date
  useEffect(() => {
    if (datesList && datesList.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      const hasToday = datesList.some((d) => d.date === today);
      if (!selectedDate || (!hasToday && !datesList.some((d) => d.date === selectedDate))) {
        setSelectedDate(hasToday ? today : datesList[0].date);
      }
    }
  }, [datesList, selectedDate]);

  // Effective date: if selectedDate is not set or first load, fallback to first available date or today
  const activeDate = selectedDate || (datesList && datesList.length > 0 ? datesList[0].date : new Date().toISOString().split("T")[0]);

  // Fetch details for active store & date
  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["history-details", effectiveStore, activeDate],
    queryFn: () => api.historyDetails(effectiveStore, activeDate),
    enabled: Boolean(activeDate),
  });

  const kpis = details?.kpis;
  const timeslots = details?.timeslot_breakdown ?? [];

  // Filter logs by selected time slot
  const filteredBills = (details?.bill_logs ?? []).filter(
    (b) => timeSlotFilter === "ALL" || b.time_slot === timeSlotFilter
  );
  const filteredFootfall = (details?.footfall_logs ?? []).filter(
    (f) => timeSlotFilter === "ALL" || f.time_slot === timeSlotFilter
  );
  const filteredNob = (details?.nob_logs ?? []).filter(
    (n) => timeSlotFilter === "ALL" || n.time_slot === timeSlotFilter
  );

  return (
    <div className="space-y-6">
      {/* Top Header & Controls */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Historical Operations Logs</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Time-slot-wise breakdown and detailed footfall, billing, and sales logs for previous & current days.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

          {/* Available Dates Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Recorded Date:</span>
            <Select
              value={activeDate}
              onValueChange={(d) => setSelectedDate(d)}
            >
              <SelectTrigger className="h-9 w-44 text-xs font-medium">
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
                  <SelectItem value={activeDate} className="text-xs">
                    {activeDate}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Date Picker */}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={activeDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 w-36 text-xs"
            />
          </div>
        </div>
      </div>

      {detailsLoading || datesLoading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Loading history logs for {activeDate}...
        </div>
      ) : (
        <>
          {/* Day Overview Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold uppercase tracking-wider">Net Sales</span>
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
                <span className="text-xs font-semibold uppercase tracking-wider">Footfall & NOB</span>
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
                <span className="text-xs font-semibold uppercase tracking-wider">Billing & Quantity</span>
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
                {details?.day_name ?? ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Store: <span className="font-semibold text-foreground">{effectiveStore === "ALL" ? "All Stores" : (STORE_NAME_BY_CODE as Record<string, string>)[effectiveStore] || effectiveStore}</span>
              </p>
            </div>
          </div>

          {/* Time Slot Wise Summary Table */}
          <Section
            title="Time Slot Wise Performance Summary"
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
                        No time slot data recorded for this date.
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
                            Total / Day Summary
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
                        {effectiveStore === "ALL" && <TableHead>Store</TableHead>}
                        <TableHead>Bill Time</TableHead>
                        <TableHead className="text-right">Net Sales Amount (₹)</TableHead>
                        <TableHead className="text-right">Bill Quantity (units sold)</TableHead>
                        <TableHead className="text-right">Time Slot</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBills.map((b) => (
                        <TableRow key={`${b.store ?? effectiveStore}-${b.row}`} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs text-muted-foreground">{b.row}</TableCell>
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
                          <TableCell colSpan={effectiveStore === "ALL" ? 6 : 5} className="h-20 text-center text-muted-foreground text-xs">
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
                        {effectiveStore === "ALL" && <TableHead>Store</TableHead>}
                        <TableHead>Entry Time</TableHead>
                        <TableHead className="text-right">Footfall Count</TableHead>
                        <TableHead className="text-right">Time Slot</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFootfall.map((f) => (
                        <TableRow key={`${f.store ?? effectiveStore}-${f.row}`} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs text-muted-foreground">{f.row}</TableCell>
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
                          <TableCell colSpan={effectiveStore === "ALL" ? 5 : 4} className="h-20 text-center text-muted-foreground text-xs">
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
                        {effectiveStore === "ALL" && <TableHead>Store</TableHead>}
                        <TableHead>Entry Time</TableHead>
                        <TableHead className="text-right">NOB (Buyers) Count</TableHead>
                        <TableHead className="text-right">Time Slot</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredNob.map((n) => (
                        <TableRow key={`${n.store ?? effectiveStore}-${n.row}`} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs text-muted-foreground">{n.row}</TableCell>
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
                          <TableCell colSpan={effectiveStore === "ALL" ? 5 : 4} className="h-20 text-center text-muted-foreground text-xs">
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
