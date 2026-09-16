import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Crown, Flame, X, Zap } from "lucide-react";
import { useState } from "react";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import raphaelAvatar from "@/assets/raphael-sir-avatar.jpg";
import { BossDirectivesModal } from "@/components/BossDirectivesModal";

import { useLanguage } from "@/context/LanguageContext";

export function BossAlertBanner() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [modalOpen, setModalOpen] = useState(false);
  const [dismissedId, setDismissedId] = useState<number | null>(null);

  const { data: summary, refetch } = useQuery({
    queryKey: ["directives-summary"],
    queryFn: api.directives,
    refetchInterval: 15000,
  });

  const latest = summary?.latest_active;
  const unreadCount = summary?.unread_count ?? 0;
  const isRead = user?.username && latest ? latest.read_by?.includes(user.username) : false;

  // Don't show if no active directive, or already dismissed this session, or already read
  if (!latest || isRead || dismissedId === latest.id) {
    return (
      <BossDirectivesModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onDirectiveAcknowledged={() => refetch()}
      />
    );
  }

  const isUrgent = latest.priority === "urgent";

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          className="mb-4 overflow-hidden"
        >
          <div
            className={`relative rounded-xl border p-3 sm:p-3.5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isUrgent
                ? "border-red-500/60 bg-gradient-to-r from-red-950/80 via-slate-950 to-amber-950/60 text-white shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                : "border-amber-500/50 bg-gradient-to-r from-slate-950 via-amber-950/40 to-slate-950 text-white shadow-[0_0_15px_rgba(245,158,11,0.15)]"
            }`}
          >
            {/* Left side: Avatar + Alert Message */}
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              {/* Glowing Avatar */}
              <div className="relative size-10 shrink-0 rounded-full">
                <span
                  className={`absolute -inset-0.5 rounded-full blur-[2px] ${
                    isUrgent ? "bg-red-500 animate-pulse" : "bg-amber-400"
                  }`}
                />
                <img
                  src={raphaelAvatar}
                  alt="Operational Head"
                  className="relative size-full rounded-full object-cover border-2 border-amber-300"
                />
                <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-amber-400 text-slate-950 shadow">
                  <Crown className="size-2 fill-slate-950 stroke-none" />
                </span>
              </div>

              {/* Text content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider border ${
                      isUrgent
                        ? "bg-red-600/30 text-red-300 border-red-500/50 animate-pulse"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    }`}
                  >
                    {isUrgent ? <Flame className="size-3" /> : <Zap className="size-3" />}
                    {isUrgent ? t.urgentInstruction : t.executiveDirective}
                  </span>
                  <span className="text-xs font-bold text-amber-200">
                    {t.fromRaphaelSir}
                  </span>
                  {unreadCount > 1 && (
                    <span className="rounded-full bg-rose-500/20 px-1.5 py-0.2 text-[10px] font-bold text-rose-300 border border-rose-500/40">
                      +{unreadCount - 1} more
                    </span>
                  )}
                </div>

                <p className="mt-0.5 truncate text-xs font-semibold text-white">
                  <span className="text-amber-300">{latest.title}:</span>{" "}
                  <span className="text-slate-200 font-normal">{latest.message}</span>
                </p>
              </div>
            </div>

            {/* Right side: Action Button & Dismiss */}
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 px-3 py-1.5 text-xs font-black text-slate-950 shadow transition-all cursor-pointer"
              >
                <span>{t.readAndAcknowledge}</span>
                <ChevronRight className="size-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setDismissedId(latest.id)}
                aria-label="Dismiss Alert"
                title={t.dismissSession}
                className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <BossDirectivesModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onDirectiveAcknowledged={() => refetch()}
      />
    </>
  );
}
