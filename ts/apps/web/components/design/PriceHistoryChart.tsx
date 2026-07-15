"use client";

import { useMemo, useState } from "react";
import type { PricePoint } from "@/hooks/usePriceHistory";
import { Shimmer } from "./primitives";
import { WarnIcon } from "./icons";

const W = 1000;
const H = 260;
const PAD = 14;

export type ChartPoint = { t: Date; v: number };

export function toChartPoints(data: PricePoint[]): ChartPoint[] {
  return data
    .filter((p): p is { date: string; price: number } => p.price != null)
    .map((p) => ({ t: new Date(p.date), v: p.price }));
}

/** Builds SVG line/area path data for a series inside a W×H viewBox. */
export function chartGeometry(
  values: number[],
  w = W,
  h = H,
  padTop = PAD,
  padBot = PAD,
) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 0.001;
  const lo = min - span * 0.08;
  const hi = max + span * 0.08;
  const ih = h - padTop - padBot;
  const xy: [number, number][] = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    padTop + ih - ((v - lo) / (hi - lo)) * ih,
  ]);
  let d = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
  for (let i = 1; i < xy.length; i++) {
    d += `L${xy[i][0].toFixed(1)},${xy[i][1].toFixed(1)}`;
  }
  return {
    d,
    area: `${d}L${w},${h - padBot}L0,${h - padBot}Z`,
    xy,
    lo,
    hi,
  };
}

