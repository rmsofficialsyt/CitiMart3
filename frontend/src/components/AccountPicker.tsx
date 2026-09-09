import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ADMIN_USERNAME, SIGN_IN_OPTIONS } from "@/lib/authUsers";

interface AccountPickerProps {
  /** Stack in a single column (used inside the narrow Login card). */
  dense?: boolean;
}

/**
 * Grid of the four fixed accounts. Replaces the old account dropdown — each tile
 * navigates to /login?account=<username>, where the password is entered.
 */
export function AccountPicker({ dense = false }: AccountPickerProps) {
  const navigate = useNavigate();

  return (
    <div className={`grid gap-3 ${dense ? "" : "sm:grid-cols-2"}`}>
      {SIGN_IN_OPTIONS.map((o, i) => {
        const Icon = o.username === ADMIN_USERNAME ? ShieldCheck : Store;
        return (
          <motion.button
            key={o.username}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.35 }}
            onClick={() => navigate(`/login?account=${encodeURIComponent(o.username)}`)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-blue-400/50 hover:bg-white/10"
          >
            <span className="flex items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-blue-300" />
              <span>
                <span className="block text-sm font-semibold text-slate-100">{o.title}</span>
                <span className="block text-xs text-slate-400">{o.sub}</span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-blue-300" />
          </motion.button>
        );
      })}
    </div>
  );
}
