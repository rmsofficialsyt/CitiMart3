import { animate } from "framer-motion";
import { useTheme } from "next-themes";
import { useEffect, useId, useRef, useState } from "react";

import type { GaugeSpec } from "@/lib/types";

/** A luxury chronometer-grade analog speedometer gauge featuring:
 * - Multi-layer brushed titanium & chrome bezel with depth bevels
 * - Dynamic status-tinted ambient dial back-glow
 * - Active value glowing progress arc track
 * - Aerodynamic dual-tone 3D needle with drop shadow and authentic spring settling physics
 * - Chromed multi-ring hub pivot with illuminated center jewel
 * - Precision sub-ticks and target milestone diamond marker
 * - Convex sapphire crystal glass reflections
 * - High-contrast digital HUD readout */

const CX = 150;
const CY = 150;
const START_ANGLE = 135; // degrees; 0deg = 3 o'clock, clockwise
const SWEEP = 270; // 270-degree arc
const BEZEL_OUTER_R = 136;
const BEZEL_R = 126;
const BEZEL_INNER_R = 118;
const FACE_R = 114;
const BAND_OUTER_R = 108;
const BAND_INNER_R = 88;
const TICK_OUTER_R = 108;
const TICK_INNER_R = 98;
const SUBTICK_INNER_R = 102;
const NEEDLE_LENGTH = 80;
const NEEDLE_BASE = 7.5;
const PIVOT_OUTER_R = 14;
const PIVOT_R = 9;
const LABEL_R = BEZEL_R + 13;
const TICK_COUNT = 8;
const SUBTICK_INTERVAL = 4; // 4 subticks per major tick

interface GaugePalette {
  red: string;
  yellow: string;
  green: string;
  bezelOuter: string;
  bezelGrad: [string, string, string, string];
  bezelInner: string;
  face: string;
  faceStroke: string;
  faceRing: string;
  tick: string;
  subtick: string;
  label: string;
  needleLeft: string;
  needleRight: string;
  needleStroke: string;
  pivotRing: string;
  pivot: string;
  pivotJewel: string;
  readout: string;
  readoutBg: string;
  readoutBorder: string;
  activeArcGlow: string;
  naBezel: string;
  naFace: string;
  naText: string;
}

const DEFAULT_PALETTE: GaugePalette = {
  red: "#f43f5e",
  yellow: "#f59e0b",
  green: "#10b981",
  bezelOuter: "#334155",
  bezelGrad: ["#cbd5e1", "#64748b", "#334155", "#1e293b"],
  bezelInner: "#0f172a",
  face: "#f8fafc",
  faceStroke: "#e2e8f0",
  faceRing: "#f1f5f9",
  tick: "#1e293b",
  subtick: "#94a3b8",
  label: "#64748b",
  needleLeft: "#f43f5e",
  needleRight: "#be123c",
  needleStroke: "#9f1239",
  pivotRing: "#cbd5e1",
  pivot: "#1e293b",
  pivotJewel: "#38bdf8",
  readout: "#0f172a",
  readoutBg: "#ffffff",
  readoutBorder: "#cbd5e1",
  activeArcGlow: "rgba(56, 189, 248, 0.4)",
  naBezel: "#94a3b8",
  naFace: "#f1f5f9",
  naText: "#94a3b8",
};

const DARK_PALETTE: GaugePalette = {
  red: "#fb7185",
  yellow: "#fbbf24",
  green: "#34d399",
  bezelOuter: "#1e293b",
  bezelGrad: ["#475569", "#334155", "#1e293b", "#0f172a"],
  bezelInner: "#090d16",
  face: "#0f172a",
  faceStroke: "#1e293b",
  faceRing: "#172033",
  tick: "#e2e8f0",
  subtick: "#475569",
  label: "#94a3b8",
  needleLeft: "#38bdf8",
  needleRight: "#0284c7",
  needleStroke: "#0369a1",
  pivotRing: "#475569",
  pivot: "#090d16",
  pivotJewel: "#38bdf8",
  readout: "#f8fafc",
  readoutBg: "#0b1120",
  readoutBorder: "#1e293b",
  activeArcGlow: "rgba(56, 189, 248, 0.5)",
  naBezel: "#334155",
  naFace: "#0f172a",
  naText: "#64748b",
};

