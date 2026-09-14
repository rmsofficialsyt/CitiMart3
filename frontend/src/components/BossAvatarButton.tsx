import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { useState } from "react";
import raphaelAvatar from "@/assets/raphael-sir-avatar.jpg";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { BossDirectivesModal } from "@/components/BossDirectivesModal";

interface BossAvatarButtonProps {
  className?: string;
}

export function BossAvatarButton({ className = "" }: BossAvatarButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const { data: summary, refetch } = useQuery({
    queryKey: ["directives-summary"],
    queryFn: api.directives,
    refetchInterval: 15000, // Poll every 15s for live executive notices
  });

  const unreadCount = summary?.unread_count ?? 0;
  const hasUrgent = summary?.has_urgent ?? false;

  return (
    <>
      <div className={`relative flex items-center ${className}`}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={() => setModalOpen(true)}
          aria-label="Raphael Sir (Boss) - Executive Instructions & Notices"
          title="Raphael Sir (Boss) — Executive Directives, Sales Notices & Remarks"
          className="group relative flex items-center gap-2 rounded-full bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950/50 p-1 pl-1 pr-2.5 sm:pr-3 text-left border border-amber-500/40 shadow-md hover:border-amber-400 hover:shadow-[0_0_18px_rgba(245,158,11,0.35)] transition-all duration-200 cursor-pointer"
        >
          {/* Avatar Container with Glowing Halo */}
          <div className="relative size-8 sm:size-9 shrink-0 rounded-full">
            {/* Animated Ring when Unread / Urgent */}
            {unreadCount > 0 && (
              <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-red-500 via-amber-400 to-amber-600 opacity-85 blur-[2px] animate-pulse" />
            )}
            
            <img
              src={raphaelAvatar}
              alt="Raphael Sir (Boss)"
              className="relative size-full rounded-full object-cover border-2 border-amber-400/90 shadow-inner bg-slate-800"
            />

            {/* Boss Crown / Badge on Corner */}
            <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-sm border border-slate-900">
              <Crown className="size-2.5 fill-slate-950 stroke-none" />
            </span>
          </div>

          {/* Text Labels (Desktop / Tablet) */}
          <div className="hidden sm:flex flex-col min-w-0 pr-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-bold text-amber-300 group-hover:text-amber-200 tracking-tight">
                Raphael Sir
              </span>
              <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-black uppercase text-amber-300 border border-amber-500/30">
                BOSS
              </span>
            </div>
            <span className="truncate text-[10px] text-slate-300/90 font-medium">
              {unreadCount > 0 ? (
                <span className="text-rose-300 font-semibold animate-pulse">
                  {unreadCount} New {unreadCount === 1 ? "Notice" : "Notices"}
                </span>
              ) : (
                "Executive Directives"
              )}
            </span>
          </div>

          {/* Unread / Alert Pill Badge */}
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={`flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black text-white shadow-lg ${
                hasUrgent
                  ? "bg-gradient-to-r from-red-600 to-rose-500 border border-red-300"
                  : "bg-gradient-to-r from-amber-500 to-orange-500 border border-amber-200"
              }`}
            >
              {unreadCount}
              {hasUrgent && (
                <span className="relative flex ml-1 h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-90" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
              )}
            </motion.span>
          )}
        </motion.button>
      </div>

      {/* Modal Dialog for Boss Directives */}
      <BossDirectivesModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onDirectiveAcknowledged={() => refetch()}
      />
    </>
  );
}
