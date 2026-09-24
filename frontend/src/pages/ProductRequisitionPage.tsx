import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Building2,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Package,
  PackagePlus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Store,
  Tag,
  Trash2,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { SearchableCategoryDropdown } from "@/components/SearchableCategoryDropdown";
import { SearchableRequisitionLineDropdown } from "@/components/SearchableRequisitionLineDropdown";
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
import { Textarea } from "@/components/ui/textarea";
import { CITIMART_PREDEFINED_713_LINES } from "@/lib/requisitionCatalog";
import type {
  CreateRequisitionPayload,
  RequisitionItem,
  RequisitionLineOption,
  RequisitionSlip,
  RequisitionStatus,
} from "@/lib/types";

interface FormItemState {
  id: string;
  sl_no: number;
  division: string;
  customDivision: string;
  isCustomDivision: boolean;
  section: string;
  customSection: string;
  isCustomSection: boolean;
  department: string;
  customDepartment: string;
  isCustomDepartment: boolean;
  isCustomLine: boolean;
  customLineText: string;
  showIndividualFields: boolean;
  barcode_details: string;
  brand: string;
  mrp: string;
  time_required: string;
  customTimeRequired: string;
  remarks: string;
}

const STORE_CONFIGS = [
  { code: "NM", name: "New Market", fullName: "LOURDES TEXTILES PVT. LTD. UNIT - CITIMART NEW MARKET" },
  { code: "HB", name: "Hatibagan", fullName: "LOURDES TEXTILES PVT. LTD. UNIT - CITIMART HATIBAGAN" },
  { code: "CHW", name: "Chowringhee", fullName: "LOURDES TEXTILES PVT. LTD. UNIT - CITIMART CHOWRINGHEE" },
] as const;

const TIME_OPTIONS = ["1 day", "2 days", "3 days", "5 days", "1 week", "Urgent - Same Day", "Other"];

