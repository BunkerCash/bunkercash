"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { usePriceHistory, type PricePoint } from "@/hooks/usePriceHistory";
import { formatPriceChartDate } from "./priceChartFormat";

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: PricePoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!;
  return (
    <div
      style={{
        background: "rgba(8, 12, 24, 0.92)",
        border: "1px solid rgba(0, 229, 255, 0.25)",
        borderRadius: 10,
        padding: "8px 12px",
        backdropFilter: "blur(8px)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
          letterSpacing: "0.06em",
        }}
      >
        {point.payload.date}
      </p>
      <p
        style={{
          margin: "2px 0 0",
          fontSize: 15,
          fontWeight: 700,
          color: "#fff",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        ${point.value?.toFixed(4) ?? "—"}
      </p>
    </div>
  );
}

export function PriceChart({ days = 30 }: { days?: number }) {
  const { data, loading } = usePriceHistory(days);

  const validPoints = data.filter(
    (d): d is PricePoint & { price: number } => d.price != null,
  );

  if (loading) {
    return (
      <div className="hp-chart-wrap">
        <div className="hp-chart-loading">Loading chart…</div>
        <style jsx>{chartStyles}</style>
      </div>
    );
  }

  if (validPoints.length === 0) {
    return (
      <div className="hp-chart-wrap">
        <div className="hp-chart-empty">
          Price history will appear after a few days of data collection.
        </div>
        <style jsx>{chartStyles}</style>
      </div>
    );
  }

  const chartData =
    validPoints.length === 1
      ? [
          {
            date: `${validPoints[0]!.date} (open)`,
            price: validPoints[0]!.price,
          },
          validPoints[0]!,
        ]
      : validPoints;

  const prices = chartData.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.15 || 0.01;

  return (
    <div className="hp-chart-wrap">
      <div className="hp-chart-header">
        <span className="hp-chart-title">PRICE HISTORY</span>
        <span className="hp-chart-range">{days}D</span>
      </div>

      <div className="hp-chart-container">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00e5ff" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#00e5ff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatPriceChartDate}
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              width={52}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{
                stroke: "rgba(0, 229, 255, 0.2)",
                strokeDasharray: "4 4",
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#00e5ff"
              strokeWidth={2}
              fill="url(#priceGrad)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "#00e5ff",
                stroke: "#080c18",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <style jsx>{chartStyles}</style>
    </div>
  );
}

const chartStyles = `
  .hp-chart-wrap {
    width: 100%;
    border-radius: 16px;
    border: 1px solid rgba(0, 229, 255, 0.12);
    background: rgba(8, 12, 24, 0.55);
    backdrop-filter: blur(12px);
    overflow: hidden;
  }
  .hp-chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.1rem 0;
  }
  .hp-chart-title {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    color: rgba(255, 255, 255, 0.45);
    text-transform: uppercase;
  }
  .hp-chart-range {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: #00e5ff;
    padding: 0.2rem 0.5rem;
    border-radius: 6px;
    background: rgba(0, 229, 255, 0.08);
    border: 1px solid rgba(0, 229, 255, 0.15);
  }
  .hp-chart-container {
    padding: 0.5rem 0.25rem 0.5rem 0;
  }
  .hp-chart-loading,
  .hp-chart-empty {
    padding: 2.5rem 1.25rem;
    text-align: center;
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: 0.04em;
  }
  .hp-chart-loading {
    animation: blink 1.4s ease-in-out infinite;
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;
