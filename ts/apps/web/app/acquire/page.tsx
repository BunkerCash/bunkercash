"use client";

import { Layout } from "@/components/layout/Layout";
import { TradeInterface } from "@/components/TradeInterface";
import { usePoolStats } from "@/hooks/usePoolStats";

function PoolMetricCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="mb-2 text-sm text-neutral-400">{label}</div>
      <div className="text-2xl font-bold text-[#00FFB2]">{value}</div>
      <div className="mt-2 text-xs text-neutral-500">{subtitle}</div>
    </div>
  );
}

export default function AcquireTokens() {
  const { stats } = usePoolStats();

  const navDisplay =
    stats.navUsdc != null ? `$${stats.navUsdc} USDC` : "—";
  const liquidDisplay =
    stats.treasuryUsdc != null ? `$${stats.treasuryUsdc} USDC` : "—";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Acquire Tokens
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Eligible users may acquire protocol tokens through the interface
              below, subject to access restrictions and available protocol
              parameters.
            </p>
          </div>

          {/* Pool Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <PoolMetricCard
              label="Current Reference Value"
              value={navDisplay}
              subtitle="Read directly from the on-chain pool account."
            />
            <PoolMetricCard
              label="Liquid Size"
              value={liquidDisplay}
              subtitle="Current USDC balance available in the payout vault."
            />
          </div>

          <div>
            <TradeInterface hiddenTabs={["withdraw"]} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
