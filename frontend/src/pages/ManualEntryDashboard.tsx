import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, Clock, Receipt, Users } from "lucide-react";
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
import { TimePicker12Hour } from "@/components/TimePicker12Hour";
import { fmtCurrencyOrZero, fmtDateIndian, fmtNumberOrZero, nowTimeHHMM, todayLocalDate } from "@/lib/format";
import { timeSlotForHHMM } from "@/lib/timeSlot";

/** Clamps the current clock time between store opening (10:30 AM) and closing (11:59 PM). */
function getInitialOperatingTime(): string {
  const t = nowTimeHHMM();
  if (t < "10:30") return "10:30";
  if (t > "23:59") return "23:59";
  return t;
}

/** Which fields a save touches: "footfall" = the Footfall section's own
 * Update button, "bill-nob" = the Bill Details & NOB section's own Update
 * button, "all" = the shared Final Submission (Footfall + Bill + NOB + Remarks). */
type SaveScope = "footfall" | "bill-nob" | "all";

import { useLanguage } from "@/context/LanguageContext";

/** Easily understandable user guide for managers explaining how to log footfall,
 * bills, NOB, and remarks, as well as the difference between Update and Final Submission. */
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

/** One store's Manual Daily Entry -- paired in the nav with that same store's
 * read-only Daily Dashboard (StoreDailyDashboard.tsx). One page, top to bottom:
 *
 * 1. "Date & Time Stamp" -- Date fixed to today (Indian format, read-only, no
 *    picker/backfill) and one editable Time Stamp (IST) shared by everything
 *    logged below; Time Slot is system-generated from it.
 * 2/3. "Footfall" (one number field) and "Bill Details & NOB" (Net Amount /
 *    Bill Quantity / NOB) sit side by side on wide screens (lg:grid-cols-2),
 *    stacking on narrow ones. Each carries its OWN Reset + Update: Footfall's
 *    Update logs only the Footfall count (handleSave("footfall")), Bill
 *    Details & NOB's logs only the bill + NOB entry (handleSave("bill-nob")) --
 *    both at the shared Time Stamp, then refresh today's snapshot with
 *    reason: null so a section-scoped Update never clobbers saved Remarks.
 * 4. "Save Today's Entry" -- Remarks + the single shared Final Submission
 *    button (handleSave("all")): logs whichever of Footfall/bill/NOB are
 *    filled AND writes Remarks, behind a confirmation, for the deliberate
 *    end-of-day click. All three scopes run through the one saveMutation.
 *    (The tab split between Footfall and Billing, and Footfall's own separate
 *    "Add" button, were removed here -- a manager kept missing that Final
 *    Submission didn't cover Footfall.)
 *
 * The "Logged Footfall" and "Logged Bills & NOB" tables (existing rows edited
 * /deleted inline) live on the read-only Daily Dashboard now, below "Today's
 * Context" -- see components/LoggedDailyEntries.tsx. Footfall, Bills, and NOB
 * stay three fully independent logs; each KPI figure is the live SUM of its
 * own log (src/daily_dashboard_store.py's sum_*_log), never derived from
 * another. */
