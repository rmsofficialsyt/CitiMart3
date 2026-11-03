import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Layers,
  AlertTriangle,
  ArrowLeftRight,
  Plus,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  ArrowRight,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";

interface StockManagementPageProps {
  initialStoreCode: string;
}

export function StockManagementPage({ initialStoreCode }: StockManagementPageProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const effectiveStore = isAdmin && initialStoreCode === "ALL" ? "" : user?.storeCode || initialStoreCode;

  const [activeTab, setActiveTab] = useState<"catalog" | "transfers" | "movements">("catalog");
  const [searchTerm, setSearchTerm] = useState("");
  const [lowStockFilter, setLowStockFilter] = useState(false);

  // Modals state
  const [inwardOpen, setInwardOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [selectedItemForAdj, setSelectedItemForAdj] = useState<any>(null);

  // Form states
  const [inwardForm, setInwardForm] = useState({
    barcode: "",
    item_name: "",
    division: "Apparel",
    section: "Menswear",
    department: "Casual Shirts",
    brand: "",
    mrp: 999,
    cost_price: 500,
    quantity: 10,
    reorder_level: 5,
    reference_id: "",
    remarks: "",
  });

  const [transferForm, setTransferForm] = useState({
    to_store: effectiveStore === "NM" ? "HB" : "NM",
    barcode: "",
    quantity: 1,
    notes: "",
  });

  const [adjForm, setAdjForm] = useState({
    adjustment_type: "DAMAGE_WRITE_OFF" as "DAMAGE_WRITE_OFF" | "AUDIT_ADJUSTMENT",
    quantity_change: -1,
    reason: "",
  });

  // Queries
  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["stocks-summary", effectiveStore],
    queryFn: () => api.getStocksSummary(effectiveStore || undefined),
  });

  const { data: inventory, isLoading: invLoading, refetch: refetchInv } = useQuery({
    queryKey: ["stocks-inventory", effectiveStore, searchTerm, lowStockFilter],
    queryFn: () =>
      api.listInventory({
        store_code: effectiveStore || undefined,
        search: searchTerm || undefined,
        low_stock_only: lowStockFilter,
        limit: 100,
      }),
  });

  const { data: transfers, isLoading: transfersLoading, refetch: refetchTransfers } = useQuery({
    queryKey: ["stocks-transfers", effectiveStore],
    queryFn: () => api.listTransfers(effectiveStore || undefined),
    enabled: activeTab === "transfers",
  });

  const { data: movements, isLoading: movementsLoading, refetch: refetchMovements } = useQuery({
    queryKey: ["stocks-movements", effectiveStore],
    queryFn: () => api.listStockMovements(effectiveStore || undefined),
    enabled: activeTab === "movements",
  });

  // Mutations
  const inwardMutation = useMutation({
    mutationFn: (data: any) =>
      api.recordInwardGRN({
        store_code: (effectiveStore || "NM").toUpperCase(),
        items: [data],
        reference_id: data.reference_id,
        remarks: data.remarks,
      }),
    onSuccess: () => {
      toast.success("Inward stock GRN recorded successfully!");
      setInwardOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stocks-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-movements"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to record inward stock"),
  });

  const transferMutation = useMutation({
    mutationFn: (data: any) =>
      api.createTransfer({
        from_store: (effectiveStore || "NM").toUpperCase(),
        to_store: data.to_store,
        items: [{ barcode: data.barcode, quantity: Number(data.quantity) }],
        notes: data.notes,
      }),
    onSuccess: () => {
      toast.success("Inter-store transfer initiated!");
      setTransferOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stocks-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-summary"] });
    },
    onError: (err: any) => toast.error(err.message || "Transfer initiation failed"),
  });

  const dispatchMutation = useMutation({
    mutationFn: (transferId: string) => api.dispatchTransfer(transferId),
    onSuccess: () => {
      toast.success("Transfer dispatched! Stock deducted from sender.");
      queryClient.invalidateQueries({ queryKey: ["stocks-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-summary"] });
    },
    onError: (err: any) => toast.error(err.message || "Dispatch failed"),
  });

  const receiveMutation = useMutation({
    mutationFn: (transferId: string) => api.receiveTransfer(transferId),
    onSuccess: () => {
      toast.success("Transfer received! Stock added to destination.");
      queryClient.invalidateQueries({ queryKey: ["stocks-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-summary"] });
    },
    onError: (err: any) => toast.error(err.message || "Receipt failed"),
  });

  const adjMutation = useMutation({
    mutationFn: (data: any) =>
      api.recordStockAdjustment({
        store_code: (effectiveStore || "NM").toUpperCase(),
        barcode: selectedItemForAdj?.barcode,
        adjustment_type: data.adjustment_type,
        quantity_change: Number(data.quantity_change),
        reason: data.reason,
      }),
    onSuccess: () => {
      toast.success("Stock adjustment logged successfully!");
      setAdjustmentOpen(false);
      queryClient.invalidateQueries({ queryKey: ["stocks-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-summary"] });
      queryClient.invalidateQueries({ queryKey: ["stocks-movements"] });
    },
    onError: (err: any) => toast.error(err.message || "Adjustment failed"),
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                <span>Stocks & Inventory Control</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {effectiveStore || "Network-Wide"}
                </span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Real-time store stock ledger, inter-store transfers, and immutable audit logs.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchSummary();
              refetchInv();
              if (activeTab === "transfers") refetchTransfers();
              if (activeTab === "movements") refetchMovements();
            }}
            className="gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>

          {effectiveStore && effectiveStore !== "ALL" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransferOpen(true)}
                className="gap-1.5 text-xs font-semibold"
              >
                <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-500" />
                <span>Inter-Store Transfer</span>
              </Button>

              <Button
                size="sm"
                onClick={() => setInwardOpen(true)}
                className="gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow"
              >
                <Plus className="h-4 w-4" />
                <span>Record Inward GRN</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active SKUs</span>
            <Boxes className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{summary?.total_skus ?? 0}</span>
            <span className="text-xs text-muted-foreground">items</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Units</span>
            <Layers className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{summary?.total_units?.toLocaleString() ?? 0}</span>
            <span className="text-xs text-muted-foreground">pcs</span>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Low Stock Alert
            </span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-300">
              {summary?.low_stock_count ?? 0}
            </span>
            <span className="text-xs text-amber-600/70 dark:text-amber-400/70">below reorder</span>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              Pending Transfers
            </span>
            <ArrowLeftRight className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-300">
              {summary?.pending_transfers_count ?? 0}
            </span>
            <span className="text-xs text-indigo-600/70 dark:text-indigo-400/70">in transit / open</span>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-border/40 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("catalog")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "catalog"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          Stock Ledger & Catalog
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("transfers")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "transfers"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          Inter-Store Transfers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("movements")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "movements"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          Movement Audit Ledger
        </button>
      </div>

      {/* Tab 1: Catalog */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by Barcode, Item Name, Brand, Dept..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-card border border-border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLowStockFilter(!lowStockFilter)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                  lowStockFilter
                    ? "bg-amber-500 text-white border-amber-600"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Filter className="h-3.5 w-3.5" />
                <span>Low Stock Only</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Store</th>
                    <th className="py-3 px-4">Barcode</th>
                    <th className="py-3 px-4">Product Details</th>
                    <th className="py-3 px-4">Hierarchy</th>
                    <th className="py-3 px-4 text-right">MRP</th>
                    <th className="py-3 px-4 text-right">Current Stock</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {invLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        Loading inventory ledger...
                      </td>
                    </tr>
                  ) : !inventory?.items?.length ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        No inventory items found. Click "Record Inward GRN" to add initial stock.
                      </td>
                    </tr>
                  ) : (
                    inventory.items.map((item: any) => {
                      const isOutOfStock = item.current_stock <= 0;
                      const isLowStock = !isOutOfStock && item.current_stock <= (item.reorder_level || 10);
                      return (
                        <tr key={`${item.store_code}-${item.barcode}`} className="hover:bg-muted/20 transition">
                          <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {item.store_code}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] font-semibold">{item.barcode}</td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-foreground">{item.item_name}</div>
                            {item.brand && <div className="text-[10px] text-muted-foreground">Brand: {item.brand}</div>}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-muted-foreground">
                            {item.division} &gt; {item.department}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium">₹{item.mrp?.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-sm">
                            {item.current_stock} {item.unit_of_measure || "Pcs"}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isOutOfStock ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/30">
                                Out of Stock
                              </span>
                            ) : isLowStock ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/30">
                                Low Stock
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                                Optimal
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedItemForAdj(item);
                                setAdjustmentOpen(true);
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-muted hover:bg-muted/80 text-foreground border border-border cursor-pointer transition"
                            >
                              Adjust / Damage
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Inter-Store Transfers */}
      {activeTab === "transfers" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Transfer ID</th>
                    <th className="py-3 px-4">Route</th>
                    <th className="py-3 px-4">Items Transferred</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {transfersLoading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        Loading transfers...
                      </td>
                    </tr>
                  ) : !transfers?.length ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No active or past stock transfers found.
                      </td>
                    </tr>
                  ) : (
                    transfers.map((t: any) => {
                      const isSender = t.from_store === (effectiveStore || "").toUpperCase();
                      const isReceiver = t.to_store === (effectiveStore || "").toUpperCase();
                      return (
                        <tr key={t.transfer_id} className="hover:bg-muted/20 transition">
                          <td className="py-3 px-4 font-mono font-bold text-foreground">{t.transfer_id}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className="text-blue-600">{t.from_store}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-emerald-600">{t.to_store}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {t.items?.map((it: any, i: number) => (
                              <div key={i} className="text-[11px]">
                                <span className="font-semibold">{it.item_name}</span> ·{" "}
                                <span className="font-mono text-muted-foreground">Qty: {it.quantity}</span>
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {new Date(t.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                t.status === "RECEIVED"
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                  : t.status === "DISPATCHED"
                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                                  : t.status === "INITIATED"
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                  : "bg-muted text-muted-foreground border-border"
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {t.status === "INITIATED" && isSender && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => dispatchMutation.mutate(t.transfer_id)}
                                disabled={dispatchMutation.isPending}
                                className="text-xs h-7 gap-1"
                              >
                                <Send className="h-3 w-3" />
                                <span>Dispatch</span>
                              </Button>
                            )}
                            {t.status === "DISPATCHED" && isReceiver && (
                              <Button
                                size="sm"
                                onClick={() => receiveMutation.mutate(t.transfer_id)}
                                disabled={receiveMutation.isPending}
                                className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              >
                                <CheckCircle className="h-3 w-3" />
                                <span>Receive</span>
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Movement Audit Log */}
      {activeTab === "movements" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Store</th>
                    <th className="py-3 px-4">Barcode / Item</th>
                    <th className="py-3 px-4">Movement Type</th>
                    <th className="py-3 px-4 text-right">Quantity Delta</th>
                    <th className="py-3 px-4 text-right">Balance After</th>
                    <th className="py-3 px-4">User & Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {movementsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        Loading audit log...
                      </td>
                    </tr>
                  ) : !movements?.length ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        No stock movement records found.
                      </td>
                    </tr>
                  ) : (
                    movements.map((m: any, idx: number) => {
                      const isPositive = m.quantity > 0;
                      return (
                        <tr key={idx} className="hover:bg-muted/20 transition">
                          <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                            {new Date(m.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-bold text-blue-600">{m.store_code}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground">{m.item_name}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{m.barcode}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-muted border border-border">
                              {m.movement_type}
                            </span>
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-mono font-bold ${
                              isPositive ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {isPositive ? `+${m.quantity}` : m.quantity}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">{m.balance_after}</td>
                          <td className="py-3 px-4 text-[11px]">
                            <div className="font-medium text-foreground">{m.created_by}</div>
                            <div className="text-muted-foreground text-[10px]">{m.remarks || m.reference_id}</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Inward GRN Modal */}
      {inwardOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-bold text-foreground">Record Inward Goods Received Note (GRN)</h3>
              <button
                type="button"
                onClick={() => setInwardOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <label className="font-semibold text-muted-foreground">Barcode / EAN *</label>
                <input
                  type="text"
                  required
                  value={inwardForm.barcode}
                  onChange={(e) => setInwardForm({ ...inwardForm, barcode: e.target.value })}
                  placeholder="e.g. 8901234567890"
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div className="col-span-2">
                <label className="font-semibold text-muted-foreground">Product Title *</label>
                <input
                  type="text"
                  required
                  value={inwardForm.item_name}
                  onChange={(e) => setInwardForm({ ...inwardForm, item_name: e.target.value })}
                  placeholder="e.g. Classic Linen Shirt"
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Division</label>
                <input
                  type="text"
                  value={inwardForm.division}
                  onChange={(e) => setInwardForm({ ...inwardForm, division: e.target.value })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Department</label>
                <input
                  type="text"
                  value={inwardForm.department}
                  onChange={(e) => setInwardForm({ ...inwardForm, department: e.target.value })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Quantity Received *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={inwardForm.quantity}
                  onChange={(e) => setInwardForm({ ...inwardForm, quantity: Number(e.target.value) })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">MRP (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={inwardForm.mrp}
                  onChange={(e) => setInwardForm({ ...inwardForm, mrp: Number(e.target.value) })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div className="col-span-2">
                <label className="font-semibold text-muted-foreground">Reference (Invoice / Challan #)</label>
                <input
                  type="text"
                  value={inwardForm.reference_id}
                  onChange={(e) => setInwardForm({ ...inwardForm, reference_id: e.target.value })}
                  placeholder="e.g. CH-2026-0042"
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button variant="outline" size="sm" onClick={() => setInwardOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => inwardMutation.mutate(inwardForm)}
                disabled={inwardMutation.isPending || !inwardForm.barcode || !inwardForm.item_name}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {inwardMutation.isPending ? "Recording..." : "Save GRN"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Inter-Store Transfer Modal */}
      {transferOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-bold text-foreground">Initiate Stock Transfer</h3>
              <button
                type="button"
                onClick={() => setTransferOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-muted-foreground">Destination Store *</label>
                <select
                  value={transferForm.to_store}
                  onChange={(e) => setTransferForm({ ...transferForm, to_store: e.target.value })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                >
                  {["NM", "HB", "CHW"]
                    .filter((s) => s !== effectiveStore)
                    .map((s) => (
                      <option key={s} value={s}>
                        {s === "NM" ? "New Market (NM)" : s === "HB" ? "Hatibagan (HB)" : "Chowringhee (CHW)"}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Barcode *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter barcode available in this store"
                  value={transferForm.barcode}
                  onChange={(e) => setTransferForm({ ...transferForm, barcode: e.target.value })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Quantity to Transfer *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transferForm.quantity}
                  onChange={(e) => setTransferForm({ ...transferForm, quantity: Number(e.target.value) })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Notes / Reason</label>
                <textarea
                  rows={2}
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                  placeholder="Urgent stock requirement from counter"
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button variant="outline" size="sm" onClick={() => setTransferOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => transferMutation.mutate(transferForm)}
                disabled={transferMutation.isPending || !transferForm.barcode}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {transferMutation.isPending ? "Initiating..." : "Initiate Transfer"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {adjustmentOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-bold text-foreground">Adjust Stock / Damage Write-Off</h3>
              <button
                type="button"
                onClick={() => setAdjustmentOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs space-y-1">
              <div className="font-bold text-foreground">{selectedItemForAdj?.item_name}</div>
              <div className="text-muted-foreground font-mono">Barcode: {selectedItemForAdj?.barcode}</div>
              <div className="font-semibold text-blue-600">Current Stock: {selectedItemForAdj?.current_stock} pcs</div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-muted-foreground">Adjustment Type *</label>
                <select
                  value={adjForm.adjustment_type}
                  onChange={(e: any) => setAdjForm({ ...adjForm, adjustment_type: e.target.value })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                >
                  <option value="DAMAGE_WRITE_OFF">Damage / Breakage / Write-Off</option>
                  <option value="AUDIT_ADJUSTMENT">Physical Audit Correction</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">
                  Quantity Change (use negative for write-off) *
                </label>
                <input
                  type="number"
                  required
                  value={adjForm.quantity_change}
                  onChange={(e) => setAdjForm({ ...adjForm, quantity_change: Number(e.target.value) })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Reason *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain reason for stock adjustment"
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button variant="outline" size="sm" onClick={() => setAdjustmentOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => adjMutation.mutate(adjForm)}
                disabled={adjMutation.isPending || !adjForm.reason}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {adjMutation.isPending ? "Logging..." : "Confirm Adjustment"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

