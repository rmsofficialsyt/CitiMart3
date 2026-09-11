import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TimePicker12Hour } from "@/components/TimePicker12Hour";
import { fmtCurrencyOrZero, fmtNumberOrZero, fmtTime12Hour, nowTimeHHMM } from "@/lib/format";
import { timeSlotForHHMM } from "@/lib/timeSlot";
import type { BillEntry, NobEntry } from "@/lib/types";

interface MergedRow {
  key: string;
  time: string | null;
  bill: BillEntry | null;
  nob: NobEntry | null;
}

/** Groups bill and NOB entries by their shared Time Stamp so a bill and a
 * NOB entry logged at the same minute render as one "Logged Bills & NOB"
 * row instead of two. Pairs positionally within each time bucket (bill[0]
 * with nob[0], bill[1] with nob[1], ...) rather than assuming at most one
 * of each per minute -- if there are more bills than NOB entries (or vice
 * versa) at that exact time, the extras still get their own row with the
 * other side blank, so nothing from either log is ever dropped or hidden. */
function buildMergedRows(bills: BillEntry[], nobs: NobEntry[]): MergedRow[] {
  const billsByTime = new Map<string, BillEntry[]>();
  for (const entry of bills) {
    const key = entry.bill_time ?? "";
    const list = billsByTime.get(key);
    if (list) list.push(entry);
    else billsByTime.set(key, [entry]);
  }
  const nobsByTime = new Map<string, NobEntry[]>();
  for (const entry of nobs) {
    const key = entry.time ?? "";
    const list = nobsByTime.get(key);
    if (list) list.push(entry);
    else nobsByTime.set(key, [entry]);
  }

  const rows: MergedRow[] = [];
  for (const timeKey of new Set([...billsByTime.keys(), ...nobsByTime.keys()])) {
    const billList = billsByTime.get(timeKey) ?? [];
    const nobList = nobsByTime.get(timeKey) ?? [];
    for (let i = 0; i < Math.max(billList.length, nobList.length); i++) {
      const bill = billList[i] ?? null;
      const nob = nobList[i] ?? null;
      rows.push({ key: `${timeKey || "unset"}-${i}-${bill?.row ?? "x"}-${nob?.row ?? "x"}`, time: bill?.bill_time ?? nob?.time ?? (timeKey || null), bill, nob });
    }
  }
  return rows.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
}

interface TimedValueEntry {
  row: number;
  time: string | null;
  value: number | null;
  time_slot: string | null;
}

/** The logged-entries table (Time Stamp / value / Time Slot / Actions, inline
 * Edit/Delete) for the Footfall log. Existing rows are edited/deleted
 * immediately here -- adding a new entry still goes through Manual Data
 * Entry's Update / Final Submission buttons. */
