import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { TopBar } from "@/components/TopBar";
import { NavigationSidebar, type DailyStoreId, type DailyStoreSel, type DailyView, OVERALL_STORE_ID } from "@/components/NavigationSidebar";
import { BossAlertBanner } from "@/components/BossAlertBanner";
import { AiChatbot } from "@/components/AiChatbot";
import { Toaster } from "@/components/ui/sonner";
import citimartLogo from "@/assets/citimart-logo.png";
import { DAILY_STORE_ID_BY_CODE } from "@/lib/authUsers";

const HistoryPage = lazy(() => import("@/pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const ProductRequisitionPage = lazy(() => import("@/pages/ProductRequisitionPage").then((m) => ({ default: m.ProductRequisitionPage })));
const OverallStoresSummary = lazy(() => import("@/pages/OverallStoresSummary").then((m) => ({ default: m.OverallStoresSummary })));

const ManualEntryNM = lazy(() => import("@/pages/ManualEntryDashboard").then((m) => ({ default: m.ManualEntryNM })));
const ManualEntryHB = lazy(() => import("@/pages/ManualEntryDashboard").then((m) => ({ default: m.ManualEntryHB })));
const ManualEntryCHW = lazy(() => import("@/pages/ManualEntryDashboard").then((m) => ({ default: m.ManualEntryCHW })));

const SalesTargetNM = lazy(() => import("@/pages/SalesTargetEntry").then((m) => ({ default: m.SalesTargetNM })));
const SalesTargetHB = lazy(() => import("@/pages/SalesTargetEntry").then((m) => ({ default: m.SalesTargetHB })));
const SalesTargetCHW = lazy(() => import("@/pages/SalesTargetEntry").then((m) => ({ default: m.SalesTargetCHW })));

const DailyDashboardNM = lazy(() => import("@/pages/StoreDailyDashboard").then((m) => ({ default: m.DailyDashboardNM })));
const DailyDashboardHB = lazy(() => import("@/pages/StoreDailyDashboard").then((m) => ({ default: m.DailyDashboardHB })));
const DailyDashboardCHW = lazy(() => import("@/pages/StoreDailyDashboard").then((m) => ({ default: m.DailyDashboardCHW })));

const DAILY_STORES = [
  { id: "nm", label: "New Market", dashboard: DailyDashboardNM, manualEntry: ManualEntryNM, salesTarget: SalesTargetNM, code: "NM" },
  { id: "hb", label: "Hatibagan", dashboard: DailyDashboardHB, manualEntry: ManualEntryHB, salesTarget: SalesTargetHB, code: "HB" },
  { id: "chw", label: "Chowringhee", dashboard: DailyDashboardCHW, manualEntry: ManualEntryCHW, salesTarget: SalesTargetCHW, code: "CHW" },
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

  const renderActivePage = () => {
    let content;
    if (effectiveView === "requisition") {
      content = <ProductRequisitionPage initialStoreCode={targetStoreCode} />;
    } else if (effectiveView === "history") {
      content = <HistoryPage storeCode={targetStoreCode} />;
    } else if (isOverall || !storeEntry) {
      content = <OverallStoresSummary />;
    } else {
      const DashboardComponent = storeEntry.dashboard;
      const ManualEntryComponent = storeEntry.manualEntry;
      const SalesTargetComponent = storeEntry.salesTarget;

      if (effectiveView === "dashboard") {
        content = <DashboardComponent />;
      } else if (effectiveView === "manual") {
        content = <ManualEntryComponent />;
      } else {
        content = <SalesTargetComponent />;
      }
    }

    return (
      <Suspense
        fallback={
          <div className="p-6 space-y-4">
            <div className="h-8 w-64 bg-muted/60 animate-pulse rounded" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="h-32 bg-muted/40 animate-pulse rounded-lg" />
              <div className="h-32 bg-muted/40 animate-pulse rounded-lg" />
              <div className="h-32 bg-muted/40 animate-pulse rounded-lg" />
            </div>
            <div className="h-96 bg-muted/30 animate-pulse rounded-lg" />
          </div>
        }
      >
        {content}
      </Suspense>
    );
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

      <div className="flex flex-col lg:flex-row items-start min-h-[calc(100vh-4.25rem)]">
        {/* Left Side Navigation Sidebar */}
        <NavigationSidebar
          effectiveStore={effectiveStore}
          setDailyStore={setDailyStore}
          effectiveView={effectiveView}
          setDailyView={setDailyView}
          isManager={isManager}
          isAdmin={isAdmin}
          forcedStore={forcedStore}
          targetStoreCode={targetStoreCode}
        />

        {/* Main Content Area */}
        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-5 2xl:p-6 w-full">
          {/* Executive Directives Alert Banner from Operational Head */}
          <BossAlertBanner />

          <AnimatePresence mode="wait">
            <motion.div
              key={animationKey}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {renderActivePage()}
            </motion.div>
          </AnimatePresence>

          <footer className="mt-6 sm:mt-8 2xl:mt-10 border-t border-border/40 py-4 sm:py-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-muted-foreground">
            <div className="shrink-0 rounded-lg bg-white px-2 py-0.5 shadow-sm border border-slate-200/40 flex items-center justify-center">
              <img
                src={citimartLogo}
                alt="CITIMART Logo"
                className="h-5 sm:h-6 2xl:h-7 w-auto object-contain"
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


