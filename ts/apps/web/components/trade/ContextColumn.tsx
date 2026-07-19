"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSetAtom } from "jotai";
import { usePoolStats } from "@/hooks/usePoolStats";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { useMyClaims } from "@/hooks/useMyClaims";
import { useMyTransactions } from "@/hooks/useMyTransactions";
import { connectModalOpenAtom } from "@/lib/ui-atoms";
import {
  chartGeometry,
  toChartPoints,
} from "@/components/design/PriceHistoryChart";

function fmtNum(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MarketContext() {
  const { stats } = usePoolStats();
  const { data: dayHistory } = usePriceHistory(1);

  const values = useMemo(
    () => toChartPoints(dayHistory).map((p) => p.v),
    [dayHistory],
  );
  const change =
    values.length >= 2 ? (values[values.length - 1] / values[0] - 1) * 100 : null;
  const spark = values.length >= 2 ? chartGeometry(values, 300, 72, 8, 8) : null;

  const rate = stats.pricePerToken;

  return (
    <section
      aria-label="Market context"
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-[18px] py-4"
    >
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="text-[13px] font-semibold">
          Reference price · 24H
        </span>
        {change != null && (
          <span
            className={`font-mono text-xs tabular-nums ${change >= 0 ? "text-mint" : "text-sell"}`}
          >
            {change >= 0 ? "↑ +" : "↓ −"}
            {Math.abs(change).toFixed(2)}%
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[26px] font-semibold tracking-[-0.01em] tabular-nums">
          {rate != null ? rate.toFixed(4) : "—"}
        </span>
        <span className="text-[12.5px] text-ink-3">USDC</span>
      </div>
      {spark && (
        <svg
          viewBox="0 0 300 72"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="block h-16 w-full"
        >
          <line
            x1="0"
            y1="24"
            x2="300"
            y2="24"
            style={{ stroke: "var(--line)", strokeWidth: 1 }}
          />
          <line
            x1="0"
            y1="48"
            x2="300"
            y2="48"
            style={{ stroke: "var(--line)", strokeWidth: 1 }}
          />
          <path
            d={spark.d}
            vectorEffect="non-scaling-stroke"
            style={{
              fill: "none",
              stroke: "var(--mint)",
              strokeWidth: 1.4,
              strokeLinejoin: "round",
            }}
          />
        </svg>
      )}
      <span className="text-xs text-ink-3">
        {stats.lastRefreshed
          ? `Updated ${stats.lastRefreshed.toLocaleTimeString("en-GB")} · read from the pool account`
          : "Read from the pool account"}
      </span>
    </section>
  );
}

function YourPosition() {
  const wallet = useOptionalWallet();
  const connected = !!wallet?.connected;
  const openConnect = useSetAtom(connectModalOpenAtom);
  const { balance: bnkrBalance } = useTokenBalance();
  const { balance: usdcBalance } = useUsdcBalance();
  const { claims } = useMyClaims();

  const openClaims = claims.filter(
    (c) => !c.cancelled && !c.processed && c.bunkercashRemaining !== "0",
  );
  const escrowBnkr = openClaims.reduce(
    (sum, c) => sum + Number(c.bunkercashRemaining) / 1e6,
    0,
  );

  return (
    <section
      aria-label="Your position"
      className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-[18px] py-4"
    >
      <span className="text-[13px] font-semibold">Your position</span>
      {connected ? (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between gap-2.5 text-[13px]">
            <span className="text-ink-3">USDC balance</span>
            <span className="font-mono text-[12.5px] tabular-nums text-ink-2">
              {usdcBalance != null ? `${usdcBalance} USDC` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2.5 text-[13px]">
            <span className="text-ink-3">BNKR balance</span>
            <span className="font-mono text-[12.5px] tabular-nums text-ink-2">
              {bnkrBalance != null ? `${bnkrBalance} BNKR` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2.5 text-[13px]">
            <span className="text-ink-3">In escrow</span>
            <span className="font-mono text-[12.5px] tabular-nums text-ink-2">
              {fmtNum(escrowBnkr)} BNKR
            </span>
          </div>
          <div className="flex justify-between gap-2.5 text-[13px]">
            <span className="text-ink-3">Open sell requests</span>
            <Link
              href="/wallet"
              className="text-[12.5px] font-medium text-mint no-underline hover:underline"
            >
              {openClaims.length}{" "}
              {openClaims.length === 1 ? "request" : "requests"} →
            </Link>
          </div>
        </div>
      ) : (
        <>
          <span className="text-[13px] leading-relaxed text-ink-2">
            Connect a wallet to see balances, escrow, and open requests.
          </span>
          <button
            type="button"
            onClick={() => openConnect(true)}
            className="h-8 self-start rounded-lg border border-line-2 bg-surface-2 px-3 text-[12.5px] font-semibold transition-colors hover:border-mint-line"
          >
            Connect wallet
          </button>
        </>
      )}
    </section>
  );
}

function RecentActivity() {
  const wallet = useOptionalWallet();
  const connected = !!wallet?.connected;
  const { transactions } = useMyTransactions();

  const recent = transactions.slice(0, 4);

  return (
    <section
      aria-label="Recent activity"
      className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-[18px] py-4"
    >
      <div className="flex items-center justify-between gap-2.5 pb-1">
        <span className="text-[13px] font-semibold">Recent activity</span>
        <Link
          href="/wallet"
          className="text-[12.5px] font-medium text-ink-2 no-underline transition-colors hover:text-ink hover:no-underline"
        >
          View all →
        </Link>
      </div>
      {connected && recent.length > 0 ? (
        recent.map((t) => {
          const buy = t.type === "investment";
          const pending = t.status === "pending" || t.status === "partial";
          const amount =
            t.tokenAmount != null && t.tokenAmount > 0
              ? `${buy ? "+" : "−"}${t.tokenAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} BNKR`
              : `${buy ? "+" : "−"}$${fmtNum(t.amount)}`;
          return (
            <div
              key={t.id}
              className="flex items-center justify-between gap-2.5 border-t border-line py-2"
            >
              <span className="flex min-w-0 items-center gap-[9px]">
                <span
                  className={`h-[7px] w-[7px] flex-none rounded-sm ${buy ? "bg-mint" : "bg-sell"}`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[12.5px] font-medium">
                    {buy ? "Buy" : "Sell"}
                    {pending ? " · pending" : ""}
                  </span>
                  <span className="text-[11.5px] text-ink-3">
                    {t.timestamp.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                    ,{" "}
                    {t.timestamp.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </span>
              <span
                className={`whitespace-nowrap font-mono text-xs tabular-nums ${buy ? "text-mint" : "text-sell"}`}
              >
                {amount}
              </span>
            </div>
          );
        })
      ) : (
        <span className="py-1.5 text-[13px] text-ink-3">
          {connected ? "No activity yet." : "No wallet connected."}
        </span>
      )}
    </section>
  );
}

export function ContextColumn() {
  return (
    <div className="flex min-w-0 flex-1 basis-[300px] flex-col gap-4">
      <MarketContext />
      <YourPosition />
      <RecentActivity />
    </div>
  );
}
