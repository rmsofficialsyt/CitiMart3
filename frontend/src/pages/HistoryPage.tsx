import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CalendarClock,
  CalendarRange,
  Clock,
  Edit2,
  Eye,
  Filter,
  Footprints,
  IndianRupee,
  PackageCheck,
  PlusCircle,
  Printer,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { ChartPanel } from "@/components/ChartPanel";
import { DailyExportMenu } from "@/components/DailyExportMenu";
import { AtAGlanceCard } from "@/components/AtAGlanceCard";
import { Section } from "@/components/Section";
import { emptyFilterState } from "@/lib/filterParams";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtCurrencyOrZero, fmtDateDot, fmtNumberOrZero, fmtPercentOrZero, fmtTime12Hour, nowTimeHHMM, toTimeHHMM, addDaysISO, todayLocalDate } from "@/lib/format";
import { timeSlotForHHMM } from "@/lib/timeSlot";
import { STORE_NAME_BY_CODE } from "@/lib/authUsers";
import type { BillEntry, FootfallEntry, NobEntry, DailyLiveSnapshot, DailyOverallSnapshot } from "@/lib/types";

interface HistoryPageProps {
  storeCode?: string; // If undefined and admin, allows selecting store
}

const STORE_OPTIONS = [
  { code: "ALL", name: "All Stores (Blended)" },
  { code: "NM", name: "New Market" },
  { code: "HB", name: "Hatibagan" },
  { code: "CHW", name: "Chowringhee" },
];

const STORE_TARGET_OPTIONS = [
  { code: "NM", name: "New Market (NM)" },
  { code: "HB", name: "Hatibagan (HB)" },
  { code: "CHW", name: "Chowringhee (CHW)" },
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
  return addDaysISO(isoDate, -days);
}

