import { useId, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Package,
  AlertTriangle,
  ArrowLeftRight,
  Plus,
  Search,
  Filter,
  RefreshCw,
  CheckCircle,
  ArrowRight,
  Send,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { ChoiceChips } from "@/components/ChoiceChips";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ModalDialog } from "@/components/ModalDialog";
import { PageUserGuide } from "@/components/PageUserGuide";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUserInvalidAria } from "@/hooks/useUserInvalidAria";
import { fmtDateDot } from "@/lib/format";

interface StockManagementPageProps {
  initialStoreCode: string;
}

const STORE_LABELS: Record<string, string> = {
  NM: "New Market (NM)",
  HB: "Hatibagan (HB)",
  CHW: "Chowringhee (CHW)",
};

// Audit timestamps in IST regardless of the device's timezone setting.
const IST_DATETIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});
const fmtIstDateTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : IST_DATETIME.format(d);
};

interface InventoryItem {
  _id?: string;
  store_code: string;
  barcode: string;
  item_name: string;
  brand?: string;
  division?: string;
  department?: string;
  mrp?: number;
  current_stock: number;
  reorder_level?: number;
  unit_of_measure?: string;
}

interface Transfer {
  transfer_id: string;
  from_store: string;
  to_store: string;
  status: string;
  created_at: string;
  items?: { item_name: string; quantity: number; barcode: string }[];
}

type TransferAction = "dispatch" | "receive" | "cancel" | "reject";

const TRANSFER_ACTION_COPY: Record<TransferAction, { title: string; confirm: string; tone: "danger" | "default"; body: (t: Transfer) => string }> = {
  dispatch: {
    title: "Dispatch this transfer?",
    confirm: "Dispatch & deduct stock",
    tone: "default",
    body: (t) => `Stock leaves ${t.from_store} now and is held in transit until ${t.to_store} receives it.`,
  },
  receive: {
    title: "Receive this transfer?",
    confirm: "Receive into stock",
    tone: "default",
    body: (t) => `Only confirm once the goods are physically at ${t.to_store}. Units are added to this store's stock.`,
  },
  cancel: {
    title: "Cancel this transfer?",
    confirm: "Cancel transfer",
    tone: "danger",
    body: () => "Nothing has been dispatched yet, so no stock moves. This cannot be undone.",
  },
  reject: {
    title: "Reject this transfer?",
    confirm: "Reject & return stock",
    tone: "danger",
    body: (t) => `The dispatched units are credited back to ${t.from_store}. Use this when the goods did not arrive or were wrong.`,
  },
};

interface GrnForm {
  barcode: string;
  item_name: string;
  division: string;
  section: string;
  department: string;
  brand: string;
  quantity: string;
  mrp: string;
  cost_price: string;
  reorder_level: string;
  reference_id: string;
  remarks: string;
}

// Blank, not pre-filled: the old form shipped MRP ₹999, cost ₹500, qty 10,
// reorder 5 and a "Menswear / Casual Shirts" hierarchy -- several of them in
// fields that weren't even on screen -- so a hurried save recorded made-up
// numbers against a real barcode.
const emptyGrn = (): GrnForm => ({
  barcode: "",
  item_name: "",
  division: "",
  section: "",
  department: "",
  brand: "",
  quantity: "",
  mrp: "",
  cost_price: "",
  reorder_level: "",
  reference_id: "",
  remarks: "",
});

