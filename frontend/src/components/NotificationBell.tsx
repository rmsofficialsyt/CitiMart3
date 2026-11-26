import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SEVERITY_STYLE: Record<string, string> = {
  urgent: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

export function NotificationBell() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["notifications", user?.username],
    queryFn: () => api.listNotifications({ limit: 30 }),
    refetchInterval: 60_000,
  });

  const markOne = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("All notifications marked as read.");
    },
  });

  const scanNow = useMutation({
    mutationFn: api.scanNotifications,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(`Agent scan complete (${res.created_count} new alert${res.created_count === 1 ? "" : "s"}).`);
    },
    onError: (err: Error) => toast.error(err.message || "Scan failed"),
  });

  const unread = data?.unread_count ?? 0;
  const items = data?.items ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          title="Operational & Log Alerts"
          className="relative size-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 sm:w-96 p-0 bg-card text-foreground border-border shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <div>
            <div className="text-sm font-semibold">Agent Alerts</div>
            <div className="text-[11px] text-muted-foreground">
              {unread} unread · {isAdmin ? "Admin + LogOps" : `Store ${user?.storeCode || ""}`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                title="Run all 6 agents now"
                onClick={() => scanNow.mutate()}
                disabled={scanNow.isPending}
                className="size-7"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${scanNow.isPending ? "animate-spin" : ""}`} />
              </Button>
            )}
            {unread > 0 && (
              <Button
                variant="ghost"
                size="icon"
                title="Mark all as read"
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="size-7"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              All clear — no active agent notifications.
            </div>
          ) : (
            items.map((n: any) => (
              <button
                key={n.notif_id}
                type="button"
                onClick={() => {
                  if (!n.read) markOne.mutate(n.notif_id);
                  if (n.action_link) {
                    setOpen(false);
                    navigate(n.action_link);
                  }
                }}
                className={`w-full text-left px-3.5 py-2.5 transition hover:bg-muted/50 cursor-pointer ${
                  n.read ? "opacity-65" : "bg-primary/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase border ${
                      SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.info
                    }`}
                  >
                    {n.severity}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">{n.agent}</span>
                </div>
                <div className="mt-1 text-xs font-semibold text-foreground">{n.title}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{n.message}</div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
