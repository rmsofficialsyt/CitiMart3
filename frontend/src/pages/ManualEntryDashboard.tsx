import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/Section";
import { Textarea } from "@/components/ui/textarea";
import { fmtCurrencyOrZero, fmtDateIndian, fmtNumberOrZero, nowTimeHHMM, todayLocalDate } from "@/lib/format";
import { timeSlotForHHMM } from "@/lib/timeSlot";

/** Which fields a save touches: "footfall" = the Footfall section's own
 * Update button, "bill-nob" = the Bill Details & NOB section's own Update
 * button, "all" = the shared Final Submission (Footfall + Bill + NOB + Remarks). */
type SaveScope = "footfall" | "bill-nob" | "all";

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

  // One shared Time Stamp for whatever gets logged next (IST -- nowTimeHHMM).
  const [entryTime, setEntryTime] = useState(nowTimeHHMM);
  const [footfallValue, setFootfallValue] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [billQuantity, setBillQuantity] = useState("");
  const [nobValue, setNobValue] = useState("");
  const [reason, setReason] = useState("");

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
        logged.push("NOB");
      }
      try {
        // Only Final Submission ("all") writes Remarks; a section-scoped Update
        // passes reason: null so it refreshes the day snapshot without
        // clobbering a previously-saved Remarks note.
        await api.saveTargetEntry({ store, date: entryDate, reason: scope === "all" ? reason.trim() || null : null });
      } catch (error) {
        if (logged.length > 0) {
          throw new Error(`${logged.join(", ")} logged, but the day summary failed to save: ${(error as Error).message}`);
        }
        throw error;
      }
      return scope;
    },
    onSuccess: (scope) => {
      toast.success(scope === "all" ? "Final submission recorded." : "Entry updated.");
      setEntryTime(nowTimeHHMM());
      if (scope !== "bill-nob") {
        setFootfallValue("");
      }
      if (scope !== "footfall") {
        setNetAmount("");
        setBillQuantity("");
        setNobValue("");
      }
      invalidateFootfallLog();
      invalidateBillLog();
      invalidateNobLog();
      invalidateLive();
    },
    onError: (error, scope) => toast.error(`${scope === "all" ? "Final Submission" : "Update"} failed: ${error.message}`),
  });

  function resetFootfall() {
    setFootfallValue("");
    setEntryTime(nowTimeHHMM());
    toast.info("Footfall field cleared.");
  }

  function resetBillNob() {
    setNetAmount("");
    setBillQuantity("");
    setNobValue("");
    setEntryTime(nowTimeHHMM());
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
    if ((footfallFilled || billIntent || nobIntent) && !entryTime) {
      toast.error("Time Stamp is required.");
      return;
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

    if (isFinal && !window.confirm("Submit this as your final entry for today? You can still click Update afterward if more bills come in.")) {
      return;
    }
    saveMutation.mutate(scope);
  }

  const previewSlot = timeSlotForHHMM(entryTime);

  return (
    <div>
      <Section title="Date & Time Stamp" className="mb-4">
        <div className="grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Date</Label>
            <div className="border-input bg-muted/50 text-foreground w-full rounded-md border px-2 py-1.5 text-sm">
              {fmtDateIndian(entryDate)}
            </div>
          </div>
          <div>
            <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Time Stamp</Label>
            <input
              type="time"
              className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
              value={entryTime}
              onChange={(e) => setEntryTime(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Time Slot</Label>
            <div
              className="border-input bg-muted/50 text-foreground w-full rounded-md border px-2 py-1.5 text-sm"
              title="System-generated from Time Stamp -- not editable"
            >
              {previewSlot ?? "Before 11:00 AM — no slot"}
            </div>
          </div>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Applies to Footfall, Bill Details and NOB below. Time Slot is generated from the Time Stamp (IST) and saved
          automatically with each entry; entries before 11:00 AM have no slot.
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
              <Label className="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">Bill Quantity</Label>
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
