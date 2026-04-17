"use client";

import { Layout } from "@/components/layout/Layout";
import { TradeInterface, type TradeTab } from "@/components/TradeInterface";
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

interface TradePageContentProps {
  title: string;
  description: string;
  initialTab?: TradeTab;
  hiddenTabs?: TradeTab[];
}

export function TradePageContent({
  title,
  description,
  initialTab = "buy-primary",
  hiddenTabs = [],
}: TradePageContentProps) {
  const { stats } = usePoolStats();

  const navDisplay = stats.navUsdc != null ? `$${stats.navUsdc} USDC` : "—";
  const liquidDisplay =
    stats.treasuryUsdc != null ? `$${stats.treasuryUsdc} USDC` : "—";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-10 text-center">
            <h1 className="mb-4 text-3xl font-bold text-foreground">{title}</h1>
            <p className="mx-auto max-w-xl text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

          <TradeInterface initialTab={initialTab} hiddenTabs={hiddenTabs} />
        </div>
      </div>
    </Layout>
  );
}
