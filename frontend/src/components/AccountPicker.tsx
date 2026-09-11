import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ADMIN_USERNAME, SIGN_IN_OPTIONS } from "@/lib/authUsers";

interface AccountPickerProps {
  /** Stack in a single column (used inside the narrow Login card). */
  dense?: boolean;
}

/**
 * Grid of the four fixed accounts with interactive hover states and spring physics.
 */
export function AccountPicker({ dense = false }: AccountPickerProps) {
  const navigate = useNavigate();

  return (
    <div className={`grid gap-3 ${dense ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
      {SIGN_IN_OPTIONS.map((o, i) => {
        const isAdmin = o.username === ADMIN_USERNAME;
        const Icon = isAdmin ? ShieldCheck : Store;
        return (
          <motion.button
            key={o.username}
            type="button"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.05 * i,
              duration: 0.4,
              ease: "easeOut",
            }}
            whileHover={{ y: -3, scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => navigate(`/login?account=${encodeURIComponent(o.username)}`)}
            className={`group relative flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition-all duration-200 ${
              isAdmin
                ? "border-blue-500/20 bg-gradient-to-r from-blue-950/40 to-slate-900/40 hover:border-blue-400/60 hover:bg-blue-900/20 hover:shadow-lg hover:shadow-blue-500/10"
                : "border-white/10 bg-white/5 hover:border-blue-400/50 hover:bg-white/[0.08] hover:shadow-lg hover:shadow-blue-500/10"
            }`}
          >
            <span className="flex items-center gap-3.5">
              <div
                className={`rounded-lg p-2 transition-all group-hover:scale-110 ${
                  isAdmin
                    ? "bg-blue-500/15 text-blue-300 group-hover:bg-blue-500/25"
                    : "bg-emerald-500/15 text-emerald-300 group-hover:bg-emerald-500/25"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
              </div>
              <span>
                <span className="block text-sm font-semibold text-slate-100 group-hover:text-blue-200 transition-colors">
                  {o.title}
                </span>
                <span className="block text-xs text-slate-400 mt-0.5">{o.sub}</span>
              </span>
            </span>

            <div className="rounded-md bg-white/5 p-1 text-slate-400 transition-all group-hover:bg-blue-500 group-hover:text-white group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4 shrink-0" />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
