import { motion } from "framer-motion";
import {
  Building2,
  ChevronRight,
  FileSpreadsheet,
  History,
  Languages,
  Layers,
  LayoutDashboard,
  LogOut,
  Moon,
  PackagePlus,
  Radio,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Sun,
  Target,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/context/LanguageContext";
import { SIGN_IN_OPTIONS } from "@/lib/authUsers";
import type { Language } from "@/lib/translations";

export type DailyStoreId = "nm" | "hb" | "chw";
export const OVERALL_STORE_ID = "overall" as const;
export type DailyStoreSel = DailyStoreId | typeof OVERALL_STORE_ID;
export type DailyView = "dashboard" | "manual" | "target" | "history" | "requisition";

interface NavigationSidebarProps {
  effectiveStore: DailyStoreSel;
  setDailyStore: (store: DailyStoreSel) => void;
  effectiveView: DailyView;
  setDailyView: (view: DailyView) => void;
  isManager: boolean;
  isAdmin: boolean;
  forcedStore?: DailyStoreId;
  targetStoreCode: string;
}

export function NavigationSidebar({
  effectiveStore,
  setDailyStore,
  effectiveView,
  setDailyView,
  isManager,
  isAdmin,
  forcedStore,
  targetStoreCode,
}: NavigationSidebarProps) {
  const navigate = useNavigate();
  const { user, isSwitchedFromAdmin, switchAccount, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const roleLabel = isAdmin
    ? "Administrator"
    : user?.storeCode
    ? `Manager · ${user.storeCode}`
    : "Manager";

  const themes = [
    { id: "light", label: "Light", Icon: Sun },
    { id: "dark", label: "Dark", Icon: Moon },
    { id: "neon", label: "Neon", Icon: Sparkles },
  ] as const;

  const languages: { id: Language; label: string; sub: string }[] = [
    { id: "en", label: "English", sub: "EN" },
    { id: "hi", label: "हिंदी", sub: "HI" },
    { id: "bn", label: "বাংলা", sub: "BN" },
  ];

  const storeNavItems = [
    { id: OVERALL_STORE_ID, label: t.navOverallSummary || "Overall Stores", code: "ALL", Icon: Layers, sub: "Network Total" },
    { id: "nm" as DailyStoreId, label: t.storeNewMarket || "New Market", code: "NM", Icon: ShoppingBag, sub: "Lindsay St" },
    { id: "hb" as DailyStoreId, label: t.storeHatibagan || "Hatibagan", code: "HB", Icon: Store, sub: "Bidhan Sarani" },
    { id: "chw" as DailyStoreId, label: t.storeChowringhee || "Chowringhee", code: "CHW", Icon: Building2, sub: "JL Nehru Rd" },
  ];

  const isOverall = effectiveStore === OVERALL_STORE_ID;

  const viewItems: { id: DailyView; label: string; Icon: React.ComponentType<{ className?: string }>; tag: string }[] = [
    { id: "dashboard", label: t.navDashboard || "Dashboard", Icon: LayoutDashboard, tag: "Live" },
    ...(!isAdmin && !isOverall ? [{ id: "manual" as DailyView, label: t.navManualEntry || "Manual Data Entry", Icon: FileSpreadsheet, tag: "Form" }] : []),
    ...(isAdmin && !isOverall ? [{ id: "target" as DailyView, label: t.navSalesTarget || "Sales Target", Icon: Target, tag: "Admin" }] : []),
    { id: "history", label: t.navHistory || "History and Analysis", Icon: History, tag: "Analysis" },
    { id: "requisition", label: "Product Requisition", Icon: PackagePlus, tag: "Slip" },
  ];

  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : "U";

  return (
    <>
      <aside className="glossy-sidebar flex w-full flex-col justify-between shrink-0 p-4 lg:w-72 lg:min-h-[calc(100vh-4.25rem)] lg:sticky lg:top-[4.25rem] text-foreground rounded-2xl lg:rounded-none border-b lg:border-b-0 lg:border-r border-border shadow-xl z-40">
        <div className="space-y-6">
          {/* Brand Header: Vector Brand Emblem */}
          <div className="flex items-center gap-3 px-2 py-1">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 p-2 shadow-lg shadow-blue-500/20 border border-white/20 text-white">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold tracking-tight text-foreground flex items-center gap-1.5">
                <span>CITIMART</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                  Daily
                </span>
              </h2>
              <p className="text-[11px] font-medium text-muted-foreground truncate">Store Operations Hub</p>
            </div>
          </div>

          {/* Admin Switched Account Return Banner */}
          {isSwitchedFromAdmin && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-amber-500/40 bg-amber-500/15 p-3 backdrop-blur-sm flex items-center justify-between gap-2 shadow-md"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-300">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">Admin Mode</span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">Switched to {user?.storeCode ?? "Store"}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await switchAccount("ADMINISTRATOR");
                    toast.success("Returned to Administrator view");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to return to Administrator");
                  }
                }}
                className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 shadow transition cursor-pointer"
              >
                Return to Admin
              </button>
            </motion.div>
          )}

          {/* Stores Navigation Section */}
          <div className="space-y-2">
            <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Radio className="h-3 w-3 text-blue-500 animate-pulse" />
                <span>{t.activeStores || "Store Selection"}</span>
              </span>
              <span className="text-[10px] font-mono text-muted-foreground font-semibold">{targetStoreCode}</span>
            </div>

            {!isManager ? (
              <div className="space-y-1">
                {storeNavItems.map((item) => {
                  const active = effectiveStore === item.id;
                  const Icon = item.Icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDailyStore(item.id as DailyStoreSel)}
                      className={`relative flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                        active
                          ? "text-white shadow-md shadow-blue-900/30"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="sidebarActiveStore"
                          className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 border border-white/20 shadow-md"
                          transition={{ type: "spring", stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-muted-foreground"}`} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-wider ${
                            active
                              ? "bg-white/20 text-white border border-white/30"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {item.code}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-300 backdrop-blur-sm">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <Store className="h-4 w-4 text-blue-500" />
                  <span>Assigned Store Hub</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {forcedStore === "nm"
                    ? "New Market (NM)"
                    : forcedStore === "hb"
                    ? "Hatibagan (HB)"
                    : "Chowringhee (CHW)"}
                </div>
              </div>
            )}
          </div>

          {/* Views Navigation Section */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Operational Modules</span>
            </div>

            <div className="space-y-1">
              {viewItems.map((item) => {
                const active = effectiveView === item.id;
                const Icon = item.Icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDailyView(item.id)}
                    className={`relative flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                      active
                        ? "text-white shadow-md shadow-indigo-950/40"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    {active && (
                      <motion.div
                        layoutId="sidebarActiveView"
                        className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 border border-white/20 shadow-md"
                        transition={{ type: "spring", stiffness: 450, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${active ? "text-amber-300" : "text-muted-foreground"}`} />
                      <span>{item.label}</span>
                    </span>
                    <div className="relative z-10 flex items-center gap-1">
                      <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                        active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                      }`}>
                        {item.tag}
                      </span>
                      {active && (
                        <ChevronRight className="h-3.5 w-3.5 text-white/90" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Section: Single Unified Settings & Account Profile Card */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="rounded-2xl border border-border bg-card/60 dark:bg-slate-900/60 p-3 shadow-lg backdrop-blur-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-orange-500 via-coral-500 to-amber-500 p-0.5 shadow-md shadow-orange-500/20 ring-2 ring-border">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-card dark:bg-slate-950 font-bold text-sm text-foreground dark:text-white">
                  {userInitial}
                </div>
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-foreground leading-tight">
                  {user?.username || "Guest Operator"}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="inline-block rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-600 dark:text-blue-300 border border-blue-500/30">
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Single Unified Settings Trigger */}
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="Settings"
                  aria-label="Settings"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border transition cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </PopoverTrigger>

              <PopoverContent
                align="end"
                side="top"
                sideOffset={12}
                className="w-80 rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl backdrop-blur-2xl"
              >
                <div className="border-b border-border p-3.5 bg-muted/40 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Settings className="h-4 w-4 text-blue-500" />
                      {t.settingsTitle || "Settings"}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono px-1.5 py-0.5 rounded bg-muted border border-border">
                      {language.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="p-3 space-y-4 max-h-[80vh] overflow-y-auto">
                  {/* Account & Profile */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t.account || "Account & Profile"}
                    </span>
                    {user?.username ? (
                      <div className="mt-1.5 flex items-center justify-between rounded-xl bg-muted/50 p-2.5 border border-border">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold shadow-md">
                            {userInitial}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-foreground">{user.username}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 flex items-center justify-between rounded-xl bg-muted/50 p-2.5">
                        <span className="text-xs text-muted-foreground">Not signed in</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setSettingsOpen(false);
                            navigate("/login");
                          }}
                        >
                          Sign In
                        </Button>
                      </div>
                    )}

                    {/* Switch Account (Admin & Switched Mode) */}
                    {(isAdmin || isSwitchedFromAdmin) && (
                      <div className="mt-2.5">
                        <span className="text-[11px] text-muted-foreground font-medium">{t.switchAccount || "Switch Store Account"}</span>
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          {SIGN_IN_OPTIONS.map((opt) => {
                            const isActive = opt.username === user?.username;
                            return (
                              <button
                                key={opt.username}
                                type="button"
                                onClick={async () => {
                                  try {
                                    setSettingsOpen(false);
                                    await switchAccount(opt.username);
                                    toast.success(`Switched account to ${opt.title.replace("CITIMART — ", "")}`);
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : "Failed to switch account");
                                  }
                                }}
                                className={`flex flex-col items-start rounded-xl px-2.5 py-2 text-left text-xs transition border cursor-pointer ${
                                  isActive
                                    ? "border-blue-500 bg-blue-500/15 text-blue-700 dark:text-blue-200 shadow-sm"
                                    : "border-border bg-card hover:bg-muted text-foreground"
                                }`}
                              >
                                <span className="truncate w-full font-bold">{opt.title.replace("CITIMART — ", "")}</span>
                                <span className="text-[10px] text-muted-foreground">{opt.sub.split("·")[0]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Theme Switcher */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {t.theme || "Appearance Theme"}
                    </span>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      {themes.map(({ id, label, Icon }) => {
                        const isSelected = theme === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setTheme(id)}
                            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition border cursor-pointer ${
                              isSelected
                                ? "border-blue-500 bg-blue-500/20 text-blue-700 dark:text-white shadow-sm ring-1 ring-blue-500/40"
                                : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Language Selector */}
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Languages className="h-3.5 w-3.5 text-indigo-500" />
                      {t.language || "Language"}
                    </span>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      {languages.map((item) => {
                        const isSelected = language === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setLanguage(item.id)}
                            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-xs font-semibold transition border cursor-pointer ${
                              isSelected
                                ? "border-indigo-500 bg-indigo-500/20 text-indigo-700 dark:text-white shadow-sm ring-1 ring-indigo-500/40"
                                : "border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span className="font-bold text-xs">{item.label}</span>
                            <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{item.sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sign Out Button */}
                  {user?.username && (
                    <div className="pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsOpen(false);
                          setShowLogoutConfirm(true);
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/25 py-2.5 text-xs font-semibold transition cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        {t.logout || "Log Out"} ({user.username})
                      </button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </aside>

      {/* Confirmation Dialog for Log Out */}
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent className="sm:max-w-md bg-card text-foreground border-border">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Confirm Log Out</DialogTitle>
                <DialogDescription className="mt-1 text-muted-foreground">
                  Are you sure you want to log out from the dashboard?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-2 sm:justify-end">
            <Button
              variant="outline"
              className="border-border text-foreground hover:bg-muted"
              onClick={() => setShowLogoutConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setShowLogoutConfirm(false);
                await signOut();
                navigate("/", { replace: true });
              }}
            >
              Yes, Log Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
