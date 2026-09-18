import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, Clock, Receipt, Users, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
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
import { Section } from "@/components/Section";
import { Textarea } from "@/components/ui/textarea";
import { fmtCurrencyOrZero, fmtDateIndian, fmtNumberOrZero, fmtTime12Hour, nowTimeHHMM, todayLocalDate } from "@/lib/format";
import { TIME_SLOT_ORDER, timeSlotForHHMM } from "@/lib/timeSlot";
import { useLanguage } from "@/context/LanguageContext";

/** Map selected time slot to representative time for backend slot categorization */
function getTimeForSlot(slot: string): string {
  const current = nowTimeHHMM();
  if (timeSlotForHHMM(current) === slot) {
    return current;
  }
  switch (slot) {
    case "11.00 AM - 01.59 PM": return "12:00";
    case "02.00 PM - 04.59 PM": return "15:00";
    case "05.00 PM - 07.59 PM": return "18:00";
    case "08.00 PM - 11.59 PM": return "21:00";
    default: return current;
  }
}

/** Manager user guide */
function ManagerUserGuide() {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-blue-500/30 bg-blue-500/5 transition-all">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-blue-500/10 sm:px-5 cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-5 w-5 text-blue-400 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-foreground sm:text-base">
              {t.guideTitle}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t.guideSubtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-blue-400 shrink-0">
          <span>{open ? t.hideGuide : t.viewGuide}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60 p-4 pt-3 sm:p-5 sm:pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Step 1 */}
            <div className="rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                <Clock className="h-4 w-4" />
                <span>{t.step1Title}</span>
              </div>
              <p className="text-xs font-medium text-foreground">{t.step1Header}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t.step1Desc}
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
                <Users className="h-4 w-4" />
                <span>{t.step2Title}</span>
              </div>
              <p className="text-xs font-medium text-foreground">{t.step2Header}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t.step2Desc}
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                <Receipt className="h-4 w-4" />
                <span>{t.step3Title}</span>
              </div>
              <p className="text-xs font-medium text-foreground">{t.step3Header}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground leading-relaxed">
                <li>• {t.step3Net}</li>
                <li>• {t.step3Qty}</li>
                <li>• {t.step3Nob}</li>
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">{t.step3Action}</p>
            </div>

            {/* Step 4 */}
            <div className="rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>{t.step4Title}</span>
              </div>
              <p className="text-xs font-medium text-foreground">{t.step4Header}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t.step4Desc}
              </p>
              <p className="mt-1.5 rounded bg-emerald-500/10 p-1 text-[11px] text-emerald-400">
                {t.step4Safety}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="font-semibold text-foreground">{t.resetFaqTitle}</span>
              <span>{t.resetFaqDesc}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-semibold text-foreground">{t.correctFaqTitle}</span>
              <span>{t.correctFaqDesc}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualEntry({ store }: { store: string }) {
  const entryDate = todayLocalDate();

  const queryClient = useQueryClient();
  const invalidateBillLog = () => queryClient.invalidateQueries({ queryKey: ["bill-log", store, entryDate] });
  const invalidateFootfallLog = () => queryClient.invalidateQueries({ queryKey: ["footfall-log", store, entryDate] });
  const invalidateNobLog = () => queryClient.invalidateQueries({ queryKey: ["nob-log", store, entryDate] });
  const invalidateLive = () => queryClient.invalidateQueries({ queryKey: ["daily-live", store, entryDate] });

  const liveQuery = useQuery({
    queryKey: ["daily-live", store, entryDate],
    queryFn: () => api.dailyLive(store, entryDate),
  });

  // Current system time in 24-hr format (Asia/Kolkata)
  const [systemTime, setSystemTime] = useState(nowTimeHHMM());
  
  // Keep system time ticking every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setSystemTime(nowTimeHHMM());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  // Time Slot Selection (defaults to current time slot or first slot)
  const [selectedSlot, setSelectedSlot] = useState<string>(() => {
    const slot = timeSlotForHHMM(nowTimeHHMM());
    return slot ?? TIME_SLOT_ORDER[0];
  });

  // Merged Floor Operations fields
  const [footfallValue, setFootfallValue] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [billQuantity, setBillQuantity] = useState("");
  const [nobValue, setNobValue] = useState("");
  
  // Remarks field
  const [reason, setReason] = useState("");
  const [showFinalSubmitConfirm, setShowFinalSubmitConfirm] = useState(false);

  // Prefill Remarks from live data
  useEffect(() => {
    if (liveQuery.data?.reason != null) {
      setReason(liveQuery.data.reason);
    }
  }, [liveQuery.data?.reason]);

  // Floor Operations Save Mutation (Footfall + Bill + NOB)
  const floorOpsMutation = useMutation({
    mutationFn: async () => {
      const timeToLog = getTimeForSlot(selectedSlot);
      const footfallFilled = footfallValue.trim() !== "";
      const netFilled = netAmount.trim() !== "";
      const qtyFilled = billQuantity.trim() !== "";
      const nobFilled = nobValue.trim() !== "";

      const logged: string[] = [];

      if (footfallFilled) {
        await api.addFootfallEntry({
          store,
          date: entryDate,
          time: timeToLog,
          footfall: Number(footfallValue),
        });
        logged.push("Footfall");
      }

      if (netFilled || qtyFilled) {
        await api.addBillEntry({
          store,
          date: entryDate,
          bill_time: timeToLog,
          net_amount: Number(netAmount),
          bill_quantity: Number(billQuantity),
        });
        logged.push("Bill");
      }

      if (nobFilled) {
        await api.addNobEntry({
          store,
          date: entryDate,
          time: timeToLog,
          nob: Number(nobValue),
        });
        logged.push("NOB");
      }

      return logged;
    },
    onSuccess: (logged) => {
      const summary = logged.join(" + ");
      toast.success(summary ? `${summary} recorded successfully.` : "Floor operations updated.");
      setFootfallValue("");
      setNetAmount("");
      setBillQuantity("");
      setNobValue("");
      invalidateFootfallLog();
      invalidateBillLog();
      invalidateNobLog();
      invalidateLive();
    },
    onError: (error: Error) => toast.error(`Update failed: ${error.message}`),
  });

  // Remarks Save Mutation
  const remarksMutation = useMutation({
    mutationFn: async () => {
      return api.saveTargetEntry({
        store,
        date: entryDate,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Remarks updated successfully.");
      invalidateLive();
    },
    onError: (error: Error) => toast.error(`Failed to update remarks: ${error.message}`),
  });

  // Final Submission Mutation
  const finalSubmitMutation = useMutation({
    mutationFn: async () => {
      const timeToLog = getTimeForSlot(selectedSlot);
      const footfallFilled = footfallValue.trim() !== "";
      const netFilled = netAmount.trim() !== "";
      const qtyFilled = billQuantity.trim() !== "";
      const nobFilled = nobValue.trim() !== "";

      if (footfallFilled) {
        await api.addFootfallEntry({
          store,
          date: entryDate,
          time: timeToLog,
          footfall: Number(footfallValue),
        });
      }

      if (netFilled || qtyFilled) {
        await api.addBillEntry({
          store,
          date: entryDate,
          bill_time: timeToLog,
          net_amount: Number(netAmount),
          bill_quantity: Number(billQuantity),
        });
      }

      if (nobFilled) {
        await api.addNobEntry({
          store,
          date: entryDate,
          time: timeToLog,
          nob: Number(nobValue),
        });
      }

      await api.saveTargetEntry({
        store,
        date: entryDate,
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Final entry submitted for today.");
      setFootfallValue("");
      setNetAmount("");
      setBillQuantity("");
      setNobValue("");
      invalidateFootfallLog();
      invalidateBillLog();
      invalidateNobLog();
      invalidateLive();
    },
    onError: (error: Error) => toast.error(`Final Submission failed: ${error.message}`),
  });

  function resetFloorOps() {
    setFootfallValue("");
    setNetAmount("");
    setBillQuantity("");
    setNobValue("");
    toast.info("Floor operations fields cleared.");
  }

  function handleFloorOpsUpdate() {
    const footfallFilled = footfallValue.trim() !== "";
    const netFilled = netAmount.trim() !== "";
    const qtyFilled = billQuantity.trim() !== "";
    const nobFilled = nobValue.trim() !== "";

    if (!footfallFilled && !netFilled && !qtyFilled && !nobFilled) {
      toast.error("Please enter Footfall, a Bill (Net Amount & Quantity), or NOB to update.");
      return;
    }

    if (footfallFilled) {
      const f = Number(footfallValue);
      if (Number.isNaN(f) || f < 0) {
        toast.error("Footfall must be a non-negative number.");
        return;
      }
    }

    if (netFilled || qtyFilled) {
      if (!netFilled || !qtyFilled) {
        toast.error("Both Net Amount and Bill Quantity must be filled in for a bill.");
        return;
      }
      const net = Number(netAmount);
      const qty = Number(billQuantity);
      if (Number.isNaN(net) || net < 0) {
        toast.error("Net Amount must be a non-negative number.");
        return;
      }
      if (Number.isNaN(qty) || qty < 0) {
        toast.error("Bill Quantity must be a non-negative number.");
        return;
      }
    }

    if (nobFilled) {
      const nob = Number(nobValue);
      if (Number.isNaN(nob) || nob < 0) {
        toast.error("NOB must be a non-negative number.");
        return;
      }
    }

    floorOpsMutation.mutate();
  }

  function handleRemarksUpdate() {
    remarksMutation.mutate();
  }

  function resetRemarks() {
    setReason("");
    toast.info("Remarks cleared.");
  }

  return (
    <div>
      <ManagerUserGuide />

      {/* 1. Date & Time Stamp Header Section (Contains Final Submission) */}
      <Section title="Date & Time Stamp" className="mb-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
            {/* System Generated Date */}
            <div>
              <Label className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                Date (System Generated)
              </Label>
              <div className="border-input bg-muted/50 text-foreground flex h-9 w-full items-center rounded-md border px-3 text-sm font-semibold shadow-xs">
                {fmtDateIndian(entryDate)}
              </div>
            </div>

            {/* System Generated Time Stamp */}
            <div>
              <Label className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                Time Stamp (12-Hour)
              </Label>
              <div className="border-input bg-muted/50 text-foreground flex h-9 w-full items-center rounded-md border px-3 text-sm font-semibold shadow-xs">
                <Clock className="mr-2 h-4 w-4 text-blue-400 shrink-0" />
                {fmtTime12Hour(systemTime)}
              </div>
            </div>

            {/* Selectable Time Slot */}
            <div>
              <Label className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                Operational Time Slot
              </Label>
              <select
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                className="border-input bg-background text-foreground flex h-9 w-full items-center rounded-md border px-3 text-xs font-semibold shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              >
                {TIME_SLOT_ORDER.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Final Submission Button Relocated Here */}
          <div className="shrink-0">
            <Button
              className="w-full sm:w-auto font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={finalSubmitMutation.isPending}
              onClick={() => setShowFinalSubmitConfirm(true)}
            >
              <Send className="h-4 w-4" />
              {finalSubmitMutation.isPending ? "Submitting..." : "Final Submission"}
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground mt-2.5 text-xs">
          Date and Time Stamp are system generated. Select the operational time slot for entry recording. Operational hours: <strong>10.30 am</strong> to <strong>11.59 pm</strong>.
        </p>
      </Section>

      {/* 2. Merged Floor Operations Section (Footfall + Net Amount + Bill Quantity + NOB) */}
      <Section title="Floor Operations Data Entry" className="mb-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/60">
          <span>
            Footfall logged: <strong className="text-foreground">{fmtNumberOrZero(liveQuery.data?.kpis.footfall ?? 0)}</strong>
          </span>
          <span>•</span>
          <span>
            Net Sales so far: <strong className="text-foreground">{fmtCurrencyOrZero(liveQuery.data?.kpis.net_sales)}</strong>
          </span>
          <span>•</span>
          <span>
            Bill Quantity: <strong className="text-foreground">{fmtNumberOrZero(liveQuery.data?.kpis.bill_quantity ?? 0)}</strong>
          </span>
          <span>•</span>
          <span>
            NOB: <strong className="text-foreground">{fmtNumberOrZero(liveQuery.data?.kpis.nob ?? 0)}</strong>
          </span>
          <span>•</span>
          <span>
            Target: <strong className="text-foreground">{fmtCurrencyOrZero(liveQuery.data?.kpis.sales_target)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
              Footfall (visitors)
            </Label>
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="e.g. 150"
              value={footfallValue}
              onChange={(e) => setFootfallValue(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
              Net Amount (₹)
            </Label>
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="e.g. 25000"
              value={netAmount}
              onChange={(e) => setNetAmount(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
              Bill Quantity (units)
            </Label>
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="e.g. 45"
              value={billQuantity}
              onChange={(e) => setBillQuantity(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
              NOB (Transactions)
            </Label>
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              placeholder="e.g. 30"
              value={nobValue}
              onChange={(e) => setNobValue(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
          <p className="text-muted-foreground text-xs">
            Values will be recorded under <strong>{selectedSlot}</strong>. Click Update to save entries.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={floorOpsMutation.isPending}
              onClick={resetFloorOps}
            >
              Reset
            </Button>
            <Button
              disabled={floorOpsMutation.isPending}
              onClick={handleFloorOpsUpdate}
            >
              {floorOpsMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </div>
        </div>
      </Section>

      {/* 3. Remarks Section with Dedicated Update / Reset */}
      <Section title="Save Today's Entry" className="mb-4">
        <div>
          <Label className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Remarks (Special Notes / Events)
          </Label>
          <Textarea
            rows={3}
            placeholder="Only for special cases -- e.g. Holiday, Election/Votes, Weather (Rain)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
          <p className="text-muted-foreground text-xs">
            Save contextual notes for today's trading conditions (weather, local events, operational notes).
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={remarksMutation.isPending}
              onClick={resetRemarks}
            >
              Reset
            </Button>
            <Button
              disabled={remarksMutation.isPending}
              onClick={handleRemarksUpdate}
            >
              {remarksMutation.isPending ? "Updating..." : "Update"}
            </Button>
          </div>
        </div>
      </Section>

      {/* Confirmation Dialog for Final Submission */}
      <Dialog open={showFinalSubmitConfirm} onOpenChange={setShowFinalSubmitConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Confirm Final Submission</DialogTitle>
                <DialogDescription className="mt-1">
                  Are you sure to Submit data?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            This will record today's final entries and snapshot for your store under <strong>{selectedSlot}</strong>. You can still update later if more bills arrive.
          </p>
          <DialogFooter className="gap-2 pt-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowFinalSubmitConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={finalSubmitMutation.isPending}
              onClick={() => {
                setShowFinalSubmitConfirm(false);
                finalSubmitMutation.mutate();
              }}
            >
              {finalSubmitMutation.isPending ? "Submitting..." : "Yes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ManualEntryNM() {
  return <ManualEntry store="NM" />;
}

export function ManualEntryHB() {
  return <ManualEntry store="HB" />;
}

export function ManualEntryCHW() {
  return <ManualEntry store="CHW" />;
}

