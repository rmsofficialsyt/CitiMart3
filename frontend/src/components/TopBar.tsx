import { motion } from "framer-motion";
import {
  Bot,
  Calculator,
  ChevronDown,
  FileOutput,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import citimartLogo from "@/assets/citimart-logo.png";
import { useAuth } from "@/auth/AuthProvider";
import { BossAvatarButton } from "@/components/BossAvatarButton";
import { BusinessCalculatorModal } from "@/components/BusinessCalculatorModal";
import { NotificationBell } from "@/components/NotificationBell";
import { SystemStatusIndicators } from "@/components/SystemStatusIndicators";
import { WhatsAppAlertsModal } from "@/components/WhatsAppAlertsModal";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import { useIsMobile } from "@/hooks/useMediaQuery";

interface TopBarProps {
  activeStores: string[];
  dateRange: string;
  lastRefresh: string;
  panelOpen: boolean;
  onTogglePanel: () => void;
  showPanelToggle?: boolean;
  showReportButton?: boolean;
  onOpenReport?: () => void;
  username?: string;
  roleLabel?: string;
  onSignOut?: () => void;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
}

const ICON_BTN = "size-9 shrink-0 text-white/85 hover:bg-white/15 hover:text-white";

export function TopBar({
  activeStores,
  dateRange,
  lastRefresh,
  panelOpen,
  onTogglePanel,
  showPanelToggle = true,
  showReportButton = false,
  onOpenReport,
  isChatOpen = false,
  onToggleChat,
}: TopBarProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [metaOpen, setMetaOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const { t } = useLanguage();
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const syncHeight = () => {
      document.documentElement.style.setProperty("--topbar-h", `${el.offsetHeight}px`);
    };
    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const liveDot = (
    <span className="inline-flex items-center gap-1.5" title="Dashboard is live on the current workbook">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="font-semibold text-emerald-300">{t.live}</span>
    </span>
  );

  return (
    <motion.header
      ref={headerRef}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="topbar glossy-topbar sticky top-0 z-50 px-2.5 py-2 shadow-md sm:px-6 sm:py-2.5 2xl:px-8 transition-all"
    >
      {/* Subtle non-interactive CITIMART watermark inside TopBar */}
      <div
        aria-hidden="true"
        className="citimart-watermark absolute inset-0 flex items-center justify-center text-2xl sm:text-5xl text-white/[0.08] overflow-hidden"
      >
        CITIMART
      </div>

      <div className="relative z-10 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3.5">
          <div className="shrink-0 flex items-center justify-center">
            <img src={citimartLogo} alt="CITIMART - Value for Money Re-defined" className="h-8 sm:h-10 2xl:h-11 w-auto object-contain drop-shadow-md" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h1 className="truncate text-sm leading-tight font-extrabold sm:text-lg 2xl:text-xl tracking-tight drop-shadow-xs">
                <span className="text-white">CITIMART</span>
                <span className="text-sky-200"> DAILY OPERATIONS</span>
              </h1>
            </div>
            <div className="text-[10px] sm:text-[11px] font-bold text-amber-200 tracking-wide uppercase">
              {t.valueForMoney}
            </div>

            {/* Mobile: the Live pill + the expand chevron on one short line. */}
            <button
              type="button"
              onClick={() => setMetaOpen((o) => !o)}
              aria-expanded={metaOpen}
              aria-label={metaOpen ? "Hide dashboard details" : "Show dashboard details"}
              className="mt-0.5 flex items-center gap-1.5 text-xs text-white/80 md:hidden cursor-pointer"
            >
              {liveDot}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${metaOpen ? "rotate-180" : ""}`} />
            </button>

            {/* md+ (and the expanded mobile state) -- the full meta strip. */}
            <p
              className={`mt-0.5 flex-wrap items-center gap-x-1.5 text-xs text-white/80 md:flex ${metaOpen ? "flex" : "hidden"
                }`}
            >
              <span className="hidden md:inline-flex">{liveDot}</span>
              <span className="hidden md:inline text-white/50">&nbsp;|&nbsp;</span>
              <span>{t.activeStores}: <strong className="text-white">{activeStores.join(", ") || "—"}</strong></span>
              <span className="hidden sm:inline text-white/50">&nbsp;|&nbsp;</span>
              <span className="w-full sm:w-auto">{t.reportingPeriod}: <strong className="text-white">{dateRange}</strong></span>
              <span className="hidden sm:inline text-white/50">&nbsp;|&nbsp;</span>
              <span className="w-full sm:w-auto">{t.lastWorkbookRefresh}: <strong className="text-white">{lastRefresh}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {showReportButton && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Export report"
              title="Export Report"
              className={ICON_BTN}
              onClick={onOpenReport}
            >
              <FileOutput className="h-4 w-4" />
            </Button>
          )}
          {showPanelToggle && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={panelOpen ? "Hide filters" : "Show filters"}
              title={panelOpen ? "Hide filters" : "Show filters"}
              className={ICON_BTN}
              onClick={onTogglePanel}
            >
              {isMobile ? (
                <SlidersHorizontal className="h-4 w-4" />
              ) : panelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Retail Business Calculator Button */}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open Retail Business Calculator"
            title="Retail Business Calculator (Targets, Margins, KPIs, GST, SPH)"
            className={`${ICON_BTN} hover:text-emerald-600 dark:hover:text-emerald-400`}
            onClick={() => setCalculatorOpen(true)}
          >
            <Calculator className="h-4 w-4" />
          </Button>

          {/* Live Database & Network Signal Indicators */}
          <SystemStatusIndicators />

          {/* Role-scoped Operational & Log Agent Notifications */}
          <NotificationBell />

          {/* Admin-only WhatsApp AI Sales Alerts */}
          {isAdmin && <WhatsAppAlertsModal />}

          {/* AI Retail Co-Pilot Circular Button */}
          {onToggleChat && (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              type="button"
              onClick={onToggleChat}
              aria-label={isChatOpen ? "Close CITIMART AI Co-Pilot" : "Open CITIMART AI Co-Pilot"}
              aria-expanded={isChatOpen}
              title="CITIMART Retail AI Assistant (Shift Co-Pilot)"
              className={`relative flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md transition-all duration-200 border cursor-pointer ${isChatOpen
                ? "border-indigo-300 ring-2 ring-indigo-400 ring-offset-2 ring-offset-background shadow-[0_0_16px_rgba(99,102,241,0.55)] scale-105"
                : "border-indigo-400/40 hover:border-indigo-300 hover:shadow-[0_0_14px_rgba(99,102,241,0.35)]"
                }`}
            >
              <Bot className="size-4 shrink-0" />
              {/* Online pulsing emerald status dot */}
              <span className="absolute -top-0.5 -right-0.5 flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-80" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400 border border-slate-900" />
              </span>
            </motion.button>
          )}

          {/* Operational Head Avatar & Directives Button */}
          <BossAvatarButton className="mr-0.5" />
        </div>
      </div>

      {/* Retail Business Calculator Modal */}
      <BusinessCalculatorModal open={calculatorOpen} onOpenChange={setCalculatorOpen} />
    </motion.header>
  );
}
