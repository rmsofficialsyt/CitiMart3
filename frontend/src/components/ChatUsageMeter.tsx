import { useQuery } from "@tanstack/react-query";
import { Gauge, Zap } from "lucide-react";

import { api } from "@/api/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TokenCounts, TurnLimits, TurnUsage } from "@/lib/types";

// Co-Pilot token usage window. Display only: the backend enforces no budget,
// and Gemini exposes no remaining-quota API, so "available" here is the
// configured capacity (context window / this tier's output cap).

export const CHAT_USAGE_QUERY_KEY = "chat-usage";

const nf = new Intl.NumberFormat("en-IN");

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function Bar({ used, cap, label }: { used: number; cap: number | null; label: string }) {
  if (!cap || cap <= 0) return null;
  const pct = Math.min(100, (used / cap) * 100);
  const tone = pct >= 90 ? "bg-status-red" : pct >= 70 ? "bg-status-yellow" : "bg-primary";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">
          {nf.format(used)} / {nf.format(cap)} · {nf.format(Math.max(0, cap - used))} available
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={used}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Counts({ c, turns }: { c: TokenCounts; turns?: number }) {
  const rows: [string, number][] = [
    ["Input", c.input_tokens],
    ["Output", c.output_tokens],
    ["Thinking", c.thinking_tokens],
    ["Cached input", c.cached_tokens],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular-nums">{nf.format(v)}</dd>
        </div>
      ))}
      <div className="col-span-2 mt-0.5 flex justify-between gap-2 border-t pt-0.5 font-medium">
        <dt>Total{turns !== undefined ? ` · ${turns} turn${turns === 1 ? "" : "s"}` : ""}</dt>
        <dd className="tabular-nums">{nf.format(c.total_tokens)}</dd>
      </div>
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function ChatUsageMeter({
  sessionId,
  lastTurn,
  lastLimits,
}: {
  sessionId: string | null;
  /** Usage from the most recent send in this panel (shown immediately, before the refetch). */
  lastTurn?: TurnUsage | null;
  lastLimits?: TurnLimits | null;
}) {
  const { data, isError } = useQuery({
    queryKey: [CHAT_USAGE_QUERY_KEY, sessionId],
    queryFn: () => api.getChatUsage(sessionId),
    staleTime: 30_000,
  });

  const todayTotal = data?.today.total_tokens ?? 0;
  const turn = lastTurn ?? data?.last_turn ?? null;
  const tierCap =
    lastLimits?.max_output_tokens ??
    (data?.last_turn?.tier ? data.limits.max_output[data.last_turn.tier] : null);
  const contextWindow = data?.limits.context_window ?? lastLimits?.context_window ?? null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-800/60 px-1.5 py-0.5 text-[10px] font-bold text-slate-300 transition hover:text-amber-300 cursor-pointer"
          title="Gemini token usage"
          aria-label={`Token usage: ${nf.format(todayTotal)} tokens today`}
        >
          <Zap className="size-3" />
          <span className="tabular-nums">{isError ? "—" : compact(todayTotal)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Token usage</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {data?.model ?? "Gemini"}
              {data?.fallback_models.length ? ` → ${data.fallback_models.join(", ")}` : ""}
            </p>
          </div>
        </div>

        {isError && <p className="text-xs text-muted-foreground">Usage is unavailable right now.</p>}

        <Section title="Last message">
          {!turn ? (
            <p className="text-xs text-muted-foreground">No Gemini calls yet.</p>
          ) : turn.llm_calls === 0 ? (
            <p className="text-xs text-muted-foreground">Answered by the built-in engine, without Gemini (0 tokens).</p>
          ) : (
            <>
              {turn.models.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Served by <span className="font-medium text-foreground">{turn.models.join(", ")}</span>
                  {data && !turn.models.includes(data.model) ? " (fallback)" : ""}
                </p>
              )}
              <Counts c={turn} />
              <Bar used={turn.output_tokens + turn.thinking_tokens} cap={tierCap} label="Output vs cap" />
              <Bar used={turn.input_tokens} cap={contextWindow} label="Input vs context window" />
            </>
          )}
        </Section>

        {data?.session && (
          <Section title="This conversation">
            <Counts c={data.session} turns={data.session.turns} />
          </Section>
        )}

        {data && (
          <Section title="Today (IST)">
            <Counts c={data.today} turns={data.today.turns} />
            <p className="text-[11px] text-muted-foreground">{nf.format(data.today.llm_calls)} Gemini calls</p>
          </Section>
        )}

        {data && (
          <p className="border-t pt-2 text-[11px] leading-snug text-muted-foreground">
            Caps: output {nf.format(data.limits.max_output.short)} / {nf.format(data.limits.max_output.medium)} /{" "}
            {nf.format(data.limits.max_output.long)} (short / medium / long), input{" "}
            {nf.format(data.limits.max_input_chars)} chars, last {data.limits.history_messages} messages of history.
            These are configured limits, not your Google quota.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