const STATUS_CONFIGS: Record<RequisitionStatus, { label: string; color: string; bg: string; border: string }> = {
  Pending: { label: "Pending Review", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  "In Review": { label: "In Review", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  Approved: { label: "Approved", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  "In Transit": { label: "In Transit / Dispatched", color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  Fulfilled: { label: "Fulfilled / Received", color: "text-green-600", bg: "bg-green-500/15", border: "border-green-500/40" },
  Rejected: { label: "Rejected / Cancelled", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/30" },
};

function createEmptyItem(sl: number): FormItemState {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sl_no: sl,
    division: "",
    customDivision: "",
    isCustomDivision: false,
    section: "",
    customSection: "",
    isCustomSection: false,
    department: "",
    customDepartment: "",
    isCustomDepartment: false,
    isCustomLine: false,
    customLineText: "",
    showIndividualFields: false,
    barcode_details: "",
    brand: "",
    mrp: "",
    time_required: "1 day",
    customTimeRequired: "",
    remarks: "",
  };
}

export function ProductRequisitionPage({ initialStoreCode }: { initialStoreCode?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const userStoreCode = user?.storeCode as "NM" | "HB" | "CHW" | undefined;

  // Active view tab: "list" (Admin & list view) | "create" (Form view)
  const [activeTab, setActiveTab] = useState<"list" | "create">(isAdmin ? "list" : "create");

  // Form State
  const defaultStore: "NM" | "HB" | "CHW" =
    userStoreCode || (initialStoreCode === "HB" ? "HB" : initialStoreCode === "CHW" ? "CHW" : "NM");
  const [selectedStore, setSelectedStore] = useState<"NM" | "HB" | "CHW">(defaultStore);
  const [slipDate, setSlipDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [slipPriority, setSlipPriority] = useState<"Normal" | "High" | "Urgent">("Normal");
  const [generalRemarks, setGeneralRemarks] = useState<string>("");
  const [items, setItems] = useState<FormItemState[]>([createEmptyItem(1)]);

  // List Filters
  const [filterStore, setFilterStore] = useState<string>(isAdmin ? "ALL" : defaultStore);
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Sync manager store
  useEffect(() => {
    if (!isAdmin && userStoreCode) {
      setSelectedStore(userStoreCode);
      setFilterStore(userStoreCode);
    }
  }, [isAdmin, userStoreCode]);

  // Modals
  const [viewingSlip, setViewingSlip] = useState<RequisitionSlip | null>(null);
  const [statusModalSlip, setStatusModalSlip] = useState<RequisitionSlip | null>(null);
  const [newStatus, setNewStatus] = useState<RequisitionStatus>("Approved");
  const [adminResponseText, setAdminResponseText] = useState<string>("");

  // Queries
  const { data: catData } = useQuery({
    queryKey: ["requisition-categories"],
    queryFn: api.requisitionCategories,
    staleTime: 1000 * 60 * 30, // 30 mins
  });

  const { data: reqListData, isLoading: reqListLoading, refetch: refetchList } = useQuery({
    queryKey: ["requisitions-list", filterStore, filterStatus, searchQuery, startDate, endDate],
    queryFn: () =>
      api.requisitionsList({
        store_code: filterStore,
        status: filterStatus !== "ALL" ? filterStatus : undefined,
        search: searchQuery || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: api.createRequisition,
    onSuccess: (res) => {
      toast.success("Requisition Slip submitted successfully to Operational Head!");
      queryClient.invalidateQueries({ queryKey: ["requisitions-list"] });
      // Reset form
      setItems([createEmptyItem(1)]);
      setGeneralRemarks("");
      setActiveTab("list");
      setViewingSlip(res.requisition);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit requisition");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { status: RequisitionStatus; admin_remarks?: string } }) =>
      api.updateRequisitionStatus(id, payload),
    onSuccess: (res) => {
      toast.success(`Requisition status updated to ${res.requisition.status}`);
      queryClient.invalidateQueries({ queryKey: ["requisitions-list"] });
      setStatusModalSlip(null);
      if (viewingSlip && viewingSlip._id === res.requisition._id) {
        setViewingSlip(res.requisition);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update status");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteRequisition,
    onSuccess: () => {
      toast.success("Requisition slip deleted");
      queryClient.invalidateQueries({ queryKey: ["requisitions-list"] });
      setViewingSlip(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete requisition");
    },
  });

  // Unified Line list from Excel (713 items) + custom additions
  const lineOptions = useMemo<RequisitionLineOption[]>(() => {
    if (catData?.lines && catData.lines.length > 0) {
      return catData.lines;
    }
    return CITIMART_PREDEFINED_713_LINES;
  }, [catData]);

  // Separate Category lists from Excel + custom additions (for fine-tuning)
  const divisionList = useMemo(() => {
    return catData?.divisions || [];
  }, [catData]);

  const sectionList = useMemo(() => {
    return catData?.sections || [];
  }, [catData]);

  const departmentList = useMemo(() => {
    return catData?.departments || [];
  }, [catData]);

  // Form manipulation helpers
  const handleAddItem = () => {
    setItems((prev) => [...prev, createEmptyItem(prev.length + 1)]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.error("A requisition slip must have at least one product item.");
      return;
    }
    setItems((prev) => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((item, idx) => ({ ...item, sl_no: idx + 1 }));
    });
  };

  const updateItem = (index: number, updates: Partial<FormItemState>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const currentStoreConfig = useMemo(() => {
    return STORE_CONFIGS.find((s) => s.code === selectedStore) || STORE_CONFIGS[0];
  }, [selectedStore]);

  // Form submission
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    const processedItems = items.map((item, idx) => {
      let div = item.isCustomDivision ? item.customDivision.trim() : item.division.trim();
      let sec = item.isCustomSection ? item.customSection.trim() : item.section.trim();
      let dep = item.isCustomDepartment ? item.customDepartment.trim() : item.department.trim();

      // If entered via single custom line text
      if (item.isCustomLine && item.customLineText.trim()) {
        const parts = item.customLineText.split(/->|➔/).map((p) => p.trim());
        if (parts.length >= 3) {
          div = parts[0] || div;
          sec = parts[1] || sec;
          dep = parts[2] || dep;
        } else if (parts.length === 2) {
          div = parts[0] || div;
          sec = parts[1] || sec;
          dep = parts[1] || dep;
        } else if (parts.length === 1) {
          div = parts[0] || div;
          sec = parts[0] || sec;
          dep = parts[0] || dep;
        }
      }

      const time = item.time_required === "Other" ? item.customTimeRequired.trim() : item.time_required.trim();

      return {
        sl_no: idx + 1,
        division: div,
        section: sec,
        department: dep,
        product_required: `(${idx + 1}) -> ${div || "N/A"} -> ${sec || "N/A"} -> ${dep || "N/A"}`,
        barcode_details: item.barcode_details.trim(),
        brand: item.brand.trim(),
        mrp: item.mrp.trim(),
        time_required: time || "1 day",
        remarks: item.remarks.trim(),
      };
    });

    for (let i = 0; i < processedItems.length; i++) {
      const item = processedItems[i];
      if (!item.division || !item.section || !item.department) {
        toast.error(`Item #${i + 1}: Please select a Unified Product Requisition Line`);
        return;
      }
    }

    const payload: CreateRequisitionPayload = {
      store_code: selectedStore,
      date: slipDate,
      priority: slipPriority,
      remarks_general: generalRemarks,
      items: processedItems,
    };

    createMutation.mutate(payload);
  };

  // Stats calculation
  const stats = useMemo(() => {
    const list = reqListData?.requisitions || [];
    const total = list.length;
    const pending = list.filter((r) => r.status === "Pending").length;
    const approved = list.filter((r) => r.status === "Approved" || r.status === "In Transit").length;
    const fulfilled = list.filter((r) => r.status === "Fulfilled").length;
    const urgent = list.filter((r) => r.priority === "Urgent" && r.status !== "Fulfilled").length;
    return { total, pending, approved, fulfilled, urgent };
  }, [reqListData]);

  // Flattened items for List View display
  const flattenedListItems = useMemo(() => {
    const list = reqListData?.requisitions || [];
    const rows: {
      req: RequisitionSlip;
      item: RequisitionItem;
      globalIndex: number;
    }[] = [];

    let count = 1;
    list.forEach((req) => {
      if (req.items && req.items.length > 0) {
        req.items.forEach((item) => {
          rows.push({
            req,
            item,
            globalIndex: count++,
          });
        });
      } else {
        rows.push({
          req,
          item: {
            sl_no: 1,
            division: "-",
            section: "-",
            department: "-",
            product_required: "-",
            barcode_details: "-",
            brand: "-",
            mrp: "-",
            time_required: "-",
            remarks: req.remarks_general || "-",
          },
          globalIndex: count++,
        });
      }
    });

    return rows;
  }, [reqListData]);

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Banner & Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-5 sm:p-7 text-white shadow-2xl">
        <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -bottom-10 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                <Store className="h-3.5 w-3.5 mr-1" />
                CITIMART Operations
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                Managers to Admin
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Operational Head Desk
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <PackagePlus className="h-7 w-7 text-blue-400 shrink-0" />
              <span>Required Product Requisition Slip / Form</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              Official Store Format:{" "}
              <span className="text-amber-300 font-semibold underline underline-offset-2">
                LOURDES TEXTILES PVT. LTD. UNIT - CITIMART
              </span>{" "}
              (New Market &bull; Hatibagan &bull; Chowringhee)
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700/80 shrink-0">
            <Button
              size="sm"
              variant={activeTab === "list" ? "default" : "ghost"}
              onClick={() => setActiveTab("list")}
              className={`text-xs font-semibold px-4 ${
                activeTab === "list"
                  ? "bg-blue-600 text-white shadow-md hover:bg-blue-700"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
              List View
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-slate-900/60 text-[10px] text-blue-300 font-bold">
                {reqListData?.count ?? 0}
              </span>
            </Button>
            <Button
              size="sm"
              variant={activeTab === "create" ? "default" : "ghost"}
              onClick={() => setActiveTab("create")}
              className={`text-xs font-semibold px-4 ${
                activeTab === "create"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Requisition Form
            </Button>
          </div>
        </div>

        {/* Quick KPI Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-700/60 text-slate-200">
          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
            <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Total Slips</p>
            <p className="text-xl sm:text-2xl font-black text-white">{stats.total}</p>
          </div>
          <div className="bg-amber-500/10 rounded-xl p-3 border border-amber-500/20">
            <p className="text-[11px] text-amber-400 uppercase font-bold tracking-wider">Pending Review</p>
            <p className="text-xl sm:text-2xl font-black text-amber-400">{stats.pending}</p>
          </div>
          <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
            <p className="text-[11px] text-emerald-400 uppercase font-bold tracking-wider">Approved / Transit</p>
            <p className="text-xl sm:text-2xl font-black text-emerald-400">{stats.approved}</p>
          </div>
          <div className="bg-rose-500/10 rounded-xl p-3 border border-rose-500/20">
            <p className="text-[11px] text-rose-400 uppercase font-bold tracking-wider">Urgent Attention</p>
            <p className="text-xl sm:text-2xl font-black text-rose-400">{stats.urgent}</p>
          </div>
        </div>
      </div>

      {/* VIEW 1: REQUISITION CREATION FORM */}
      {activeTab === "create" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          <form onSubmit={handleSubmitForm} className="space-y-6">
            {/* Header Form Card */}
            <div className="rounded-2xl border border-border/70 bg-card shadow-lg overflow-hidden">
              <div className="bg-slate-500/5 border-b border-border/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
                    <Store className="h-4 w-4 text-blue-500" />
                    Requisition Header &amp; Unit Identity
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Specify issuing store, requisition date, and operational priority.
                  </p>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-blue-500/40 text-blue-600 dark:text-blue-400 font-mono text-xs font-semibold bg-blue-500/5">
                  To: Operational Head / Admin
                </span>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Store Name */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-blue-500" />
                      1. Store Name (Company Unit)
                    </Label>
                    {!isAdmin && userStoreCode ? (
                      <div className="w-full h-10 px-3.5 rounded-lg border border-border/70 bg-slate-500/5 dark:bg-slate-800/40 flex items-center justify-between gap-3 shadow-inner">
                        <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                          {currentStoreConfig.fullName}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          {currentStoreConfig.name} ({currentStoreConfig.code})
                        </span>
                      </div>
                    ) : (
                      <select
                        value={selectedStore}
                        onChange={(e) => setSelectedStore(e.target.value as "NM" | "HB" | "CHW")}
                        className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                      >
                        {STORE_CONFIGS.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.fullName}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Full Legal Header:{" "}
                      <span className="font-semibold text-foreground">{currentStoreConfig.fullName}</span>
                    </p>
                  </div>

                  {/* Date */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-blue-500" />
                      Requisition Date
                    </Label>
                    <Input
                      type="date"
                      value={slipDate}
                      onChange={(e) => setSlipDate(e.target.value)}
                      className="h-10 text-sm font-medium"
                      required
                    />
                  </div>
                </div>

                {/* Priority & General Remarks */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">Priority Level</Label>
                    <div className="flex gap-2">
                      {(["Normal", "High", "Urgent"] as const).map((p) => (
                        <Button
                          key={p}
                          type="button"
                          size="sm"
                          variant={slipPriority === p ? "default" : "outline"}
                          onClick={() => setSlipPriority(p)}
                          className={`flex-1 text-xs font-bold ${
                            slipPriority === p
                              ? p === "Urgent"
                                ? "bg-rose-600 hover:bg-rose-700 text-white"
                                : p === "High"
                                ? "bg-amber-600 hover:bg-amber-700 text-white"
                                : "bg-blue-600 hover:bg-blue-700 text-white"
                              : ""
                          }`}
                        >
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold text-foreground">General Slip Notes / Requisition Reason</Label>
                    <Input
                      placeholder="e.g. Urgent stock replenishment for weekend footfall surge"
                      value={generalRemarks}
                      onChange={(e) => setGeneralRemarks(e.target.value)}
                      className="h-10 text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Product Items Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Package className="h-4 w-4 text-indigo-500" />
                    2. Product Required &amp; Item Details
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Cascading hierarchy from Excel:{" "}
                    <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                      &lt;sl&gt; ➔ &lt;DIVISION&gt; ➔ &lt;SECTION&gt; ➔ &lt;DEPARTMENT&gt;
                    </span>
                    . Unified single dropdown with 700+ lines.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="border-blue-500/40 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 text-xs font-bold"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Another Item Line
                </Button>
              </div>

              {/* Items List */}
              <div className="space-y-4">
                {items.map((item, idx) => {
                  // Preview string
                  const displayDiv = item.isCustomDivision ? item.customDivision : item.division;
                  const displaySec = item.isCustomSection ? item.customSection : item.section;
                  const displayDep = item.isCustomDepartment ? item.customDepartment : item.department;
                  let previewStr = `(${idx + 1}) -> ${displayDiv || "..."} -> ${displaySec || "..."} -> ${
                    displayDep || "..."
                  }`;
                  if (item.isCustomLine && item.customLineText) {
                    previewStr = `(${idx + 1}) -> ${item.customLineText}`;
                  }

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-border/80 shadow-md transition-all hover:border-blue-500/40 bg-card/60 backdrop-blur-sm"
                    >
                      <div className="bg-slate-500/5 border-b border-border/50 py-3 px-4 sm:px-6 flex items-center justify-between gap-2 rounded-t-2xl">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold font-mono text-foreground">
                            Item #{idx + 1} Requisition Line
                          </span>
                        </div>
                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 h-7 px-2 text-xs"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>

                      <div className="p-4 sm:p-6 space-y-4">
                        {/* Live Formatted Badge */}
                        <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                              Formatted Product Required Preview:
                            </span>
                            <p className="text-xs font-mono font-bold text-foreground truncate">{previewStr}</p>
                          </div>
                          <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-500/30 text-blue-500 bg-blue-500/5">
                            Unified Dropdown Menu
                          </span>
                        </div>

                        {/* 1 Single Unified Dropdown Selector */}
                        <SearchableRequisitionLineDropdown
                          label="1. PRODUCT REQUISITION LINE (DIVISION ➔ SECTION ➔ DEPARTMENT)"
                          subLabel="Single dropdown with all 700+ lines from Excel with instant search"
                          placeholder="-- Select / Search Unified Product Line (e.g. Accoessories ➔ Gift & Novelties ➔ Books) --"
                          selectedDivision={item.isCustomDivision ? item.customDivision : item.division}
                          selectedSection={item.isCustomSection ? item.customSection : item.section}
                          selectedDepartment={item.isCustomDepartment ? item.customDepartment : item.department}
                          options={lineOptions}
                          isCustom={item.isCustomLine}
                          customValue={item.customLineText}
                          onSelectLine={({ division, section, department }) => {
                            updateItem(idx, {
                              division,
                              section,
                              department,
                              isCustomLine: false,
                              isCustomDivision: false,
                              isCustomSection: false,
                              isCustomDepartment: false,
                            });
                          }}
                          onCustomToggle={(isCustom) => {
                            updateItem(idx, {
                              isCustomLine: isCustom,
                              customLineText: isCustom
                                ? item.customLineText ||
                                  (item.division && item.section && item.department
                                    ? `${item.division} -> ${item.section} -> ${item.department}`
                                    : "")
                                : "",
                            });
                          }}
                          onCustomChange={(val) => {
                            updateItem(idx, {
                              customLineText: val,
                            });
                          }}
                          required
                        />

                        {/* Optional Accordion to fine-tune individual fields if needed */}
                        <div className="pt-0.5">
                          <button
                            type="button"
                            onClick={() => updateItem(idx, { showIndividualFields: !item.showIndividualFields })}
                            className="text-[11px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
                          >
                            <span>
                              {item.showIndividualFields ? "▲ Hide" : "▼ Fine-tune"} Individual Division / Section / Department
                            </span>
                          </button>

                          {item.showIndividualFields && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2.5 pb-1 border-t border-border/40 mt-2 animate-in fade-in duration-150">
                              <SearchableCategoryDropdown
                                label="Division"
                                placeholder="-- Select Division --"
                                value={item.isCustomDivision ? item.customDivision : item.division}
                                options={divisionList}
                                isCustom={Boolean(item.isCustomDivision)}
                                customValue={item.customDivision || ""}
                                onSelect={(div) => updateItem(idx, { division: div, isCustomDivision: false })}
                                onCustomToggle={(isCustom) => updateItem(idx, { isCustomDivision: isCustom })}
                                onCustomChange={(val) => updateItem(idx, { customDivision: val })}
                                colorTheme="blue"
                              />
                              <SearchableCategoryDropdown
                                label="Section"
                                placeholder="-- Select Section --"
                                value={item.isCustomSection ? item.customSection : item.section}
                                options={sectionList}
                                isCustom={Boolean(item.isCustomSection)}
                                customValue={item.customSection || ""}
                                onSelect={(sec) => updateItem(idx, { section: sec, isCustomSection: false })}
                                onCustomToggle={(isCustom) => updateItem(idx, { isCustomSection: isCustom })}
                                onCustomChange={(val) => updateItem(idx, { customSection: val })}
                                colorTheme="indigo"
                              />
                              <SearchableCategoryDropdown
                                label="Department"
                                placeholder="-- Select Department --"
                                value={item.isCustomDepartment ? item.customDepartment : item.department}
                                options={departmentList}
                                isCustom={Boolean(item.isCustomDepartment)}
                                customValue={item.customDepartment || ""}
                                onSelect={(dep) => updateItem(idx, { department: dep, isCustomDepartment: false })}
                                onCustomToggle={(isCustom) => updateItem(idx, { isCustomDepartment: isCustom })}
                                onCustomChange={(val) => updateItem(idx, { customDepartment: val })}
                                colorTheme="emerald"
                              />
                            </div>
                          )}
                        </div>

                        {/* Product Detail Fields: 3. BARCODE, 4. BRAND, 5. MRP, 6. Time Required, 7. Remarks */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 pt-2">
                          {/* 3. BARCODE DETAILS DESCRIPTIONS */}
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                              <Tag className="h-3 w-3 text-blue-500" />
                              3. BARCODE DETAILS DESCRIPTIONS
                            </Label>
                            <Input
                              placeholder="e.g. 8901234567890 - Baby Rattle Blue 6M+"
                              value={item.barcode_details}
                              onChange={(e) => updateItem(idx, { barcode_details: e.target.value })}
                              className="h-9 text-xs"
                            />
                          </div>

                          {/* 4. BRAND */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">4. BRAND</Label>
                            <Input
                              placeholder="e.g. MeeMee / Citimart Basics"
                              value={item.brand}
                              onChange={(e) => updateItem(idx, { brand: e.target.value })}
                              className="h-9 text-xs"
                            />
                          </div>

                          {/* 5. MRP */}
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-foreground">5. MRP (₹)</Label>
                            <Input
                              placeholder="e.g. 499.00"
                              value={item.mrp}
                              onChange={(e) => updateItem(idx, { mrp: e.target.value })}
                              className="h-9 text-xs"
                            />
                          </div>
                        </div>

                        {/* Time Required & Remarks */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5 pt-1">
                          {/* 6. Time Required */}
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-xs font-semibold text-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3 text-indigo-500" />
                              6. Time Required
                            </Label>
                            <div className="flex gap-1.5 flex-wrap">
                              {TIME_OPTIONS.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => updateItem(idx, { time_required: opt })}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition ${
                                    item.time_required === opt
                                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                      : "bg-background text-muted-foreground border-border hover:border-indigo-400"
                                  }`}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                            {item.time_required === "Other" && (
                              <Input
                                placeholder="Specify custom time required (e.g. 4 days)"
                                value={item.customTimeRequired}
                                onChange={(e) => updateItem(idx, { customTimeRequired: e.target.value })}
                                className="h-8 text-xs mt-1.5"
                              />
                            )}
                          </div>

                          {/* 7. Remarks */}
                          <div className="space-y-1.5 sm:col-span-2">
                            <Label className="text-xs font-semibold text-foreground">7. Remarks</Label>
                            <Input
                              placeholder="e.g. Low shelf stock, customer demanded"
                              value={item.remarks}
                              onChange={(e) => updateItem(idx, { remarks: e.target.value })}
                              className="h-9 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Submission Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-border/80">
              <p className="text-xs text-muted-foreground">
                Requisition slip will be immediately dispatched to Operational Head / Admin list.
              </p>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setItems([createEmptyItem(1)]);
                    setGeneralRemarks("");
                  }}
                  className="flex-1 sm:flex-none text-xs"
                >
                  Reset Form
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 sm:flex-none bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs px-6 shadow-lg shadow-blue-500/20"
                >
                  {createMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Submit Requisition Slip
                </Button>
              </div>
            </div>
          </form>
        </motion.div>
      )}

      {/* VIEW 2: ADMIN & MANAGERS LIST VIEW */}
      {activeTab === "list" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {/* Filters Bar */}
          <div className="rounded-2xl border border-border/70 bg-card p-3.5 sm:p-4 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="text-xs font-bold text-foreground">Filter &amp; Search Requisitions</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetchList()}
                  className="h-8 text-xs font-semibold"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
                <a
                  href={api.getRequisitionExportUrl({
                    store_code: filterStore,
                    status: filterStatus !== "ALL" ? filterStatus : undefined,
                    search: searchQuery || undefined,
                    start_date: startDate || undefined,
                    end_date: endDate || undefined,
                  })}
                  download
                  className="inline-flex items-center justify-center rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3 transition shadow-sm"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Export Excel (.xlsx)
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 pt-1">
              {/* Store Filter */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Store</Label>
                <select
                  value={filterStore}
                  disabled={!isAdmin && !!userStoreCode}
                  onChange={(e) => setFilterStore(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-medium focus:outline-none"
                >
                  {isAdmin && <option value="ALL">All Stores (Network)</option>}
                  <option value="NM">New Market</option>
                  <option value="HB">Hatibagan</option>
                  <option value="CHW">Chowringhee</option>
                </select>
              </div>

              {/* Status Filter */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Status</Label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-medium focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Pending">Pending Review</option>
                  <option value="In Review">In Review</option>
                  <option value="Approved">Approved</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Fulfilled">Fulfilled</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              {/* Start Date */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">From Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              {/* End Date */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">To Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              {/* Search */}
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-muted-foreground">Search</Label>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Barcode, brand, item..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* List View Table */}
          <div className="rounded-2xl border border-border/70 bg-card shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                {/* Column head exact requested:
                    sl.no | Date | Product Required | BARCODE DETAILS DESCRIPTIONS | BRAND | MRP | Time Required | Remarks
                */}
                <thead>
                  <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <th className="py-3 px-3 w-14 text-center">sl.no</th>
                    <th className="py-3 px-3 w-24">Date</th>
                    <th className="py-3 px-3 min-w-[200px]">Product Required</th>
                    <th className="py-3 px-3 min-w-[180px]">BARCODE DETAILS DESCRIPTIONS</th>
                    <th className="py-3 px-3 w-28">BRAND</th>
                    <th className="py-3 px-3 w-24 text-right">MRP</th>
                    <th className="py-3 px-3 w-28 text-center">Time Required</th>
                    <th className="py-3 px-3 min-w-[160px]">Remarks</th>
                    <th className="py-3 px-3 w-28 text-center">Status</th>
                    <th className="py-3 px-3 w-24 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-medium">
                  {reqListLoading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                        Loading product requisitions...
                      </td>
                    </tr>
                  ) : flattenedListItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No product requisition records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    flattenedListItems.map(({ req, item, globalIndex }) => {
                      const statusCfg = STATUS_CONFIGS[req.status] || STATUS_CONFIGS.Pending;
                      return (
                        <tr
                          key={`${req._id}-${item.sl_no}-${globalIndex}`}
                          className="hover:bg-muted/40 transition-colors group"
                        >
                          {/* 1. sl.no */}
                          <td className="py-3 px-3 text-center font-bold text-muted-foreground">
                            {globalIndex}
                          </td>

                          {/* 2. Date */}
                          <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                            <span className="font-semibold text-foreground">{req.date}</span>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <span className="font-bold text-blue-600 dark:text-blue-400">{req.store_code}</span>
                              <span>&bull; {req.req_code.split("-").slice(-1)}</span>
                            </div>
                          </td>

                          {/* 3. Product Required */}
                          <td className="py-3 px-3 font-mono text-[11px] text-blue-600 dark:text-blue-300 font-semibold">
                            {item.product_required || `(${item.sl_no}) -> ${item.division} -> ${item.section} -> ${item.department}`}
                          </td>

                          {/* 4. BARCODE DETAILS DESCRIPTIONS */}
                          <td className="py-3 px-3 font-mono text-[11px] text-foreground">
                            {item.barcode_details || <span className="text-muted-foreground italic">N/A</span>}
                          </td>

                          {/* 5. BRAND */}
                          <td className="py-3 px-3 font-semibold text-foreground">
                            {item.brand || <span className="text-muted-foreground italic">-</span>}
                          </td>

                          {/* 6. MRP */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                            {item.mrp ? `₹${item.mrp}` : <span className="text-muted-foreground italic">-</span>}
                          </td>

                          {/* 7. Time Required */}
                          <td className="py-3 px-3 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border border-indigo-500/30 text-indigo-500 bg-indigo-500/5">
                              <Clock className="h-2.5 w-2.5 mr-1" />
                              {item.time_required || "1 day"}
                            </span>
                          </td>

                          {/* 8. Remarks */}
                          <td className="py-3 px-3 text-muted-foreground text-xs">
                            {item.remarks || req.remarks_general || <span className="italic opacity-60">-</span>}
                            {req.admin_remarks && (
                              <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                Admin: {req.admin_remarks}
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border}`}
                            >
                              {statusCfg.label}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setViewingSlip(req)}
                                title="View Full Slip"
                                className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>

                              {isAdmin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setStatusModalSlip(req);
                                    setNewStatus(req.status);
                                    setAdminResponseText(req.admin_remarks || "");
                                  }}
                                  title="Update Status / Response"
                                  className="h-7 w-7 p-0 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                </Button>
                              )}

                              {(isAdmin || req.created_by_user === user?.username) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete slip ${req.req_code}?`)) {
                                      deleteMutation.mutate(req._id);
                                    }
                                  }}
                                  title="Delete Slip"
                                  className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
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
        </motion.div>
      )}

      {/* MODAL 1: VIEW & PRINT OFFICIAL REQUISITION SLIP */}
      <Dialog open={!!viewingSlip} onOpenChange={(open) => !open && setViewingSlip(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
          {viewingSlip && (
            <div className="p-6 sm:p-8 space-y-6 bg-white text-slate-900" id="printable-requisition-slip">
              {/* Slip Header */}
              <div className="border-b-2 border-slate-900 pb-4 text-center space-y-1">
                <h2 className="text-xl font-black uppercase tracking-wider text-slate-900">
                  LOURDES TEXTILES PVT. LTD.
                </h2>
                <h3 className="text-base font-bold uppercase text-slate-700">
                  UNIT - CITIMART {viewingSlip.store_name?.toUpperCase() || viewingSlip.store_code}
                </h3>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest pt-1">
                  REQUIRED PRODUCT REQUISITION SLIP / FORM
                </p>
                <div className="flex flex-wrap items-center justify-between pt-3 text-xs font-mono font-bold text-slate-700 border-t border-slate-300">
                  <span>SLIP REF: {viewingSlip.req_code}</span>
                  <span>DATE: {viewingSlip.date}</span>
                  <span>
                    STATUS: <span className="font-extrabold uppercase text-indigo-700">{viewingSlip.status}</span>
                  </span>
                </div>
              </div>

              {/* Sender / Recipient Metadata */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px]">From (Store Unit):</span>
                  <p className="font-bold text-slate-900">{viewingSlip.store_name_full}</p>
                  <p className="text-slate-600">Created by: {viewingSlip.created_by_name}</p>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px]">To (Headquarters):</span>
                  <p className="font-bold text-slate-900">Operational Head / Administration</p>
                  <p className="text-slate-600">Priority: {viewingSlip.priority}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Product Items Requisitioned ({viewingSlip.item_count} items):
                </span>
                <table className="w-full text-left text-xs border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-300">
                      <th className="p-2 border-r border-slate-300 w-10 text-center">sl</th>
                      <th className="p-2 border-r border-slate-300">Product Required</th>
                      <th className="p-2 border-r border-slate-300">Barcode Details</th>
                      <th className="p-2 border-r border-slate-300">Brand</th>
                      <th className="p-2 border-r border-slate-300 text-right">MRP</th>
                      <th className="p-2 border-r border-slate-300 text-center">Time Req.</th>
                      <th className="p-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {viewingSlip.items?.map((item, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 border-r border-slate-300 text-center font-bold">{item.sl_no || i + 1}</td>
                        <td className="p-2 border-r border-slate-300 font-mono font-semibold text-slate-900">
                          {item.product_required}
                        </td>
                        <td className="p-2 border-r border-slate-300 font-mono">{item.barcode_details || "-"}</td>
                        <td className="p-2 border-r border-slate-300 font-medium">{item.brand || "-"}</td>
                        <td className="p-2 border-r border-slate-300 text-right font-mono font-bold">
                          {item.mrp ? `₹${item.mrp}` : "-"}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-center font-semibold">{item.time_required}</td>
                        <td className="p-2 text-slate-600">{item.remarks || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* General Remarks / Admin Response */}
              {(viewingSlip.remarks_general || viewingSlip.admin_remarks) && (
                <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
                  {viewingSlip.remarks_general && (
                    <div>
                      <span className="font-bold text-slate-700">General Remarks: </span>
                      <span className="text-slate-800">{viewingSlip.remarks_general}</span>
                    </div>
                  )}
                  {viewingSlip.admin_remarks && (
                    <div className="bg-blue-50 p-2.5 rounded border border-blue-200 text-blue-900">
                      <span className="font-bold">Operational Head Note: </span>
                      <span>{viewingSlip.admin_remarks}</span>
                      {viewingSlip.actioned_by && (
                        <span className="block text-[10px] text-blue-700 pt-1">
                          Actioned by {viewingSlip.actioned_by} at {viewingSlip.actioned_at}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Official Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-10 text-xs border-t border-slate-400">
                <div className="text-center space-y-8">
                  <div className="h-10" />
                  <p className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                    Store Manager Signature / Stamp
                  </p>
                </div>
                <div className="text-center space-y-8">
                  <div className="h-10" />
                  <p className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                    Operational Head / Admin Approval
                  </p>
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 print:hidden">
                <Button variant="outline" size="sm" onClick={() => setViewingSlip(null)}>
                  Close
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrintSlip}
                    className="border-slate-300 text-slate-800 font-bold"
                  >
                    <Printer className="h-4 w-4 mr-1.5" />
                    Print Slip
                  </Button>
                  {isAdmin && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setStatusModalSlip(viewingSlip);
                        setNewStatus(viewingSlip.status);
                        setAdminResponseText(viewingSlip.admin_remarks || "");
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                    >
                      Update Status
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 2: ADMIN STATUS & REMARKS UPDATE */}
      <Dialog open={!!statusModalSlip} onOpenChange={(open) => !open && setStatusModalSlip(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Update Requisition Status &amp; Notes
            </DialogTitle>
            <DialogDescription className="text-xs">
              Operational Head Action for Slip:{" "}
              <span className="font-mono font-bold text-foreground">{statusModalSlip?.req_code}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Select Status</Label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as RequisitionStatus)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-xs font-bold focus:outline-none"
              >
                <option value="Pending">Pending Review</option>
                <option value="In Review">In Review</option>
                <option value="Approved">Approved</option>
                <option value="In Transit">In Transit / Dispatched</option>
                <option value="Fulfilled">Fulfilled / Received</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Admin / Operational Head Remarks</Label>
              <Textarea
                rows={3}
                placeholder="e.g. Approved. Transfer order dispatched from Central Warehouse."
                value={adminResponseText}
                onChange={(e) => setAdminResponseText(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setStatusModalSlip(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={updateStatusMutation.isPending}
              onClick={() => {
                if (!statusModalSlip) return;
                updateStatusMutation.mutate({
                  id: statusModalSlip._id,
                  payload: {
                    status: newStatus,
                    admin_remarks: adminResponseText,
                  },
                });
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {updateStatusMutation.isPending ? "Saving..." : "Save Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
