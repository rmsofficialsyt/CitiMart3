import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Building2,
  FileSpreadsheet,
  History,
  Layers,
  LayoutDashboard,
  ShoppingBag,
  Store,
  Target,
} from "lucide-react";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { TopBar } from "@/components/TopBar";
import { BossAlertBanner } from "@/components/BossAlertBanner";
import { AiChatbot } from "@/components/AiChatbot";
import { Toaster } from "@/components/ui/sonner";
import citimartLogo from "@/assets/citimart-logo.png";
import { DAILY_STORE_ID_BY_CODE } from "@/lib/authUsers";
import { HistoryPage } from "@/pages/HistoryPage";
import { ManualEntryCHW, ManualEntryHB, ManualEntryNM } from "@/pages/ManualEntryDashboard";
import { OverallStoresSummary } from "@/pages/OverallStoresSummary";
import { SalesTargetCHW, SalesTargetHB, SalesTargetNM } from "@/pages/SalesTargetEntry";
import { DailyDashboardCHW, DailyDashboardHB, DailyDashboardNM } from "@/pages/StoreDailyDashboard";

const DAILY_STORES = [
  { id: "nm", label: "New Market", dashboard: DailyDashboardNM, manualEntry: ManualEntryNM, salesTarget: SalesTargetNM, code: "NM" },
  { id: "hb", label: "Hatibagan", dashboard: DailyDashboardHB, manualEntry: ManualEntryHB, salesTarget: SalesTargetHB, code: "HB" },
  { id: "chw", label: "Chowringhee", dashboard: DailyDashboardCHW, manualEntry: ManualEntryCHW, salesTarget: SalesTargetCHW, code: "CHW" },
] as const;

type DailyStoreId = (typeof DAILY_STORES)[number]["id"];
const OVERALL_STORE_ID = "overall" as const;
type DailyStoreSel = DailyStoreId | typeof OVERALL_STORE_ID;
type DailyView = "dashboard" | "manual" | "target" | "history";

const STORE_NAV_ITEMS = [
  { id: OVERALL_STORE_ID, label: "Overall Stores Summary", code: "ALL", Icon: Layers },
  { id: "nm", label: "New Market", code: "NM", Icon: ShoppingBag },
  { id: "hb", label: "Hatibagan", code: "HB", Icon: Store },
  { id: "chw", label: "Chowringhee", code: "CHW", Icon: Building2 },
] as const;

