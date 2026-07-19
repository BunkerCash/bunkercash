"use client";

import { useMemo } from "react";
import { usePoolStats } from "@/hooks/usePoolStats";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { GLOSSARY } from "@/lib/glossary";

/** Data older than this is flagged as stale in the rail. */
const STALE_AFTER_MS = 5 * 60 * 1000;

function RailItem({
  label,
  value,
  tip,
  valueClassName,
}: {
  label: string;
  value: string;
  tip?: string;
  valueClassName?: string;
}) {
  return (
    <span
      title={tip}
      className="inline-flex h-[18px] cursor-default items-center gap-[7px] whitespace-nowrap border-r border-line px-4"
    >
      <span className="text-xs text-ink-3">{label}</span>
      <span
        className={`font-mono text-xs tabular-nums ${valueClassName ?? "text-ink-2"}`}
      >
        {value}
      </span>
    </span>
  );
}

export function StatusRail() {
  const { stats, loading, error } = usePoolStats();
  const { data: dayPrices } = usePriceHistory(1);

  const change24h = useMemo(() => {
    const prices = dayPrices
      .map((p) => p.price)
      .filter((p): p is number => p != null && p > 0);
    if (prices.length < 2) return null;
    return (prices[prices.length - 1] / prices[0] - 1) * 100;
  }, [dayPrices]);

  const stale =
    stats.lastRefreshed != null &&
    Date.now() - stats.lastRefreshed.getTime() > STALE_AFTER_MS;

  const net = error
    ? { dot: "bg-danger", label: "RPC unavailable" }
    : loading
      ? { dot: "bg-warn", label: "Connecting…" }
      : stale
        ? { dot: "bg-warn", label: "Degraded — stale data" }
        : { dot: "bg-mint", label: "Operational" };

  return (
    <div className="border-b border-line bg-surface">
      <div className="rail-scroll mx-auto flex h-9 max-w-[1320px] items-center px-6 max-[839px]:px-4">
        {stats.pricePerToken != null && (
          <RailItem
            label="BNKR/USDC"
            value={stats.pricePerToken.toFixed(4)}
            tip={GLOSSARY.referenceRate}
            valueClassName="text-ink"
          />
        )}
        {change24h != null && (
          <RailItem
            label="24H"
            value={`${change24h >= 0 ? "+" : "−"}${Math.abs(change24h).toFixed(2)}%`}
            tip="Change in the reference rate over the past 24 hours"
            valueClassName={change24h >= 0 ? "text-mint" : "text-sell"}
          />
        )}
        {stats.treasuryUsdc != null && (
          <RailItem
            label="Liquidity"
            value={`$${stats.treasuryUsdc}`}
            tip={GLOSSARY.liquidUsdc}
          />
        )}
        {stats.pendingClaimsUsdc != null && (
          <RailItem
            label="Pending"
            value={`$${stats.pendingClaimsUsdc}`}
            tip={GLOSSARY.pendingClaims}
          />
        )}
        {stats.circulatingSupply != null && (
          <RailItem
            label="Circulating"
            value={`${stats.circulatingSupply} BNKR`}
            tip={GLOSSARY.circulatingSupply}
          />
        )}
        <span className="flex-1" />
        <span className="inline-flex items-center gap-[7px] whitespace-nowrap pl-4">
          <span className={`h-1.5 w-1.5 flex-none rounded-full ${net.dot}`} />
          <span className="text-xs text-ink-2">{net.label}</span>
          {stats.lastRefreshed && (
            <span className="pl-2.5 text-xs text-ink-3">
              Updated{" "}
              <span className="font-mono tabular-nums">
                {stats.lastRefreshed.toLocaleTimeString("en-GB")}
              </span>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
