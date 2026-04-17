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

          <div className="mt-8 rounded-2xl border border-yellow-800/40 bg-yellow-950/20 p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-yellow-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              Risk Disclaimer
            </div>
            <p className="text-xs leading-relaxed text-yellow-600/80">
              Bunker Cash tokens are not investments, securities, or financial
              instruments. They carry no guarantee of value, return, or
              liquidity. Token prices may fluctuate and you may lose part or all
              of the amount used to acquire them. Settlement of sell requests
              depends on available protocol liquidity and is not guaranteed
              within any timeframe. By using this interface you acknowledge that
              you understand these risks and that you are solely responsible for
              your own decisions. This is not financial advice.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