const NEON_PALETTE: GaugePalette = {
  red: "#fb7185",
  yellow: "#facc15",
  green: "#34d399",
  bezelOuter: "#1e1b4b",
  bezelGrad: ["#6366f1", "#4338ca", "#1e1b4b", "#090514"],
  bezelInner: "#090514",
  face: "#0d1124",
  faceStroke: "rgba(99, 102, 241, 0.3)",
  faceRing: "#141936",
  tick: "#a5b4fc",
  subtick: "#4f46e5",
  label: "#c7d2fe",
  needleLeft: "#22d3ee",
  needleRight: "#0891b2",
  needleStroke: "#06b6d4",
  pivotRing: "#6366f1",
  pivot: "#090514",
  pivotJewel: "#22d3ee",
  readout: "#e0e7ff",
  readoutBg: "#080c1d",
  readoutBorder: "#4338ca",
  activeArcGlow: "rgba(34, 211, 238, 0.6)",
  naBezel: "#312e81",
  naFace: "#0d1124",
  naText: "#6366f1",
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

/** Annular donut segment from startDeg to endDeg */
function ringSegmentPath(rOuter: number, rInner: number, startDeg: number, endDeg: number): string {
  if (endDeg <= startDeg) return "";
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const p1 = polar(rOuter, startDeg);
  const p2 = polar(rOuter, endDeg);
  const p3 = polar(rInner, endDeg);
  const p4 = polar(rInner, startDeg);
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
}

/** Arc line from startDeg to endDeg */
function arcPath(r: number, startDeg: number, endDeg: number): string {
  if (endDeg <= startDeg) return "";
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const p1 = polar(r, startDeg);
  const p2 = polar(r, endDeg);
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`;
}

/** Dual-tone 3D faceted needle with center ridge */
function needlePaths(angleDeg: number): { leftPath: string; rightPath: string; shadowPath: string } {
  const tip = polar(NEEDLE_LENGTH, angleDeg);
  const left = polar(NEEDLE_BASE, angleDeg + 90);
  const right = polar(NEEDLE_BASE, angleDeg - 90);
  const tail = polar(NEEDLE_BASE * 1.5, angleDeg + 180);

  // Slight offset for drop shadow
  const shadowTip = polar(NEEDLE_LENGTH, angleDeg + 2);
  const shadowLeft = polar(NEEDLE_BASE + 2, angleDeg + 92);
  const shadowRight = polar(NEEDLE_BASE - 1, angleDeg - 88);
  const shadowTail = polar(NEEDLE_BASE * 1.5 + 2, angleDeg + 182);

  const leftPath = `M ${tail.x} ${tail.y} L ${left.x} ${left.y} L ${tip.x} ${tip.y} Z`;
  const rightPath = `M ${tail.x} ${tail.y} L ${tip.x} ${tip.y} L ${right.x} ${right.y} Z`;
  const shadowPath = `M ${shadowTail.x} ${shadowTail.y + 4} L ${shadowLeft.x} ${shadowLeft.y + 4} L ${shadowTip.x} ${shadowTip.y + 4} L ${shadowRight.x} ${shadowRight.y + 4} Z`;

  return { leftPath, rightPath, shadowPath };
}

function fmtGaugeValue(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return rounded.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

export function GlossyGauge({ spec, className, neon }: { spec: GaugeSpec; className?: string; neon?: boolean }) {
  const { theme, resolvedTheme } = useTheme();
  const isNeon = neon ?? theme === "neon";
  const isDark = isNeon ? false : resolvedTheme === "dark" || theme === "dark";
  const p = isNeon ? NEON_PALETTE : isDark ? DARK_PALETTE : DEFAULT_PALETTE;

  const uniqueId = useId().replace(/:/g, "");
  const wrapperClass = className ?? "h-[160px] sm:h-[180px] w-full";
  const min = spec.min ?? 0;

  const [displayValue, setDisplayValue] = useState<number>(min);
  const currentValueRef = useRef(displayValue);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (spec.value == null) return;
    const from = mountedRef.current ? currentValueRef.current : min;
    mountedRef.current = true;
    
    // Smooth spring-damped analog needle motion
    const controls = animate(from, spec.value, {
      duration: 1.05,
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
        {spec.title && (
          <p className="text-muted-foreground mb-1 text-center text-xs font-semibold tracking-wide truncate w-full">
            {spec.title}
          </p>
        )}
        <svg viewBox="0 0 300 300" className="h-full max-h-[135px] w-full max-w-[135px]" role="img" aria-label={`${spec.title}: not available`}>
          <circle cx={CX} cy={CY} r={BEZEL_OUTER_R} fill={p.bezelOuter} />
          <circle cx={CX} cy={CY} r={BEZEL_R} fill={p.naBezel} />
          <circle cx={CX} cy={CY} r={FACE_R} fill={p.naFace} />
          <text
            x={CX}
            y={CY + 8}
            textAnchor="middle"
            style={{ fontSize: 24, fontWeight: 700, fontFamily: "'Fira Code Variable', monospace" }}
            fill={p.naText}
          >
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

  // Determine current active zone color for ambient halo
  let activeZoneColor = p.green;
  if (!reverse) {
    if (displayValue < redBelow) activeZoneColor = p.red;
    else if (displayValue < greenAt) activeZoneColor = p.yellow;
  } else {
    if (displayValue > redBelow) activeZoneColor = p.red;
    else if (displayValue > greenAt) activeZoneColor = p.yellow;
  }

  const needleAngle = angleFor(displayValue, min, max);
  const targetAngle = target != null ? angleFor(target, min, max) : null;
  const { leftPath, rightPath, shadowPath } = needlePaths(needleAngle);

  // Generate major and minor ticks
  const majorTicks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => START_ANGLE + (i / TICK_COUNT) * SWEEP);
  const subTicks: number[] = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    const step = SWEEP / TICK_COUNT;
    const subStep = step / SUBTICK_INTERVAL;
    for (let j = 1; j < SUBTICK_INTERVAL; j++) {
      subTicks.push(START_ANGLE + i * step + j * subStep);
    }
  }

  const minLabelPos = polar(LABEL_R, START_ANGLE);
  const maxLabelPos = polar(LABEL_R, START_ANGLE + SWEEP);

  return (
    <div className={`group flex flex-col items-center justify-center p-1 select-none transition-transform duration-300 ${wrapperClass}`}>
      {spec.title && (
        <p className="text-muted-foreground group-hover:text-foreground mb-1 text-center text-xs font-semibold tracking-wide truncate w-full transition-colors">
          {spec.title}
        </p>
      )}
      <svg
        viewBox="0 0 300 300"
        className="h-full max-h-[132px] sm:max-h-[142px] w-full max-w-[145px] shrink-0 filter drop-shadow-md"
        role="img"
        aria-label={`${spec.title}: ${fmt(value)}${target != null ? `, target ${fmt(target)}` : ""}`}
      >
        <defs>
          {/* Metallic outer bezel gradient */}
          <radialGradient id={`bezelOuter_${uniqueId}`} cx="40%" cy="30%" r="70%">
            <stop offset="0%" stopColor={p.bezelGrad[0]} />
            <stop offset="45%" stopColor={p.bezelGrad[1]} />
            <stop offset="85%" stopColor={p.bezelGrad[2]} />
            <stop offset="100%" stopColor={p.bezelGrad[3]} />
          </radialGradient>

          {/* Inner bezel chamfer */}
          <radialGradient id={`bezelInner_${uniqueId}`} cx="50%" cy="50%" r="50%">
            <stop offset="80%" stopColor={p.bezelInner} stopOpacity="0.4" />
            <stop offset="100%" stopColor={p.bezelInner} stopOpacity="0.9" />
          </radialGradient>

          {/* Ambient zone glow inside face */}
          <radialGradient id={`ambientHalo_${uniqueId}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={activeZoneColor} stopOpacity="0.18" />
            <stop offset="70%" stopColor={activeZoneColor} stopOpacity="0.04" />
            <stop offset="100%" stopColor={activeZoneColor} stopOpacity="0" />
          </radialGradient>

          {/* Convex glass reflection */}
          <linearGradient id={`glassReflection_${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Dynamic glowing active arc filter */}
          <filter id={`glow_${uniqueId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. Bezel casing (multi-layered titanium/chrome) */}
        <circle cx={CX} cy={CY} r={BEZEL_OUTER_R} fill={p.bezelOuter} />
        <circle cx={CX} cy={CY} r={BEZEL_R} fill={`url(#bezelOuter_${uniqueId})`} />
        <circle cx={CX} cy={CY} r={BEZEL_INNER_R} fill={`url(#bezelInner_${uniqueId})`} />

        {/* 2. Dial face */}
        <circle cx={CX} cy={CY} r={FACE_R} fill={p.face} stroke={p.faceStroke} strokeWidth={1.5} />
        <circle cx={CX} cy={CY} r={FACE_R - 6} fill="none" stroke={p.faceRing} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />

        {/* Ambient active zone back-glow */}
        <circle cx={CX} cy={CY} r={FACE_R - 4} fill={`url(#ambientHalo_${uniqueId})`} />

        {/* 3. Color threshold bands */}
        {bands.map((b, i) => (
          <path
            key={i}
            d={ringSegmentPath(BAND_OUTER_R, BAND_INNER_R, angleFor(b.from, min, max), angleFor(b.to, min, max))}
            fill={b.color}
            opacity={0.88}
          />
        ))}

        {/* Active glowing progress arc line on inner track */}
        <path
          d={arcPath(BAND_INNER_R + 1, START_ANGLE, needleAngle)}
          fill="none"
          stroke={activeZoneColor}
          strokeWidth={3}
          strokeLinecap="round"
          filter={`url(#glow_${uniqueId})`}
        />

        {/* 4. Sub-ticks (intermediate micro-ticks) */}
        {subTicks.map((angle, i) => {
          const p1 = polar(SUBTICK_INNER_R, angle);
          const p2 = polar(TICK_OUTER_R, angle);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={p.subtick} strokeWidth={1} opacity={0.7} />;
        })}

        {/* Major ticks */}
        {majorTicks.map((angle, i) => {
          const p1 = polar(TICK_INNER_R, angle);
          const p2 = polar(TICK_OUTER_R + 3, angle);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={p.tick} strokeWidth={2} strokeLinecap="round" />;
        })}

        {/* Target Milestone Indicator Pin on Arc */}
        {targetAngle != null && (
          <g transform={`rotate(${targetAngle}, ${CX}, ${CY})`}>
            <polygon
              points={`${CX + BAND_OUTER_R + 4},${CY} ${CX + BAND_OUTER_R - 2},${CY - 3.5} ${CX + BAND_INNER_R},${CY} ${CX + BAND_OUTER_R - 2},${CY + 3.5}`}
              fill="#38bdf8"
              stroke="#0369a1"
              strokeWidth={0.75}
            />
          </g>
        )}

        {/* 5. Scale Endpoint Labels */}
        <text
          x={minLabelPos.x}
          y={minLabelPos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Geist Variable', sans-serif" }}
          fill={p.label}
        >
          {fmt(min)}
        </text>
        <text
          x={maxLabelPos.x}
          y={maxLabelPos.y}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Geist Variable', sans-serif" }}
          fill={p.label}
        >
          {fmt(max)}
        </text>

        {/* 6. Target readout in bottom gap */}
        {target != null && (
          <g>
            <rect
              x={CX - 42}
              y={228}
              width={84}
              height={20}
              rx={6}
              fill={p.readoutBg}
              stroke={p.readoutBorder}
              strokeWidth={0.75}
              opacity={0.9}
            />
            <text
              x={CX}
              y={241}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 9.5, fontWeight: 600 }}
              fill={p.label}
            >
              Tgt: <tspan fill={p.readout} fontWeight="700">{fmt(target)}</tspan>
            </text>
          </g>
        )}

        {/* 7. Center Digital HUD Readout Box */}
        <g>
          <rect
            x={CX - 46}
            y={CY + 18}
            width={92}
            height={28}
            rx={6}
            fill={p.readoutBg}
            stroke={p.readoutBorder}
            strokeWidth={1}
            opacity={0.95}
          />
          <text
            x={CX}
            y={CY + 36}
            textAnchor="middle"
            style={{
              fontSize: 17,
              fontWeight: 800,
              fontFamily: "'Fira Code Variable', ui-monospace, monospace",
              letterSpacing: "-0.5px",
            }}
            fill={p.readout}
          >
            {fmt(displayValue)}
          </text>
        </g>

        {/* 8. 3D Aerodynamic Needle with Real-time Drop Shadow */}
        <path d={shadowPath} fill="rgba(0,0,0,0.35)" />
        <path d={leftPath} fill={p.needleLeft} />
        <path d={rightPath} fill={p.needleRight} />
        <line
          x1={polar(NEEDLE_BASE * 1.5, needleAngle + 180).x}
          y1={polar(NEEDLE_BASE * 1.5, needleAngle + 180).y}
          x2={polar(NEEDLE_LENGTH, needleAngle).x}
          y2={polar(NEEDLE_LENGTH, needleAngle).y}
          stroke={p.needleStroke}
          strokeWidth={0.5}
        />

        {/* 9. Chromed Multi-Ring Pivot Hub with Center Jewel */}
        <circle cx={CX} cy={CY} r={PIVOT_OUTER_R} fill={p.pivotRing} stroke={p.bezelInner} strokeWidth={1} />
        <circle cx={CX} cy={CY} r={PIVOT_R} fill={p.pivot} />
        <circle cx={CX} cy={CY} r={4} fill={p.pivotJewel} filter={`url(#glow_${uniqueId})`} />
        <circle cx={CX - 1.5} cy={CY - 1.5} r={1.2} fill="#ffffff" opacity={0.8} />

        {/* 10. Convex Glass Lens Shine Overlay */}
        <circle cx={CX} cy={CY} r={BEZEL_R} fill={`url(#glassReflection_${uniqueId})`} pointerEvents="none" />
      </svg>
    </div>
  );
}
