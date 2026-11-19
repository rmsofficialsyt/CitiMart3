import { motion } from "framer-motion";
import {
  Bot,
  ChevronDown,
  FileOutput,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";

import citimartLogo from "@/assets/citimart-logo.png";
import { BossAvatarButton } from "@/components/BossAvatarButton";
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

const ICON_BTN = "size-9 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground";

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
  const [metaOpen, setMetaOpen] = useState(false);
  const { t } = useLanguage();

  const liveDot = (
    <span className="inline-flex items-center gap-1.5" title="Dashboard is live on the current workbook">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{t.live}</span>
    </span>
  );

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="topbar glossy-topbar sticky top-0 z-50 px-3 py-2.5 shadow-md sm:px-6 transition-all"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
          <div className="shrink-0 rounded-xl bg-white p-1 sm:p-1.5 shadow-sm border border-border flex items-center justify-center">
            <img src={citimartLogo} alt="CITIMART - Value for Money Re-defined" className="h-8 sm:h-9 w-auto object-contain" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h1 className="truncate text-base leading-tight font-extrabold sm:text-lg tracking-tight">
                <span className="text-foreground">CITIMART</span>
                <span className="text-blue-600 dark:text-blue-400"> DAILY OPERATIONS</span>
              </h1>
            </div>
            <div className="text-[10px] sm:text-[11px] font-bold text-amber-600 dark:text-amber-300 tracking-wide uppercase">
              {t.valueForMoney}
            </div>

            {/* Mobile: the Live pill + the expand chevron on one short line. */}
            <button
              type="button"
              onClick={() => setMetaOpen((o) => !o)}
              aria-expanded={metaOpen}
              aria-label={metaOpen ? "Hide dashboard details" : "Show dashboard details"}
              className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground md:hidden cursor-pointer"
            >
              {liveDot}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${metaOpen ? "rotate-180" : ""}`} />
            </button>

            {/* md+ (and the expanded mobile state) -- the full meta strip. */}
            <p
              className={`mt-0.5 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground md:flex ${
                metaOpen ? "flex" : "hidden"
              }`}
            >
              <span className="hidden md:inline-flex">{liveDot}</span>
              <span className="hidden md:inline">&nbsp;|&nbsp;</span>
              <span>{t.activeStores}: <strong className="text-foreground">{activeStores.join(", ") || "—"}</strong></span>
              <span className="hidden sm:inline">&nbsp;|&nbsp;</span>
              <span className="w-full sm:w-auto">{t.reportingPeriod}: <strong className="text-foreground">{dateRange}</strong></span>
              <span className="hidden sm:inline">&nbsp;|&nbsp;</span>
              <span className="w-full sm:w-auto">{t.lastWorkbookRefresh}: <strong className="text-foreground">{lastRefresh}</strong></span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
              className={`relative flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md transition-all duration-200 border cursor-pointer ${
                isChatOpen
                  ? "border-indigo-300 ring-2 ring-indigo-400 ring-offset-2 ring-offset-background shadow-[0_0_16px_rgba(99,102,241,0.55)] scale-105"
                  : "border-indigo-400/40 hover:border-indigo-300 hover:shadow-[0_0_14px_rgba(99,102,241,0.35)]"
              }`}
            >
              <Bot className="size-4 sm:size-4.5" />
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
    </motion.header>
  );
}
