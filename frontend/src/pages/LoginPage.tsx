import { motion } from "framer-motion";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { AccountPicker } from "@/components/AccountPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountForUsername } from "@/lib/authUsers";
import citimartLogo from "@/assets/citimart-logo.png";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, signIn } = useAuth();
  const account = accountForUsername(params.get("account") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/app", { replace: true });
  }, [loading, user, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    setError(null);
    setSubmitting(true);
    try {
      await signIn(account.username, password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1220] px-4 text-slate-100">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(50rem 50rem at 20% 15%, oklch(0.42 0.16 265 / 0.5), transparent 60%)," +
            "radial-gradient(45rem 45rem at 80% 85%, oklch(0.6 0.19 258 / 0.4), transparent 55%)",
        }}
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-7"
      >
        <div className="inline-flex items-center rounded-xl bg-white px-3 py-1.5 shadow-md border border-slate-200/50">
          <img src={citimartLogo} alt="CITIMART - Value for Money Re-defined" className="h-11 w-auto sm:h-12 object-contain" />
        </div>
        <h1 className="mt-3 text-xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">Sales KPI Dashboard Report</p>

        {!account ? (
          <div className="mt-6">
            <p className="mb-3 text-sm text-slate-300">Choose your account</p>
            <AccountPicker dense />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-slate-300">Account</Label>
              <div className="flex items-center justify-between rounded-md border border-white/15 bg-[#0b1220]/60 px-3 py-2">
                <span className="text-sm text-slate-100">{account.label}</span>
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="text-xs text-blue-300 hover:underline"
                >
                  Change
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-300" htmlFor="password">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border-white/15 bg-[#0b1220]/60 text-slate-100 pr-10"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              type="submit"
              disabled={submitting || !password}
              className="w-full bg-blue-500 text-white hover:bg-blue-400"
            >
              <LogIn className="mr-1.5 h-4 w-4" /> {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} CITIMART Operations. All Rights Reserved.
        </p>
      </motion.div>
    </div>
  );
}
