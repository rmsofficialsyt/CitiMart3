import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, Database, RefreshCw, Server, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface NetworkInfo {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

function getBrowserConnection(): NetworkInfo | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    connection?: NetworkInfo & EventTarget;
    mozConnection?: NetworkInfo & EventTarget;
    webkitConnection?: NetworkInfo & EventTarget;
  };
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const ICON_BTN = "relative size-9 shrink-0 text-white/85 hover:bg-white/15 hover:text-white";

export function SystemStatusIndicators() {
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [connInfo, setConnInfo] = useState<NetworkInfo | null>(() => getBrowserConnection());
  const [dbOpen, setDbOpen] = useState(false);
  const [netOpen, setNetOpen] = useState(false);

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const conn = getBrowserConnection() as (NetworkInfo & EventTarget) | null;
    const onConnChange = () => setConnInfo(getBrowserConnection());
    if (conn?.addEventListener) {
      conn.addEventListener("change", onConnChange);
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (conn?.removeEventListener) {
        conn.removeEventListener("change", onConnChange);
      }
    };
  }, []);

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["system-status"],
    queryFn: api.systemStatus,
    refetchInterval: 30_000,
    retry: 1,
  });

  // Database state
  const dbUp = !isError && data?.database.status === "up";
  const dbState: "up" | "down" | "checking" = isLoading
    ? "checking"
    : dbUp
    ? "up"
    : "down";

  const dbDotColor =
    dbState === "up"
      ? "bg-emerald-400"
      : dbState === "checking"
      ? "bg-amber-400"
      : "bg-rose-500";

  // Network state
  const apiReachable = browserOnline && !isError && Boolean(data);
  const isSlow = apiReachable && (data?.api_roundtrip_ms ?? 0) > 800;
  const netState: "online" | "degraded" | "offline" | "checking" = !browserOnline
    ? "offline"
    : isLoading
    ? "checking"
    : !apiReachable
    ? "offline"
    : isSlow || data?.cache.status === "down"
    ? "degraded"
    : "online";

  const netDotColor =
    netState === "online"
      ? "bg-emerald-400"
      : netState === "checking" || netState === "degraded"
      ? "bg-amber-400"
      : "bg-rose-500";

  const cacheLabel =
    data?.cache.status === "up"
      ? `UP (${data.cache.latency_ms ?? 0} ms)`
      : data?.cache.status === "disabled"
      ? "In-Process (Single Node)"
      : isError
      ? "Unreachable"
      : "DOWN";

  return (
    <div className="flex items-center gap-1">
      {/* Database Uptime & Details Popover */}
      <Popover open={dbOpen} onOpenChange={setDbOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Database status: ${dbState.toUpperCase()}`}
            title={
              dbState === "up"
                ? `Database: UP (${data?.database.latency_ms ?? 0} ms)`
                : dbState === "checking"
                ? "Database: Checking..."
                : "Database: DOWN / Unreachable"
            }
            className={ICON_BTN}
          >
            <Database className="h-4 w-4 shrink-0" />
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
              {dbState === "up" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ring-1 ring-slate-950/80 ${dbDotColor}`} />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 py-2.5 rounded-t-2xl">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Database className="h-4 w-4 shrink-0 text-blue-500" />
              <span>Database Telemetry</span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                dbState === "up"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                  : dbState === "checking"
                  ? "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300"
                  : "border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dbDotColor}`} />
              {dbState === "up" ? "UP" : dbState === "checking" ? "Checking" : "DOWN"}
            </span>
          </div>

          <div className="p-3.5 space-y-2.5 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-muted/40 p-2">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Status</span>
                <span className="mt-0.5 block font-bold text-foreground">
                  {dbState === "up" ? "Connected" : dbState === "checking" ? "Probing..." : "Disconnected"}
                </span>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-2">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Ping Latency</span>
                <span className="mt-0.5 block font-mono font-bold text-foreground">
                  {data?.database.latency_ms != null ? `${data.database.latency_ms} ms` : "—"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 rounded-xl border border-border bg-card/60 p-2.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Database</span>
                <span className="font-mono font-semibold text-foreground truncate">
                  {data?.database.database_name ?? "citimart_daily"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Pool Size</span>
                <span className="font-mono font-semibold text-foreground">
                  {data?.database.pool ? `${data.database.pool.min_size} – ${data.database.pool.max_size}` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Redis / Session Bus</span>
                <span className="font-mono font-semibold text-foreground">{cacheLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" /> Uptime
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {data?.server ? formatUptime(data.server.uptime_seconds) : "—"}
                </span>
              </div>
              {data?.server.started_at && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Started At</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{data.server.started_at}</span>
                </div>
              )}
              {data?.database.error && (
                <div className="flex items-center justify-between gap-2 text-rose-500">
                  <span>Error</span>
                  <span className="font-mono font-semibold">{data.database.error}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
              <span>Checked: {data?.server.checked_at ?? "—"}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px] cursor-pointer"
                disabled={isFetching}
                onClick={() => refetch()}
              >
                <RefreshCw className={`mr-1 h-3 w-3 shrink-0 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Network & API Connectivity Popover */}
      <Popover open={netOpen} onOpenChange={setNetOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Network status: ${netState.toUpperCase()}`}
            title={
              netState === "online"
                ? `Network: Online (${data?.api_roundtrip_ms ?? 0} ms API RTT)`
                : netState === "degraded"
                ? `Network: Degraded (${data?.api_roundtrip_ms ?? 0} ms)`
                : netState === "checking"
                ? "Network: Checking..."
                : "Network: Offline / API Unreachable"
            }
            className={ICON_BTN}
          >
            {netState === "offline" ? (
              <WifiOff className="h-4 w-4 shrink-0 text-rose-300" />
            ) : (
              <Wifi className="h-4 w-4 shrink-0" />
            )}
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
              {netState === "online" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ring-1 ring-slate-950/80 ${netDotColor}`} />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 py-2.5 rounded-t-2xl">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              {netState === "offline" ? (
                <WifiOff className="h-4 w-4 shrink-0 text-rose-500" />
              ) : (
                <Wifi className="h-4 w-4 shrink-0 text-emerald-500" />
              )}
              <span>Network & API Signal</span>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                netState === "online"
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                  : netState === "degraded" || netState === "checking"
                  ? "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-300"
                  : "border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-300"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${netDotColor}`} />
              {netState.toUpperCase()}
            </span>
          </div>

          <div className="p-3.5 space-y-2.5 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-muted/40 p-2">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Browser Link</span>
                <span className="mt-0.5 block font-bold text-foreground">
                  {browserOnline ? "Online" : "Offline"}
                </span>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-2">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">API Round-Trip</span>
                <span className="mt-0.5 block font-mono font-bold text-foreground">
                  {apiReachable && data ? `${data.api_roundtrip_ms} ms` : "Unreachable"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 rounded-xl border border-border bg-card/60 p-2.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Server className="h-3 w-3 shrink-0" /> API Gateway
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {apiReachable ? "Connected (UP)" : "Disconnected"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Activity className="h-3 w-3 shrink-0" /> Link Quality
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {connInfo?.effectiveType
                    ? `${connInfo.effectiveType.toUpperCase()}${
                        connInfo.downlink != null ? ` · ${connInfo.downlink} Mbps` : ""
                      }`
                    : browserOnline
                    ? "Standard Link"
                    : "No Carrier"}
                </span>
              </div>
              {connInfo?.rtt != null && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Network RTT</span>
                  <span className="font-mono font-semibold text-foreground">{connInfo.rtt} ms</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 shrink-0" /> Server Uptime
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {data?.server ? formatUptime(data.server.uptime_seconds) : "—"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
              <span>Auto-syncs every 30s</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px] cursor-pointer"
                disabled={isFetching}
                onClick={() => refetch()}
              >
                <RefreshCw className={`mr-1 h-3 w-3 shrink-0 ${isFetching ? "animate-spin" : ""}`} />
                Test Link
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
