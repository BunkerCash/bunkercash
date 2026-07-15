"use client";

import { useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { PageContainer } from "@/components/design/PageContainer";
import {
  SectionCard,
  CardHeader,
  MetricGrid,
  Shimmer,
  type Metric,
} from "@/components/design/primitives";
import { RefreshIcon, WarnIcon, Spinner } from "@/components/design/icons";
import { usePoolStats } from "@/hooks/usePoolStats";

function fmtNum(n: number, maxDec = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDec,
  });
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return fmtNum(n);
}

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

// ---------------------------------------------------------------------------
// Horizontal bar visual (used for composition breakdowns)
// ---------------------------------------------------------------------------
function CompositionBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total <= 0) return null;

  return (
    <div className="flex flex-col gap-3 px-[18px] py-4 max-[839px]:px-3.5">
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-3">
        {segments.map((seg) => {
          const w = pct(seg.value, total);
          if (w <= 0) return null;
          return (
            <div
              key={seg.label}
              className="h-full transition-all duration-500"
              style={{ width: `${w}%`, backgroundColor: seg.color }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1.5 text-[12.5px]">
            <span
              className="h-2 w-2 flex-none rounded-[2px]"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-ink-3">{seg.label}</span>
            <span className="font-mono tabular-nums text-ink-2">
              ${fmtCompact(seg.value)}
            </span>
            <span className="text-ink-3">
              ({pct(seg.value, total).toFixed(1)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pool page
// ---------------------------------------------------------------------------
export default function PoolPage() {
  const { stats, loading, refreshing, error, refresh } = usePoolStats();

  const shimmer = <Shimmer className="h-5 w-24" />;

  const summaryMetrics: Metric[] = useMemo(
    () => [
      {
        label: "Reference rate",
        value: loading ? shimmer : stats.pricePerToken != null ? `$${stats.pricePerToken.toFixed(4)}` : "—",
        unit: stats.pricePerToken != null ? "USDC" : undefined,
        tip: "Current per-token price derived from NAV / circulating supply.",
      },
      {
        label: "Reference value (NAV)",
        value: loading ? shimmer : stats.navUsdcRaw != null ? `$${fmtCompact(stats.navUsdcRaw)}` : "—",
        tip: "Total USDC value tracked on-chain backing all circulating BNKR.",
      },
      {
        label: "Treasury USDC",
        value: loading ? shimmer : stats.treasuryUsdcRaw != null ? `$${fmtCompact(stats.treasuryUsdcRaw)}` : "—",
        tip: "Liquid USDC held in the protocol treasury account.",
        valueClassName: "text-mint",
      },
      {
        label: "Pending claims",
        value: loading ? shimmer : stats.pendingClaimsUsdcRaw != null ? `$${fmtCompact(stats.pendingClaimsUsdcRaw)}` : "—",
        tip: "Total USDC requested by open sell requests awaiting settlement.",
        valueClassName: "text-warn",
      },
    ],
    [loading, stats],
  );

  const supplyMetrics: Metric[] = useMemo(
    () => [
      {
        label: "Total supply",
        value: loading ? shimmer : stats.totalSupply ?? "—",
        unit: "BNKR",
        tip: "All BNKR tokens that exist — circulating plus escrowed for pending sells.",
      },
      {
        label: "Circulating supply",
        value: loading ? shimmer : stats.circulatingSupply ?? "—",
        unit: "BNKR",
        tip: "BNKR freely held by users. Escrow tokens back pending sell requests and are excluded until settled.",
      },
      {
        label: "Escrowed BNKR",
        value: loading
          ? shimmer
          : stats.totalSupplyRaw != null && stats.circulatingSupplyRaw != null
            ? fmtCompact(stats.totalSupplyRaw - stats.circulatingSupplyRaw)
            : "—",
        unit: "BNKR",
        tip: "BNKR locked in escrow for open sell requests — returned if cancelled, burned at settlement.",
      },
    ],
    [loading, stats],
  );

  const treasurySegments = useMemo(() => {
    if (stats.treasuryUsdcRaw == null || stats.pendingClaimsUsdcRaw == null)
      return null;
    return [
      { label: "Available liquidity", value: Math.max(0, stats.treasuryUsdcRaw - stats.pendingClaimsUsdcRaw), color: "var(--mint)" },
      { label: "Reserved for claims", value: Math.min(stats.pendingClaimsUsdcRaw, stats.treasuryUsdcRaw), color: "var(--amber)" },
    ];
  }, [stats.treasuryUsdcRaw, stats.pendingClaimsUsdcRaw]);

  const supplySegments = useMemo(() => {
    if (stats.totalSupplyRaw == null || stats.circulatingSupplyRaw == null)
      return null;
    const escrow = stats.totalSupplyRaw - stats.circulatingSupplyRaw;
    return [
      { label: "Circulating", value: stats.circulatingSupplyRaw, color: "var(--mint)" },
      { label: "Escrowed", value: escrow, color: "var(--amber)" },
    ];
  }, [stats.totalSupplyRaw, stats.circulatingSupplyRaw]);

  const liquidityHealth = useMemo(() => {
    if (stats.treasuryUsdcRaw == null || stats.pendingClaimsUsdcRaw == null)
      return null;
    if (stats.pendingClaimsUsdcRaw <= 0) return { ratio: Infinity, label: "Healthy", tone: "text-mint" as const };
    const ratio = stats.treasuryUsdcRaw / stats.pendingClaimsUsdcRaw;
    if (ratio >= 2) return { ratio, label: "Healthy", tone: "text-mint" as const };
    if (ratio >= 1) return { ratio, label: "Adequate", tone: "text-info" as const };
    return { ratio, label: "Low", tone: "text-warn" as const };
  }, [stats.treasuryUsdcRaw, stats.pendingClaimsUsdcRaw]);

  return (
    <Layout>
      <PageContainer className="gap-5">
        {/* Page heading */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">Pool</h1>
            <span className="text-[13px] text-ink-3">
              Read-only protocol transparency — supply, treasury, and settlement
              metrics sourced directly from on-chain state.
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {stats.lastRefreshed && (
              <span className="text-[12px] text-ink-3">
                {stats.lastRefreshed.toLocaleTimeString("en-GB")}
              </span>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || refreshing}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line-2 bg-surface-2 px-3 text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-ink-3 disabled:opacity-50"
            >
              {refreshing ? (
                <Spinner className="h-3 w-3" />
              ) : (
                <RefreshIcon size={12} />
              )}
              Refresh
            </button>
          </div>
        </div>

        {/* Stale / error banner */}
        {error && (
          <div className="flex items-center gap-2.5 rounded-lg border border-sell-line bg-sell-soft px-4 py-2.5 text-[13px] text-sell">
            <WarnIcon size={14} />
            {error}
          </div>
        )}

        {/* Pool summary metrics */}
        <SectionCard label="Pool summary">
          <CardHeader
            title="Pool summary"
            right={
              liquidityHealth && (
                <span className={`text-[12.5px] font-semibold ${liquidityHealth.tone}`}>
                  Liquidity: {liquidityHealth.label}
                  {liquidityHealth.ratio !== Infinity &&
                    ` (${liquidityHealth.ratio.toFixed(1)}×)`}
                </span>
              )
            }
          />
          <MetricGrid metrics={summaryMetrics} />
        </SectionCard>

        {/* Treasury composition */}
        {treasurySegments && !loading && (
          <SectionCard label="Treasury composition">
            <CardHeader title="Treasury composition" />
            <CompositionBar segments={treasurySegments} />
          </SectionCard>
        )}

        {/* Supply composition */}
        <SectionCard label="Supply composition">
          <CardHeader title="Supply composition" />
          <MetricGrid metrics={supplyMetrics} />
          {supplySegments && !loading && (
            <CompositionBar segments={supplySegments} />
          )}
        </SectionCard>

        {/* Protocol data source */}
        <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface px-[18px] py-3.5 text-[12.5px] leading-relaxed text-ink-3">
          <WarnIcon size={13} className="mt-0.5 flex-none text-ink-3" />
          <span>
            All values are read from on-chain data and related protocol state.
            Displayed metrics are informational only and do not represent
            guarantees of liquidity, settlement, or value.
          </span>
        </div>
      </PageContainer>
    </Layout>
  );
}
