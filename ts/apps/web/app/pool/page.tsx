"use client";

import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { Info, RefreshCw } from "lucide-react";
import { usePoolStats } from "@/hooks/usePoolStats";

const PoolStatus = () => {
  const { stats, loading, error, refresh } = usePoolStats();

  const formatTime = (d: Date | null) => {
    if (!d) return "—";
    return d.toLocaleTimeString();
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
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

          {/* Main Stats Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div>
              <StatCard
                label="Token Price"
                value={
                  loading ? (
                    <span className="text-muted-foreground text-2xl animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    <span className="text-primary">
                      ${stats.pricePerToken?.toFixed(4) ?? "—"} USDC
                    </span>
                  )
                }
                note="Fixed primary sale price"
                className="glow-primary h-full"
              />
            </div>

            <div>
              <StatCard
                label="Treasury USDC"
                value={
                  loading ? (
                    <span className="text-muted-foreground text-2xl animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    <span className="text-foreground">
                      ${stats.treasuryUsdc ?? "0"} USDC
                    </span>
                  )
                }
                note="Payout vault balance"
                className="glass-card h-full"
              />
            </div>

            <div>
              <StatCard
                label="Total Supply"
                value={
                  loading ? (
                    <span className="text-muted-foreground text-2xl animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    <span className="text-foreground">
                      {stats.totalSupply ?? "—"} BNKR
                    </span>
                  )
                }
                note="All minted tokens"
                className="glass-card h-full"
              />
            </div>

            <div>
              <StatCard
                label="Circulating Supply"
                value={
                  loading ? (
                    <span className="text-muted-foreground text-2xl animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    <span className="text-primary">
                      {stats.circulatingSupply ?? "—"} BNKR
                    </span>
                  )
                }
                note="Freely tradable tokens"
                className="glow-primary h-full"
              />
            </div>

            <div>
              <StatCard
                label="Locked Supply"
                value={
                  loading ? (
                    <span className="text-muted-foreground text-2xl animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    <span className="text-foreground">
                      {stats.lockedSupply ?? "—"} BNKR
                    </span>
                  )
                }
                note="In open sell registrations"
                className="glass-card h-full"
              />
            </div>

            <div>
              <StatCard
                label="Unlocked Supply"
                value={
                  loading ? (
                    <span className="text-muted-foreground text-2xl animate-pulse">
                      Loading...
                    </span>
                  ) : (
                    <span className="text-foreground">
                      {stats.circulatingSupply ?? "—"} BNKR
                    </span>
                  )
                }
                note="Same as circulating (not locked)"
                className="glass-card h-full"
              />
            </div>
          </div>

          {/* Refresh + Info */}
          <div className="grid md:grid-cols-1 gap-6 mb-8">
            <div className="glass-card p-6 h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 flex-1">
                  <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    All values are read directly from the Solana blockchain.
                    &quot;Treasury USDC&quot; is the payout vault balance.
                    Supply metrics are derived from the Token-2022 mint and open
                    claim accounts.
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
      </div>
    </Layout>
  );
};

export default PoolStatus;
