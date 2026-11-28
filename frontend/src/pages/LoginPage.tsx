import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Droplets,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { AccountPicker } from "@/components/AccountPicker";
import { LegalNoticeModal, type LegalDocType } from "@/components/LegalNoticeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_USERNAME, accountForUsername } from "@/lib/authUsers";
import citimartLogo from "@/assets/citimart-logo.png";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, signIn } = useAuth();
  const { theme, setTheme } = useTheme();
  const isGlassy = theme === "glassy";
  const accountParam = params.get("account") ?? "";
  const account = accountForUsername(accountParam);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isLegalModalOpen, setIsLegalModalOpen] = useState(false);
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocType>("about");

  function openLegalDoc(doc: LegalDocType) {
    setActiveLegalDoc(doc);
    setIsLegalModalOpen(true);
  }

  useEffect(() => {
    if (!loading && user) navigate("/app", { replace: true });
  }, [loading, user, navigate]);

  // Clear password and error if account query param changes
  useEffect(() => {
    setPassword("");
    setError(null);
  }, [accountParam]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn(account.username, password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please check credentials.");
    } finally {
      setSubmitting(false);
    }
  }

  const isAdmin = account?.username === ADMIN_USERNAME;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(125deg,#7a151a_0%,#3d1538_38%,#193066_75%,#101f44_100%)] glassy:bg-[linear-gradient(135deg,#dbeafe_0%,#eff6ff_38%,#e0e7ff_74%,#f0f9ff_100%)] px-4 py-8 text-slate-100 glassy:text-slate-900 selection:bg-[#b52026] selection:text-white">
      {/* Dynamic Animated Ambient Background Orbs & Sales Line Graph */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Sweeping Animated Sales Line Chart Graphic */}
        <svg
          className="absolute top-0 left-0 w-full h-[650px] opacity-25 glassy:opacity-35"
          viewBox="0 0 1440 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="loginBgLineGradPrimary" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e11d48" stopOpacity="0.35" />
              <stop offset="35%" stopColor="#b52026" stopOpacity="0.85" />
              <stop offset="70%" stopColor="#6366f1" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.45" />
            </linearGradient>
            <linearGradient id="loginBgAreaGradPrimary" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#b52026" stopOpacity="0.16" />
              <stop offset="50%" stopColor="#23407d" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0a0d16" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="loginBgLineGradSecondary" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.15" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#23407d" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          <line x1="0" y1="120" x2="1440" y2="120" stroke={isGlassy ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.03)"} strokeDasharray="6 6" />
          <line x1="0" y1="240" x2="1440" y2="240" stroke={isGlassy ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.03)"} strokeDasharray="6 6" />
          <line x1="0" y1="360" x2="1440" y2="360" stroke={isGlassy ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.03)"} strokeDasharray="6 6" />
          <line x1="0" y1="480" x2="1440" y2="480" stroke={isGlassy ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.03)"} strokeDasharray="6 6" />

          <motion.path
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.6 }}
            transition={{ duration: 2.2, ease: "easeInOut" }}
            d="M 0,380 C 180,340 320,420 480,310 C 640,200 800,280 960,180 C 1120,80 1280,190 1440,110"
            stroke="url(#loginBgLineGradSecondary)"
            strokeWidth="2"
            strokeDasharray="4 4"
            fill="none"
          />

          <motion.path
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.8, delay: 0.5 }}
            d="M 0,320 C 160,280 280,350 440,220 C 600,90 760,190 920,110 C 1080,30 1240,120 1440,40 L 1440,600 L 0,600 Z"
            fill="url(#loginBgAreaGradPrimary)"
          />

          <motion.path
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 2.5, ease: "easeInOut" }}
            d="M 0,320 C 160,280 280,350 440,220 C 600,90 760,190 920,110 C 1080,30 1240,120 1440,40"
            stroke="url(#loginBgLineGradPrimary)"
            strokeWidth="3.5"
            fill="none"
          />

          <motion.circle
            cx="440"
            cy="220"
            r="5"
            fill="#f43f5e"
            animate={{ r: [4, 7, 4], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <motion.circle
            cx="920"
            cy="110"
            r="6"
            fill="#818cf8"
            animate={{ r: [5, 8, 5], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
          />
          <motion.circle
            cx="1440"
            cy="40"
            r="6"
            fill="#3b82f6"
            animate={{ r: [5, 9, 5], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.8, repeat: Infinity, delay: 1 }}
          />
        </svg>
        <motion.div
          aria-hidden
          className="absolute -top-[15%] -left-[10%] h-[36rem] w-[36rem] rounded-full bg-[#dc2626]/30 glassy:bg-sky-400/35 blur-[130px]"
          animate={{
            x: [0, 35, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-[15%] -right-[10%] h-[36rem] w-[36rem] rounded-full bg-[#2563eb]/30 glassy:bg-indigo-400/30 blur-[130px]"
          animate={{
            x: [0, -35, 0],
            y: [0, -30, 0],
            scale: [1, 1.12, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-[40%] left-[60%] h-[28rem] w-[28rem] rounded-full bg-indigo-600/15 glassy:bg-cyan-300/30 blur-[120px]"
          animate={{
            x: [0, -25, 0],
            y: [0, 25, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_25%,rgba(10,13,22,0.45)_100%)] glassy:opacity-15" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      {/* Main Login Card Container */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className={`lg-glass-surface relative w-full overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-slate-900/95 via-[#0f1628]/90 to-[#162244]/60 glassy:border-white/80 glassy:bg-white/65 glassy:bg-none p-4 backdrop-blur-2xl shadow-2xl glassy:shadow-[0_24px_64px_rgba(30,58,138,0.16),inset_0_1px_0_rgba(255,255,255,0.9)] transition-[max-width] duration-300 sm:p-8 ${!account ? "max-w-2xl 2xl:max-w-3xl" : "max-w-lg 2xl:max-w-xl"
          }`}
      >
        {/* Flush Glossy Red-Blue TopBar inside card (No Watermark, No Divider) */}
        <div className="glossy-topbar relative -mx-4 -mt-4 mb-5 flex items-center justify-between gap-2 px-4 py-3.5 sm:-mx-8 sm:-mt-8 sm:mb-6 sm:px-8 sm:py-4 border-b-0!">
          <motion.div
            whileHover={{ scale: 1.03 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="inline-flex items-center"
          >
            <img
              src={citimartLogo}
              alt="CITIMART - Value for Money Re-defined"
              className="h-10 w-auto sm:h-12 object-contain drop-shadow-md"
            />
          </motion.div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTheme(isGlassy ? "light" : "glassy")}
              aria-label={isGlassy ? "Switch to Classic Theme" : "Switch to Glassy Theme"}
              title={isGlassy ? "Switch to Classic Theme" : "Switch to Glassy Theme"}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                isGlassy
                  ? "border-sky-200/80 bg-white/30 text-white shadow-sm"
                  : "border-white/25 bg-white/10 text-white/90 hover:bg-white/20"
              }`}
            >
              <Droplets className="h-3.5 w-3.5" />
            </button>

            <motion.button
              type="button"
              whileHover={{ x: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/25 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Overview</span>
            </motion.button>
          </div>
        </div>

        {/* Header Title */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-300 glassy:text-blue-700">
            <Sparkles className="h-3.5 w-3.5 text-blue-400 glassy:text-blue-600" />
            <span>Retail Management Portal</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white glassy:text-slate-900 sm:text-3xl">
            Sign In to CITIMART
          </h1>
          <p className="text-xs text-slate-400 glassy:text-slate-600">
            Real-time daily operations, store KPIs, and executive reporting
          </p>
        </div>

        {/* Content View Transition: Account Selection vs Password Form */}
        <AnimatePresence mode="wait">
          {!account ? (
            <motion.div
              key="account-picker"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.25 }}
              className="mt-6 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold tracking-wider uppercase text-slate-400 glassy:text-slate-600">
                  Select Your Account
                </p>
                <span className="text-[11px] text-rose-300 glassy:text-blue-700 font-medium">Fixed Store Accounts</span>
              </div>

              <AccountPicker />

              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 glassy:text-slate-600 pt-2">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Protected by role-scoped access control</span>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="password-form"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.25 }}
              onSubmit={onSubmit}
              className="mt-6 space-y-4"
            >
              {/* Selected Account Banner */}
              <div className="rounded-xl border border-white/15 bg-gradient-to-r from-[#b52026]/15 to-[#23407d]/20 glassy:border-white/80 glassy:bg-white/70 glassy:bg-none p-3.5 flex items-center justify-between shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-lg p-2 border ${isAdmin
                      ? "border-rose-400/30 bg-[#b52026]/25 text-rose-200 glassy:bg-rose-500/15 glassy:text-rose-700 glassy:border-rose-300"
                      : "border-blue-400/30 bg-[#23407d]/35 text-sky-200 glassy:bg-blue-500/15 glassy:text-blue-700 glassy:border-blue-300"
                      }`}
                  >
                    {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-400 glassy:text-slate-500">
                      Signing in as
                    </span>
                    <span className="block text-sm font-semibold text-white glassy:text-slate-900">
                      {account.label}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/login")}
                  className="text-xs text-rose-200 hover:text-white hover:bg-white/15 border border-white/15 glassy:text-blue-700 glassy:border-blue-200 glassy:bg-white/60 glassy:hover:bg-white"
                >
                  Change
                </Button>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300 glassy:text-slate-700" htmlFor="password">
                    Enter Password
                  </Label>
                  <span className="text-[11px] text-slate-400 glassy:text-slate-600 flex items-center gap-1">
                    <KeyRound className="h-3 w-3 text-amber-400 glassy:text-amber-600" /> Secure Token
                  </span>
                </div>

                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-11 border-white/15 bg-black/40 text-slate-100 glassy:border-white/80 glassy:bg-white/75 glassy:text-slate-900 pr-11 focus:border-rose-400 focus:ring-1 focus:ring-rose-400 text-sm font-medium"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-200 hover:bg-white/5 glassy:text-slate-600 glassy:hover:text-slate-900 glassy:hover:bg-slate-200/60 focus:outline-none transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error Message with Animation */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-300 glassy:border-red-300 glassy:bg-red-50/90 glassy:text-red-700"
                >
                  {error}
                </motion.div>
              )}

              {/* Submit Button with Spring Hover */}
              <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}>
                <Button
                  type="submit"
                  disabled={submitting || !password}
                  className="w-full h-11 bg-gradient-to-r from-[#b52026] to-[#23407d] font-semibold text-white border border-white/20 shadow-lg shadow-[#b52026]/25 hover:from-[#c8252c] hover:to-[#2b4d96] transition-all"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authenticating…
                    </>
                  ) : (
                    <>
                      <LogIn className="mr-2 h-4 w-4" />
                      Sign In to Workspace
                    </>
                  )}
                </Button>
              </motion.div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Footer info inside card */}
        <div className="mt-8 border-t border-white/10 glassy:border-slate-300/70 pt-4 text-center text-xs text-slate-500 glassy:text-slate-600 space-y-2">
          <p>
            &copy; {new Date().getFullYear()} CITIMART Operations. All rights reserved. &middot; Kolkata, West Bengal, India.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
            <button
              type="button"
              onClick={() => openLegalDoc("about")}
              className="hover:text-slate-300 glassy:hover:text-slate-900 transition-colors cursor-pointer"
            >
              About Us
            </button>
            <span>&middot;</span>
            <button
              type="button"
              onClick={() => openLegalDoc("terms")}
              className="hover:text-slate-300 glassy:hover:text-slate-900 transition-colors cursor-pointer"
            >
              Terms of Use
            </button>
            <span>&middot;</span>
            <button
              type="button"
              onClick={() => openLegalDoc("privacy")}
              className="hover:text-slate-300 glassy:hover:text-slate-900 transition-colors cursor-pointer"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </motion.div>

      <LegalNoticeModal
        open={isLegalModalOpen}
        onOpenChange={setIsLegalModalOpen}
        activeDoc={activeLegalDoc}
        onDocChange={setActiveLegalDoc}
      />
    </div>
  );
}
