import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtCurrencyOrZero, fmtNumberOrZero, fmtTime12Hour, nowTimeHHMM, toTimeHHMM } from "@/lib/format";
import { TIME_SLOT_ORDER, timeSlotForHHMM } from "@/lib/timeSlot";
import type { BillEntry, FootfallEntry, NobEntry } from "@/lib/types";

interface MergedOperationRow {
  key: string;
  time: string | null;
  time_slot: string | null;
  footfall: FootfallEntry | null;
  bill: BillEntry | null;
  nob: NobEntry | null;
}

/** Map selected time slot to representative time for backend slot categorization */
function getTimeForSlot(slot: string, fallbackTime: string | null): string {
  const current = fallbackTime ? toTimeHHMM(fallbackTime) : nowTimeHHMM();
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

/** Combines footfall, bill, and NOB logs for the day into single unified operational rows. */
function buildMergedOperations(
  footfalls: FootfallEntry[],
  bills: BillEntry[],
  nobs: NobEntry[],
): MergedOperationRow[] {
  const footfallByTime = new Map<string, FootfallEntry[]>();
  for (const f of footfalls) {
    const k = f.time ?? "";
    const list = footfallByTime.get(k);
    if (list) list.push(f);
    else footfallByTime.set(k, [f]);
  }

  const billsByTime = new Map<string, BillEntry[]>();
  for (const b of bills) {
    const k = b.bill_time ?? "";
    const list = billsByTime.get(k);
    if (list) list.push(b);
    else billsByTime.set(k, [b]);
  }

  const nobsByTime = new Map<string, NobEntry[]>();
  for (const n of nobs) {
    const k = n.time ?? "";
    const list = nobsByTime.get(k);
    if (list) list.push(n);
    else nobsByTime.set(k, [n]);
  }

  const allTimes = new Set([...footfallByTime.keys(), ...billsByTime.keys(), ...nobsByTime.keys()]);
  const rows: MergedOperationRow[] = [];

  for (const timeKey of allTimes) {
    const fList = footfallByTime.get(timeKey) ?? [];
    const bList = billsByTime.get(timeKey) ?? [];
    const nList = nobsByTime.get(timeKey) ?? [];

    const maxCount = Math.max(fList.length, bList.length, nList.length);
    for (let i = 0; i < maxCount; i++) {
      const f = fList[i] ?? null;
      const b = bList[i] ?? null;
      const n = nList[i] ?? null;
      const timeVal = b?.bill_time ?? f?.time ?? n?.time ?? (timeKey || null);
      const slotVal = b?.time_slot ?? f?.time_slot ?? n?.time_slot ?? (timeVal ? timeSlotForHHMM(toTimeHHMM(timeVal)) : null);

      rows.push({
        key: `${timeKey || "unset"}-${i}-${f?.row ?? "x"}-${b?.row ?? "x"}-${n?.row ?? "x"}`,
        time: timeVal,
        time_slot: slotVal,
        footfall: f,
        bill: b,
        nob: n,
      });
    }
  }

  return rows.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
}

/** Unified Logged Floor Operations table */
export function LoggedDailyEntries({ store, date }: { store: string; date: string }) {
  const queryClient = useQueryClient();
  const invalidateBillLog = () => queryClient.invalidateQueries({ queryKey: ["bill-log", store, date] });
  const invalidateFootfallLog = () => queryClient.invalidateQueries({ queryKey: ["footfall-log", store, date] });
  const invalidateNobLog = () => queryClient.invalidateQueries({ queryKey: ["nob-log", store, date] });
  const invalidateLive = () => {
    queryClient.invalidateQueries({ queryKey: ["daily-live", store, date] });
    queryClient.invalidateQueries({ queryKey: ["chart"] });
  };

  const billLogQuery = useQuery({ queryKey: ["bill-log", store, date], queryFn: () => api.billLog(store, date) });
  const entries = billLogQuery.data?.entries ?? [];

  const footfallLogQuery = useQuery({ queryKey: ["footfall-log", store, date], queryFn: () => api.footfallLog(store, date) });
  const footfallEntries = footfallLogQuery.data?.entries ?? [];

  const nobLogQuery = useQuery({ queryKey: ["nob-log", store, date], queryFn: () => api.nobLog(store, date) });
  const nobEntries = nobLogQuery.data?.entries ?? [];

  // Edit state
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editSlot, setEditSlot] = useState<string>(TIME_SLOT_ORDER[0]);
  const [editFootfall, setEditFootfall] = useState("");
  const [editNetAmount, setEditNetAmount] = useState("");
  const [editBillQuantity, setEditBillQuantity] = useState("");
  const [editNobValue, setEditNobValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function startEditRow(row: MergedOperationRow) {
    setEditingRowKey(row.key);
    const initialSlot = row.time_slot ?? (row.time ? timeSlotForHHMM(toTimeHHMM(row.time)) : null) ?? TIME_SLOT_ORDER[0];
    setEditSlot(initialSlot);
    setEditFootfall(row.footfall?.footfall != null ? String(row.footfall.footfall) : "");
    setEditNetAmount(row.bill?.net_amount != null ? String(row.bill.net_amount) : "");
    setEditBillQuantity(row.bill?.bill_quantity != null ? String(row.bill.bill_quantity) : "");
    setEditNobValue(row.nob?.nob != null ? String(row.nob.nob) : "");
  }

  async function saveEditRow(row: MergedOperationRow) {
    const timeToSave = getTimeForSlot(editSlot, row.time);

    let footfallNum = 0;
    if (row.footfall) {
      footfallNum = Number(editFootfall);
      if (Number.isNaN(footfallNum) || footfallNum < 0) {
        toast.error("Footfall must be a non-negative number.");
        return;
      }
    }

    let net = 0;
    let qty = 0;
    if (row.bill) {
      net = Number(editNetAmount);
      qty = Number(editBillQuantity);
      if (Number.isNaN(net) || net < 0) {
        toast.error("Net Amount must be a non-negative number.");
        return;
      }
      if (Number.isNaN(qty) || qty < 0) {
        toast.error("Bill Quantity must be a non-negative number.");
        return;
      }
    }

    let nobVal = 0;
    if (row.nob) {
      nobVal = Number(editNobValue);
      if (Number.isNaN(nobVal) || nobVal < 0) {
        toast.error("NOB must be a non-negative number.");
        return;
      }
    }

    try {
      setIsSaving(true);
      const promises: Promise<unknown>[] = [];

      if (row.footfall) {
        promises.push(
          api.updateFootfallEntry({
            store,
            row: row.footfall.row,
            time: timeToSave,
            footfall: footfallNum,
          }),
        );
      }

      if (row.bill) {
        promises.push(
          api.updateBillEntry({
            store,
            row: row.bill.row,
            bill_time: timeToSave,
            net_amount: net,
            bill_quantity: qty,
          }),
        );
      }

      if (row.nob) {
        promises.push(
          api.updateNobEntry({
            store,
            row: row.nob.row,
            time: timeToSave,
            nob: nobVal,
          }),
        );
      }

      await Promise.all(promises);
      toast.success("Operations entry updated successfully.");
      setEditingRowKey(null);
      invalidateFootfallLog();
      invalidateBillLog();
      invalidateNobLog();
      invalidateLive();
    } catch (error: any) {
      toast.error(`Failed to update entry: ${error.message || error}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRow(row: MergedOperationRow) {
    if (!window.confirm("Delete this floor operations entry? This cannot be undone.")) {
      return;
    }
    try {
      setIsDeleting(true);
      const promises: Promise<unknown>[] = [];
      if (row.footfall) {
        promises.push(api.deleteFootfallEntry(store, row.footfall.row));
      }
      if (row.bill) {
        promises.push(api.deleteBillEntry(store, row.bill.row));
      }
      if (row.nob) {
        promises.push(api.deleteNobEntry(store, row.nob.row));
      }
      await Promise.all(promises);
      toast.success("Entry deleted successfully.");
      invalidateFootfallLog();
      invalidateBillLog();
      invalidateNobLog();
      invalidateLive();
    } catch (error: any) {
      toast.error(`Failed to delete entry: ${error.message || error}`);
    } finally {
      setIsDeleting(false);
    }
  }

  const mergedRows = buildMergedOperations(footfallEntries, entries, nobEntries);

  return (
    <Section title="Logged Floor Operations" className="mb-4">
      {mergedRows.length === 0 ? (
        <p className="text-muted-foreground text-sm py-4">No floor operations logged yet for today.</p>
      ) : (
        <div className="w-full overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="whitespace-nowrap">Time Stamp (12-Hr)</TableHead>
                <TableHead className="whitespace-nowrap">Time Slot</TableHead>
                <TableHead className="whitespace-nowrap">Footfall (visitors)</TableHead>
                <TableHead className="whitespace-nowrap">Net Sales</TableHead>
                <TableHead className="whitespace-nowrap">Bill Quantity (units)</TableHead>
                <TableHead className="whitespace-nowrap">NOB</TableHead>
                <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mergedRows.map((row) => {
                const isEditing = editingRowKey === row.key;
                const displaySlot = row.time_slot ?? (row.time ? timeSlotForHHMM(row.time) : null);

                return (
                  <TableRow key={row.key} className="hover:bg-muted/30">
                    {/* Time Stamp (Read-only system time) */}
                    <TableCell className="font-medium whitespace-nowrap">
                      <span className="font-mono text-xs bg-muted/50 px-2 py-1 rounded border border-border/50">
                        {fmtTime12Hour(row.time)}
                      </span>
                    </TableCell>

                    {/* Time Slot (Selectable in edit mode) */}
                    <TableCell>
                      {isEditing ? (
                        <select
                          value={editSlot}
                          onChange={(e) => setEditSlot(e.target.value)}
                          className="border-input bg-background text-foreground flex h-8 rounded-md border px-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                        >
                          {TIME_SLOT_ORDER.map((slot) => (
                            <option key={slot} value={slot}>
                              {slot}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-primary font-medium">{displaySlot ?? "—"}</span>
                      )}
                    </TableCell>

                    {/* Footfall */}
                    <TableCell>
                      {isEditing && row.footfall ? (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="h-8 max-w-[100px]"
                          value={editFootfall}
                          onChange={(e) => setEditFootfall(e.target.value)}
                        />
                      ) : row.footfall ? (
                        <span className="font-medium">{fmtNumberOrZero(row.footfall.footfall)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Net Sales */}
                    <TableCell>
                      {isEditing && row.bill ? (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="h-8 max-w-[120px]"
                          value={editNetAmount}
                          onChange={(e) => setEditNetAmount(e.target.value)}
                        />
                      ) : row.bill ? (
                        <span className="font-medium text-emerald-500">{fmtCurrencyOrZero(row.bill.net_amount)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Bill Quantity */}
                    <TableCell>
                      {isEditing && row.bill ? (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="h-8 max-w-[100px]"
                          value={editBillQuantity}
                          onChange={(e) => setEditBillQuantity(e.target.value)}
                        />
                      ) : row.bill ? (
                        <span>{fmtNumberOrZero(row.bill.bill_quantity)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* NOB */}
                    <TableCell>
                      {isEditing && row.nob ? (
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          className="h-8 max-w-[100px]"
                          value={editNobValue}
                          onChange={(e) => setEditNobValue(e.target.value)}
                        />
                      ) : row.nob ? (
                        <span>{fmtNumberOrZero(row.nob.nob)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex justify-end gap-1.5 whitespace-nowrap">
                          <Button size="xs" disabled={isSaving} onClick={() => saveEditRow(row)}>
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button variant="outline" size="xs" disabled={isSaving} onClick={() => setEditingRowKey(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1.5 whitespace-nowrap">
                          <Button variant="outline" size="xs" onClick={() => startEditRow(row)}>
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="xs"
                            disabled={isDeleting}
                            onClick={() => deleteRow(row)}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

