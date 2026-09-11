import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogIn,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { AccountPicker } from "@/components/AccountPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_USERNAME, accountForUsername } from "@/lib/authUsers";
import citimartLogo from "@/assets/citimart-logo.png";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, signIn } = useAuth();
  const accountParam = params.get("account") ?? "";
  const account = accountForUsername(accountParam);

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090e1a] px-4 py-8 text-slate-100 selection:bg-blue-600 selection:text-white">
      {/* Dynamic Animated Ambient Background Orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          aria-hidden
          className="absolute -top-[15%] -left-[10%] h-[36rem] w-[36rem] rounded-full bg-blue-600/20 blur-[130px]"
          animate={{
            x: [0, 35, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute -bottom-[15%] -right-[10%] h-[34rem] w-[34rem] rounded-full bg-emerald-500/15 blur-[130px]"
          animate={{
            x: [0, -35, 0],
            y: [0, -30, 0],
            scale: [1, 1.12, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute top-[40%] left-[60%] h-[28rem] w-[28rem] rounded-full bg-indigo-600/15 blur-[120px]"
          animate={{
            x: [0, -25, 0],
            y: [0, 25, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#090e1a_75%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
      </div>

      {/* Main Login Card Container */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-blue-950/40 p-6 backdrop-blur-2xl shadow-2xl sm:p-8"
      >
        {/* Top bar inside card */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <motion.div
            whileHover={{ scale: 1.03 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="inline-flex items-center rounded-xl bg-white px-3 py-1.5 shadow-md border border-slate-200/60"
          >
            <img
              src={citimartLogo}
              alt="CITIMART - Value for Money Re-defined"
              className="h-9 w-auto sm:h-11 object-contain"
            />
          </motion.div>

          <motion.button
            type="button"
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Overview</span>
          </motion.button>
        </div>

        {/* Header Title */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <span>Retail Management Portal</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Sign In to CITIMART
          </h1>
          <p className="text-xs text-slate-400">
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
                <p className="text-xs font-bold tracking-wider uppercase text-slate-400">
                  Select Your Account
                </p>
                <span className="text-[11px] text-blue-400">Fixed Store Accounts</span>
              </div>

              <AccountPicker dense />

              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 pt-2">
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
              <div className="rounded-xl border border-white/10 bg-white/5 p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-lg p-2 ${
                      isAdmin ? "bg-blue-500/20 text-blue-300" : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                  </div>
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Signing in as
                    </span>
                    <span className="block text-sm font-semibold text-white">
                      {account.label}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/login")}
                  className="text-xs text-blue-300 hover:text-blue-200 hover:bg-white/10"
                >
                  Change
                </Button>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-300" htmlFor="password">
                    Enter Password
                  </Label>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <KeyRound className="h-3 w-3 text-amber-400" /> Secure Token
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
                    className="h-11 border-white/15 bg-black/40 text-slate-100 pr-11 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 text-sm font-medium"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-200 hover:bg-white/5 focus:outline-none transition-colors"
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
                  className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs font-medium text-red-300"
                >
                  {error}
                </motion.div>
              )}

              {/* Submit Button with Spring Hover */}
              <motion.div whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.985 }}>
                <Button
                  type="submit"
                  disabled={submitting || !password}
                  className="w-full h-11 bg-blue-600 font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-colors"
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
        <div className="mt-8 border-t border-white/10 pt-4 text-center text-xs text-slate-500 space-y-1">
          <p>&copy; {new Date().getFullYear()} CITIMART Operations &middot; Kolkata</p>
        </div>
      </motion.div>
    </div>
  );
}
