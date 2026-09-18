import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  CloudSun,
  FileText,
  MapPin,
  Sparkles,
  Vote,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { fmtDateDot } from "@/lib/format";
import type { DailyLiveSnapshot, DailyOverallSnapshot } from "@/lib/types";

const TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

function getGreeting(hour: number): string {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

interface DailyHeroCardProps {
  storeName: string;
  data?: DailyLiveSnapshot | DailyOverallSnapshot | null;
}

/** The Daily Dashboard's top hero card -- Teamify-inspired personalized greeting,
 * live-ticking wall clock, store badge, and integrated Environmental & Trading Conditions. */
export function DailyHeroCard({ storeName, data }: DailyHeroCardProps) {
  const [now, setNow] = useState(() => new Date());
  const { user } = useAuth();

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const currentHour = now.getHours();
  const greeting = getGreeting(currentHour);
  const displayName = user?.role === "admin" ? "Admin" : storeName;
  const liveData = data as DailyLiveSnapshot | undefined;

  return (
    <div className="glossy-card rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left Side: Personalized Greeting */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Live Store Operations · Kolkata
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <span>{greeting}, {displayName}</span>
            <Sparkles className="h-5 w-5 text-amber-500 inline animate-pulse" />
          </h1>
          <p className="text-xs text-muted-foreground">
            Hope you have a productive operating day. Monitoring live customer footfall, counter billings, and store targets.
          </p>
        </div>

        {/* Right Side: Active Store Pill & Live Wall Clock */}
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 dark:bg-black/30 px-3.5 py-2 shadow-xs">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Store Active</div>
              <div className="text-xs font-bold text-foreground">{storeName}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/60 dark:bg-black/30 px-3.5 py-2 shadow-xs">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {fmtDateDot(now)}
              </div>
              <div className="font-mono text-sm font-black text-foreground tabular-nums">
                {TIME_FORMATTER.format(now)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Environmental & Trading Conditions (Underlying Context) Strip */}
      <div className="rounded-2xl border border-border/80 bg-muted/40 dark:bg-black/30 p-3.5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Context Label */}
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1 hidden sm:inline">
              Trading Context:
            </span>

            {/* Day Type Badge */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/80 px-3 py-1.5 font-medium text-foreground shadow-2xs">
              <Calendar className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              <span>{liveData?.day_name ? `${liveData.day_name} (${liveData.day_type ?? "Regular"})` : "Standard Trading Day"}</span>
            </div>

            {/* Weather Badge */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/80 px-3 py-1.5 font-medium text-foreground shadow-2xs">
              <CloudSun className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
              <span>
                {liveData?.weather
                  ? `${liveData.weather.condition}${liveData.weather.temp_max_c != null ? ` · ${liveData.weather.temp_max_c}°C` : ""}${liveData.weather.precipitation_mm ? ` (${liveData.weather.precipitation_mm}mm rain)` : ""}`
                  : "Kolkata Weather Normal"}
              </span>
            </div>

            {/* Holiday / Event Context */}
            <div className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-medium shadow-2xs ${
              liveData?.holiday_name
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                : "border-border/80 bg-background/80 text-foreground"
            }`}>
              <Sparkles className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
              <span>{liveData?.holiday_name ? `Holiday: ${liveData.holiday_name}` : "Standard Retail Trading Day"}</span>
            </div>

            {/* Election Context (if present) */}
            {liveData?.election_name && (
              <div className="flex items-center gap-1.5 rounded-xl border border-purple-500/40 bg-purple-500/15 px-3 py-1.5 font-medium text-purple-700 dark:text-purple-300 shadow-2xs">
                <Vote className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
                <span>Election: {liveData.election_name}</span>
              </div>
            )}
          </div>

          {/* Manager Operational Remarks / Notes (if present) */}
          {liveData?.reason && (
            <div className="flex items-center gap-2 text-xs bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 px-3 py-1.5 rounded-xl">
              <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-medium truncate max-w-[320px]">
                <strong className="text-amber-900 dark:text-amber-300">Remarks:</strong> {liveData.reason}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
