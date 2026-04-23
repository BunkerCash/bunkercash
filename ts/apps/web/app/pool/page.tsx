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
  treasury: "hsl(166, 100%, 50%)",
  pending: "hsl(220, 15%, 35%)",
  nav: "hsl(45, 100%, 55%)",
};

const PoolStatus = () => {
  const { stats, loading, error, refresh } = usePoolStats();

  const formatTime = (d: Date | null) => {
    if (!d) return "—";
    return d.toLocaleTimeString();
  };

  const supplyPieData = useMemo(() => {
    if (stats.treasuryUsdcRaw == null || stats.pendingClaimsUsdcRaw == null)
      return null;
    return [
      { name: "Treasury USDC", value: stats.treasuryUsdcRaw },
      { name: "Open Requests", value: stats.pendingClaimsUsdcRaw },
    ];
  }, [stats.treasuryUsdcRaw, stats.pendingClaimsUsdcRaw]);

  const barData = useMemo(() => {
    if (
      stats.navUsdcRaw == null ||
      stats.treasuryUsdcRaw == null ||
      stats.pendingClaimsUsdcRaw == null
    )
      return null;
    return [
      { name: "Reference Value", value: stats.navUsdcRaw },
      { name: "Treasury", value: stats.treasuryUsdcRaw },
      { name: "Open Requests", value: stats.pendingClaimsUsdcRaw },
    ];
  }, [stats.navUsdcRaw, stats.treasuryUsdcRaw, stats.pendingClaimsUsdcRaw]);

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
          <p className="text-muted-foreground">{formatNum(d.value)} USDC</p>
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
              Pool Status
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Read-only protocol transparency for supply, treasury, and open
              request metrics.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 mb-6">
              {error}
            </div>
          )}

          {/* Top row: Reference Rate + Treasury */}
          <div className="grid sm:grid-cols-2 gap-6 mb-6">
            <StatCard
              label="Reference Rate"
              value={
                loading
                  ? renderLoading
                  : (
                    <span className="text-primary">
                      ${stats.pricePerToken?.toFixed(4) ?? "—"} USDC
                    </span>
                  )
              }
              note="Interface reference metric"
              className="glow-primary h-full"
            />
            <StatCard
              label="Treasury Balance"
              value={
                loading
                  ? renderLoading
                  : (
                    <span className="text-foreground">
                      ${stats.treasuryUsdc ?? "0"} USDC
                    </span>
                  )
              }
              note="Protocol treasury balance"
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
              note="Current token supply"
              className="glass-card h-full"
            />
            <StatCard
              label="Open Requests"
              value={
                loading
                  ? renderLoading
                  : (
                    <span className="text-foreground">
                      ${stats.pendingClaimsUsdc ?? "—"} USDC
                    </span>
                  )
              }
              note="Pending settlement requests"
              className="glass-card h-full"
            />
            <StatCard
              label="Circulating Supply"
              value={
                loading
                  ? renderLoading
                  : (
                    <span className="text-primary">
                      {stats.circulatingSupply ?? "—"} BunkerCash
                    </span>
                  )
              }
              note="Requests reduce circulating supply"
              className="glow-primary h-full"
            />
          </div>

          {/* Charts row */}
          {!loading && supplyPieData && barData && (
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Donut: Treasury vs Open Requests */}
              <div className="glass-card p-6">
                <p className="stat-label mb-4">Treasury Breakdown</p>
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
                      <Cell fill={CHART_COLORS.treasury} />
                      <Cell fill={CHART_COLORS.pending} />
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

              {/* Bar: reference value vs treasury vs open requests */}
              <div className="glass-card p-6">
                <p className="stat-label mb-4">Protocol Liquidity Metrics</p>
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
                              ? CHART_COLORS.nav
                              : idx === 1
                                ? CHART_COLORS.treasury
                                : CHART_COLORS.pending
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

          {/* Info + Refresh */}
          <div className="glass-card p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 flex-1">
                <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  All values are read from on-chain data and related protocol
                  state. Displayed metrics are informational only and do not
                  represent guarantees of liquidity, settlement, or value.
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