function TimedEntryTable({
  valueLabel,
  entries,
  onUpdate,
  onDelete,
  updatePending,
  deletePending,
}: {
  valueLabel: string;
  entries: TimedValueEntry[];
  onUpdate: (row: number, time: string, value: number) => Promise<unknown>;
  onDelete: (row: number) => void;
  updatePending: boolean;
  deletePending: boolean;
}) {
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editValue, setEditValue] = useState("");

  function startEdit(entry: TimedValueEntry) {
    setEditingRow(entry.row);
    setEditTime(entry.time ?? nowTimeHHMM());
    setEditValue(entry.value != null ? String(entry.value) : "");
  }

  async function saveEdit(row: number) {
    if (!editTime) {
      toast.error("Time Stamp is required.");
      return;
    }
    if (editTime < "10:30" || editTime > "23:59") {
      toast.error("Operating hours are between 10:30 AM and 23:59 PM.");
      return;
    }
    const v = Number(editValue);
    if (Number.isNaN(v) || v < 0) {
      toast.error(`${valueLabel} must be a non-negative number.`);
      return;
    }
    try {
      await onUpdate(row, editTime, v);
    } catch {
      return;
    }
    setEditingRow(null);
  }

  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">No {valueLabel.toLowerCase()} logged yet for today.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time Stamp</TableHead>
            <TableHead>{valueLabel}</TableHead>
            <TableHead>Time Slot</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) =>
            editingRow === entry.row ? (
              <TableRow key={entry.row}>
                <TableCell>
                  <TimePicker12Hour
                    size="sm"
                    value={editTime}
                    onChange={setEditTime}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    className="h-8"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                </TableCell>
                <TableCell>{timeSlotForHHMM(editTime) ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="xs" disabled={updatePending} onClick={() => saveEdit(entry.row)}>
                      {updatePending ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="outline" size="xs" disabled={updatePending} onClick={() => setEditingRow(null)}>
                      Cancel
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={entry.row}>
                <TableCell className="font-medium">{fmtTime12Hour(entry.time)}</TableCell>
                <TableCell>{fmtNumberOrZero(entry.value)}</TableCell>
                <TableCell>{entry.time_slot ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="outline" size="xs" onClick={() => startEdit(entry)}>
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="xs"
                      disabled={deletePending}
                      onClick={() => {
                        if (window.confirm(`Delete this ${valueLabel.toLowerCase()} entry? This cannot be undone.`)) {
                          onDelete(entry.row);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}

/** "Logged Footfall" + "Logged Bills & NOB" for one store's current day.
 * Rendered on the read-only Daily Dashboard (below "Today's Context") so a
 * manager can review and correct logged entries without leaving the
 * dashboard. Adding new entries still happens on Manual Data Entry; existing
 * rows are edited/deleted inline here. Every edit/delete also refreshes the
 * dashboard's live KPI cards and gauges (["daily-live", ...] + ["chart"]). */
export function LoggedDailyEntries({ store, date }: { store: string; date: string }) {
  const queryClient = useQueryClient();
  const invalidateBillLog = () => queryClient.invalidateQueries({ queryKey: ["bill-log", store, date] });
  const invalidateFootfallLog = () => queryClient.invalidateQueries({ queryKey: ["footfall-log", store, date] });
  const invalidateNobLog = () => queryClient.invalidateQueries({ queryKey: ["nob-log", store, date] });
  const invalidateLive = () => {
    queryClient.invalidateQueries({ queryKey: ["daily-live", store, date] });
    queryClient.invalidateQueries({ queryKey: ["chart"] }); // the gauges read the same live KPIs
  };

  const billLogQuery = useQuery({ queryKey: ["bill-log", store, date], queryFn: () => api.billLog(store, date) });
  const entries = billLogQuery.data?.entries ?? [];

  const footfallLogQuery = useQuery({ queryKey: ["footfall-log", store, date], queryFn: () => api.footfallLog(store, date) });
  const footfallEntries = footfallLogQuery.data?.entries ?? [];

  const nobLogQuery = useQuery({ queryKey: ["nob-log", store, date], queryFn: () => api.nobLog(store, date) });
  const nobEntries = nobLogQuery.data?.entries ?? [];

  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editNetAmount, setEditNetAmount] = useState("");
  const [editBillQuantity, setEditBillQuantity] = useState("");
  const [editNobValue, setEditNobValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const updateFootfallMutation = useMutation({
    mutationFn: (payload: { row: number; time: string; footfall: number }) => api.updateFootfallEntry({ store, ...payload }),
    onSuccess: () => {
      toast.success("Footfall entry updated.");
      invalidateFootfallLog();
      invalidateLive();
    },
    onError: (error: Error) => toast.error(`Failed to update footfall entry: ${error.message}`),
  });
  const deleteFootfallMutation = useMutation({
    mutationFn: (row: number) => api.deleteFootfallEntry(store, row),
    onSuccess: () => {
      toast.success("Footfall entry deleted.");
      invalidateFootfallLog();
      invalidateLive();
    },
    onError: (error: Error) => toast.error(`Failed to delete footfall entry: ${error.message}`),
  });

  function startEditRow(row: MergedRow) {
    setEditingRowKey(row.key);
    setEditTime(row.time ?? nowTimeHHMM());
    setEditNetAmount(row.bill?.net_amount != null ? String(row.bill.net_amount) : "");
    setEditBillQuantity(row.bill?.bill_quantity != null ? String(row.bill.bill_quantity) : "");
    setEditNobValue(row.nob?.nob != null ? String(row.nob.nob) : "");
  }

  async function saveEditRow(row: MergedRow) {
    if (!editTime) {
      toast.error("Time Stamp is required.");
      return;
    }
    if (editTime < "10:30" || editTime > "23:59") {
      toast.error("Operating hours are between 10:30 AM and 23:59 PM.");
      return;
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
      if (row.bill) {
        promises.push(
          api.updateBillEntry({
            store,
            row: row.bill.row,
            bill_time: editTime,
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
            time: editTime,
            nob: nobVal,
          }),
        );
      }
      await Promise.all(promises);
      toast.success("Entry updated successfully.");
      setEditingRowKey(null);
      invalidateBillLog();
      invalidateNobLog();
      invalidateLive();
    } catch (error: any) {
      toast.error(`Failed to update entry: ${error.message || error}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRow(row: MergedRow) {
    const label = row.bill && row.nob ? "bill and NOB entry" : row.bill ? "bill entry" : "NOB entry";
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) {
      return;
    }
    try {
      setIsDeleting(true);
      const promises: Promise<unknown>[] = [];
      if (row.bill) {
        promises.push(api.deleteBillEntry(store, row.bill.row));
      }
      if (row.nob) {
        promises.push(api.deleteNobEntry(store, row.nob.row));
      }
      await Promise.all(promises);
      toast.success("Entry deleted successfully.");
      invalidateBillLog();
      invalidateNobLog();
      invalidateLive();
    } catch (error: any) {
      toast.error(`Failed to delete entry: ${error.message || error}`);
    } finally {
      setIsDeleting(false);
    }
  }

  const mergedRows = buildMergedRows(entries, nobEntries);

  return (
    <>
      <Section title="Logged Footfall" className="mb-4">
        <TimedEntryTable
          valueLabel="Footfall"
          entries={footfallEntries.map((e) => ({ row: e.row, time: e.time, value: e.footfall, time_slot: e.time_slot }))}
          onUpdate={(row, time, value) => updateFootfallMutation.mutateAsync({ row, time, footfall: value })}
          onDelete={(row) => deleteFootfallMutation.mutate(row)}
          updatePending={updateFootfallMutation.isPending}
          deletePending={deleteFootfallMutation.isPending}
        />
      </Section>

      <Section title="Logged Bills & NOB" className="mb-4">
        {mergedRows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No bills or NOB logged yet for today.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time Stamp</TableHead>
                  <TableHead>Net Amount</TableHead>
                  <TableHead>Bill Quantity (units sold)</TableHead>
                  <TableHead>NOB</TableHead>
                  <TableHead>Time Slot</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mergedRows.map((row) => {
                  const isEditing = editingRowKey === row.key;
                  const timeSlot = row.bill?.time_slot ?? row.nob?.time_slot ?? null;

                  return (
                    <TableRow key={row.key}>
                      <TableCell>
                        {isEditing ? (
                          <TimePicker12Hour
                            size="sm"
                            value={editTime}
                            onChange={setEditTime}
                          />
                        ) : (
                          <span className="font-medium">{fmtTime12Hour(row.time)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing && row.bill ? (
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            className="h-8"
                            value={editNetAmount}
                            onChange={(e) => setEditNetAmount(e.target.value)}
                          />
                        ) : row.bill ? (
                          fmtCurrencyOrZero(row.bill.net_amount)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing && row.bill ? (
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            className="h-8"
                            value={editBillQuantity}
                            onChange={(e) => setEditBillQuantity(e.target.value)}
                          />
                        ) : row.bill ? (
                          fmtNumberOrZero(row.bill.bill_quantity)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing && row.nob ? (
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            className="h-8"
                            value={editNobValue}
                            onChange={(e) => setEditNobValue(e.target.value)}
                          />
                        ) : row.nob ? (
                          fmtNumberOrZero(row.nob.nob)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing
                          ? (timeSlotForHHMM(editTime) ?? <span className="text-muted-foreground">—</span>)
                          : (timeSlot ?? <span className="text-muted-foreground">—</span>)}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex gap-2">
                            <Button size="xs" disabled={isSaving} onClick={() => saveEditRow(row)}>
                              {isSaving ? "Saving..." : "Save"}
                            </Button>
                            <Button variant="outline" size="xs" disabled={isSaving} onClick={() => setEditingRowKey(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
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
    </>
  );
}
