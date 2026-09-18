import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Edit2,
  Flame,
  Info,
  Layers,
  Megaphone,
  PlusCircle,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Store,
  Tag,
  Target,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { fmtDateDot } from "@/lib/format";
import raphaelAvatar from "@/assets/raphael-sir-avatar.jpg";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  CreateDirectivePayload,
  Directive,
  DirectiveCategory,
  DirectivePriority,
  DirectiveTargetStore,
  UpdateDirectivePayload,
} from "@/lib/types";

import { useLanguage } from "@/context/LanguageContext";

interface BossDirectivesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDirectiveAcknowledged?: () => void;
}

const ADMIN_PRESET_TEMPLATES = [
  {
    name: "Peak Hour Sales & Conversion Push",
    category: "sales_target" as DirectiveCategory,
    priority: "urgent" as DirectivePriority,
    title: "Peak Hour Sales Target & Floor Conversion (3 PM - 9 PM)",
    message:
      "All store managers: Maximize floor presence during peak trading hours (03:00 PM to 09:00 PM). Ensure minimum conversion rate of 70% across Men's, Women's, and Kids' departments. Keep cash counters fully manned to eliminate billing queues.",
  },
  {
    name: "ATV & Basket Size Optimization",
    category: "sales_target" as DirectiveCategory,
    priority: "high" as DirectivePriority,
    title: "Maintain ATV Above ₹1,800 + Cross-Selling at Cash Desk",
    message:
      "Please brief sales floor staff on active cross-selling and up-selling accessories & fast-moving items at billing points. Target: Maintain Average Transaction Value (ATV) above ₹1,800 and Basket Size >= 2.8 items per bill.",
  },
  {
    name: "Weekend Footfall & Customer Experience",
    category: "special_notice" as DirectiveCategory,
    priority: "high" as DirectivePriority,
    title: "Weekend Footfall Strategy & Floor Management",
    message:
      "Heavy customer footfall anticipated this weekend. Ensure all floor supervisors actively assist shoppers, fast replenishment of top-selling size runs, and accurate time-slot logging of hourly footfall and bill count.",
  },
  {
    name: "Operational Data Logging Notice",
    category: "operations" as DirectiveCategory,
    priority: "normal" as DirectivePriority,
    title: "Daily Data Entry Timelines & Verification",
    message:
      "Store managers: Kindly ensure all bill logs, footfall entries, and NOB logs are updated by 10:30 PM sharp each evening so consolidated executive reports reflect exact numbers.",
  },
];

const MANAGER_PRESET_TEMPLATES = [
  {
    name: "Operational Issue / Technical Breakdown",
    category: "complaint" as DirectiveCategory,
    priority: "urgent" as DirectivePriority,
    title: "Store Infrastructure / Electrical / Cooling Malfunction",
    message:
      "Operational Head: Facing an unexpected hardware/cooling/electrical issue on the sales floor. Requesting urgent maintenance support.",
  },
  {
    name: "POS & Billing Terminal Glitch",
    category: "complaint" as DirectiveCategory,
    priority: "high" as DirectivePriority,
    title: "Billing Counter Terminal / Barcode Scanner Fault",
    message:
      "Operational Head: Billing terminal scanner experiencing latency during rush hours, slowing customer checkout. Technical intervention requested.",
  },
  {
    name: "Store Packaging & Carry Bag Requisition",
    category: "requirements" as DirectiveCategory,
    priority: "normal" as DirectivePriority,
    title: "Requisition for Carry Bags & Counter Thermal Rolls",
    message:
      "Operational Head: Store inventory running low on Large/Medium carry bags and thermal billing rolls for upcoming days. Requesting dispatch.",
  },
  {
    name: "Floor Demand & Footfall Remarks",
    category: "remarks" as DirectiveCategory,
    priority: "normal" as DirectivePriority,
    title: "Daily Store Footfall & Category Demand Feedback",
    message:
      "Operational Head: Strong customer interest observed in Festive and Ethnic wear today. Re-stocking fast-moving sizes recommended.",
  },
];

const PRIORITY_CONFIG: Record<
  DirectivePriority,
  { label: string; icon: typeof Flame; badgeClass: string; cardBorder: string }