function ManualEntry({ store }: { store: string }) {
  const entryDate = todayLocalDate();

  const queryClient = useQueryClient();
  // The logged-entries tables that consume these keys render on the Daily
  // Dashboard; invalidating here keeps them fresh after an add.
  const invalidateBillLog = () => queryClient.invalidateQueries({ queryKey: ["bill-log", store, entryDate] });
  const invalidateFootfallLog = () => queryClient.invalidateQueries({ queryKey: ["footfall-log", store, entryDate] });
  const invalidateNobLog = () => queryClient.invalidateQueries({ queryKey: ["nob-log", store, entryDate] });
  const invalidateLive = () => queryClient.invalidateQueries({ queryKey: ["daily-live", store, entryDate] });

  const liveQuery = useQuery({
    queryKey: ["daily-live", store, entryDate],
    queryFn: () => api.dailyLive(store, entryDate),
  });

  // One shared Time Stamp for whatever gets logged next (IST, clamped 10:30 - 23:59).
  const [entryTime, setEntryTime] = useState(getInitialOperatingTime);
  const [footfallValue, setFootfallValue] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [billQuantity, setBillQuantity] = useState("");
  const [nobValue, setNobValue] = useState("");
  const [reason, setReason] = useState("");
  const [showFinalSubmitConfirm, setShowFinalSubmitConfirm] = useState(false);

  // Prefill Remarks from the last saved value -- otherwise reopening a day
  // that already has an update on it would show a blank textarea.
  useEffect(() => {
    setReason(liveQuery.data?.reason ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveQuery.data?.reason]);

  const saveMutation = useMutation({
    mutationFn: async (scope: SaveScope) => {
      const doFootfall = scope !== "bill-nob";
      const doBillNob = scope !== "footfall";

      const footfallIntent = doFootfall && footfallValue.trim() !== "";
      const billIntent = doBillNob && (netAmount.trim() !== "" || billQuantity.trim() !== "");
      const nobIntent = doBillNob && nobValue.trim() !== "";

      // Log each filled-in section at the shared Time Stamp, tracking what
      // actually made it in so a mid-sequence failure can say which log saved
      // and which didn't.
      const logged: string[] = [];
      if (footfallIntent) {
        await api.addFootfallEntry({ store, date: entryDate, time: entryTime, footfall: Number(footfallValue) });
        logged.push("footfall");
      }
      if (billIntent) {
        await api.addBillEntry({
          store,
          date: entryDate,
          bill_time: entryTime,
          net_amount: Number(netAmount),
          bill_quantity: Number(billQuantity),
        });
        logged.push("bill");
      }
      if (nobIntent) {
        await api.addNobEntry({ store, date: entryDate, time: entryTime, nob: Number(nobValue) });
        logged.push("nob");
      }
      try {
        // Final Submission always writes Remarks (even when empty, to clear
        // it); section-scoped Updates pass null to preserve whatever reason is
        // already saved for today.
        const remarksPayload = scope === "all" ? reason.trim() : null;
        await api.saveTargetEntry({ store, date: entryDate, reason: remarksPayload });
      } catch (error) {
        if (logged.length > 0) {
          throw new Error(`${logged.join(", ")} logged, but the day summary failed to save: ${(error as Error).message}`);
        }
        throw error;
      }
      return { logged, scope };
    },
    onSuccess: ({ logged, scope }) => {
      if (scope === "all") {
        toast.success("Final entry submitted for today.");
      } else {
        const labels: Record<string, string> = { footfall: "Footfall", bill: "Bill", nob: "NOB" };
        const saved = logged.map((k) => labels[k] ?? k).join(" + ");
        toast.success(saved ? `${saved} entry updated.` : "Today's entry updated.");
      }

      setEntryTime(getInitialOperatingTime());
      if (scope === "footfall" || scope === "all") {
        setFootfallValue("");
        invalidateFootfallLog();
      }
      if (scope === "bill-nob" || scope === "all") {
        setNetAmount("");
        setBillQuantity("");
        setNobValue("");
        invalidateBillLog();
        invalidateNobLog();
      }
      invalidateLive();
    },
    onError: (error: Error, scope) => toast.error(`${scope === "all" ? "Final Submission" : "Update"} failed: ${error.message}`),
  });

  function resetFootfall() {
    setFootfallValue("");
    setEntryTime(getInitialOperatingTime());
    toast.info("Footfall field cleared.");
  }

  function resetBillNob() {
    setNetAmount("");
    setBillQuantity("");
    setNobValue("");
    setEntryTime(getInitialOperatingTime());
    toast.info("Bill Details & NOB fields cleared.");
  }

  function handleSave(scope: SaveScope) {
    const isFinal = scope === "all";
    const touchFootfall = scope !== "bill-nob";
    const touchBillNob = scope !== "footfall";

    const footfallFilled = touchFootfall && footfallValue.trim() !== "";
    const netAmountFilled = netAmount.trim() !== "";
    const billQuantityFilled = billQuantity.trim() !== "";
    const billIntent = touchBillNob && (netAmountFilled || billQuantityFilled);
    const nobIntent = touchBillNob && nobValue.trim() !== "";

    // Final Submission is a deliberate "I'm done for today" click and is
    // always allowed through (it just refreshes the day's snapshot against
    // the latest logs). A section-scoped Update needs something new in its
    // own fields to save.
    if (scope === "footfall" && !footfallFilled) {
      toast.error("Enter a Footfall count to update.");
      return;
    }
    if (scope === "bill-nob" && !billIntent && !nobIntent) {
      toast.error("Enter a bill (Net Amount + Bill Quantity) or NOB to update.");
      return;
    }
    if (scope === "all" && !footfallFilled && !billIntent && !nobIntent && reason.trim() === "") {
      toast.error("Nothing to submit -- enter a Footfall count, a bill, NOB, or Remarks.");
      return;
    }
    if (footfallFilled || billIntent || nobIntent) {
      if (!entryTime) {
        toast.error("Time Stamp is required.");
        return;
      }
      if (entryTime < "10:30" || entryTime > "23:59") {
        toast.error("Time Stamp must be between 10:30 AM and 11:59 PM (store operating hours).");
        return;
      }
    }
    if (footfallFilled) {
      const f = Number(footfallValue);
      if (Number.isNaN(f) || f < 0) {
        toast.error("Footfall must be a non-negative number.");
        return;
      }
    }
    if (billIntent) {
      if (!netAmountFilled || !billQuantityFilled) {
        toast.error("A bill needs both Net Amount and Bill Quantity filled in.");
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
    if (nobIntent) {
      const nob = Number(nobValue);
      if (Number.isNaN(nob) || nob < 0) {
        toast.error("NOB must be a non-negative number.");
        return;
      }
    }

    if (isFinal) {
      setShowFinalSubmitConfirm(true);
      return;
    }
    saveMutation.mutate(scope);
  }

  const previewSlot = timeSlotForHHMM(entryTime);

  return (
    <div>
      <ManagerUserGuide />

      <Section title="Date & Time Stamp" className="mb-4">
        <div className="grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-3">
          <div>
            <Label className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">Date</Label>
            <div className="border-input bg-muted/50 text-foreground flex h-9 w-full items-center rounded-md border px-3 text-sm font-semibold shadow-xs">
              {fmtDateIndian(entryDate)}
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">Time Stamp (12-Hour)</Label>
            <TimePicker12Hour
              value={entryTime}
              onChange={setEntryTime}
              disabled={saveMutation.isPending}
            />
          </div>
          <div>
            <Label className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">Time Slot</Label>
            <div
              className="border-input bg-muted/50 text-foreground flex h-9 w-full items-center rounded-md border px-3 text-xs font-semibold shadow-xs text-primary"
              title="System-generated from Time Stamp -- not editable"
            >
              {previewSlot ?? "Outside store hours (10:30 AM - 11:59 PM)"}
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-2.5 text-xs">
          Applies to Footfall, Bill Details and NOB below. Operational hours: <strong>10.30 am</strong> to <strong>11.59 pm</strong>.
        </p>
      </Section>

      {/* Footfall and Bill Details & NOB sit side by side (same level) on wide
       * screens, stacking only when there isn't room. Each has its own
       * Update / Reset that saves just that section; the shared Final
       * Submission below covers everything (Footfall + Bill + NOB + Remarks). */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Footfall" className="mb-0 flex h-full flex-col">
          <p className="text-muted-foreground mb-3 text-sm">
            Footfall logged today: <span className="text-foreground font-semibold">{fmtNumberOrZero(liveQuery.data?.kpis.footfall ?? 0)}</span>
          </p>
          <div className="max-w-xs">
            <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Footfall (visitors)</Label>
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={footfallValue}
              onChange={(e) => setFootfallValue(e.target.value)}
            />
          </div>
          <p className="text-muted-foreground mt-2 text-xs">Added to today's Footfall at the shared Time Stamp when you click Update (or Final Submission below).</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={saveMutation.isPending} onClick={resetFootfall}>
              Reset
            </Button>
            <Button variant="outline" disabled={saveMutation.isPending} onClick={() => handleSave("footfall")}>
              {saveMutation.isPending && saveMutation.variables === "footfall" ? "Updating..." : "Update"}
            </Button>
          </div>
        </Section>

        <Section title="Bill Details & NOB" className="mb-0 flex h-full flex-col">
          <p className="text-muted-foreground mb-4 text-sm">
            Total Sales Target (admin-defined): <span className="text-foreground font-semibold">{fmtCurrencyOrZero(liveQuery.data?.kpis.sales_target)}</span>
            {" · "}Net Sales so far: <span className="text-foreground font-semibold">{fmtCurrencyOrZero(liveQuery.data?.kpis.net_sales)}</span>
            {" · "}NOB logged today: <span className="text-foreground font-semibold">{fmtNumberOrZero(liveQuery.data?.kpis.nob ?? 0)}</span>
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Net Amount</Label>
              <Input type="number" min={0} step="any" inputMode="decimal" value={netAmount} onChange={(e) => setNetAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Bill Quantity (units sold)</Label>
              <Input type="number" min={0} step="any" inputMode="decimal" value={billQuantity} onChange={(e) => setBillQuantity(e.target.value)} />
            </div>
            <div>
              <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">NOB</Label>
              <Input type="number" min={0} step="any" inputMode="decimal" value={nobValue} onChange={(e) => setNobValue(e.target.value)} />
            </div>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">A bill needs both Net Amount and Bill Quantity. Update saves this section at the shared Time Stamp.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={saveMutation.isPending} onClick={resetBillNob}>
              Reset
            </Button>
            <Button variant="outline" disabled={saveMutation.isPending} onClick={() => handleSave("bill-nob")}>
              {saveMutation.isPending && saveMutation.variables === "bill-nob" ? "Updating..." : "Update"}
            </Button>
          </div>
        </Section>
      </div>

      <Section title="Save Today's Entry" className="mb-4">
        <p className="text-muted-foreground mb-3 text-sm">
          Final Submission records the Footfall, bill and NOB entered above (whichever are filled) at{" "}
          <span className="text-foreground font-semibold">{entryTime || "—"}</span>
          {previewSlot ? ` (${previewSlot})` : ""}, saves the Remarks below, then refreshes today's totals.
        </p>
        <div>
          <Label className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Remarks (optional)</Label>
          <Textarea
            rows={3}
            placeholder="Only for special cases -- e.g. Holiday, Election/Votes, Weather (Rain)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button disabled={saveMutation.isPending} onClick={() => handleSave("all")}>
            {saveMutation.isPending && saveMutation.variables === "all" ? "Submitting..." : "Final Submission"}
          </Button>
        </div>
      </Section>

      {/* Confirmation Dialog for Final Submission */}
      <Dialog open={showFinalSubmitConfirm} onOpenChange={setShowFinalSubmitConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
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
            This will record today's final entries and snapshot for your store. You can still update later if more bills arrive.
          </p>
          <DialogFooter className="gap-2 pt-2 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setShowFinalSubmitConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={saveMutation.isPending}
              onClick={() => {
                setShowFinalSubmitConfirm(false);
                saveMutation.mutate("all");
              }}
            >
              {saveMutation.isPending && saveMutation.variables === "all" ? "Submitting..." : "Yes"}
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
