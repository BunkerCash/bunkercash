"use client";

import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { TradeInterface } from "@/components/TradeInterface";
import { usePoolStats } from "@/hooks/usePoolStats";

export default function Home() {
  const { stats, loading, error } = usePoolStats();

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Buy Token
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Review the live pool metrics before purchasing Bunker Cash.
            </p>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <StatCard
              label="Current Pool NAV"
              value={
                loading ? (
                  <span className="text-muted-foreground animate-pulse">
                    Loading...
                  </span>
                ) : error ? (
                  <span className="text-destructive text-sm">
                    Error loading stats
                  </span>
                ) : (
                  <span className="text-primary">
                    ${stats.navUsdc ?? "0.00"} USDC
                  </span>
                )
              }
              note="Read directly from the on-chain pool account."
              className="glow-primary"
            />
            <StatCard
              label="Liquid Size"
              value={
                loading ? (
                  <span className="text-muted-foreground animate-pulse">
                    Loading...
                  </span>
                ) : error ? (
                  <span className="text-destructive text-sm">
                    Error loading stats
                  </span>
                ) : (
                  <span className="text-primary">
                    ${stats.treasuryUsdc ?? "0.00"} USDC
                  </span>
                )
              }
              note="Current USDC balance available in the payout vault."
            />
          </div>

          {/* Trade Interface */}
          <div>
            <TradeInterface hiddenTabs={["withdraw"]} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
