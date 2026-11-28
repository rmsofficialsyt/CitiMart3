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
    <div className={`grid gap-3 ${dense ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 auto-rows-fr"}`}>
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
            className={`lg-glass-surface group relative flex h-full w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-all duration-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] cursor-pointer ${
              isAdmin
                ? "border-rose-400/35 bg-gradient-to-br from-[#b52026]/25 via-slate-900/80 to-[#23407d]/30 hover:border-rose-400/70 hover:shadow-lg hover:shadow-[#b52026]/20 glassy:border-rose-300/75 glassy:bg-white/70 glassy:bg-none glassy:hover:border-rose-400"
                : "border-white/15 bg-gradient-to-br from-[#1b1018]/75 via-slate-900/80 to-[#142040]/70 hover:border-blue-400/60 hover:shadow-lg hover:shadow-[#23407d]/25 glassy:border-white/80 glassy:bg-white/65 glassy:bg-none glassy:hover:border-blue-400"
            }`}
          >
            <span className="flex min-w-0 flex-1 items-center gap-3.5">
              <div
                className={`shrink-0 rounded-lg p-2.5 border transition-all group-hover:scale-110 ${
                  isAdmin
                    ? "border-rose-400/30 bg-gradient-to-br from-[#b52026]/35 to-[#23407d]/35 text-rose-200 glassy:bg-rose-500/15 glassy:text-rose-700 glassy:border-rose-300"
                    : "border-white/15 bg-gradient-to-br from-[#b52026]/20 to-[#23407d]/30 text-sky-200 glassy:bg-blue-500/15 glassy:text-blue-700 glassy:border-blue-300"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-100 group-hover:text-white glassy:text-slate-900 glassy:group-hover:text-slate-950 transition-colors">
                  {o.title}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-300/80 glassy:text-slate-600">{o.sub}</span>
              </span>
            </span>

            <div className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 glassy:border-slate-300/70 glassy:bg-white/70 glassy:text-slate-700 transition-all group-hover:border-white/25 group-hover:bg-gradient-to-r group-hover:from-[#b52026] group-hover:to-[#23407d] group-hover:text-white group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4 shrink-0" />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