export function HistoryPage({ storeCode }: HistoryPageProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const initialStore = (!isAdmin && user?.storeCode) ? user.storeCode : (storeCode || user?.storeCode || "ALL");

  const [selectedStore, setSelectedStore] = useState<string>(initialStore);
  const [rangeMode, setRangeMode] = useState<HistoryRangePreset>("single");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [timeSlotFilter, setTimeSlotFilter] = useState<string>("ALL");

  // CRUD Modal Dialog States for Admin Single-Day Management
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<(BillEntry & { store?: string; date?: string }) | null>(null);
  const [billFormStore, setBillFormStore] = useState<string>("NM");
  const [billFormTime, setBillFormTime] = useState<string>("12:00");
  const [billFormAmount, setBillFormAmount] = useState<string>("");
  const [billFormQuantity, setBillFormQuantity] = useState<string>("");

  const [footfallModalOpen, setFootfallModalOpen] = useState(false);
  const [editingFootfall, setEditingFootfall] = useState<(FootfallEntry & { store?: string; date?: string }) | null>(null);
  const [footfallFormStore, setFootfallFormStore] = useState<string>("NM");
  const [footfallFormTime, setFootfallFormTime] = useState<string>("12:00");
  const [footfallFormCount, setFootfallFormCount] = useState<string>("");

  const [nobModalOpen, setNobModalOpen] = useState(false);
  const [editingNob, setEditingNob] = useState<(NobEntry & { store?: string; date?: string }) | null>(null);
  const [nobFormStore, setNobFormStore] = useState<string>("NM");
  const [nobFormTime, setNobFormTime] = useState<string>("12:00");
  const [nobFormCount, setNobFormCount] = useState<string>("");

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

  const today = useMemo(() => todayLocalDate(), []);

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
  // "Previous N Days" means N actual days ending at yesterday (today excluded)
  const yesterday = useMemo(() => computeDaysAgo(today, 1), [today]);

  const { effectiveStartDate, effectiveEndDate } = useMemo(() => {
    const baseEnd = selectedDate || latestDate;
    if (rangeMode === "single") {
      const d = selectedDate || latestDate;
      return { effectiveStartDate: d, effectiveEndDate: d };
    }
    if (rangeMode === "7days") {
      // 7 days ending yesterday: yesterday - 6 → yesterday
      return {
        effectiveStartDate: computeDaysAgo(yesterday, 6),
        effectiveEndDate: yesterday,
      };
    }
    if (rangeMode === "14days") {
      // 14 days ending yesterday: yesterday - 13 → yesterday
      return {
        effectiveStartDate: computeDaysAgo(yesterday, 13),
        effectiveEndDate: yesterday,
      };
    }
    if (rangeMode === "30days") {
      // 30 days ending yesterday: yesterday - 29 → yesterday
      return {
        effectiveStartDate: computeDaysAgo(yesterday, 29),
        effectiveEndDate: yesterday,
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
  }, [rangeMode, selectedDate, latestDate, earliestDate, customStartDate, customEndDate, yesterday]);

  const isMultiDay = effectiveStartDate !== effectiveEndDate;
  const referenceDateForSnapshot = isMultiDay ? effectiveEndDate : effectiveStartDate;

  // Fetch range data from backend
  const { data: rangeData, isLoading: detailsLoading } = useQuery({
    queryKey: ["history-range", effectiveStore, effectiveStartDate, effectiveEndDate],
    queryFn: () => api.historyRange(effectiveStore, effectiveStartDate, effectiveEndDate),
    enabled: Boolean(effectiveStartDate && effectiveEndDate),
  });

  // Fetch single day snapshot for At a Glance context
  const { data: singleDaySnapshot } = useQuery<DailyLiveSnapshot | DailyOverallSnapshot>({
    queryKey: ["daily-live-history", effectiveStore, referenceDateForSnapshot],
    queryFn: () => (effectiveStore === "ALL" ? api.dailyLiveOverall(referenceDateForSnapshot) : api.dailyLive(effectiveStore, referenceDateForSnapshot)),
    enabled: Boolean(referenceDateForSnapshot),
    staleTime: 60_000,
  });

  const kpis = rangeData?.kpis;
  const timeslots = rangeData?.timeslot_breakdown ?? [];
  const dailyBreakdown = rangeData?.daily_breakdown ?? [];
  const daysCount = rangeData?.days_count ?? (isMultiDay ? dailyBreakdown.length : 1);

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

  const invalidateHistoryQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["history-range"] });
    queryClient.invalidateQueries({ queryKey: ["history-dates"] });
    queryClient.invalidateQueries({ queryKey: ["daily-live"] });
    queryClient.invalidateQueries({ queryKey: ["landing-hero"] });
  };

  // --- BILL MUTATIONS ---
  const addBillMutation = useMutation({
    mutationFn: (payload: { store: string; date: string; bill_time: string; net_amount: number; bill_quantity: number }) =>
      api.addBillEntry(payload),
    onSuccess: () => {
      toast.success("Bill entry created and recorded in database");
      invalidateHistoryQueries();
      setBillModalOpen(false);
    },
    onError: (err: Error) => toast.error(`Create bill failed: ${err.message}`),
  });

  const updateBillMutation = useMutation({
    mutationFn: (payload: { store: string; row: number; bill_time: string; net_amount: number; bill_quantity: number }) =>
      api.updateBillEntry(payload),
    onSuccess: () => {
      toast.success("Bill entry updated in database");
      invalidateHistoryQueries();
      setBillModalOpen(false);
    },
    onError: (err: Error) => toast.error(`Update bill failed: ${err.message}`),
  });

  const deleteBillMutation = useMutation({
    mutationFn: ({ store, row }: { store: string; row: number }) => api.deleteBillEntry(store, row),
    onSuccess: () => {
      toast.success("Bill entry deleted from database");
      invalidateHistoryQueries();
    },
    onError: (err: Error) => toast.error(`Delete bill failed: ${err.message}`),
  });

  // --- FOOTFALL MUTATIONS ---
  const addFootfallMutation = useMutation({
    mutationFn: (payload: { store: string; date: string; time: string; footfall: number }) =>
      api.addFootfallEntry(payload),
    onSuccess: () => {
      toast.success("Footfall entry created and recorded in database");
      invalidateHistoryQueries();
      setFootfallModalOpen(false);
    },
    onError: (err: Error) => toast.error(`Create footfall failed: ${err.message}`),
  });

  const updateFootfallMutation = useMutation({
    mutationFn: (payload: { store: string; row: number; time: string; footfall: number }) =>
      api.updateFootfallEntry(payload),
    onSuccess: () => {
      toast.success("Footfall entry updated in database");
      invalidateHistoryQueries();
      setFootfallModalOpen(false);
    },
    onError: (err: Error) => toast.error(`Update footfall failed: ${err.message}`),
  });

  const deleteFootfallMutation = useMutation({
    mutationFn: ({ store, row }: { store: string; row: number }) => api.deleteFootfallEntry(store, row),
    onSuccess: () => {
      toast.success("Footfall entry deleted from database");
      invalidateHistoryQueries();
    },
    onError: (err: Error) => toast.error(`Delete footfall failed: ${err.message}`),
  });

  // --- NOB MUTATIONS ---
  const addNobMutation = useMutation({
    mutationFn: (payload: { store: string; date: string; time: string; nob: number }) =>
      api.addNobEntry(payload),
    onSuccess: () => {
      toast.success("Sales NOB entry created and recorded in database");
      invalidateHistoryQueries();
      setNobModalOpen(false);
    },
    onError: (err: Error) => toast.error(`Create NOB failed: ${err.message}`),
  });

  const updateNobMutation = useMutation({
    mutationFn: (payload: { store: string; row: number; time: string; nob: number }) =>
      api.updateNobEntry(payload),
    onSuccess: () => {
      toast.success("Sales NOB entry updated in database");
      invalidateHistoryQueries();
      setNobModalOpen(false);
    },
    onError: (err: Error) => toast.error(`Update NOB failed: ${err.message}`),
  });

  const deleteNobMutation = useMutation({
    mutationFn: ({ store, row }: { store: string; row: number }) => api.deleteNobEntry(store, row),
    onSuccess: () => {
      toast.success("Sales NOB entry deleted from database");
      invalidateHistoryQueries();
    },
    onError: (err: Error) => toast.error(`Delete NOB failed: ${err.message}`),
  });

  // Open Handlers
  const handleOpenAddBill = () => {
    setEditingBill(null);
    setBillFormStore(effectiveStore === "ALL" ? "NM" : effectiveStore);
    setBillFormTime(nowTimeHHMM());
    setBillFormAmount("");
    setBillFormQuantity("1");
    setBillModalOpen(true);
  };

  const handleOpenEditBill = (b: BillEntry & { store?: string; date?: string }) => {
    setEditingBill(b);
    setBillFormStore(b.store || (effectiveStore === "ALL" ? "NM" : effectiveStore));
    setBillFormTime(toTimeHHMM(b.bill_time));
    setBillFormAmount(String(b.net_amount));
    setBillFormQuantity(String(b.bill_quantity));
    setBillModalOpen(true);
  };

  const handleOpenAddFootfall = () => {
    setEditingFootfall(null);
    setFootfallFormStore(effectiveStore === "ALL" ? "NM" : effectiveStore);
    setFootfallFormTime(nowTimeHHMM());
    setFootfallFormCount("");
    setFootfallModalOpen(true);
  };

  const handleOpenEditFootfall = (f: FootfallEntry & { store?: string; date?: string }) => {
    setEditingFootfall(f);
    setFootfallFormStore(f.store || (effectiveStore === "ALL" ? "NM" : effectiveStore));
    setFootfallFormTime(toTimeHHMM(f.time));
    setFootfallFormCount(String(f.footfall));
    setFootfallModalOpen(true);
  };

  const handleOpenAddNob = () => {
    setEditingNob(null);
    setNobFormStore(effectiveStore === "ALL" ? "NM" : effectiveStore);
    setNobFormTime(nowTimeHHMM());
    setNobFormCount("");
    setNobModalOpen(true);
  };

  const handleOpenEditNob = (n: NobEntry & { store?: string; date?: string }) => {
    setEditingNob(n);
    setNobFormStore(n.store || (effectiveStore === "ALL" ? "NM" : effectiveStore));
    setNobFormTime(toTimeHHMM(n.time));
    setNobFormCount(String(n.nob));
    setNobModalOpen(true);
  };

  // Submit Handlers
  const handleBillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const netAmt = parseFloat(billFormAmount);
    const billQty = parseFloat(billFormQuantity);
    if (isNaN(netAmt) || netAmt < 0 || isNaN(billQty) || billQty < 0) {
      toast.error("Please enter valid positive numbers for Amount and Quantity.");
      return;
    }
    if (editingBill) {
      updateBillMutation.mutate({
        store: billFormStore,
        row: editingBill.row,
        bill_time: billFormTime,
        net_amount: netAmt,
        bill_quantity: billQty,
      });
    } else {
      addBillMutation.mutate({
        store: billFormStore,
        date: effectiveStartDate,
        bill_time: billFormTime,
        net_amount: netAmt,
        bill_quantity: billQty,
      });
    }
  };

  const handleFootfallSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(footfallFormCount, 10);
    if (isNaN(count) || count < 0) {
      toast.error("Please enter a valid positive integer for Footfall Count.");
      return;
    }
    if (editingFootfall) {
      updateFootfallMutation.mutate({
        store: footfallFormStore,
        row: editingFootfall.row,
        time: footfallFormTime,
        footfall: count,
      });
    } else {
      addFootfallMutation.mutate({
        store: footfallFormStore,
        date: effectiveStartDate,
        time: footfallFormTime,
        footfall: count,
      });
    }
  };

  const handleNobSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(nobFormCount, 10);
    if (isNaN(count) || count < 0) {
      toast.error("Please enter a valid positive integer for Buyers Count (NOB).");
      return;
    }
    if (editingNob) {
      updateNobMutation.mutate({
        store: nobFormStore,
        row: editingNob.row,
        time: nobFormTime,
        nob: count,
      });
    } else {
      addNobMutation.mutate({
        store: nobFormStore,
        date: effectiveStartDate,
        time: nobFormTime,
        nob: count,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Controls Card */}
      <div className="glossy-card flex flex-col gap-4 rounded-3xl p-4 sm:p-6 shadow-2xl border border-white/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Operational History & Performance Analysis</h2>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Time-slot-wise performance breakdown, multi-day trend analysis, and comprehensive operations logs.
              {isAdmin && rangeMode === "single" && (
                <span className="ml-1.5 font-semibold text-amber-500 dark:text-amber-400">
                  (Admin Single-Day Edit & Delete Active)
                </span>
              )}
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
              <button
                type="button"
                onClick={() => window.print()}
                className="glossy-btn flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-foreground transition-all cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5 text-primary" />
                <span>Print</span>
              </button>
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
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 border border-white/20"
                      : "glossy-btn text-muted-foreground hover:text-foreground"
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
                            {fmtDateDot(d.date)} ({d.day_name.slice(0, 3)})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value={effectiveStartDate} className="text-xs">
                          {fmtDateDot(effectiveStartDate)}
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
                  {fmtDateDot(effectiveStartDate)} &rarr; {fmtDateDot(effectiveEndDate)} ({daysCount} {daysCount === 1 ? "day" : "days"})
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {detailsLoading || datesLoading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Loading history logs for {isMultiDay ? `${fmtDateDot(effectiveStartDate)} to ${fmtDateDot(effectiveEndDate)}` : fmtDateDot(effectiveStartDate)}...
        </div>
      ) : (
        <>
          {/* Day / Range Overview Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Net Sales */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileHover={{ y: -3, scale: 1.018 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0 }}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-emerald-500 dark:border-l-emerald-400 p-3.5 sm:p-4 transition-all duration-200 overflow-hidden",
                "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
                "shadow-[inset_2px_0_12px_rgba(16,185,129,0.18)] bg-gradient-to-br from-emerald-500/[0.07] via-transparent to-emerald-500/[0.02]",
              )}
            >
              {/* Ambient aura */}
              <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
              {/* Specular line */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
              {/* Hover shimmer */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

              <div className="relative z-10 flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground/90 transition-colors sm:text-xs">
                  {isMultiDay ? "Total Net Sales" : "Net Sales"}
                </span>
                <div className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
                  <IndianRupee className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="relative z-10 mt-2">
                <p className="font-mono text-xl font-extrabold tracking-tight text-foreground group-hover:text-primary transition-colors sm:text-2xl drop-shadow-xs">
                  {fmtCurrencyOrZero(kpis?.net_sales)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Target: {kpis?.sales_target != null ? fmtCurrencyOrZero(kpis.sales_target) : "N/A"}
                  {kpis?.achievement_pct != null && (
                    <span className="ml-1.5 font-semibold text-emerald-500 dark:text-emerald-400">
                      ({fmtPercentOrZero(kpis.achievement_pct)})
                    </span>
                  )}
                </p>
              </div>
            </motion.div>

            {/* Card 2: Footfall & NOB */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileHover={{ y: -3, scale: 1.018 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.03 }}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-purple-500 dark:border-l-purple-400 p-3.5 sm:p-4 transition-all duration-200 overflow-hidden",
                "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
                "shadow-[inset_2px_0_12px_rgba(168,85,247,0.18)] bg-gradient-to-br from-purple-500/[0.07] via-transparent to-purple-500/[0.02]",
              )}
            >
              {/* Ambient aura */}
              <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-purple-500/15 via-purple-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
              {/* Specular line */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
              {/* Hover shimmer */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

              <div className="relative z-10 flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground/90 transition-colors sm:text-xs">
                  {isMultiDay ? "Total Footfall & NOB" : "Footfall & NOB"}
                </span>
                <div className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-purple-500/10 border border-purple-500/25 text-purple-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
                  <Footprints className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="relative z-10 mt-2">
                <p className="font-mono text-xl font-extrabold tracking-tight text-foreground group-hover:text-primary transition-colors sm:text-2xl drop-shadow-xs">
                  {fmtNumberOrZero(kpis?.footfall)} <span className="text-xs font-normal text-muted-foreground">visitors</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Buyers (NOB): <span className="font-semibold text-foreground">{fmtNumberOrZero(kpis?.nob)}</span>
                  {kpis?.conversion_pct != null && (
                    <span className="ml-1.5 font-semibold text-amber-500 dark:text-amber-400">
                      ({fmtPercentOrZero(kpis.conversion_pct)} conv.)
                    </span>
                  )}
                </p>
              </div>
            </motion.div>

            {/* Card 3: Billing & Quantity */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileHover={{ y: -3, scale: 1.018 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.06 }}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-sky-500 dark:border-l-sky-400 p-3.5 sm:p-4 transition-all duration-200 overflow-hidden",
                "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
                "shadow-[inset_2px_0_12px_rgba(14,165,233,0.18)] bg-gradient-to-br from-sky-500/[0.07] via-transparent to-sky-500/[0.02]",
              )}
            >
              {/* Ambient aura */}
              <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
              {/* Specular line */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
              {/* Hover shimmer */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

              <div className="relative z-10 flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground/90 transition-colors sm:text-xs">
                  {isMultiDay ? "Total Items & Avg ATV" : "Billing & Quantity"}
                </span>
                <div className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-sky-500/10 border border-sky-500/25 text-sky-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
                  <PackageCheck className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="relative z-10 mt-2">
                <p className="font-mono text-xl font-extrabold tracking-tight text-foreground group-hover:text-primary transition-colors sm:text-2xl drop-shadow-xs">
                  {fmtNumberOrZero(kpis?.bill_quantity)} <span className="text-xs font-normal text-muted-foreground">units sold</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ATV: <span className="font-semibold text-foreground">{fmtCurrencyOrZero(kpis?.atv)}</span>
                  {kpis?.basket_size != null && (
                    <span className="ml-1.5 font-semibold text-sky-500 dark:text-sky-400">
                      ({fmtNumberOrZero(kpis.basket_size)} items/bill)
                    </span>
                  )}
                </p>
              </div>
            </motion.div>

            {/* Card 4: Revenue Per Visitor */}
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              whileHover={{ y: -3, scale: 1.018 }}
              whileTap={{ scale: 0.99 }}
              transition={{ type: "spring", stiffness: 240, damping: 22, delay: 0.09 }}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl border border-border/70 border-l-[3.5px] border-l-amber-500 dark:border-l-amber-400 p-3.5 sm:p-4 transition-all duration-200 overflow-hidden",
                "bg-card/90 dark:bg-card/75 backdrop-blur-md shadow-xs hover:shadow-lg hover:border-border",
                "shadow-[inset_2px_0_12px_rgba(245,158,11,0.18)] bg-gradient-to-br from-amber-500/[0.07] via-transparent to-amber-500/[0.02]",
              )}
            >
              {/* Ambient aura */}
              <div className="pointer-events-none absolute -top-10 -left-10 h-28 w-28 rounded-full bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent opacity-60 blur-xl transition-opacity duration-300 group-hover:opacity-100" />
              {/* Specular line */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 dark:via-white/15 to-transparent" />
              {/* Hover shimmer */}
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />

              <div className="relative z-10 flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground/90 transition-colors sm:text-xs">
                  Revenue Per Visitor
                </span>
                <div className="flex h-5.5 w-5.5 items-center justify-center rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-500 shadow-xs transition-transform duration-300 group-hover:scale-110">
                  <CalendarClock className="h-3.5 w-3.5" />
                </div>
              </div>
              <div className="relative z-10 mt-2">
                <p className="font-mono text-xl font-extrabold tracking-tight text-foreground group-hover:text-primary transition-colors sm:text-2xl drop-shadow-xs">
                  {fmtCurrencyOrZero(kpis?.rpv)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Remaining Gap: <span className="font-semibold text-foreground">{kpis?.remaining != null ? fmtCurrencyOrZero(kpis.remaining) : "N/A"}</span>
                </p>
              </div>
            </motion.div>
          </div>

          {/* At a Glance · Context & Comparative Lookback Analytics */}
          <AtAGlanceCard
            storeCode={effectiveStore}
            storeName={STORE_OPTIONS.find((s) => s.code === effectiveStore)?.name ?? effectiveStore}
            date={referenceDateForSnapshot}
            data={singleDaySnapshot}
            isLoading={detailsLoading}
          />

          {/* Interactive Historical Operations Visualization Graphs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Section
              title={
                isMultiDay
                  ? `Revenue Trajectory Trend (${fmtDateDot(effectiveStartDate)} to ${fmtDateDot(effectiveEndDate)})`
                  : `Hourly Performance by Time Slot (${fmtDateDot(effectiveStartDate)})`
              }
              className="mb-0 h-full"
            >
              <ChartPanel
                chartId="daily_timeslot_breakdown"
                filters={{
                  ...emptyFilterState(),
                  stores: effectiveStore === "ALL" ? ["NM", "HB", "CHW"] : [effectiveStore],
                  start: effectiveStartDate,
                  end: effectiveEndDate,
                }}
                className="h-[320px] sm:h-[400px] w-full"
              />
            </Section>

            <Section
              title={
                isMultiDay
                  ? `Footfall vs NOB (Buyers) Yield Trend (${daysCount} Days)`
                  : `Footfall vs NOB Yield (${fmtDateDot(effectiveStartDate)})`
              }
              className="mb-0 h-full"
            >
              <ChartPanel
                chartId="daily_footfall_nob"
                filters={{
                  ...emptyFilterState(),
                  stores: effectiveStore === "ALL" ? ["NM", "HB", "CHW"] : [effectiveStore],
                  start: effectiveStartDate,
                  end: effectiveEndDate,
                }}
                className="h-[320px] sm:h-[400px] w-full"
              />
            </Section>
          </div>

          {/* Multi-Day Daily Breakdown Table */}
          {isMultiDay && dailyBreakdown.length > 0 && (
            <Section title={`Day-Wise Summary Breakdown (${dailyBreakdown.length} Recorded Days)`}>
              <div className="w-full overflow-x-auto rounded-xl border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="font-semibold whitespace-nowrap">Date</TableHead>
                      <TableHead className="font-semibold whitespace-nowrap">Day</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">Net Sales (₹)</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">Target (₹)</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">Achievement %</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">Remaining (₹)</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">Bill Qty</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">Footfall</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">NOB</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">Basket Size</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">ATV (₹)</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">RPV (₹)</TableHead>
                      <TableHead className="text-right font-semibold whitespace-nowrap">Conversion %</TableHead>
                      <TableHead className="text-center font-semibold whitespace-nowrap">Inspect</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyBreakdown.map((day) => (
                      <TableRow key={day.date} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-semibold text-foreground whitespace-nowrap">{fmtDateDot(day.date)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{day.day_name}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-400 whitespace-nowrap">
                          {fmtCurrencyOrZero(day.net_sales)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                          {day.sales_target != null ? fmtCurrencyOrZero(day.sales_target) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-indigo-300 whitespace-nowrap">
                          {fmtPercentOrZero(day.achievement_pct)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                          {fmtCurrencyOrZero(day.remaining)}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">
                          {fmtNumberOrZero(day.bill_quantity)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmtNumberOrZero(day.footfall)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmtNumberOrZero(day.nob)}</TableCell>
                        <TableCell className="text-right font-semibold text-amber-300 whitespace-nowrap">
                          {fmtNumberOrZero(day.basket_size)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmtCurrencyOrZero(day.atv)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{fmtCurrencyOrZero(day.rpv)}</TableCell>
                        <TableCell className="text-right font-semibold text-blue-400 whitespace-nowrap">
                          {fmtPercentOrZero(day.conversion_pct)}
                        </TableCell>
                        <TableCell className="text-center whitespace-nowrap">
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
            {(() => {
              const billColSpan = 4 + (isMultiDay ? 1 : 0) + (effectiveStore === "ALL" ? 1 : 0) + (isAdmin && rangeMode === "single" ? 1 : 0);
              const footfallColSpan = 3 + (isMultiDay ? 1 : 0) + (effectiveStore === "ALL" ? 1 : 0) + (isAdmin && rangeMode === "single" ? 1 : 0);
              const nobColSpan = 3 + (isMultiDay ? 1 : 0) + (effectiveStore === "ALL" ? 1 : 0) + (isAdmin && rangeMode === "single" ? 1 : 0);

              return (
                <Tabs defaultValue="bills" className="w-full">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                    <TabsList>
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

                    {/* Admin-Only Single Day Quick Action Add Buttons */}
                    {isAdmin && rangeMode === "single" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleOpenAddBill}
                          className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Add Bill Entry
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleOpenAddFootfall}
                          className="h-8 gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Add Footfall Entry
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleOpenAddNob}
                          className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                          Add NOB Entry
                        </Button>
                      </div>
                    )}
                  </div>

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
                            {isAdmin && rangeMode === "single" && (
                              <TableHead className="text-right w-24">Actions</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredBills.map((b) => (
                            <TableRow key={`${b.store ?? effectiveStore}-${b.date ?? ""}-${b.row}`} className="hover:bg-muted/30">
                              <TableCell className="font-mono text-xs text-muted-foreground">{b.row}</TableCell>
                              {isMultiDay && (
                                <TableCell className="font-mono text-xs text-muted-foreground">{fmtDateDot(b.date ?? effectiveStartDate)}</TableCell>
                              )}
                              {effectiveStore === "ALL" && (
                                <TableCell className="font-semibold text-xs text-blue-600 dark:text-blue-300">
                                  {(STORE_NAME_BY_CODE as Record<string, string>)[b.store ?? ""] || b.store}
                                </TableCell>
                              )}
                              <TableCell className="font-medium text-foreground">
                                <span className="font-mono text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                                  {fmtTime12Hour(b.bill_time)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                {fmtCurrencyOrZero(b.net_amount)}
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">{fmtNumberOrZero(b.bill_quantity)}</TableCell>
                              <TableCell className="text-right">
                                <span className="rounded-md bg-muted/60 border border-border px-2 py-0.5 text-xs text-muted-foreground font-medium">
                                  {b.time_slot || (b.bill_time ? timeSlotForHHMM(toTimeHHMM(b.bill_time)) : null) || "—"}
                                </span>
                              </TableCell>
                              {isAdmin && rangeMode === "single" && (
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOpenEditBill(b)}
                                      className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300"
                                      title="Edit this bill log entry"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const targetStore = b.store || (effectiveStore === "ALL" ? "NM" : effectiveStore);
                                        if (confirm(`Delete bill entry #${b.row} (${fmtCurrencyOrZero(b.net_amount)}) from store ${targetStore}?`)) {
                                          deleteBillMutation.mutate({ store: targetStore, row: b.row });
                                        }
                                      }}
                                      className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300"
                                      title="Delete this bill log entry"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                          {filteredBills.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={billColSpan}
                                className="h-20 text-center text-muted-foreground text-xs"
                              >
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
                            {isAdmin && rangeMode === "single" && (
                              <TableHead className="text-right w-24">Actions</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredFootfall.map((f) => (
                            <TableRow key={`${f.store ?? effectiveStore}-${f.date ?? ""}-${f.row}`} className="hover:bg-muted/30">
                              <TableCell className="font-mono text-xs text-muted-foreground">{f.row}</TableCell>
                              {isMultiDay && (
                                <TableCell className="font-mono text-xs text-muted-foreground">{fmtDateDot(f.date ?? effectiveStartDate)}</TableCell>
                              )}
                              {effectiveStore === "ALL" && (
                                <TableCell className="font-semibold text-xs text-blue-600 dark:text-blue-300">
                                  {(STORE_NAME_BY_CODE as Record<string, string>)[f.store ?? ""] || f.store}
                                </TableCell>
                              )}
                              <TableCell className="font-medium text-foreground">
                                <span className="font-mono text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                                  {fmtTime12Hour(f.time)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-semibold text-purple-600 dark:text-purple-300 font-mono">
                                {fmtNumberOrZero(f.footfall)}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="rounded-md bg-muted/60 border border-border px-2 py-0.5 text-xs text-muted-foreground font-medium">
                                  {f.time_slot || (f.time ? timeSlotForHHMM(toTimeHHMM(f.time)) : null) || "—"}
                                </span>
                              </TableCell>
                              {isAdmin && rangeMode === "single" && (
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOpenEditFootfall(f)}
                                      className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300"
                                      title="Edit this footfall log entry"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const targetStore = f.store || (effectiveStore === "ALL" ? "NM" : effectiveStore);
                                        if (confirm(`Delete footfall entry #${f.row} (${f.footfall} visitors) from store ${targetStore}?`)) {
                                          deleteFootfallMutation.mutate({ store: targetStore, row: f.row });
                                        }
                                      }}
                                      className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300"
                                      title="Delete this footfall log entry"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                          {filteredFootfall.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={footfallColSpan}
                                className="h-20 text-center text-muted-foreground text-xs"
                              >
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
                            {isAdmin && rangeMode === "single" && (
                              <TableHead className="text-right w-24">Actions</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredNob.map((n) => (
                            <TableRow key={`${n.store ?? effectiveStore}-${n.date ?? ""}-${n.row}`} className="hover:bg-muted/30">
                              <TableCell className="font-mono text-xs text-muted-foreground">{n.row}</TableCell>
                              {isMultiDay && (
                                <TableCell className="font-mono text-xs text-muted-foreground">{fmtDateDot(n.date ?? effectiveStartDate)}</TableCell>
                              )}
                              {effectiveStore === "ALL" && (
                                <TableCell className="font-semibold text-xs text-blue-600 dark:text-blue-300">
                                  {(STORE_NAME_BY_CODE as Record<string, string>)[n.store ?? ""] || n.store}
                                </TableCell>
                              )}
                              <TableCell className="font-medium text-foreground">
                                <span className="font-mono text-xs font-bold text-foreground inline-flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                                  {fmtTime12Hour(n.time)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-semibold text-blue-600 dark:text-blue-400 font-mono">
                                {fmtNumberOrZero(n.nob)}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="rounded-md bg-muted/60 border border-border px-2 py-0.5 text-xs text-muted-foreground font-medium">
                                  {n.time_slot || (n.time ? timeSlotForHHMM(toTimeHHMM(n.time)) : null) || "—"}
                                </span>
                              </TableCell>
                              {isAdmin && rangeMode === "single" && (
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOpenEditNob(n)}
                                      className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 dark:text-blue-400 dark:hover:text-blue-300"
                                      title="Edit this NOB log entry"
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        const targetStore = n.store || (effectiveStore === "ALL" ? "NM" : effectiveStore);
                                        if (confirm(`Delete NOB entry #${n.row} (${n.nob} buyers) from store ${targetStore}?`)) {
                                          deleteNobMutation.mutate({ store: targetStore, row: n.row });
                                        }
                                      }}
                                      className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 dark:hover:text-rose-300"
                                      title="Delete this NOB log entry"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                          {filteredNob.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={nobColSpan}
                                className="h-20 text-center text-muted-foreground text-xs"
                              >
                                No NOB / sales buyer entries logged for this date / filter.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              );
            })()}
          </Section>
        </>
      )}

      {/* --- ADMIN CRUD DIALOGS --- */}

      {/* 1. BILL ENTRY DIALOG */}
      <Dialog open={billModalOpen} onOpenChange={setBillModalOpen}>
        <DialogContent className="sm:max-w-md border border-border bg-card text-foreground shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 font-bold">
              <IndianRupee className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
              {editingBill ? `Edit Bill Log Entry #${editingBill.row}` : `Add New Bill Log Entry (${effectiveStartDate})`}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              {editingBill
                ? "Update billing details in MongoDB database for the selected store."
                : `Record a new sales bill entry for ${effectiveStartDate}.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBillSubmit} className="space-y-4 pt-2">
            {effectiveStore === "ALL" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Store</Label>
                <select
                  value={billFormStore}
                  onChange={(e) => setBillFormStore(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary"
                  disabled={!!editingBill}
                >
                  {STORE_TARGET_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Bill Time Stamp</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                    {fmtTime12Hour(billFormTime)}
                  </span>
                  {timeSlotForHHMM(billFormTime) && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 border border-border px-2 py-0.5 rounded-lg">
                      {timeSlotForHHMM(billFormTime)}
                    </span>
                  )}
                </div>
              </div>
              <Input
                type="time"
                value={billFormTime}
                onChange={(e) => setBillFormTime(e.target.value)}
                className="bg-background border-border text-foreground text-xs font-mono"
                required
              />
              {/* Quick Time Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-muted-foreground font-semibold mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => setBillFormTime(nowTimeHHMM())}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => setBillFormTime("12:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  12:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setBillFormTime("15:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  03:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setBillFormTime("18:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  06:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setBillFormTime("21:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  09:00 PM
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Net Sales Amount (₹)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 1500.00"
                value={billFormAmount}
                onChange={(e) => setBillFormAmount(e.target.value)}
                className="bg-background border-border text-foreground text-xs font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Bill Quantity (Units Sold)</Label>
              <Input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 2"
                value={billFormQuantity}
                onChange={(e) => setBillFormQuantity(e.target.value)}
                className="bg-background border-border text-foreground text-xs font-mono"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBillModalOpen(false)}
                className="border-border text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={addBillMutation.isPending || updateBillMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
              >
                {editingBill ? "Save Changes" : "Create Entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. FOOTFALL ENTRY DIALOG */}
      <Dialog open={footfallModalOpen} onOpenChange={setFootfallModalOpen}>
        <DialogContent className="sm:max-w-md border border-border bg-card text-foreground shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 font-bold">
              <Footprints className="h-4 w-4 text-purple-500 dark:text-purple-400" />
              {editingFootfall ? `Edit Footfall Entry #${editingFootfall.row}` : `Add New Footfall Entry (${effectiveStartDate})`}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              {editingFootfall
                ? "Update hourly customer footfall count in MongoDB database."
                : `Record footfall count for ${effectiveStartDate}.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleFootfallSubmit} className="space-y-4 pt-2">
            {effectiveStore === "ALL" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Store</Label>
                <select
                  value={footfallFormStore}
                  onChange={(e) => setFootfallFormStore(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary"
                  disabled={!!editingFootfall}
                >
                  {STORE_TARGET_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Entry Time Stamp</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-bold bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-lg">
                    {fmtTime12Hour(footfallFormTime)}
                  </span>
                  {timeSlotForHHMM(footfallFormTime) && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 border border-border px-2 py-0.5 rounded-lg">
                      {timeSlotForHHMM(footfallFormTime)}
                    </span>
                  )}
                </div>
              </div>
              <Input
                type="time"
                value={footfallFormTime}
                onChange={(e) => setFootfallFormTime(e.target.value)}
                className="bg-background border-border text-foreground text-xs font-mono"
                required
              />
              {/* Quick Time Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-muted-foreground font-semibold mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => setFootfallFormTime(nowTimeHHMM())}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => setFootfallFormTime("12:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  12:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setFootfallFormTime("15:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  03:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setFootfallFormTime("18:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  06:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setFootfallFormTime("21:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  09:00 PM
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Footfall Count (Visitors)</Label>
              <Input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 25"
                value={footfallFormCount}
                onChange={(e) => setFootfallFormCount(e.target.value)}
                className="bg-background border-border text-foreground text-xs font-mono"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFootfallModalOpen(false)}
                className="border-border text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={addFootfallMutation.isPending || updateFootfallMutation.isPending}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer"
              >
                {editingFootfall ? "Save Changes" : "Create Entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. NOB ENTRY DIALOG */}
      <Dialog open={nobModalOpen} onOpenChange={setNobModalOpen}>
        <DialogContent className="sm:max-w-md border border-border bg-card text-foreground shadow-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2 font-bold">
              <PackageCheck className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              {editingNob ? `Edit Sales NOB Entry #${editingNob.row}` : `Add New Sales NOB Entry (${effectiveStartDate})`}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              {editingNob
                ? "Update Number of Buyers (NOB) in MongoDB database."
                : `Record buyers count for ${effectiveStartDate}.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleNobSubmit} className="space-y-4 pt-2">
            {effectiveStore === "ALL" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Store</Label>
                <select
                  value={nobFormStore}
                  onChange={(e) => setNobFormStore(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary"
                  disabled={!!editingNob}
                >
                  {STORE_TARGET_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Entry Time Stamp</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400 font-bold bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-lg">
                    {fmtTime12Hour(nobFormTime)}
                  </span>
                  {timeSlotForHHMM(nobFormTime) && (
                    <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 border border-border px-2 py-0.5 rounded-lg">
                      {timeSlotForHHMM(nobFormTime)}
                    </span>
                  )}
                </div>
              </div>
              <Input
                type="time"
                value={nobFormTime}
                onChange={(e) => setNobFormTime(e.target.value)}
                className="bg-background border-border text-foreground text-xs font-mono"
                required
              />
              {/* Quick Time Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-muted-foreground font-semibold mr-1">Presets:</span>
                <button
                  type="button"
                  onClick={() => setNobFormTime(nowTimeHHMM())}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  Now
                </button>
                <button
                  type="button"
                  onClick={() => setNobFormTime("12:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  12:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setNobFormTime("15:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  03:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setNobFormTime("18:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  06:00 PM
                </button>
                <button
                  type="button"
                  onClick={() => setNobFormTime("21:00")}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border px-2 py-0.5 text-[10px] font-semibold text-foreground transition-all cursor-pointer"
                >
                  09:00 PM
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Buyers Count (NOB)</Label>
              <Input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 12"
                value={nobFormCount}
                onChange={(e) => setNobFormCount(e.target.value)}
                className="bg-background border-border text-foreground text-xs font-mono"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNobModalOpen(false)}
                className="border-border text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={addNobMutation.isPending || updateNobMutation.isPending}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold cursor-pointer"
              >
                {editingNob ? "Save Changes" : "Create Entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
