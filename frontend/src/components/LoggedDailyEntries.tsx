import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtCurrencyOrZero, fmtNumberOrZero, nowTimeHHMM } from "@/lib/format";
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
                  <input
                    type="time"
                    className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
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
                <TableCell>{entry.time ?? "—"}</TableCell>
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

  // A bill row and a NOB row can share the same underlying `row` number
  // (different collections), so the edited row is tracked as "bill-<row>" /
  // "nob-<row>", not a bare number.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBillTime, setEditBillTime] = useState("");
  const [editNetAmount, setEditNetAmount] = useState("");
  const [editBillQuantity, setEditBillQuantity] = useState("");
  const [editNobTime, setEditNobTime] = useState("");
  const [editNobValue, setEditNobValue] = useState("");

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

  const updateBillMutation = useMutation({
    mutationFn: (payload: { row: number; bill_time: string; net_amount: number; bill_quantity: number }) =>
      api.updateBillEntry({ store, ...payload }),
    onSuccess: () => {
      toast.success("Bill entry updated.");
      setEditingKey(null);
      invalidateBillLog();
      invalidateLive();
    },
    onError: (error: Error) => toast.error(`Failed to update bill entry: ${error.message}`),
  });
  const deleteBillMutation = useMutation({
    mutationFn: (row: number) => api.deleteBillEntry(store, row),
    onSuccess: () => {
      toast.success("Bill entry deleted.");
      invalidateBillLog();
      invalidateLive();
    },
    onError: (error: Error) => toast.error(`Failed to delete bill entry: ${error.message}`),
  });

  const updateNobMutation = useMutation({
    mutationFn: (payload: { row: number; time: string; nob: number }) => api.updateNobEntry({ store, ...payload }),
    onSuccess: () => {
      toast.success("NOB entry updated.");
      setEditingKey(null);
      invalidateNobLog();
      invalidateLive();
    },
    onError: (error: Error) => toast.error(`Failed to update NOB entry: ${error.message}`),
  });
  const deleteNobMutation = useMutation({
    mutationFn: (row: number) => api.deleteNobEntry(store, row),
    onSuccess: () => {
      toast.success("NOB entry deleted.");
      invalidateNobLog();
      invalidateLive();
    },
    onError: (error: Error) => toast.error(`Failed to delete NOB entry: ${error.message}`),
  });

  function startEditBill(entry: BillEntry) {
    setEditingKey(`bill-${entry.row}`);
    setEditBillTime(entry.bill_time ?? nowTimeHHMM());
    setEditNetAmount(entry.net_amount != null ? String(entry.net_amount) : "");
    setEditBillQuantity(entry.bill_quantity != null ? String(entry.bill_quantity) : "");
  }

  function saveEditBill(row: number) {
    const net = Number(editNetAmount);
    const qty = Number(editBillQuantity);
    if (!editBillTime) {
      toast.error("Bill Time Stamp is required.");
      return;
    }
    if (Number.isNaN(net) || net < 0) {
      toast.error("Net Amount must be a non-negative number.");
      return;
    }
    if (Number.isNaN(qty) || qty < 0) {
      toast.error("Bill Quantity must be a non-negative number.");
      return;
    }
    updateBillMutation.mutate({ row, bill_time: editBillTime, net_amount: net, bill_quantity: qty });
  }

  function startEditNob(entry: NobEntry) {
    setEditingKey(`nob-${entry.row}`);
    setEditNobTime(entry.time ?? nowTimeHHMM());
    setEditNobValue(entry.nob != null ? String(entry.nob) : "");
  }

  function saveEditNob(row: number) {
    const nob = Number(editNobValue);
    if (!editNobTime) {
      toast.error("NOB Time Stamp is required.");
      return;
    }
    if (Number.isNaN(nob) || nob < 0) {
      toast.error("NOB must be a non-negative number.");
      return;
    }
    updateNobMutation.mutate({ row, time: editNobTime, nob });
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
                  <TableHead>Bill Quantity</TableHead>
                  <TableHead>NOB</TableHead>
                  <TableHead>Time Slot</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mergedRows.map((row) => {
                  const billKey = row.bill ? `bill-${row.bill.row}` : null;
                  const nobKey = row.nob ? `nob-${row.nob.row}` : null;
                  const editingBill = billKey !== null && editingKey === billKey;
                  const editingNob = nobKey !== null && editingKey === nobKey;
                  const timeSlot = row.bill?.time_slot ?? row.nob?.time_slot ?? null;
                  const showBothLabels = row.bill !== null && row.nob !== null;

                  return (
                    <TableRow key={row.key}>
                      <TableCell>
                        {editingBill ? (
                          <input
                            type="time"
                            className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
                            value={editBillTime}
                            onChange={(e) => setEditBillTime(e.target.value)}
                          />
                        ) : editingNob ? (
                          <input
                            type="time"
                            className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
                            value={editNobTime}
                            onChange={(e) => setEditNobTime(e.target.value)}
                          />
                        ) : (
                          (row.time ?? "—")
                        )}
                      </TableCell>
                      <TableCell>
                        {editingBill ? (
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
                        {editingBill ? (
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
                        {editingNob ? (
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
                        {editingBill
                          ? (timeSlotForHHMM(editBillTime) ?? <span className="text-muted-foreground">—</span>)
                          : editingNob
                            ? (timeSlotForHHMM(editNobTime) ?? <span className="text-muted-foreground">—</span>)
                            : (timeSlot ?? <span className="text-muted-foreground">—</span>)}
                      </TableCell>
                      <TableCell>
                        {editingBill ? (
                          <div className="flex gap-2">
                            <Button size="xs" disabled={updateBillMutation.isPending} onClick={() => saveEditBill(row.bill!.row)}>
                              {updateBillMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                            <Button variant="outline" size="xs" disabled={updateBillMutation.isPending} onClick={() => setEditingKey(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : editingNob ? (
                          <div className="flex gap-2">
                            <Button size="xs" disabled={updateNobMutation.isPending} onClick={() => saveEditNob(row.nob!.row)}>
                              {updateNobMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                            <Button variant="outline" size="xs" disabled={updateNobMutation.isPending} onClick={() => setEditingKey(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {row.bill && (
                              <div className="flex items-center gap-1.5">
                                {showBothLabels && <span className="text-muted-foreground w-8 text-xs">Bill</span>}
                                <Button variant="outline" size="xs" onClick={() => startEditBill(row.bill!)}>
                                  Edit
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="xs"
                                  disabled={deleteBillMutation.isPending}
                                  onClick={() => {
                                    if (window.confirm("Delete this bill entry? This cannot be undone.")) {
                                      deleteBillMutation.mutate(row.bill!.row);
                                    }
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                            {row.nob && (
                              <div className="flex items-center gap-1.5">
                                {showBothLabels && <span className="text-muted-foreground w-8 text-xs">NOB</span>}
                                <Button variant="outline" size="xs" onClick={() => startEditNob(row.nob!)}>
                                  Edit
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="xs"
                                  disabled={deleteNobMutation.isPending}
                                  onClick={() => {
                                    if (window.confirm("Delete this NOB entry? This cannot be undone.")) {
                                      deleteNobMutation.mutate(row.nob!.row);
                                    }
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
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
