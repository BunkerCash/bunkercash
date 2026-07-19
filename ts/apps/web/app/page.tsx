"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Layout } from "@/components/layout/Layout";
import { PageContainer } from "@/components/design/PageContainer";
import {
  SectionCard,
  MetricGrid,
  SegmentedTabs,
  type Metric,
} from "@/components/design/primitives";
import {
  PriceHistoryChart,
  ChartLoading,
  ChartError,
  toChartPoints,
} from "@/components/design/PriceHistoryChart";
import { DisclaimerBanner } from "@/components/ui/DisclaimerBanner";
import { usePoolStats } from "@/hooks/usePoolStats";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";
import { GLOSSARY } from "@/lib/glossary";

type Period = "24H" | "7D" | "30D" | "90D";
const PERIOD_DAYS: Record<Period, number> = {
  "24H": 1,
  "7D": 7,
  "30D": 30,
  "90D": 90,
};
const PERIODS = (Object.keys(PERIOD_DAYS) as Period[]).map((p) => ({
  value: p,
  label: p,
}));

function formatPercentFromBps(bps: number): string {
  const formatted = (bps / 100).toFixed(2);
  return formatted.replace(/\.?0+$/, "");
}

function ChangeChip({ change }: { change: number }) {
  const up = change >= 0;
  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-md px-2 py-[3px] font-mono text-[12.5px] font-medium tabular-nums ${
        up ? "bg-mint-soft text-mint" : "bg-sell-soft text-sell"
      }`}
    >
      {up ? "↑" : "↓"} {up ? "+" : "−"}
      {Math.abs(change).toFixed(2)}% · 24H
    </span>
  );
}

export default function Home() {
  const { stats, refresh } = usePoolStats();
  const wallet = useOptionalWallet();
  const connected = !!wallet?.connected;

  const [period, setPeriod] = useState<Period>("7D");
  const {
    data: history,
    loading: chartLoading,
    refresh: refreshHistory,
  } = usePriceHistory(PERIOD_DAYS[period]);
  const { data: dayHistory } = usePriceHistory(1);

  const points = useMemo(() => toChartPoints(history), [history]);
  const change24h = useMemo(() => {
    const vals = toChartPoints(dayHistory).map((p) => p.v);
    if (vals.length < 2 || vals[0] === 0) return null;
    return (vals[vals.length - 1] / vals[0] - 1) * 100;
  }, [dayHistory]);

  const rate = stats.pricePerToken;
  const rateFmt = rate != null ? rate.toFixed(4) : "—";
  const purchaseFeePct =
    stats.purchaseFeeBps != null
      ? `${formatPercentFromBps(stats.purchaseFeeBps)}%`
      : "—";
  const claimFeePct =
    stats.claimFeeBps != null
      ? `${formatPercentFromBps(stats.claimFeeBps)}%`
      : "—";
  const updatedFmt = stats.lastRefreshed
    ? stats.lastRefreshed.toLocaleTimeString("en-GB")
    : "—";

  const liquidityRatio =
    stats.treasuryUsdcRaw != null &&
    stats.navUsdcRaw != null &&
    stats.navUsdcRaw > 0
      ? ((stats.treasuryUsdcRaw / stats.navUsdcRaw) * 100).toFixed(1)
      : null;

  const metrics: Metric[] = [
    {
      label: "Pool NAV",
      value: stats.navUsdc != null ? `$${stats.navUsdc}` : "—",
      tip: GLOSSARY.poolNav,
    },
    {
      label: "Liquid USDC",
      value: stats.treasuryUsdc != null ? `$${stats.treasuryUsdc}` : "—",
      tip: GLOSSARY.liquidUsdc,
    },
    {
      label: "Pending claims",
      value:
        stats.pendingClaimsUsdc != null ? `$${stats.pendingClaimsUsdc}` : "—",
      tip: GLOSSARY.pendingClaims,
    },
    {
      label: "Circulating supply",
      value: stats.circulatingSupply ?? "—",
      unit: "BNKR",
      tip: GLOSSARY.circulatingSupply,
    },
    {
      label: "Total supply",
      value: stats.totalSupply ?? "—",
      unit: "BNKR",
      tip: GLOSSARY.totalSupply,
    },
    {
      label: "Liquidity ratio",
      value: liquidityRatio ?? "—",
      unit: "%",
      tip: "Share of pool NAV held as liquid USDC in the payout vault.",
    },
  ];

  const settlesImmediately =
    stats.treasuryUsdcRaw != null &&
    stats.pendingClaimsUsdcRaw != null &&
    stats.treasuryUsdcRaw >= stats.pendingClaimsUsdcRaw;

  return (
    <Layout>
      <PageContainer>
        {/* Overview header */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-3.5">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-xl font-semibold tracking-[-0.01em]">
                BNKR reference price
              </h1>
              <span className="text-[13px] text-ink-3">
                Calculated from pool NAV divided by circulating supply · read
                on-chain
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-3.5">
              <span className="font-mono text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums max-[480px]:text-[28px] desk:text-[40px]">
                {rateFmt}
              </span>
              <span className="text-sm text-ink-2">USDC</span>
              {change24h != null && <ChangeChip change={change24h} />}
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2.5 desk:w-auto">
            <Link
              href="/buy"
              className="flex h-11 min-w-[130px] flex-1 items-center justify-center rounded-lg bg-mint-btn px-5 text-sm font-semibold text-mint-ink no-underline transition-colors hover:bg-mint-btn-h hover:no-underline desk:h-10 desk:flex-none"
            >
              Buy BNKR
            </Link>
            <Link
              href="/sell"
              className="flex h-11 min-w-[130px] flex-1 items-center justify-center rounded-lg border border-line-2 bg-surface-2 px-5 text-sm font-semibold text-ink no-underline transition-colors hover:border-sell-line hover:no-underline desk:h-10 desk:flex-none"
            >
              Sell BNKR
            </Link>
            <Link
              href="/pool"
              className="flex h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-2 no-underline transition-colors hover:text-ink hover:no-underline"
            >
              Pool details →
            </Link>
          </div>
        </div>

        {/* Price history */}
        <SectionCard label="Price history">
          <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-line px-[18px] py-3.5">
            <div className="flex flex-wrap items-center gap-3.5">
              <span className="text-sm font-semibold">Price history</span>
              <SegmentedTabs
                label="Chart period"
                items={PERIODS}
                value={period}
                onChange={setPeriod}
              />
            </div>
            <span className="text-[12.5px] tabular-nums text-ink-3">
              1 BNKR = <span className="font-mono text-ink-2">{rateFmt}</span>{" "}
              USDC · {updatedFmt}
            </span>
          </div>

          {chartLoading ? (
            <ChartLoading />
          ) : points.length < 2 ? (
            <ChartError
              onRetry={() => {
                void refreshHistory();
                void refresh();
              }}
            />
          ) : (
            <PriceHistoryChart points={points} intraday={period === "24H"} />
          )}
        </SectionCard>

        {/* Protocol snapshot */}
        <SectionCard label="Protocol snapshot">
          <div className="flex items-center justify-between gap-3 border-b border-line px-[18px] py-3.5">
            <span className="text-sm font-semibold">Protocol snapshot</span>
            <Link
              href="/pool"
              className="text-[13px] font-medium text-ink-2 no-underline transition-colors hover:text-ink hover:no-underline"
            >
              Full pool status →
            </Link>
          </div>
          <MetricGrid metrics={metrics} />
        </SectionCard>

        {/* Action panels */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
          <section
            aria-label="Buy BNKR"
            className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5"
          >
            <div className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold">Buy BNKR</span>
              <span className="text-[13px] leading-relaxed text-ink-2">
                USDC converts at the live reference rate. BNKR is minted
                directly to your wallet — no order book, no counterparty.
              </span>
            </div>
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="text-ink-3">Reference rate</span>
                <span className="font-mono tabular-nums text-ink-2">
                  1 BNKR = {rateFmt} USDC
                </span>
              </div>
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="text-ink-3">Protocol fee</span>
                <span className="font-mono tabular-nums text-ink-2">
                  {purchaseFeePct}
                </span>
              </div>
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="text-ink-3">100 USDC receives</span>
                <span className="font-mono tabular-nums text-ink-2">
                  {rate != null && rate > 0
                    ? `≈ ${((100 * (10000 - (stats.purchaseFeeBps ?? 0)) / 10000) / rate).toLocaleString("en-US", { maximumFractionDigits: 2 })} BNKR`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="text-ink-3">Capacity remaining</span>
                <span className="font-mono tabular-nums text-ink-2">
                  {stats.remainingPurchaseCapacityUsdc != null
                    ? `$${stats.remainingPurchaseCapacityUsdc}`
                    : "Unlimited"}
                </span>
              </div>
            </div>
            <Link
              href="/buy"
              className="flex h-10 items-center justify-center rounded-lg bg-mint-btn text-sm font-semibold text-mint-ink no-underline transition-colors hover:bg-mint-btn-h hover:no-underline"
            >
              {connected ? "Buy BNKR" : "Connect wallet to buy"}
            </Link>
          </section>

          <section
            aria-label="Sell BNKR"
            className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5"
          >
            <div className="flex flex-col gap-1">
              <span className="text-[15px] font-semibold">Sell BNKR</span>
              <span className="text-[13px] leading-relaxed text-ink-2">
                Sell requests settle in USDC from pool liquidity. If liquidity
                is insufficient, the request enters escrow and can be cancelled
                at any time.
              </span>
            </div>
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="text-ink-3">Liquid USDC available</span>
                <span className="font-mono tabular-nums text-ink-2">
                  {stats.treasuryUsdc != null ? `$${stats.treasuryUsdc}` : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="text-ink-3">Pending settlement queue</span>
                <span className="font-mono tabular-nums text-ink-2">
                  {stats.pendingClaimsUsdc != null
                    ? `$${stats.pendingClaimsUsdc}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="text-ink-3">Claim fee</span>
                <span className="font-mono tabular-nums text-ink-2">
                  {claimFeePct}
                </span>
              </div>
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="text-ink-3">Minimum claim</span>
                <span className="font-mono tabular-nums text-ink-2">
                  {stats.minClaimUsdc != null ? `$${stats.minClaimUsdc}` : "—"}
                </span>
              </div>
              <div className="flex justify-between gap-2.5 text-[13px]">
                <span className="text-ink-3">Typical settlement</span>
                <span className="text-ink-2">
                  {settlesImmediately
                    ? "Immediate at current liquidity"
                    : "Queued until liquidity is replenished"}
                </span>
              </div>
            </div>
            <Link
              href="/sell"
              className="flex h-10 items-center justify-center rounded-lg border border-sell-line bg-sell-soft text-sm font-semibold text-sell no-underline transition-colors hover:border-sell hover:no-underline"
            >
              {connected ? "Sell BNKR" : "Connect wallet to sell"}
            </Link>
          </section>
        </div>

        {/* Risk note */}
        <p className="max-w-[880px] text-[12.5px] leading-relaxed text-ink-3">
          Digital tokens involve risk and may lose all value. BNKR is a
          community-based token and does not represent a deposit, equity
          interest, or claim of any kind. Settlement of sell requests depends
          on available pool liquidity.{" "}
          <Link href="/information#risks">Read risks and limitations</Link>.
        </p>

        <DisclaimerBanner />
      </PageContainer>
    </Layout>
  );
}