function fmtTime(t: Date): string {
  return t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(t: Date): string {
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * The interactive reference-rate chart from the design: gridlines, open
 * reference line, hover crosshair with tooltip, axis tick labels.
 */
export function PriceHistoryChart({
  points,
  intraday,
}: {
  points: ChartPoint[];
  /** Use time-of-day x labels (24H period) instead of dates. */
  intraday?: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const values = useMemo(() => points.map((p) => p.v), [points]);
  const g = useMemo(() => chartGeometry(values), [values]);

  const yTicks = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const frac = i / 3;
      const val = g.hi - (g.hi - g.lo) * frac;
      const y = PAD + (H - PAD * 2) * frac;
      return {
        y,
        pct: `${((y / H) * 100).toFixed(2)}%`,
        label: val.toFixed(4),
      };
    });
  }, [g]);

  const xTicks = useMemo(() => {
    const n = points.length;
    return Array.from({ length: 5 }, (_, i) => {
      const p = points[Math.round(((n - 1) * i) / 4)];
      return intraday ? fmtTime(p.t) : fmtDay(p.t);
    });
  }, [points, intraday]);

  const refVal = values[0];
  const refY = PAD + (H - PAD * 2) * ((g.hi - refVal) / (g.hi - g.lo));

  const hovering = hoverIdx != null && g.xy[hoverIdx] != null;
  const hx = hovering ? g.xy[hoverIdx!][0] : -30;
  const hy = hovering ? g.xy[hoverIdx!][1] : -30;
  let tipTime = "";
  let tipVal = "";
  let tipDelta = "";
  let tipDeltaUp = true;
  if (hovering) {
    const p = points[hoverIdx!];
    tipTime = `${fmtDay(p.t)}, ${fmtTime(p.t)}`;
    tipVal = `${p.v.toFixed(4)} USDC`;
    const dl = (p.v / values[0] - 1) * 100;
    tipDeltaUp = dl >= 0;
    tipDelta = `${dl >= 0 ? "+" : "−"}${Math.abs(dl).toFixed(2)}%`;
  }

  const last = values[values.length - 1];

  return (
    <div className="px-[18px] pb-3 pt-[18px]">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`BNKR reference rate history, currently ${last.toFixed(4)} USDC`}
          className="block h-[220px] w-full cursor-crosshair desk:h-[264px]"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            setHoverIdx(Math.round(fx * (points.length - 1)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {yTicks.map((t) => (
            <line
              key={t.pct}
              x1="0"
              y1={t.y}
              x2={W}
              y2={t.y}
              style={{ stroke: "var(--line)", strokeWidth: 1 }}
            />
          ))}
          <line
            x1="0"
            y1={refY}
            x2={W}
            y2={refY}
            strokeDasharray="4 5"
            style={{ stroke: "var(--text-3)", strokeWidth: 1, opacity: 0.55 }}
          />
          <path d={g.area} style={{ fill: "var(--mint)", opacity: 0.06 }} />
          <path
            d={g.d}
            vectorEffect="non-scaling-stroke"
            style={{
              fill: "none",
              stroke: "var(--mint)",
              strokeWidth: 1.6,
              strokeLinejoin: "round",
            }}
          />
          <line
            x1={hx}
            y1="0"
            x2={hx}
            y2={H}
            style={{
              stroke: "var(--line-2)",
              strokeWidth: 1,
              opacity: hovering ? 1 : 0,
            }}
          />
          <circle
            cx={hx}
            cy={hy}
            r="3.2"
            style={{ fill: "var(--mint)", opacity: hovering ? 1 : 0 }}
          />
        </svg>

        {yTicks.map((t) => (
          <span
            key={t.pct}
            className="absolute right-0 -translate-y-full bg-surface pb-0.5 pl-1.5 font-mono text-[11px] tabular-nums text-ink-3"
            style={{ top: t.pct }}
          >
            {t.label}
          </span>
        ))}
        <span
          className="absolute right-0 -translate-y-1/2 bg-surface py-px pl-1.5 font-mono text-[10.5px] tabular-nums text-ink-3"
          style={{ top: `${((refY / H) * 100).toFixed(2)}%` }}
        >
          open {refVal.toFixed(4)}
        </span>

        <div
          className="pointer-events-none absolute top-2.5 flex flex-col gap-0.5 whitespace-nowrap rounded-lg border border-line-2 bg-surface-2 px-[11px] py-2 shadow-pop transition-opacity"
          style={{
            left: `min(max(${((hx / W) * 100).toFixed(1)}% - 70px, 8px), calc(100% - 170px))`,
            opacity: hovering ? 1 : 0,
          }}
        >
          <span className="text-[11.5px] text-ink-3">{tipTime}</span>
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold tabular-nums">
              {tipVal}
            </span>
            <span
              className={`font-mono text-[11.5px] tabular-nums ${tipDeltaUp ? "text-mint" : "text-sell"}`}
            >
              {tipDelta}
            </span>
          </span>
        </div>
      </div>

      <div className="flex justify-between pt-2.5">
        {xTicks.map((x, i) => (
          <span key={i} className="font-mono text-[11px] text-ink-3">
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Shimmer skeleton matching the chart's footprint. */
export function ChartLoading() {
  return (
    <div
      role="status"
      aria-label="Loading price history"
      className="flex flex-col gap-2.5 p-[18px]"
    >
      <Shimmer className="h-[220px] desk:h-[264px]" />
      <div className="flex justify-between">
        <div className="h-2.5 w-[60px] rounded-[5px] bg-surface-2" />
        <div className="h-2.5 w-[60px] rounded-[5px] bg-surface-2" />
        <div className="h-2.5 w-[60px] rounded-[5px] bg-surface-2" />
      </div>
    </div>
  );
}

/** Error state with a retry action. */
export function ChartError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-16 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-danger-line bg-danger-soft text-danger">
        <WarnIcon size={16} />
      </span>
      <span className="text-[14.5px] font-semibold">
        Price data unavailable
      </span>
      <span className="max-w-[380px] text-[13px] text-ink-2">
        The data endpoint did not respond. Your funds are unaffected — this
        view is read-only.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1.5 h-[34px] rounded-lg border border-line-2 bg-surface-2 px-4 text-[13px] font-semibold transition-colors hover:border-mint-line"
      >
        Retry connection
      </button>
    </div>
  );
}
