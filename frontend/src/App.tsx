import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { TopBar } from "@/components/TopBar";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const TAB_STRIP = "no-scrollbar -mx-3 max-w-[calc(100%+1.5rem)] overflow-x-auto px-3 sm:mx-0 sm:max-w-none sm:overflow-visible sm:px-0";
const TAB_LIST = "h-auto flex-nowrap sm:flex-wrap";

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
          {!isManager && (
            <Tabs
              value={effectiveStore}
              onValueChange={(v) => setDailyStore(v as DailyStoreSel)}
              className={`mb-3 ${TAB_STRIP}`}
            >
              <TabsList variant="line" className={TAB_LIST}>
                <TabsTrigger value={OVERALL_STORE_ID}>Overall Stores Summary</TabsTrigger>
                {DAILY_STORES.map((s) => (
                  <TabsTrigger key={s.id} value={s.id}>
                    {s.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <Tabs value={effectiveView} onValueChange={(v) => setDailyView(v as DailyView)} className={`mb-4 ${TAB_STRIP}`}>
            <TabsList className={TAB_LIST}>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              {!isAdmin && !isOverall && <TabsTrigger value="manual">Manual Data Entry</TabsTrigger>}
              {isAdmin && !isOverall && <TabsTrigger value="target">Sales Target</TabsTrigger>}
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </Tabs>

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

          <footer className="mt-8 border-t border-border/40 py-4 text-center text-xs text-muted-foreground">
            CITIMART Sales KPI Dashboard &copy; {new Date().getFullYear()} CITIMART Operations. All Rights Reserved.
          </footer>
        </main>
      </div>

      <Toaster />
    </div>
  );
}
