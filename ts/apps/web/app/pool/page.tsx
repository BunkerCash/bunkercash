"use client";

import { useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { Info, RefreshCw } from "lucide-react";
import { usePoolStats } from "@/hooks/usePoolStats";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const CHART_COLORS = {
  circulating: "hsl(166, 100%, 50%)", // primary / teal
  locked: "hsl(220, 15%, 35%)", // muted gray
  treasury: "hsl(45, 100%, 55%)", // gold accent
  price: "hsl(166, 100%, 50%)",
};

const PoolStatus = () => {
  const { stats, loading, error, refresh } = usePoolStats();

  const formatTime = (d: Date | null) => {
    if (!d) return "—";
    return d.toLocaleTimeString();
  };

  const supplyPieData = useMemo(() => {
    if (stats.circulatingSupplyRaw == null || stats.lockedSupplyRaw == null)
      return null;
    return [
      { name: "Circulating", value: stats.circulatingSupplyRaw },
      { name: "Locked", value: stats.lockedSupplyRaw },
    ];
  }, [stats.circulatingSupplyRaw, stats.lockedSupplyRaw]);

  const barData = useMemo(() => {
    if (
      stats.totalSupplyRaw == null ||
      stats.circulatingSupplyRaw == null ||
      stats.lockedSupplyRaw == null
    )
      return null;
    return [
      { name: "Total", value: stats.totalSupplyRaw },
      { name: "Circulating", value: stats.circulatingSupplyRaw },
      { name: "Locked", value: stats.lockedSupplyRaw },
    ];
  }, [stats.totalSupplyRaw, stats.circulatingSupplyRaw, stats.lockedSupplyRaw]);

  const formatNum = (v: number) =>
    v.toLocaleString(undefined, { maximumFractionDigits: 2 });

  const CustomTooltipContent = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; payload: { name: string } }>;
  }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
        <p className="text-foreground font-medium">{d.payload.name}</p>
        <p className="text-muted-foreground">{formatNum(d.value)} BNKR</p>
      </div>
    );
  };

  const renderLoading = (
    <span className="text-muted-foreground text-2xl animate-pulse">
      Loading...
    </span>
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Liquidity Pool Status
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Real-time transparency into the pool, supply metrics, and active
              claims. This page is read-only.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 mb-6">
              {error}
            </div>
          )}

          {/* Top row: Price + Treasury */}
          <div className="grid sm:grid-cols-2 gap-6 mb-6">
            <StatCard
              label="Token Price"
              value={
                loading
                  ? renderLoading
                  : (
                    <span className="text-primary">
                      ${stats.pricePerToken?.toFixed(4) ?? "—"} USDC
                    </span>
                  )
              }
              note="Fixed primary sale price"
              className="glow-primary h-full"
            />
            <StatCard
              label="Treasury USDC"
              value={
                loading
                  ? renderLoading
                  : (
                    <span className="text-foreground">
                      ${stats.treasuryUsdc ?? "0"} USDC
                    </span>
                  )
              }
              note="Payout vault balance"
              className="glass-card h-full"
            />
          </div>

          {/* Supply stats row */}
          <div className="grid sm:grid-cols-3 gap-6 mb-8">
            <StatCard
              label="Total Supply"
              value={
                loading
                  ? renderLoading
                  : (
                    <span className="text-foreground">
                      {stats.totalSupply ?? "—"} BNKR
                    </span>
                  )
              }
              note="All minted tokens"
              className="glass-card h-full"
            />
            <StatCard
              label="Locked Supply"
              value={
                loading
                  ? renderLoading
                  : (
                    <span className="text-foreground">
                      {stats.lockedSupply ?? "—"} BNKR
                    </span>
                  )
              }
              note="In open sell registrations"
              className="glass-card h-full"
            />
            <StatCard
              label="Circulating Supply"
              value={
                loading
                  ? renderLoading
                  : (
                    <span className="text-primary">
                      {stats.circulatingSupply ?? "—"} BNKR
                    </span>
                  )
              }
              note="Total − Locked"
              className="glow-primary h-full"
            />
          </div>

          {/* Charts row */}
          {!loading && supplyPieData && barData && (
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Donut: Circulating vs Locked */}
              <div className="glass-card p-6">
                <p className="stat-label mb-4">Supply Breakdown</p>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={supplyPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill={CHART_COLORS.circulating} />
                      <Cell fill={CHART_COLORS.locked} />
                    </Pie>
                    <Tooltip content={<CustomTooltipContent />} />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => (
                        <span className="text-xs text-muted-foreground">
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Bar: Supply comparison */}
              <div className="glass-card p-6">
                <p className="stat-label mb-4">Supply Comparison</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={barData}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "hsl(220, 15%, 65%)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "hsl(220, 15%, 65%)", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) =>
                        v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1_000
                            ? `${(v / 1_000).toFixed(1)}K`
                            : v.toString()
                      }
                      width={52}
                    />
                    <Tooltip content={<CustomTooltipContent />} cursor={false} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                      {barData.map((entry, idx) => (
                        <Cell
                          key={entry.name}
                          fill={
                            idx === 0
                              ? CHART_COLORS.price
                              : idx === 1
                                ? CHART_COLORS.circulating
                                : CHART_COLORS.locked
                          }
                          fillOpacity={idx === 0 ? 0.3 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Refresh + Info */}
          <div className="glass-card p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 flex-1">
                <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  All values are read directly from the Solana blockchain.
                  &quot;Treasury USDC&quot; is the payout vault balance. Supply
                  metrics are derived from the Token-2022 mint and open claim
                  accounts.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Last refreshed: {formatTime(stats.lastRefreshed)}
              </span>
              <button
                onClick={() => void refresh()}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PoolStatus;
