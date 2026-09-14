import { animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import type { GaugeSpec } from "@/lib/types";

/** A classic analog speedometer gauge -- chrome bezel, glass shine, vivid
 * red/yellow/green zones, tick marks, and a real needle -- rendered in raw
 * SVG rather than through Plotly, which has no needle primitive (see
 * src/charts.py's gauge_chart() vs. gauge_spec() docstrings). Consumes
 * gauge_spec()'s plain JSON directly: `spec.value`/`min`/`max` place the
 * needle, `redBelow`/`greenAt`/`reverse` place the band boundaries -- the
 * same numbers src/charts.py's Plotly-based gauge_chart() (still used by
 * the Streamlit apps) draws, just a different renderer for the same
 * business thresholds.
 *
 * The needle/readout sweep in on mount and re-sweep on value changes via
 * `displayValue`, mirroring ChartPanel's Plotly-indicator sweep-in for the
 * chart types that go through Plotly instead of this SVG renderer -- see
 * ChartPanel.tsx's "Gauge (Indicator) value-sweep-in" comment. */

const CX = 150;
const CY = 150;
const START_ANGLE = 135; // degrees; 0deg = 3 o'clock, increasing = clockwise (SVG's y-down convention)
const SWEEP = 270; // total arc sweep, leaving a 90deg gap at the bottom
const BEZEL_R = 128;
const FACE_R = 116;
const BAND_OUTER_R = 110;
const BAND_INNER_R = 84;
const TICK_OUTER_R = 110;
const TICK_INNER_R = 98;
const NEEDLE_LENGTH = 76;
const NEEDLE_BASE = 8;
const PIVOT_R = 10;
const LABEL_R = BEZEL_R + 16;
const TICK_COUNT = 8;

interface GaugePalette {
  red: string;
  yellow: string;
  green: string;
  bezel: [string, string, string];
  face: string;
  faceStroke: string;
  tick: string;
  label: string;
  needle: string;
  needleStroke: string;
  pivot: string;
  pivotStroke: string;
  readout: string;
  naBezel: string;
  naFace: string;
  naText: string;
}

const DEFAULT_PALETTE: GaugePalette = {
  red: "#dc2626",
  yellow: "#eab308",
  green: "#16a34a",
  bezel: ["#475569", "#1e293b", "#0f172a"],
  face: "#f8fafc",
  faceStroke: "#cbd5e1",
  tick: "#1e293b",
  label: "#64748b",
  needle: "#dc2626",
  needleStroke: "#7f1d1d",
  pivot: "#1e293b",
  pivotStroke: "#475569",
  readout: "#0f172a",
  naBezel: "#94a3b8",
  naFace: "#f1f5f9",
  naText: "#94a3b8",
};

// Matches the neon Plotly palette in src/theme.py so the SVG gauges read the
// same as the recoloured charts around them.
const NEON_PALETTE: GaugePalette = {
  red: "#fb7185",
  yellow: "#facc15",
  green: "#34d399",
  bezel: ["#2a3a5f", "#141c33", "#0b1020"],
  face: "#111a2e",
  faceStroke: "rgba(148,197,255,0.25)",
  tick: "#64748b",
  label: "#94a3b8",
  needle: "#22d3ee",
  needleStroke: "#0e7490",
  pivot: "#0b1020",
  pivotStroke: "#22d3ee",
  readout: "#e2e8f0",
  naBezel: "#334155",
  naFace: "#111a2e",
  naText: "#64748b",
};

function polar(r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function angleFor(value: number, min: number, max: number): number {
  const t = max > min ? (value - min) / (max - min) : 0;
  const clamped = Math.min(1, Math.max(0, t));
  return START_ANGLE + clamped * SWEEP;
}

/** An annular (donut) wedge from startDeg to endDeg, radius rInner..rOuter -- one color band. */
function ringSegmentPath(rOuter: number, rInner: number, startDeg: number, endDeg: number): string {
  if (endDeg <= startDeg) return "";
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const p1 = polar(rOuter, startDeg);
  const p2 = polar(rOuter, endDeg);
  const p3 = polar(rInner, endDeg);
  const p4 = polar(rInner, startDeg);
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
}

function needlePath(angleDeg: number): string {
  const tip = polar(NEEDLE_LENGTH, angleDeg);
  const left = polar(NEEDLE_BASE, angleDeg + 90);
  const right = polar(NEEDLE_BASE, angleDeg - 90);
  const tail = polar(NEEDLE_BASE * 1.6, angleDeg + 180);
  return `M ${left.x} ${left.y} L ${tip.x} ${tip.y} L ${right.x} ${right.y} L ${tail.x} ${tail.y} Z`;
}

function fmtGaugeValue(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return rounded.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

export function GlossyGauge({ spec, className, neon = false }: { spec: GaugeSpec; className?: string; neon?: boolean }) {
  const wrapperClass = className ?? "h-[160px] sm:h-[180px] w-full";
  const p = neon ? NEON_PALETTE : DEFAULT_PALETTE;
  const min = spec.min ?? 0;

  const [displayValue, setDisplayValue] = useState<number>(min);
  const currentValueRef = useRef(displayValue);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (spec.value == null) return;
    const from = mountedRef.current ? currentValueRef.current : min;
    mountedRef.current = true;
    const controls = animate(from, spec.value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        currentValueRef.current = v;
        setDisplayValue(v);
      },
    });
    return () => controls.stop();
  }, [spec.value, min]);

  if (spec.value == null) {
    return (
      <div className={`flex flex-col items-center justify-center p-1 ${wrapperClass}`}>
        {spec.title && <p className="text-muted-foreground mb-0.5 text-center text-xs font-semibold truncate w-full">{spec.title}</p>}
        <svg viewBox="0 0 300 300" className="h-full max-h-[135px] w-full max-w-[135px]" role="img" aria-label={`${spec.title}: not available`}>
          <circle cx={CX} cy={CY} r={BEZEL_R} fill={p.naBezel} />
          <circle cx={CX} cy={CY} r={FACE_R} fill={p.naFace} />
          <text x={CX} y={CY + 10} textAnchor="middle" style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Fira Code Variable', ui-monospace, monospace" }} fill={p.naText}>
            N/A
          </text>
        </svg>
        <p className="text-muted-foreground mt-0.5 text-center text-[10px]">Data not available</p>
      </div>
    );
  }

  const { value, target } = spec;
  const max = spec.max ?? 100;
  const redBelow = spec.redBelow ?? 0;
  const greenAt = spec.greenAt ?? max;
  const reverse = spec.reverse ?? false;
  const suffix = spec.suffix ?? "";
  const prefix = spec.prefix ?? "";
  const fmt = (v: number) => `${prefix}${fmtGaugeValue(v)}${suffix}`;

  const bands = reverse
    ? [
        { from: min, to: greenAt, color: p.green },
        { from: greenAt, to: redBelow, color: p.yellow },
        { from: redBelow, to: max, color: p.red },
      ]
    : [
        { from: min, to: redBelow, color: p.red },
        { from: redBelow, to: greenAt, color: p.yellow },
        { from: greenAt, to: max, color: p.green },
      ];

  const needleAngle = angleFor(displayValue, min, max);
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => START_ANGLE + (i / TICK_COUNT) * SWEEP);
  const minLabelPos = polar(LABEL_R, START_ANGLE);
  const maxLabelPos = polar(LABEL_R, START_ANGLE + SWEEP);

  return (
    <div className={`flex flex-col items-center justify-between p-1 select-none ${wrapperClass}`}>
      {spec.title && <p className="text-muted-foreground mb-0.5 text-center text-xs font-semibold tracking-wide truncate w-full">{spec.title}</p>}
      <svg
        viewBox="0 0 300 300"
        className="h-full max-h-[135px] w-full max-w-[135px] shrink-0"
        role="img"
        aria-label={`${spec.title}: ${fmt(value)}${target != null ? `, target ${fmt(target)}` : ""}`}
      >
        <defs>
          <radialGradient id="glossyGaugeBezel" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={p.bezel[0]} />
            <stop offset="55%" stopColor={p.bezel[1]} />
            <stop offset="100%" stopColor={p.bezel[2]} />
          </radialGradient>
          <linearGradient id="glossyGaugeShine" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Bezel (chrome casing) */}
        <circle cx={CX} cy={CY} r={BEZEL_R} fill="url(#glossyGaugeBezel)" />
        {/* Dial face */}
        <circle cx={CX} cy={CY} r={FACE_R} fill={p.face} stroke={p.faceStroke} strokeWidth={1} />

        {/* Color bands */}
        {bands.map((b, i) => (
          <path key={i} d={ringSegmentPath(BAND_OUTER_R, BAND_INNER_R, angleFor(b.from, min, max), angleFor(b.to, min, max))} fill={b.color} />
        ))}

        {/* Tick marks */}
        {ticks.map((angle, i) => {
          const p1 = polar(TICK_INNER_R, angle);
          const p2 = polar(TICK_OUTER_R + 6, angle);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={p.tick} strokeWidth={2} />;
        })}

        {/* Endpoint labels */}
        <text x={minLabelPos.x} y={minLabelPos.y} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 11, fontWeight: 600 }} fill={p.label}>
          {fmt(min)}
        </text>
        <text x={maxLabelPos.x} y={maxLabelPos.y} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 11, fontWeight: 600 }} fill={p.label}>
          {fmt(max)}
        </text>

        {/* Needle + pivot hub */}
        <path d={needlePath(needleAngle)} fill={p.needle} stroke={p.needleStroke} strokeWidth={0.5} />
        <circle cx={CX} cy={CY} r={PIVOT_R} fill={p.pivot} stroke={p.pivotStroke} strokeWidth={1.5} />

        {/* Center readout */}
        <text
          x={CX}
          y={CY + 46}
          textAnchor="middle"
          style={{ fontSize: 26, fontWeight: 700, fontFamily: "'Fira Code Variable', ui-monospace, monospace" }}
          fill={p.readout}
        >
          {fmt(displayValue)}
        </text>

        {/* Glass shine overlay */}
        <circle cx={CX} cy={CY} r={BEZEL_R} fill="url(#glossyGaugeShine)" />
      </svg>
      {target != null ? (
        <p className="text-muted-foreground mt-0.5 text-center text-[11px] leading-tight">
          Target: <span className="text-foreground font-semibold">{fmt(target)}</span>
        </p>
      ) : (
        <div className="h-3" />
      )}
    </div>
  );
}