export function StockManagementPage({ initialStoreCode }: StockManagementPageProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const effectiveStore = isAdmin && initialStoreCode === "ALL" ? "" : user?.storeCode || initialStoreCode;
  const storeUpper = (effectiveStore || "").toUpperCase();

  const [activeTab, setActiveTab] = useState<"catalog" | "transfers" | "movements">("catalog");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebouncedValue(searchTerm.trim());
  const [lowStockFilter, setLowStockFilter] = useState(false);

  const [inwardOpen, setInwardOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjItem, setAdjItem] = useState<InventoryItem | null>(null);
  const [pendingAction, setPendingAction] = useState<{ action: TransferAction; transfer: Transfer } | null>(null);
  const [actionReason, setActionReason] = useState("");

  const [inwardForm, setInwardForm] = useState<GrnForm>(emptyGrn);
  const [transferForm, setTransferForm] = useState({
    to_store: storeUpper === "NM" ? "HB" : "NM",
    barcode: "",
    quantity: "1",
    notes: "",
  });

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["stocks-summary", effectiveStore],
    queryFn: () => api.getStocksSummary(effectiveStore || undefined),
  });

  const { data: inventory, isLoading: invLoading, refetch: refetchInv } = useQuery({
    queryKey: ["stocks-inventory", effectiveStore, debouncedSearch, lowStockFilter],
    queryFn: () =>
      api.listInventory({
        store_code: effectiveStore || undefined,
        search: debouncedSearch || undefined,
        low_stock_only: lowStockFilter,
        limit: 100,
      }),
  });

  // Unfiltered list of this store's in-stock SKUs, for the transfer picker.
  const { data: transferable } = useQuery({
    queryKey: ["stocks-inventory", effectiveStore, "transferable"],
    queryFn: () => api.listInventory({ store_code: effectiveStore, limit: 500 }),
    enabled: transferOpen && !!effectiveStore,
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

  const invalidateStock = () => {
    queryClient.invalidateQueries({ queryKey: ["stocks-inventory"] });
    queryClient.invalidateQueries({ queryKey: ["stocks-summary"] });
    queryClient.invalidateQueries({ queryKey: ["stocks-movements"] });
    queryClient.invalidateQueries({ queryKey: ["stocks-transfers"] });
  };

  const inwardMutation = useMutation({
    mutationFn: (f: GrnForm) => {
      // Send only what the manager actually typed; optional fields left blank
      // are omitted rather than replaced with invented values.
      const item: Record<string, string | number> = {
        barcode: f.barcode.trim(),
        item_name: f.item_name.trim(),
        quantity: Number(f.quantity),
      };
      if (f.division.trim()) item.division = f.division.trim();
      if (f.section.trim()) item.section = f.section.trim();
      if (f.department.trim()) item.department = f.department.trim();
      if (f.brand.trim()) item.brand = f.brand.trim();
      if (f.mrp.trim()) item.mrp = Number(f.mrp);
      if (f.cost_price.trim()) item.cost_price = Number(f.cost_price);
      if (f.reorder_level.trim()) item.reorder_level = Number(f.reorder_level);
      return api.recordInwardGRN({
        store_code: storeUpper,
        items: [item],
        reference_id: f.reference_id.trim(),
        remarks: f.remarks.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Inward stock GRN recorded successfully!");
      setInwardOpen(false);
      setInwardForm(emptyGrn()); // reopening must not re-receive the same goods
      invalidateStock();
    },
    onError: (err: Error) => toast.error(err.message || "Failed to record inward stock"),
  });

  const transferMutation = useMutation({
    mutationFn: (data: typeof transferForm) =>
      api.createTransfer({
        from_store: storeUpper,
        // Never send a self-transfer if the default destination equals this store.
        to_store: data.to_store === storeUpper ? (storeUpper === "NM" ? "HB" : "NM") : data.to_store,
        items: [{ barcode: data.barcode.trim(), quantity: Number(data.quantity) }],
        notes: data.notes.trim(),
      }),
    onSuccess: () => {
      toast.success("Inter-store transfer initiated!");
      setTransferOpen(false);
      setTransferForm((f) => ({ ...f, barcode: "", quantity: "1", notes: "" }));
      invalidateStock();
    },
    onError: (err: Error) => toast.error(err.message || "Transfer initiation failed"),
  });

  const transferActionMutation = useMutation({
    mutationFn: ({ action, transfer, reason }: { action: TransferAction; transfer: Transfer; reason: string }) => {
      if (action === "dispatch") return api.dispatchTransfer(transfer.transfer_id);
      if (action === "receive") return api.receiveTransfer(transfer.transfer_id);
      return api.cancelOrRejectTransfer(transfer.transfer_id, reason || undefined);
    },
    onSuccess: (_res, { action }) => {
      const msg: Record<TransferAction, string> = {
        dispatch: "Transfer dispatched — stock deducted from sender.",
        receive: "Transfer received — stock added to this store.",
        cancel: "Transfer cancelled.",
        reject: "Transfer rejected — stock returned to sender.",
      };
      toast.success(msg[action]);
      setPendingAction(null);
      setActionReason("");
      invalidateStock();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Transfer update failed");
      // Someone else may have moved it on (e.g. already dispatched): show the truth.
      queryClient.invalidateQueries({ queryKey: ["stocks-transfers"] });
    },
  });

  const adjMutation = useMutation({
    mutationFn: (data: { item: InventoryItem; adjustment_type: string; quantity_change: number; reason: string }) =>
      api.recordStockAdjustment({
        // The item's own store -- not the page's. In the admin network-wide view
        // the page store is "", which used to fall back to "NM" and post an HB
        // or CHW item's adjustment against New Market.
        store_code: data.item.store_code,
        barcode: data.item.barcode,
        adjustment_type: data.adjustment_type,
        quantity_change: data.quantity_change,
        reason: data.reason,
      }),
    onSuccess: () => {
      toast.success("Stock adjustment logged successfully!");
      setAdjItem(null);
      invalidateStock();
    },
    onError: (err: Error) => toast.error(err.message || "Adjustment failed"),
  });

  const inventoryItems: InventoryItem[] = inventory?.items ?? [];
  const transferableItems: InventoryItem[] = (transferable?.items ?? []).filter(
    (i: InventoryItem) => i.store_code === storeUpper && i.current_stock > 0,
  );
  const transferPick = transferableItems.find((i) => i.barcode === transferForm.barcode.trim());

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {!isAdmin && (
        <PageUserGuide
          className="mb-0"
          title="Manager Manual Guide — Stock Management"
          subtitle="How to record inward GRNs, inter-store transfers, and damage/audit adjustments"
          steps={[
            {
              icon: Plus,
              colorClass: "text-blue-400",
              title: "Step 1 · Inward GRN",
              header: "Record Received Stock",
              bullets: [
                "Click Record Inward GRN in the top bar.",
                "Enter Barcode, Item Name and Quantity; add Category, Brand, MRP and Reorder Level if known.",
                "Add Invoice / Reference ID for traceability.",
              ],
            },
            {
              icon: ArrowLeftRight,
              colorClass: "text-indigo-400",
              title: "Step 2 · Transfers",
              header: "Send or Receive Branch Stock",
              description:
                "Use Inter-Store Transfer to send units, then Dispatch when they leave. The receiving store clicks Receive only once the goods arrive.",
            },
            {
              icon: AlertTriangle,
              colorClass: "text-amber-400",
              title: "Step 3 · Adjustments",
              header: "Log Damage or Audit Shortfall",
              description:
                "Click Adjust on any SKU to write off damaged units or correct a counted shortfall, with a clear reason. Increases go through Central Admin.",
            },
            {
              icon: CheckCircle,
              colorClass: "text-emerald-400",
              title: "Step 4 · Low Stock & Audit",
              header: "Monitor Reorder Alerts",
              description:
                "Filter by Low Stock Only to spot items at or below reorder level, and inspect the Movements tab for the immutable ledger.",
              safetyNote: "All stock writes immediately update live counts and audit logs.",
            },
          ]}
          faqs={[
            {
              title: "When do low-stock alerts trigger?",
              description: "Whenever a SKU's current stock drops to or below its configured Reorder Level.",
            },
            {
              title: "Damage write-offs:",
              description: "3 or more damage write-offs in a single day automatically notify Central Admin.",
            },
          ]}
        />
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Boxes className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              <span>Stocks & Inventory Control</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {effectiveStore || "Network-Wide"}
              </span>
            </h1>
            {/* Honest scope: bills don't deduct stock yet (spec §3). */}
            <p className="text-xs text-muted-foreground">
              Stock reflects receipts, transfers and adjustments — sales are not deducted automatically.
            </p>
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
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </Button>

          {effectiveStore && effectiveStore !== "ALL" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)} className="gap-1.5 text-xs font-semibold">
                <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
                <span>Inter-Store Transfer</span>
              </Button>

              <Button
                size="sm"
                onClick={() => setInwardOpen(true)}
                className="gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
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
            <Boxes className="h-4 w-4 text-blue-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{summary?.total_skus ?? 0}</span>
            <span className="text-xs text-muted-foreground">items</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Units</span>
            <Package className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">
              {(summary?.total_units ?? 0).toLocaleString("en-IN")}
            </span>
            <span className="text-xs text-muted-foreground">pcs</span>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Low Stock Alert</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-300">{summary?.low_stock_count ?? 0}</span>
            <span className="text-xs text-amber-600/70 dark:text-amber-400/70">at/below reorder</span>
          </div>
        </div>

        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Pending Transfers</span>
            <ArrowLeftRight className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-300">{summary?.pending_transfers_count ?? 0}</span>
            <span className="text-xs text-indigo-600/70 dark:text-indigo-400/70">in transit / open</span>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList variant="line" aria-label="Stock views" className="border-b border-border/40 pb-1">
          <TabsTrigger value="catalog" className="text-xs font-bold">Stock Ledger & Catalog</TabsTrigger>
          <TabsTrigger value="transfers" className="text-xs font-bold">Inter-Store Transfers</TabsTrigger>
          <TabsTrigger value="movements" className="text-xs font-bold">Movement Audit Ledger</TabsTrigger>
        </TabsList>

        {/* Tab 1: Catalog */}
        <TabsContent value="catalog" className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div role="search" className="relative flex-1 max-w-md">
              <label htmlFor="stock-search" className="sr-only">
                Search inventory
              </label>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                id="stock-search"
                type="search"
                autoComplete="off"
                spellCheck={false}
                placeholder="Search by Barcode, Item Name, Brand, Dept..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-card border border-border text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              />
            </div>
            <button
              type="button"
              aria-pressed={lowStockFilter}
              onClick={() => setLowStockFilter(!lowStockFilter)}
              className="px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition bg-card border-border text-muted-foreground hover:text-foreground aria-pressed:bg-amber-500 aria-pressed:text-white aria-pressed:border-amber-600 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Low Stock Only</span>
            </button>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Inventory{lowStockFilter ? " (low stock only)" : ""}</caption>
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 font-semibold">
                  <tr>
                    <th scope="col" className="py-3 px-4">Store</th>
                    <th scope="col" className="py-3 px-4">Barcode</th>
                    <th scope="col" className="py-3 px-4">Product Details</th>
                    <th scope="col" className="py-3 px-4">Hierarchy</th>
                    <th scope="col" className="py-3 px-4 text-right">MRP</th>
                    <th scope="col" className="py-3 px-4 text-right">Current Stock</th>
                    <th scope="col" className="py-3 px-4 text-center">Status</th>
                    <th scope="col" className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {invLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">Loading inventory ledger...</td>
                    </tr>
                  ) : !inventoryItems.length ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        {debouncedSearch || lowStockFilter
                          ? "No items match the current search or filter."
                          : 'No inventory items found. Click "Record Inward GRN" to add initial stock.'}
                      </td>
                    </tr>
                  ) : (
                    inventoryItems.map((item) => {
                      const isOutOfStock = item.current_stock <= 0;
                      // `??` not `||`: a reorder level of 0 is a real setting.
                      const isLowStock = !isOutOfStock && item.current_stock <= (item.reorder_level ?? 10);
                      return (
                        <tr key={`${item.store_code}-${item.barcode}`} className="hover:bg-muted/20 transition">
                          <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">{item.store_code}</td>
                          <td className="py-3 px-4 font-mono text-[11px] font-semibold">{item.barcode}</td>
                          <th scope="row" className="py-3 px-4 text-left font-normal">
                            <div className="font-bold text-foreground">{item.item_name}</div>
                            {item.brand && <div className="text-[10px] text-muted-foreground">Brand: {item.brand}</div>}
                          </th>
                          <td className="py-3 px-4 text-[11px] text-muted-foreground">
                            {item.division} › {item.department}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium">
                            {typeof item.mrp === "number" ? `₹${item.mrp.toFixed(2)}` : "—"}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-sm">
                            {item.current_stock} {item.unit_of_measure || "Pcs"}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isOutOfStock ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/30">Out of Stock</span>
                            ) : isLowStock ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/30">Low Stock</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">Optimal</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setAdjItem(item)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-muted hover:bg-muted/80 text-foreground border border-border cursor-pointer transition focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              Adjust / Damage<span className="sr-only"> for {item.item_name}</span>
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
        </TabsContent>

        {/* Tab 2: Inter-Store Transfers */}
        <TabsContent value="transfers" className="space-y-4 pt-2">
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Inter-store transfers</caption>
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 font-semibold">
                  <tr>
                    <th scope="col" className="py-3 px-4">Transfer ID</th>
                    <th scope="col" className="py-3 px-4">Route</th>
                    <th scope="col" className="py-3 px-4">Items Transferred</th>
                    <th scope="col" className="py-3 px-4">Created Date</th>
                    <th scope="col" className="py-3 px-4 text-center">Status</th>
                    <th scope="col" className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {transfersLoading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">Loading transfers...</td>
                    </tr>
                  ) : !transfers?.length ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">No active or past stock transfers found.</td>
                    </tr>
                  ) : (
                    (transfers as Transfer[]).map((t) => {
                      const isSender = !!storeUpper && t.from_store === storeUpper;
                      const isReceiver = !!storeUpper && t.to_store === storeUpper;
                      const open = (action: TransferAction) => {
                        setActionReason("");
                        setPendingAction({ action, transfer: t });
                      };
                      return (
                        <tr key={t.transfer_id} className="hover:bg-muted/20 transition">
                          <th scope="row" className="py-3 px-4 text-left font-mono font-bold text-foreground">{t.transfer_id}</th>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-bold">
                              <span className="text-blue-600">{t.from_store}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" aria-label="to" />
                              <span className="text-emerald-600">{t.to_store}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {t.items?.map((it) => (
                              <div key={it.barcode} className="text-[11px]">
                                <span className="font-semibold">{it.item_name}</span> ·{" "}
                                <span className="font-mono text-muted-foreground">Qty: {it.quantity}</span>
                              </div>
                            ))}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">{fmtDateDot(t.created_at)}</td>
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
                          <td className="py-3 px-4">
                            <div className="flex justify-end gap-1.5">
                              {t.status === "INITIATED" && isSender && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => open("dispatch")} className="text-xs h-7 gap-1">
                                    <Send className="h-3 w-3" aria-hidden="true" />
                                    <span>Dispatch</span>
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => open("cancel")} className="text-xs h-7 gap-1 text-rose-600 hover:bg-rose-500/10">
                                    <Ban className="h-3 w-3" aria-hidden="true" />
                                    <span>Cancel</span>
                                  </Button>
                                </>
                              )}
                              {t.status === "DISPATCHED" && isReceiver && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => open("receive")}
                                    className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                  >
                                    <CheckCircle className="h-3 w-3" aria-hidden="true" />
                                    <span>Receive</span>
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => open("reject")} className="text-xs h-7 gap-1 text-rose-600 hover:bg-rose-500/10">
                                    <Ban className="h-3 w-3" aria-hidden="true" />
                                    <span>Reject</span>
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Movement Audit Log */}
        <TabsContent value="movements" className="space-y-4 pt-2">
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Stock movement audit ledger, newest first</caption>
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 font-semibold">
                  <tr>
                    <th scope="col" className="py-3 px-4">Timestamp (IST)</th>
                    <th scope="col" className="py-3 px-4">Store</th>
                    <th scope="col" className="py-3 px-4">Barcode / Item</th>
                    <th scope="col" className="py-3 px-4">Movement Type</th>
                    <th scope="col" className="py-3 px-4 text-right">Quantity Delta</th>
                    <th scope="col" className="py-3 px-4 text-right">Balance After</th>
                    <th scope="col" className="py-3 px-4">User & Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {movementsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">Loading audit log...</td>
                    </tr>
                  ) : !movements?.length ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">No stock movement records found.</td>
                    </tr>
                  ) : (
                    movements.map((m: any, idx: number) => {
                      const isPositive = m.quantity > 0;
                      return (
                        <tr key={m._id ?? `${m.created_at}-${m.barcode}-${idx}`} className="hover:bg-muted/20 transition">
                          <td className="py-3 px-4 text-muted-foreground font-mono text-[11px]">
                            <time dateTime={m.created_at}>{fmtIstDateTime(m.created_at)}</time>
                          </td>
                          <td className="py-3 px-4 font-bold text-blue-600">{m.store_code}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-foreground">{m.item_name}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{m.barcode}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-muted border border-border">{m.movement_type}</span>
                          </td>
                          {/* Sign is spelled out, not colour-only. */}
                          <td className={`py-3 px-4 text-right font-mono font-bold ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
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
        </TabsContent>
      </Tabs>

      <ModalDialog
        open={inwardOpen}
        onClose={() => setInwardOpen(false)}
        title="Record Inward Goods Received Note (GRN)"
        description={`Receiving into ${STORE_LABELS[storeUpper] ?? storeUpper}. Fields marked * are required.`}
        className="max-w-lg"
      >
        <GrnFormView
          value={inwardForm}
          onChange={setInwardForm}
          pending={inwardMutation.isPending}
          onCancel={() => setInwardOpen(false)}
          onSubmit={() => inwardMutation.mutate(inwardForm)}
        />
      </ModalDialog>

      <ModalDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Initiate Stock Transfer"
        description={`From ${STORE_LABELS[storeUpper] ?? storeUpper}. Stock is only deducted when you Dispatch.`}
      >
        <TransferFormView
          value={transferForm}
          onChange={setTransferForm}
          fromStore={storeUpper}
          items={transferableItems}
          picked={transferPick}
          pending={transferMutation.isPending}
          onCancel={() => setTransferOpen(false)}
          onSubmit={() => transferMutation.mutate(transferForm)}
        />
      </ModalDialog>

      <ModalDialog
        open={adjItem !== null}
        onClose={() => setAdjItem(null)}
        title="Adjust Stock / Damage Write-Off"
      >
        {adjItem && (
          <AdjustmentFormView
            item={adjItem}
            canIncrease={isAdmin}
            pending={adjMutation.isPending}
            onCancel={() => setAdjItem(null)}
            onSubmit={(payload) => adjMutation.mutate({ item: adjItem, ...payload })}
          />
        )}
      </ModalDialog>

      {pendingAction && (
        <ConfirmDialog
          open
          title={TRANSFER_ACTION_COPY[pendingAction.action].title}
          description={`${pendingAction.transfer.transfer_id} (${pendingAction.transfer.from_store} → ${pendingAction.transfer.to_store}): ${TRANSFER_ACTION_COPY[
            pendingAction.action
          ].body(pendingAction.transfer)}`}
          confirmLabel={TRANSFER_ACTION_COPY[pendingAction.action].confirm}
          tone={TRANSFER_ACTION_COPY[pendingAction.action].tone}
          pending={transferActionMutation.isPending}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => transferActionMutation.mutate({ ...pendingAction, reason: actionReason.trim() })}
        >
          {(pendingAction.action === "cancel" || pendingAction.action === "reject") && (
            <div className="flex flex-col gap-1 text-xs">
              <label htmlFor="transfer-action-reason" className="font-semibold text-muted-foreground">
                Reason (recorded on the transfer)
              </label>
              <textarea
                id="transfer-action-reason"
                rows={2}
                maxLength={300}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full p-2 rounded-xl bg-background border border-border text-xs"
              />
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

const fieldCls = "field flex flex-col gap-1";
const controlCls = "w-full p-2 rounded-xl bg-background border border-border text-xs focus-visible:outline-2 focus-visible:outline-ring";
const labelCls = "font-semibold text-muted-foreground";
const errorCls = "field-error items-center gap-1 text-[11px] font-semibold text-destructive";

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} className={errorCls}>
      <span role="img" aria-label="Error">⚠</span> {children}
    </span>
  );
}

function GrnFormView({
  value,
  onChange,
  pending,
  onCancel,
  onSubmit,
}: {
  value: GrnForm;
  onChange: (v: GrnForm) => void;
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  useUserInvalidAria(formRef);
  const set = (patch: Partial<GrnForm>) => onChange({ ...value, ...patch });
  const text = (key: keyof GrnForm, label: string, opts: { required?: boolean; placeholder?: string; max?: number; span2?: boolean } = {}) => (
    <div className={`${fieldCls} ${opts.span2 ? "sm:col-span-2" : ""}`}>
      <label htmlFor={`${id}-${key}`} className={labelCls}>
        {label} {opts.required && <span aria-hidden="true">*</span>}
      </label>
      <input
        id={`${id}-${key}`}
        name={key}
        type="text"
        required={opts.required}
        maxLength={opts.max ?? 80}
        autoComplete="off"
        placeholder={opts.placeholder}
        value={value[key]}
        onChange={(e) => set({ [key]: e.target.value } as Partial<GrnForm>)}
        className={controlCls}
      />
    </div>
  );

  return (
    <form
      ref={formRef}
      className="validated grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) onSubmit();
      }}
    >
      <div className={`${fieldCls} sm:col-span-2`}>
        <label htmlFor={`${id}-barcode`} className={labelCls}>
          Barcode / EAN <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${id}-barcode`}
          name="barcode"
          type="text"
          required
          pattern="[A-Za-z0-9\-]{1,64}"
          maxLength={64}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          data-autofocus
          placeholder="e.g. 8901234567890"
          value={value.barcode}
          onChange={(e) => set({ barcode: e.target.value.trim() })}
          data-error={`${id}-barcode-error`}
          className={`${controlCls} font-mono`}
        />
        <FieldError id={`${id}-barcode-error`}>Enter the barcode (letters, digits or hyphens).</FieldError>
      </div>

      <div className={`${fieldCls} sm:col-span-2`}>
        <label htmlFor={`${id}-item`} className={labelCls}>
          Product Title <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${id}-item`}
          name="item_name"
          type="text"
          required
          minLength={2}
          maxLength={150}
          autoComplete="off"
          placeholder="e.g. Classic Linen Shirt"
          value={value.item_name}
          onChange={(e) => set({ item_name: e.target.value })}
          data-error={`${id}-item-error`}
          className={controlCls}
        />
        <FieldError id={`${id}-item-error`}>Enter the product name (at least 2 characters).</FieldError>
      </div>

      {text("division", "Division", { placeholder: "e.g. Apparel" })}
      {text("section", "Section", { placeholder: "e.g. Menswear" })}
      {text("department", "Department", { placeholder: "e.g. Casual Shirts" })}
      {text("brand", "Brand")}

      <div className={fieldCls}>
        <label htmlFor={`${id}-qty`} className={labelCls}>
          Quantity Received <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${id}-qty`}
          name="quantity"
          type="number"
          inputMode="numeric"
          required
          min={1}
          max={100000}
          step={1}
          value={value.quantity}
          onChange={(e) => set({ quantity: e.target.value })}
          data-error={`${id}-qty-error`}
          className={`${controlCls} font-mono`}
        />
        <FieldError id={`${id}-qty-error`}>Enter a whole number of 1 or more.</FieldError>
      </div>

      <div className={fieldCls}>
        <label htmlFor={`${id}-mrp`} className={labelCls}>
          MRP (₹)
        </label>
        <input
          id={`${id}-mrp`}
          name="mrp"
          type="text"
          inputMode="decimal"
          pattern="\d{1,7}(\.\d{1,2})?"
          autoComplete="off"
          placeholder="e.g. 999.00"
          value={value.mrp}
          onChange={(e) => set({ mrp: e.target.value.trim() })}
          data-error={`${id}-mrp-error`}
          className={`${controlCls} font-mono`}
        />
        <FieldError id={`${id}-mrp-error`}>Enter an amount like 499 or 499.50.</FieldError>
      </div>

      <div className={fieldCls}>
        <label htmlFor={`${id}-cost`} className={labelCls}>
          Cost Price (₹)
        </label>
        <input
          id={`${id}-cost`}
          name="cost_price"
          type="text"
          inputMode="decimal"
          pattern="\d{1,7}(\.\d{1,2})?"
          autoComplete="off"
          value={value.cost_price}
          onChange={(e) => set({ cost_price: e.target.value.trim() })}
          data-error={`${id}-cost-error`}
          className={`${controlCls} font-mono`}
        />
        <FieldError id={`${id}-cost-error`}>Enter an amount like 250 or 250.75.</FieldError>
      </div>

      <div className={fieldCls}>
        <label htmlFor={`${id}-reorder`} className={labelCls}>
          Reorder Level
        </label>
        <input
          id={`${id}-reorder`}
          name="reorder_level"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value.reorder_level}
          onChange={(e) => set({ reorder_level: e.target.value })}
          className={`${controlCls} font-mono`}
        />
      </div>

      {text("reference_id", "Reference (Invoice / Challan #)", { placeholder: "e.g. CH-2026-0042", span2: true })}

      <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-border/40">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending} className="bg-blue-600 hover:bg-blue-700 text-white">
          {pending ? "Recording..." : "Save GRN"}
        </Button>
      </div>
    </form>
  );
}

function TransferFormView({
  value,
  onChange,
  fromStore,
  items,
  picked,
  pending,
  onCancel,
  onSubmit,
}: {
  value: { to_store: string; barcode: string; quantity: string; notes: string };
  onChange: (v: { to_store: string; barcode: string; quantity: string; notes: string }) => void;
  fromStore: string;
  items: InventoryItem[];
  picked: InventoryItem | undefined;
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  useUserInvalidAria(formRef);
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });
  const destinations = ["NM", "HB", "CHW"].filter((s) => s !== fromStore);
  const toStore = destinations.includes(value.to_store) ? value.to_store : destinations[0];

  return (
    <form
      ref={formRef}
      className="validated space-y-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (!picked) {
          toast.error("Pick a barcode that is in stock at this store.");
          return;
        }
        onSubmit();
      }}
    >
      <ChoiceChips
        legend="Destination store *"
        name="to_store"
        value={toStore}
        options={destinations.map((s) => ({ value: s, label: STORE_LABELS[s] ?? s }))}
        onChange={(s) => set({ to_store: s })}
      />

      <div className={fieldCls}>
        <label htmlFor={`${id}-barcode`} className={labelCls}>
          Item (barcode) <span aria-hidden="true">*</span>
        </label>
        <span id={`${id}-barcode-hint`} className="text-[10px] text-muted-foreground">
          Type to search this store's in-stock items.
        </span>
        {/* datalist: fuzzy pick from a long, dynamic list (guide: forms > selection matrix). */}
        <input
          id={`${id}-barcode`}
          name="barcode"
          type="text"
          list={`${id}-items`}
          required
          autoComplete="off"
          spellCheck={false}
          data-autofocus
          value={value.barcode}
          onChange={(e) => set({ barcode: e.target.value })}
          aria-describedby={`${id}-barcode-hint ${id}-avail`}
          className={`${controlCls} font-mono`}
        />
        <datalist id={`${id}-items`}>
          {items.map((i) => (
            <option key={i.barcode} value={i.barcode}>
              {`${i.item_name} — ${i.current_stock} in stock`}
            </option>
          ))}
        </datalist>
        <span id={`${id}-avail`} className="text-[11px] font-semibold" aria-live="polite">
          {picked ? (
            <span className="text-blue-600">
              {picked.item_name}: {picked.current_stock} {picked.unit_of_measure || "Pcs"} available
            </span>
          ) : value.barcode.trim() ? (
            <span className="text-destructive">Not in stock at {fromStore}.</span>
          ) : null}
        </span>
      </div>

      <div className={fieldCls}>
        <label htmlFor={`${id}-qty`} className={labelCls}>
          Quantity to Transfer <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${id}-qty`}
          name="quantity"
          type="number"
          inputMode="numeric"
          required
          min={1}
          max={picked?.current_stock}
          step={1}
          value={value.quantity}
          onChange={(e) => set({ quantity: e.target.value })}
          data-error={`${id}-qty-error`}
          className={`${controlCls} font-mono`}
        />
        <FieldError id={`${id}-qty-error`}>
          {picked ? `Enter 1 to ${picked.current_stock}.` : "Enter a whole number of 1 or more."}
        </FieldError>
      </div>

      <div className={fieldCls}>
        <label htmlFor={`${id}-notes`} className={labelCls}>
          Notes / Reason
        </label>
        <textarea
          id={`${id}-notes`}
          name="notes"
          rows={2}
          maxLength={300}
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Urgent stock requirement from counter"
          className={controlCls}
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending} className="bg-blue-600 hover:bg-blue-700 text-white">
          {pending ? "Initiating..." : "Initiate Transfer"}
        </Button>
      </div>
    </form>
  );
}

function AdjustmentFormView({
  item,
  canIncrease,
  pending,
  onCancel,
  onSubmit,
}: {
  item: InventoryItem;
  canIncrease: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (p: { adjustment_type: string; quantity_change: number; reason: string }) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  useUserInvalidAria(formRef);
  const [type, setType] = useState<"DAMAGE_WRITE_OFF" | "AUDIT_ADJUSTMENT">("DAMAGE_WRITE_OFF");
  // Direction is chosen explicitly and the quantity is always positive. The
  // old single "quantity change (use negative)" box meant a damage write-off
  // typed as "5" *added* five units.
  const [direction, setDirection] = useState<"remove" | "add">("remove");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");

  const effectiveDirection = type === "DAMAGE_WRITE_OFF" || !canIncrease ? "remove" : direction;
  const n = Number(qty);
  const delta = Number.isInteger(n) && n > 0 ? (effectiveDirection === "remove" ? -n : n) : 0;
  const newBalance = item.current_stock + delta;

  return (
    <form
      ref={formRef}
      className="validated space-y-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending || !delta) return;
        onSubmit({ adjustment_type: type, quantity_change: delta, reason: reason.trim() });
      }}
    >
      <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-1">
        <div className="font-bold text-foreground">{item.item_name}</div>
        <div className="text-muted-foreground font-mono">
          {item.store_code} · Barcode {item.barcode}
        </div>
        <div className="font-semibold text-blue-600">Current stock: {item.current_stock} pcs</div>
      </div>

      <ChoiceChips
        legend="Adjustment type *"
        name="adjustment_type"
        value={type}
        options={[
          { value: "DAMAGE_WRITE_OFF", label: "Damage / Breakage" },
          { value: "AUDIT_ADJUSTMENT", label: "Physical Audit Correction" },
        ]}
        onChange={setType}
      />

      {type === "AUDIT_ADJUSTMENT" && canIncrease && (
        <ChoiceChips
          legend="Direction *"
          name="direction"
          value={direction}
          options={[
            { value: "remove", label: "Counted fewer (remove)" },
            { value: "add", label: "Counted more (add)" },
          ]}
          onChange={setDirection}
        />
      )}
      {type === "AUDIT_ADJUSTMENT" && !canIncrease && (
        <p className="text-[11px] text-muted-foreground">
          Store managers can record shortfalls only. To add units after a recount, ask Central Admin.
        </p>
      )}

      <div className={fieldCls}>
        <label htmlFor={`${id}-qty`} className={labelCls}>
          Units to {effectiveDirection === "remove" ? "remove" : "add"} <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${id}-qty`}
          name="quantity"
          type="number"
          inputMode="numeric"
          required
          min={1}
          max={effectiveDirection === "remove" ? item.current_stock : undefined}
          step={1}
          data-autofocus
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          aria-describedby={`${id}-preview`}
          data-error={`${id}-qty-error`}
          className={`${controlCls} font-mono`}
        />
        <FieldError id={`${id}-qty-error`}>
          {effectiveDirection === "remove"
            ? `Enter 1 to ${item.current_stock} — you can't remove more than is in stock.`
            : "Enter a whole number of 1 or more."}
        </FieldError>
        <span id={`${id}-preview`} className="text-[11px] font-semibold text-foreground" aria-live="polite">
          {delta ? `New balance: ${newBalance} pcs (${delta > 0 ? "+" : ""}${delta})` : ""}
        </span>
      </div>

      <div className={fieldCls}>
        <label htmlFor={`${id}-reason`} className={labelCls}>
          Reason <span aria-hidden="true">*</span>
        </label>
        <span id={`${id}-reason-hint`} className="text-[10px] text-muted-foreground">
          At least 10 characters — what happened and who checked it.
        </span>
        <textarea
          id={`${id}-reason`}
          name="reason"
          rows={2}
          required
          minLength={10}
          maxLength={300}
          placeholder="e.g. 2 shirts torn in transit, checked by floor supervisor"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby={`${id}-reason-hint`}
          data-error={`${id}-reason-error`}
          className={controlCls}
        />
        <FieldError id={`${id}-reason-error`}>Describe the reason in at least 10 characters.</FieldError>
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending} className="bg-blue-600 hover:bg-blue-700 text-white">
          {pending ? "Logging..." : "Confirm Adjustment"}
        </Button>
      </div>
    </form>
  );
}
