import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { TopBar } from "@/components/TopBar";
import {
  NavigationSidebar,
  type DailyStoreId,
  type DailyStoreSel,
  type DailyView,
  type NavPosition,
  OVERALL_STORE_ID,
} from "@/components/NavigationSidebar";
import { BossAlertBanner } from "@/components/BossAlertBanner";
import { AiChatbot } from "@/components/AiChatbot";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/useMediaQuery";
import citimartLogo from "@/assets/citimart-logo.png";
import { DAILY_STORE_ID_BY_CODE } from "@/lib/authUsers";
import { isDailyView, isIsoDate, isStoreSel } from "@/lib/appLinks";

const HistoryPage = lazy(() => import("@/pages/HistoryPage").then((m) => ({ default: m.HistoryPage })));
const ProductRequisitionPage = lazy(() => import("@/pages/ProductRequisitionPage").then((m) => ({ default: m.ProductRequisitionPage })));
const OverallStoresSummary = lazy(() => import("@/pages/OverallStoresSummary").then((m) => ({ default: m.OverallStoresSummary })));
const StockManagementPage = lazy(() => import("@/pages/StockManagementPage").then((m) => ({ default: m.StockManagementPage })));
const StaffManagementPage = lazy(() => import("@/pages/StaffManagementPage").then((m) => ({ default: m.StaffManagementPage })));

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

  // Store / view / date live in the URL (/app?store=&view=&date=, lib/appLinks.ts),
  // so views can be linked from the Co-Pilot, bookmarked, and walked with Back/Forward.
  // The URL only selects: the role guards below still decide what is shown.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStore = searchParams.get("store");
  const urlView = searchParams.get("view");
  const urlDate = searchParams.get("date");
  const dailyStore: DailyStoreSel = isStoreSel(urlStore) ? urlStore : OVERALL_STORE_ID;
  const dailyView: DailyView = isDailyView(urlView) ? urlView : "dashboard";
  const historyDate = isIsoDate(urlDate) ? urlDate : undefined;

  const updateParams = useCallback(
    (patch: Record<string, string | null>) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      }),
    [setSearchParams],
  );
  const setDailyStore = (store: DailyStoreSel) => updateParams({ store, date: null });
  const setDailyView = (view: DailyView) => updateParams({ view, date: null });

  const isMobile = useIsMobile();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [navPosition, setNavPosition] = useState<NavPosition>(() => {
    try {
      const saved = localStorage.getItem("citimart_nav_position");
      if (saved === "left" || saved === "right" || saved === "bottom" || saved === "top") return saved;
    } catch {
      // ignore storage errors
    }
    return "left";
  });
  const updateNavPosition = useCallback((pos: NavPosition) => {
    setNavPosition(pos);
    try {
      localStorage.setItem("citimart_nav_position", pos);
    } catch {
      // ignore storage errors
    }
  }, []);
  const [navOpen, setNavOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("citimart_nav_open") !== "false";
    } catch {
      return true;
    }
  });
  const toggleNav = useCallback(() => {
    setNavOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("citimart_nav_open", String(next));
      } catch {
        // ignore storage errors
      }
      if (isMobile) {
        setMobileDrawerOpen(next);
      }
      return next;
    });
  }, [isMobile]);

  // Lock page scroll while the mobile navigation drawer is open.
  useEffect(() => {
    if (!isMobile || !mobileDrawerOpen) return;
    const { body, documentElement: html } = document;
    const previous = { body: body.style.overflow, html: html.style.overflow };
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous.body;
      html.style.overflow = previous.html;
    };
  }, [isMobile, mobileDrawerOpen]);

  useEffect(() => {
    if (!isMobile) setMobileDrawerOpen(false);
  }, [isMobile]);
  // A shared conversation link (/app?chat=<id>) opens the Co-Pilot; AiChatbot loads it.
  const hasChatLink = searchParams.has("chat");
  useEffect(() => {
    if (hasChatLink) setIsChatOpen(true);
  }, [hasChatLink]);

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
    } else if (effectiveView === "stocks") {
      content = <StockManagementPage initialStoreCode={targetStoreCode} />;
    } else if (effectiveView === "staff") {
      content = <StaffManagementPage initialStoreCode={targetStoreCode} />;
    } else if (effectiveView === "history") {
      content = <HistoryPage storeCode={targetStoreCode} date={historyDate} />;
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

  const animationKey = `daily-${effectiveStore}-${effectiveView}-${historyDate ?? ""}`;

  return (
    <div className="bg-background min-h-screen relative">
      {/* Subtle non-interactive CITIMART background watermark */}
      <div
        aria-hidden="true"
        className="citimart-watermark fixed inset-0 z-0 flex items-center justify-center overflow-hidden text-6xl sm:text-8xl lg:text-[10rem] text-foreground/[0.03]"
      >
        <span className="-rotate-12">CITIMART</span>
      </div>

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
        isChatOpen={isChatOpen}
        onToggleChat={() => setIsChatOpen((prev) => !prev)}
      />

      <div className="relative z-10 flex flex-col lg:flex-row items-start min-h-[calc(100vh-4.25rem)]">
        {/* Left Side Navigation Sidebar (Center-aligned with icon-only Show/Hide) */}
        <NavigationSidebar
          effectiveStore={effectiveStore}
          setDailyStore={setDailyStore}
          effectiveView={effectiveView}
          setDailyView={setDailyView}
          isManager={isManager}
          isAdmin={isAdmin}
          forcedStore={forcedStore}
          targetStoreCode={targetStoreCode}
          navOpen={navOpen}
          onToggleNav={toggleNav}
          mobileDrawerOpen={mobileDrawerOpen}
          onMobileDrawerOpenChange={setMobileDrawerOpen}
          navPosition={navPosition}
          onNavPositionChange={updateNavPosition}
        />

        {/* Main Content Area */}
        <main
          className={`min-w-0 flex-1 p-2.5 sm:p-4 lg:p-5 2xl:p-8 w-full ${
            navPosition === "bottom" ? "pb-24" : navPosition === "top" ? "lg:pt-20" : ""
          }`}
        >
          <div className="mx-auto w-full max-w-[1920px]">
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
            <div className="shrink-0 flex items-center justify-center">
              <img
                src={citimartLogo}
                alt="CITIMART Logo"
                className="h-6 sm:h-7 2xl:h-8 w-auto object-contain drop-shadow-xs"
              />
            </div>
            <span>
              CITIMART Sales KPI Dashboard &copy; {new Date().getFullYear()} CITIMART Operations. All Rights Reserved.
            </span>
          </footer>
          </div>
        </main>
      </div>

      <AiChatbot
        activeStore={targetStoreCode}
        isOpen={isChatOpen}
        onOpenChange={setIsChatOpen}
      />
      <Toaster />
    </div>
  );
}