> = {
  urgent: {
    label: "Urgent Directive",
    icon: Flame,
    badgeClass: "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse",
    cardBorder: "border-red-500/50 bg-red-950/10 shadow-[0_0_15px_rgba(239,68,68,0.15)]",
  },
  high: {
    label: "High Priority",
    icon: Zap,
    badgeClass: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    cardBorder: "border-amber-500/40 bg-amber-950/10",
  },
  normal: {
    label: "Notice",
    icon: Sparkles,
    badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    cardBorder: "border-blue-500/30 bg-blue-950/10",
  },
  info: {
    label: "Informational",
    icon: Info,
    badgeClass: "bg-slate-500/20 text-slate-300 border-slate-500/40",
    cardBorder: "border-slate-700 bg-slate-900/40",
  },
};

const CATEGORY_CONFIG: Record<DirectiveCategory, { label: string; icon: typeof Target; color: string }> = {
  sales_target: { label: "Sales Target", icon: Target, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  special_notice: { label: "Special Notice", icon: AlertTriangle, color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  operations: { label: "Operations", icon: Radio, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  announcement: { label: "Announcement", icon: Megaphone, color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  remarks: { label: "Remarks & Observations", icon: Tag, color: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
  complaint: { label: "Complaint / Escalation", icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/30" },
  requirements: { label: "Store Requisitions / Need", icon: Layers, color: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
};

const STORE_CONFIG: Record<DirectiveTargetStore, { label: string; code: string }> = {
  ALL: { label: "All CITIMART Stores", code: "ALL" },
  NM: { label: "New Market", code: "NM" },
  HB: { label: "Hatibagan", code: "HB" },
  CHW: { label: "Chowringhee", code: "CHW" },
  ADMIN: { label: "Operational Head / Admin Desk", code: "ADMIN" },
};

function formatTimestamp(isoStr: string): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const time = d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${fmtDateDot(d)}, ${time}`;
  } catch {
    return isoStr;
  }
}

export function BossDirectivesModal({
  open,
  onOpenChange,
  onDirectiveAcknowledged,
}: BossDirectivesModalProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"directives" | "broadcast">("directives");
  const [editingDirective, setEditingDirective] = useState<Directive | null>(null);

  // Form State for Broadcasting / Reporting
  const [formTitle, setFormTitle] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formPriority, setFormPriority] = useState<DirectivePriority>(isAdmin ? "high" : "normal");
  const [formCategory, setFormCategory] = useState<DirectiveCategory>(isAdmin ? "sales_target" : "complaint");
  const [formTargetStore, setFormTargetStore] = useState<DirectiveTargetStore>(
    isAdmin ? "ALL" : ((user?.storeCode as DirectiveTargetStore) || "ADMIN")
  );

  // Query Directives Summary
  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ["directives-summary"],
    queryFn: api.directives,
    enabled: open,
    refetchInterval: open ? 10000 : false,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (payload: CreateDirectivePayload) => api.createDirective(payload),
    onSuccess: () => {
      toast.success(
        isAdmin
          ? "Directive broadcasted successfully by Operational Head!"
          : "Report / Directive submitted successfully to Operational Head!"
      );
      queryClient.invalidateQueries({ queryKey: ["directives-summary"] });
      setFormTitle("");
      setFormMessage("");
      setActiveTab("directives");
    },
    onError: (err: Error) => {
      toast.error(`Submission failed: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateDirectivePayload }) =>
      api.updateDirective(id, payload),
    onSuccess: () => {
      toast.success("Directive updated successfully");
      queryClient.invalidateQueries({ queryKey: ["directives-summary"] });
      setEditingDirective(null);
    },
    onError: (err: Error) => {
      toast.error(`Update failed: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteDirective(id),
    onSuccess: () => {
      toast.success("Directive deleted");
      queryClient.invalidateQueries({ queryKey: ["directives-summary"] });
    },
    onError: (err: Error) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => api.acknowledgeDirective(id),
    onSuccess: () => {
      toast.success("Directive acknowledged and recorded");
      queryClient.invalidateQueries({ queryKey: ["directives-summary"] });
      onDirectiveAcknowledged?.();
    },
    onError: (err: Error) => {
      toast.error(`Acknowledge failed: ${err.message}`);
    },
  });

  const handleApplyPreset = (preset: { name: string; category: DirectiveCategory; priority: DirectivePriority; title: string; message: string }) => {
    setFormTitle(preset.title);
    setFormMessage(preset.message);
    setFormCategory(preset.category);
    setFormPriority(preset.priority);
    toast.info(`Applied template: "${preset.name}"`);
  };

  const handleBroadcastSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formMessage.trim()) {
      toast.error("Please fill in both title and directive message.");
      return;
    }

    if (isAdmin) {
      createMutation.mutate({
        title: formTitle.trim(),
        message: formMessage.trim(),
        priority: formPriority,
        category: formCategory,
        target_store: formTargetStore,
        author_name: "Operational Head",
        author_title: "Executive Director / Operations Head",
      });
    } else {
      const storeName = STORE_CONFIG[user?.storeCode as DirectiveTargetStore]?.label || "Store";
      createMutation.mutate({
        title: formTitle.trim(),
        message: formMessage.trim(),
        priority: formPriority,
        category: formCategory,
        target_store: (user?.storeCode as DirectiveTargetStore) || "ADMIN",
        author_name: user?.username || `${storeName} Store Manager`,
        author_title: `${storeName} Manager`,
      });
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDirective) return;
    updateMutation.mutate({
      id: editingDirective.id,
      payload: {
        title: editingDirective.title,
        message: editingDirective.message,
        priority: editingDirective.priority,
        category: editingDirective.category,
        target_store: editingDirective.target_store,
        active: editingDirective.active,
      },
    });
  };

  const directivesList = summary?.directives ?? [];
  const unreadCount = summary?.unread_count ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] sm:max-w-4xl overflow-hidden p-0 border border-slate-700/80 bg-slate-950 text-slate-100 shadow-2xl flex flex-col">
        {/* Executive Header */}
        <div className="relative border-b border-amber-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/30 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              {/* Operational Head Avatar with Glowing Gold Frame */}
              <div className="relative size-13 sm:size-15 shrink-0 rounded-full">
                <span className="absolute -inset-1 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-600 opacity-75 blur-[3px]" />
                <img
                  src={raphaelAvatar}
                  alt="Operational Head"
                  className="relative size-full rounded-full object-cover border-2 border-amber-300 shadow-xl bg-slate-800"
                />
                <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow border border-slate-950">
                  <Crown className="size-3 fill-slate-950 stroke-none" />
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
                    Operational Head
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-300 border border-amber-500/40">
                      BOSS / Executive Desk
                    </span>
                  </h2>
                </div>
                <p className="text-xs text-amber-200/80 font-medium">
                  {isAdmin
                    ? "Official executive instructions, operational targets, and manager escalation channel"
                    : "Official operational instructions, alerts & direct communication channel with Operational Head"}
                </p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Live Channel Active
                  </span>
                  <span>•</span>
                  <span>{directivesList.length} Active Directives & Reports</span>
                  {unreadCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-rose-400 font-bold animate-pulse">
                        {unreadCount} Unread for you
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions / Refresh */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 border border-slate-800"
                title="Refresh Directives"
              >
                <RefreshCw className={`size-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
                Sync
              </Button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-4 pt-3 border-t border-slate-800/80">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "directives" | "broadcast")}>
              <TabsList className="bg-slate-900 border border-slate-700/80 p-1 rounded-lg gap-1.5 shadow-inner">
                <TabsTrigger
                  value="directives"
                  className="text-xs font-semibold px-3.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800/60 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-slate-950 data-[state=active]:font-black data-[state=active]:shadow transition-all cursor-pointer"
                >
                  <Bell className="size-3.5 mr-1.5" />
                  {isAdmin ? "Directives & Store Reports" : "Executive Directives & Notices"} ({directivesList.length})
                </TabsTrigger>
                <TabsTrigger
                  value="broadcast"
                  className="text-xs font-semibold px-3.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800/60 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-slate-950 data-[state=active]:font-black data-[state=active]:shadow transition-all cursor-pointer"
                >
                  <PlusCircle className="size-3.5 mr-1.5" />
                  {isAdmin ? "Broadcast Directive (Executive)" : "Report to Operational Head / Requisitions"}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* TAB 1: Directives List */}
          {activeTab === "directives" && (
            <div className="space-y-4">
              {directivesList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-900 text-slate-400">
                    <Sparkles className="size-6 text-amber-400" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-white">{t.noActiveDirectives}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    No active directives or reports recorded at this moment.
                  </p>
                </div>
              ) : (
                directivesList.map((directive) => {
                  const isRead = user?.username ? directive.read_by?.includes(user.username) : false;
                  const priorityInfo = PRIORITY_CONFIG[directive.priority] || PRIORITY_CONFIG.normal;
                  const categoryInfo = CATEGORY_CONFIG[directive.category] || CATEGORY_CONFIG.sales_target;
                  const PriorityIcon = priorityInfo.icon;
                  const CategoryIcon = categoryInfo.icon;
                  const targetStoreInfo = STORE_CONFIG[directive.target_store] || STORE_CONFIG.ALL;
                  const isManagerReport =
                    directive.category === "complaint" ||
                    directive.category === "requirements" ||
                    directive.author_name !== "Operational Head";

                  return (
                    <motion.div
                      key={directive.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`relative rounded-xl border p-4 sm:p-5 transition-all ${
                        priorityInfo.cardBorder
                      } ${!directive.active ? "opacity-60 bg-slate-950/40" : ""}`}
                    >
                      {/* Top Header Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Priority Badge */}
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold border ${priorityInfo.badgeClass}`}
                          >
                            <PriorityIcon className="size-3.5" />
                            {priorityInfo.label}
                          </span>

                          {/* Category Badge */}
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold border ${categoryInfo.color}`}
                          >
                            <CategoryIcon className="size-3" />
                            {categoryInfo.label}
                          </span>

                          {/* Origin / Target Store Badge */}
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/80 px-2 py-1 text-xs font-medium text-slate-300 border border-slate-700/60">
                            <Store className="size-3 text-amber-400" />
                            {isManagerReport ? `From: ${directive.author_title || directive.author_name}` : targetStoreInfo.label}
                          </span>

                          {!directive.active && (
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-400">
                              Inactive / Archived
                            </span>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <Clock className="size-3 text-slate-500" />
                          <span>{formatTimestamp(directive.created_at)}</span>
                        </div>
                      </div>

                      {/* Directive Title & Message Body */}
                      <div className="mt-3.5 space-y-2">
                        <h4 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                          {directive.title}
                        </h4>

                        {/* Message Quote Box */}
                        <div
                          className={`relative rounded-lg bg-slate-900/90 p-3.5 sm:p-4 text-sm leading-relaxed text-slate-200 border-l-4 shadow-inner ${
                            isManagerReport ? "border-sky-400 bg-sky-950/20" : "border-amber-400 bg-slate-900/90"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <p className="whitespace-pre-line text-xs sm:text-sm font-normal text-slate-100">
                              {directive.message}
                            </p>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between text-[11px] font-semibold border-t border-slate-800/60 pt-2 text-slate-400">
                            <span className={isManagerReport ? "text-sky-300 font-bold" : "text-amber-300/90"}>
                              — {directive.author_name} ({directive.author_title})
                            </span>
                            <span className="text-slate-500 font-normal">
                              {isManagerReport ? "Store Operations Escalation" : "CITIMART Operations Headquarters"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions / Acknowledgements */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/50">
                        {/* Acknowledgement Status for Users */}
                        <div className="flex items-center gap-2">
                          {isRead ? (
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/30">
                              <CheckCircle2 className="size-3.5 text-emerald-400" />
                              <span>Acknowledged by you</span>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => acknowledgeMutation.mutate(directive.id)}
                              disabled={acknowledgeMutation.isPending}
                              className="h-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md border border-emerald-400/40"
                            >
                              <Check className="size-3.5 mr-1.5" />
                              {isAdmin && isManagerReport ? "Mark Reviewed / Acknowledge" : t.markAcknowledged}
                            </Button>
                          )}
                        </div>

                        {/* Controls (Edit / Toggle Active / Delete / Read Receipts) */}
                        {(isAdmin || user?.username === directive.author_name || (user?.storeCode && directive.target_store === user.storeCode)) && (
                          <div className="flex items-center gap-2">
                            {/* Read Receipts Badge */}
                            {isAdmin && (
                              <span
                                className="text-[11px] text-slate-400 bg-slate-800/60 px-2 py-1 rounded border border-slate-700/50"
                                title={`Read by: ${directive.read_by?.join(", ") || "None"}`}
                              >
                                <UserCheck className="inline size-3 mr-1 text-blue-400" />
                                {directive.read_by?.length || 0} Read
                              </span>
                            )}

                            {/* Active Toggle Button */}
                            {isAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  updateMutation.mutate({
                                    id: directive.id,
                                    payload: { active: !directive.active },
                                  })
                                }
                                className="h-7 text-[11px] bg-slate-800/60 border-slate-700 text-slate-300 hover:text-white"
                              >
                                {directive.active ? "Archive" : "Re-activate"}
                              </Button>
                            )}

                            {/* Edit Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingDirective(directive)}
                              className="h-7 text-[11px] bg-slate-800/60 border-slate-700 text-slate-300 hover:text-white"
                            >
                              <Edit2 className="size-3 mr-1" />
                              Edit
                            </Button>

                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Delete this directive / report permanently?")) {
                                  deleteMutation.mutate(directive.id);
                                }
                              }}
                              className="h-7 text-[11px] text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: Broadcast / Submit New Directive / Escalation */}
          {activeTab === "broadcast" && (
            <form onSubmit={handleBroadcastSubmit} className="space-y-4">
              {/* Quick Template Presets */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5">
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wide">
                  <Sparkles className="size-3.5 text-amber-400" />
                  {isAdmin ? "Quick Presets & Common Directives" : "Quick Escalation / Requisition Templates"}
                </span>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(isAdmin ? ADMIN_PRESET_TEMPLATES : MANAGER_PRESET_TEMPLATES).map((tpl) => (
                    <button
                      key={tpl.name}
                      type="button"
                      onClick={() => handleApplyPreset(tpl)}
                      className="flex flex-col items-start rounded-lg border border-amber-500/20 bg-slate-900/80 p-2.5 text-left transition hover:border-amber-400 hover:bg-slate-800 cursor-pointer"
                    >
                      <span className="text-xs font-bold text-amber-200">{tpl.name}</span>
                      <span className="text-[11px] text-slate-400 line-clamp-1">{tpl.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Directive Title */}
              <div className="space-y-1.5">
                <Label htmlFor="directive-title" className="text-xs font-bold text-slate-200">
                  {isAdmin ? "Directive Title / Subject *" : "Subject / Escalation Title *"}
                </Label>
                <Input
                  id="directive-title"
                  placeholder={
                    isAdmin
                      ? "e.g. Weekend Sales Target Push & ATV Optimization"
                      : "e.g. POS Billing Terminal Error / Staff Shortage Escalation"
                  }
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                  required
                />
              </div>

              {/* Priority & Category & Target Store row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Priority Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-200">Priority / Urgency Level</Label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as DirectivePriority)}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white shadow-sm focus:border-amber-400 focus:outline-none"
                  >
                    <option value="urgent">🔥 Urgent (Red Flash)</option>
                    <option value="high">⚡ High Priority</option>
                    <option value="normal">📌 Normal Notice</option>
                    <option value="info">ℹ️ Informational</option>
                  </select>
                </div>

                {/* Category Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-200">Category</Label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as DirectiveCategory)}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white shadow-sm focus:border-amber-400 focus:outline-none"
                  >
                    {isAdmin ? (
                      <>
                        <option value="sales_target">🎯 Sales Target</option>
                        <option value="special_notice">📢 Special Notice</option>
                        <option value="operations">⚙️ Operations</option>
                        <option value="announcement">📣 Announcement</option>
                        <option value="remarks">📝 Remarks</option>
                      </>
                    ) : (
                      <>
                        <option value="complaint">⚠️ Complaint / Breakdown Issue</option>
                        <option value="requirements">📦 Store Requisition / Material Need</option>
                        <option value="remarks">📝 Daily Remarks & Feedback</option>
                        <option value="operations">⚙️ Floor Operational Update</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Target Store */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-200">
                    {isAdmin ? "Target Store Scope" : "Destination / Store"}
                  </Label>
                  <select
                    value={formTargetStore}
                    onChange={(e) => setFormTargetStore(e.target.value as DirectiveTargetStore)}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white shadow-sm focus:border-amber-400 focus:outline-none"
                  >
                    {isAdmin ? (
                      <>
                        <option value="ALL">🏪 All CITIMART Stores</option>
                        <option value="NM">📍 New Market (NM Only)</option>
                        <option value="HB">📍 Hatibagan (HB Only)</option>
                        <option value="CHW">📍 Chowringhee (CHW Only)</option>
                      </>
                    ) : (
                      <>
                        <option value="ADMIN">👑 Operational Head / Executive Desk</option>
                        {user?.storeCode && (
                          <option value={user.storeCode}>📍 {STORE_CONFIG[user.storeCode as DirectiveTargetStore]?.label || user.storeCode}</option>
                        )}
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Message Content */}
              <div className="space-y-1.5">
                <Label htmlFor="directive-msg" className="text-xs font-bold text-slate-200">
                  {isAdmin
                    ? "Instruction / Notice Content from Operational Head *"
                    : "Complain / Remarks / Requirements Description for Operational Head *"}
                </Label>
                <Textarea
                  id="directive-msg"
                  placeholder={
                    isAdmin
                      ? "Type the detailed instructions, special targets, or operational remarks here..."
                      : "Describe the issue, requisition, or remarks in detail for the Operational Head..."
                  }
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  rows={4}
                  className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 font-sans leading-relaxed"
                  required
                />
              </div>

              {/* Broadcast Action Button */}
              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab("directives")}
                  className="border-slate-700 text-slate-300"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs shadow-lg border border-amber-300"
                >
                  <Send className="size-3.5 mr-1.5" />
                  {createMutation.isPending
                    ? "Submitting..."
                    : isAdmin
                    ? "Broadcast Directive Immediately"
                    : "Submit Report to Operational Head"}
                </Button>
              </div>
            </form>
          )}

          {/* EDIT DIRECTIVE DIALOG / FORM */}
          {editingDirective && (
            <Dialog open={!!editingDirective} onOpenChange={(o) => !o && setEditingDirective(null)}>
              <DialogContent className="sm:max-w-lg border border-slate-700 bg-slate-900 text-slate-100">
                <DialogHeader>
                  <DialogTitle className="text-white flex items-center gap-2">
                    <Edit2 className="size-4 text-amber-400" />
                    Edit Directive #{editingDirective.id}
                  </DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Modify the broadcasted instructions or parameters.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSaveEdit} className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-300">Title</Label>
                    <Input
                      value={editingDirective.title}
                      onChange={(e) =>
                        setEditingDirective({ ...editingDirective, title: e.target.value })
                      }
                      className="bg-slate-800 border-slate-700 text-white text-xs"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-slate-300">Priority</Label>
                      <select
                        value={editingDirective.priority}
                        onChange={(e) =>
                          setEditingDirective({
                            ...editingDirective,
                            priority: e.target.value as DirectivePriority,
                          })
                        }
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="urgent">🔥 Urgent</option>
                        <option value="high">⚡ High</option>
                        <option value="normal">📌 Normal</option>
                        <option value="info">ℹ️ Info</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-slate-300">Category</Label>
                      <select
                        value={editingDirective.category}
                        onChange={(e) =>
                          setEditingDirective({
                            ...editingDirective,
                            category: e.target.value as DirectiveCategory,
                          })
                        }
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="sales_target">Sales Target</option>
                        <option value="special_notice">Special Notice</option>
                        <option value="operations">Operations</option>
                        <option value="announcement">Announcement</option>
                        <option value="remarks">Remarks</option>
                        <option value="complaint">Complaint</option>
                        <option value="requirements">Requirements</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-300">Message</Label>
                    <Textarea
                      value={editingDirective.message}
                      onChange={(e) =>
                        setEditingDirective({ ...editingDirective, message: e.target.value })
                      }
                      rows={4}
                      className="bg-slate-800 border-slate-700 text-white text-xs"
                      required
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingDirective(null)}
                      className="border-slate-700 text-slate-300"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={updateMutation.isPending}
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                    >
                      Save Changes
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
