import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCurrency, fmtNumber } from "@/lib/format";

export interface RechartDataPoint {
  name: string;
  [key: string]: string | number | null | undefined;
}

export interface SeriesConfig {
  key: string;
  name: string;
  color: string;
  fillOpacity?: number;
  strokeWidth?: number;
}

export const MODERN_PALETTE = {
  coral: "#FF6B4A",
  cyan: "#36D7B7",
  purple: "#8B5CF6",
  amber: "#F59E0B",
  emerald: "#10B981",
  sky: "#38BDF8",
  slate: "#94A3B8",
  pink: "#EC4899",
};

export const DEFAULT_SERIES_COLORS = [
  MODERN_PALETTE.coral,
  MODERN_PALETTE.cyan,
  MODERN_PALETTE.purple,
  MODERN_PALETTE.amber,
  MODERN_PALETTE.emerald,
  MODERN_PALETTE.sky,
];

// Custom floating card tooltip styled after the sleek dark dashboard in the reference image
export function ModernChartTooltip({
  active,
  payload,
  label,
  valuePrefix = "",
  valueSuffix = "",
  isCurrency = false,
}: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card/95 dark:bg-[#1E1E24]/95 p-3 shadow-xl backdrop-blur-md min-w-[150px] animate-in fade-in-0 zoom-in-95 duration-150">
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1.5 mb-2">
        {label}
      </div>
      <div className="space-y-1.5">
        {payload.map((item: any, idx: number) => {
          const val = Number(item.value) || 0;
          const formattedVal = isCurrency
            ? fmtCurrency(val)
            : `${valuePrefix}${fmtNumber(val)}${valueSuffix}`;
          return (
            <div key={idx} className="flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full ring-2 ring-primary/20"
                  style={{ backgroundColor: item.color || item.fill || MODERN_PALETTE.coral }}
                />
                <span className="font-medium text-foreground/80 dark:text-slate-300">{item.name}</span>
              </div>
              <span className="font-mono font-bold text-foreground">{formattedVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 1. Column / Bar Chart with rounded capsule headers
export function RechartsColumnChart({
  data,
  series,
  showGrid = true,
  showLegend = true,
  isCurrency = false,
  className = "h-[320px] w-full",
}: {
  data: RechartDataPoint[];
  series: SeriesConfig[];
  showGrid?: boolean;
  showLegend?: boolean;
  isCurrency?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 20 }}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.07)"
              vertical={false}
            />
          )}
          <XAxis
            dataKey="name"
            stroke="#94A3B8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
            dy={8}
          />
          <YAxis
            stroke="#94A3B8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (isCurrency ? `₹${(v / 1000).toFixed(0)}k` : `${v}`)}
          />
          <Tooltip
            content={<ModernChartTooltip isCurrency={isCurrency} />}
            cursor={{ fill: "rgba(255, 255, 255, 0.04)", radius: 6 }}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
              iconType="circle"
            />
          )}
          {series.map((s, idx) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length]}
              radius={[6, 6, 0, 0]}
              maxBarSize={48}
              animationDuration={600}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 2. Smooth Spline Line Chart with Glowing Active Markers
export function RechartsLineChart({
  data,
  series,
  showGrid = true,
  showLegend = true,
  isCurrency = false,
  className = "h-[320px] w-full",
}: {
  data: RechartDataPoint[];
  series: SeriesConfig[];
  showGrid?: boolean;
  showLegend?: boolean;
  isCurrency?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 20 }}>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.07)"
              vertical={false}
            />
          )}
          <XAxis
            dataKey="name"
            stroke="#94A3B8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
            dy={8}
          />
          <YAxis
            stroke="#94A3B8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (isCurrency ? `₹${(v / 1000).toFixed(0)}k` : `${v}`)}
          />
          <Tooltip
            content={<ModernChartTooltip isCurrency={isCurrency} />}
            cursor={{ stroke: "rgba(255, 255, 255, 0.2)", strokeDasharray: "4 4" }}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
              iconType="circle"
            />
          )}
          {series.map((s, idx) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length]}
              strokeWidth={s.strokeWidth ?? 3}
              dot={{ r: 4, fill: s.color, stroke: "#1E1E24", strokeWidth: 2 }}
              activeDot={{ r: 7, fill: "#FFFFFF", stroke: s.color, strokeWidth: 3 }}
              animationDuration={800}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// 3. Gradient Area Chart matching the Teamify glowing curves
export function RechartsAreaChart({
  data,
  series,
  showGrid = true,
  showLegend = true,
  isCurrency = false,
  className = "h-[320px] w-full",
}: {
  data: RechartDataPoint[];
  series: SeriesConfig[];
  showGrid?: boolean;
  showLegend?: boolean;
  isCurrency?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 20 }}>
          <defs>
            {series.map((s, idx) => {
              const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
              return (
                <linearGradient key={`grad-${s.key}`} id={`area-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              );
            })}
          </defs>
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255, 255, 255, 0.07)"
              vertical={false}
            />
          )}
          <XAxis
            dataKey="name"
            stroke="#94A3B8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "rgba(255, 255, 255, 0.1)" }}
            dy={8}
          />
          <YAxis
            stroke="#94A3B8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (isCurrency ? `₹${(v / 1000).toFixed(0)}k` : `${v}`)}
          />
          <Tooltip
            content={<ModernChartTooltip isCurrency={isCurrency} />}
            cursor={{ stroke: "rgba(255, 255, 255, 0.2)", strokeDasharray: "4 4" }}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
              iconType="circle"
            />
          )}
          {series.map((s, idx) => {
            const color = s.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length];
            return (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={2.5}
                fillOpacity={1}
                fill={`url(#area-grad-${s.key})`}
                dot={{ r: 3.5, fill: color, stroke: "#1E1E24", strokeWidth: 1.5 }}
                activeDot={{ r: 6.5, fill: "#FFFFFF", stroke: color, strokeWidth: 2.5 }}
                animationDuration={800}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// 4. Modern Donut / Pie Chart with Inner Ring cutout and custom badges
export function RechartsDonutChart({
  data,
  showLegend = true,
  isCurrency = false,
  className = "h-[320px] w-full",
}: {
  data: { name: string; value: number; color?: string }[];
  showLegend?: boolean;
  isCurrency?: boolean;
  className?: string;
}) {
  const total = useMemo(() => data.reduce((sum, item) => sum + (Number(item.value) || 0), 0), [data]);

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
          <Tooltip
            content={<ModernChartTooltip isCurrency={isCurrency} />}
          />
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="50%"
            outerRadius="78%"
            paddingAngle={3}
            dataKey="value"
            stroke="#1E1E24"
            strokeWidth={2}
            animationDuration={600}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color || DEFAULT_SERIES_COLORS[index % DEFAULT_SERIES_COLORS.length]}
              />
            ))}
          </Pie>
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }}
              iconType="circle"
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      {/* Center cutout summary */}
      <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</span>
        <span className="font-mono text-sm font-extrabold text-foreground sm:text-base">
          {isCurrency ? fmtCurrency(total) : fmtNumber(total)}
        </span>
      </div>
    </div>
  );
}