export default function App() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const isManager = user?.role === "manager";
  const isAdmin = user?.role === "admin";
  const forcedStore: DailyStoreId | undefined = user?.storeCode
    ? DAILY_STORE_ID_BY_CODE[user.storeCode]
    : undefined;

  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: api.meta });

  const [dailyStore, setDailyStore] = useState<DailyStoreSel>(OVERALL_STORE_ID);
  const [dailyView, setDailyView] = useState<DailyView>("dashboard");

  const effectiveStore: DailyStoreSel = isManager && forcedStore ? forcedStore : dailyStore;
  const isOverall = effectiveStore === OVERALL_STORE_ID;

  // "Manual Data Entry" is manager-only and "Sales Target" is admin-only. History is for everyone.
  const effectiveView: DailyView =
    (isAdmin && dailyView === "manual") || (!isAdmin && dailyView === "target") ? "dashboard" : dailyView;

  const storeEntry = isOverall ? undefined : DAILY_STORES.find((s) => s.id === effectiveStore);
  const targetStoreCode = isManager && user?.storeCode ? user.storeCode : isOverall ? "ALL" : storeEntry?.code ?? "ALL";

  // Build view items based on role
  const viewItems: { id: DailyView; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    ...(!isAdmin && !isOverall ? [{ id: "manual" as DailyView, label: "Manual Data Entry", Icon: FileSpreadsheet }] : []),
    ...(isAdmin && !isOverall ? [{ id: "target" as DailyView, label: "Sales Target", Icon: Target }] : []),
    { id: "history", label: "History", Icon: History },
  ];

  const renderActivePage = () => {
    if (effectiveView === "history") {
      return <HistoryPage storeCode={targetStoreCode} />;
    }
    if (isOverall || !storeEntry) {
      return <OverallStoresSummary />;
    }
    const DashboardComponent = storeEntry.dashboard;
    const ManualEntryComponent = storeEntry.manualEntry;
    const SalesTargetComponent = storeEntry.salesTarget;

    if (effectiveView === "dashboard") {
      return <DashboardComponent />;
    }
    if (effectiveView === "manual") {
      return <ManualEntryComponent />;
    }
    return <SalesTargetComponent />;
  };

  const animationKey = `daily-${effectiveStore}-${effectiveView}`;

  return (
    <div className="bg-background min-h-screen">
      <TopBar
        activeStores={meta?.store_names ?? []}
        dateRange={meta?.date_range ?? ""}
        lastRefresh={meta?.last_refresh ?? ""}
        panelOpen={false}
        onTogglePanel={() => {}}
        showPanelToggle={false}
        showReportButton={false}
        onOpenReport={() => {}}
        username={user?.username}
        roleLabel={isAdmin ? "Administrator" : user?.storeCode ? `Manager · ${user.storeCode}` : "Manager"}
        onSignOut={async () => {
          await signOut();
          navigate("/", { replace: true });
        }}
      />

      <div className="flex items-start gap-4 p-3 sm:p-5">
        <main className="min-w-0 flex-1">
          {/* Executive Directives Alert Banner from Operational Head */}
          <BossAlertBanner />

          {/* Centered Modern Navigation Header & Switchers */}
          <div className="flex flex-col items-center justify-center my-3 sm:my-4">
            {/* Store Navigation Dock (Centered, Modern Glass Pill with Spring Motion) */}
            {!isManager ? (
              <div className="no-scrollbar flex w-full max-w-full items-center justify-start sm:justify-center overflow-x-auto pb-1 sm:pb-0">
                <div className="inline-flex items-center gap-1.5 rounded-2xl border border-border/80 bg-card/85 p-1.5 shadow-sm backdrop-blur-md">
                  {STORE_NAV_ITEMS.map((item) => {
                    const active = effectiveStore === item.id;
                    const Icon = item.Icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setDailyStore(item.id as DailyStoreSel)}
                        className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                          active
                            ? "text-white shadow-xs"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }`}
                      >
                        {active && (
                          <motion.div
                            layoutId="activeStorePill"
                            className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 shadow-md shadow-indigo-500/25 dark:from-blue-500 dark:via-indigo-500 dark:to-indigo-600"
                            transition={{ type: "spring", stiffness: 450, damping: 32 }}
                          />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
                          <Icon className={`h-3.5 w-3.5 ${active ? "text-white" : "text-muted-foreground"}`} />
                          <span>{item.label}</span>
                          <span
                            className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ${
                              active
                                ? "bg-white/20 text-white"
                                : "bg-muted text-muted-foreground border border-border/60"
                            }`}
                          >
                            {item.code}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mb-1 flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-medium text-blue-400 backdrop-blur-sm">
                <Store className="h-3.5 w-3.5" />
                <span>Store Operational Hub:</span>
                <strong className="font-bold text-foreground">
                  {forcedStore === "nm" ? "New Market" : forcedStore === "hb" ? "Hatibagan" : "Chowringhee"} ({user?.storeCode})
                </strong>
              </div>
            )}

            {/* View Navigation Dock (Centered, Sleek Pill with Spring Indicator) */}
            <div className="no-scrollbar mt-2.5 flex w-full max-w-full items-center justify-start sm:justify-center overflow-x-auto pb-1 sm:pb-0">
              <div className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-muted/60 p-1 shadow-xs backdrop-blur-sm">
                {viewItems.map((item) => {
                  const active = effectiveView === item.id;
                  const Icon = item.Icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDailyView(item.id)}
                      className={`relative flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                        active
                          ? "text-foreground font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="activeViewPill"
                          className="absolute inset-0 rounded-lg bg-background shadow-xs border border-border/80"
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-1.5">
                        <Icon className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                        <span>{item.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={animationKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              {renderActivePage()}
            </motion.div>
          </AnimatePresence>

          <footer className="mt-8 border-t border-border/40 py-5 flex flex-col sm:flex-row items-center justify-center gap-2.5 text-xs text-muted-foreground">
            <div className="shrink-0 rounded bg-white px-1.5 py-0.5 shadow-sm border border-slate-200/40 flex items-center justify-center">
              <img
                src={citimartLogo}
                alt="CITIMART Logo"
                className="h-6 sm:h-7 w-auto object-contain"
              />
            </div>
            <span>
              CITIMART Sales KPI Dashboard &copy; {new Date().getFullYear()} CITIMART Operations. All Rights Reserved.
            </span>
          </footer>
        </main>
      </div>

      <AiChatbot activeStore={targetStoreCode} />
      <Toaster />
    </div>
  );
}

