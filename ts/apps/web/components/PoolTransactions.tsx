'use client'

import { useMyTransactions } from "@/hooks/useMyTransactions";
import { useConnection } from "@solana/wallet-adapter-react";
import { getClusterFromEndpoint } from "@/lib/constants";
import type { Transaction } from "@/types";
import { ArrowUpIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";

const SELL_STATUS_META: Record<
  NonNullable<Transaction["status"]>,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending settlement",
    className: "bg-amber-400/10 text-amber-300",
  },
  partial: {
    label: "Partially settled",
    className: "bg-[#00FFB2]/10 text-[#00FFB2]",
  },
  settled: {
    label: "Settled",
    className: "bg-neutral-700/40 text-neutral-300",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-neutral-800/60 text-neutral-500",
  },
};

function getTxLabel(tx: Transaction): string {
  if (tx.type === "investment") return "Buy";
  // A sell is a request until it has fully settled — match the Sell/History
  // framing so the same action isn't called "Sell" in one view and
  // "Sell request" in another.
  return tx.status === "settled" ? "Sell" : "Sell request";
}

function fmtUsd(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function PoolTransactions() {
  const { transactions, loading, error, refresh } = useMyTransactions();
  const wallet = useOptionalWallet();
  const publicKey = wallet?.publicKey ?? null;
  const { connection } = useConnection();

  const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "");
  const explorerBase =
    cluster === "mainnet-beta"
      ? "https://explorer.solana.com/tx/"
      : `https://explorer.solana.com/tx/`;
  const explorerSuffix =
    cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;

  const getTransactionIcon = (type: Transaction['type']) => {
    switch (type) {
      case "investment":
        return <ArrowRightIcon className="w-4 h-4" />;
      case "withdrawal":
        return <ArrowUpIcon className="w-4 h-4" />;
    }
  }

  const getTransactionColor = (type: Transaction['type']) => {
    switch (type) {
      case "investment":
        return "text-[#00FFB2]";
      case "withdrawal":
        return "text-red-400";
    }
  }

  const getTransactionBgColor = (type: Transaction["type"]) => {
    switch (type) {
      case "investment":
        return "bg-[#00FFB2]/10";
      case "withdrawal":
        return "bg-red-400/10";
    }
  };

  if (!publicKey) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-500">
        Complete access check and connect your wallet to view transactions.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">My Transactions</h3>
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-[#00FFB2]" />
            <span className="text-sm text-neutral-500">
              Loading transactions…
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">My Transactions</h3>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
        <button
          onClick={() => void refresh()}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">My Transactions</h3>
        <button
          onClick={() => void refresh()}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors"
        >
          Refresh
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        Buys are instant. Sells are requests that pay out to USDC when a
        settlement runs, drawing on available pool liquidity — so a sell can sit
        as &ldquo;Pending settlement&rdquo; before the USDC arrives.
      </p>

      {transactions.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-500">
          No transactions found.
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="bg-neutral-900 rounded-xl p-4 border border-neutral-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div
                    className={`${getTransactionBgColor(tx.type)} ${getTransactionColor(tx.type)} p-2 rounded-lg mt-0.5`}
                  >
                    {getTransactionIcon(tx.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold">{getTxLabel(tx)}</span>
                      {tx.type === "withdrawal" && tx.status && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SELL_STATUS_META[tx.status].className}`}
                        >
                          {SELL_STATUS_META[tx.status].label}
                        </span>
                      )}
                      {tx.txSignature && (
                        <a
                          href={`${explorerBase}${tx.txSignature}${explorerSuffix}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-neutral-600 hover:text-[#00FFB2] transition-colors font-mono"
                          title="View on Solana Explorer"
                        >
                          {tx.txSignature.slice(0, 4)}…
                          {tx.txSignature.slice(-4)}
                        </a>
                      )}
                    </div>
                    {tx.type === "withdrawal" &&
                      (tx.status === "pending" || tx.status === "partial") && (
                        <div className="text-sm text-neutral-400">
                          {tx.status === "partial"
                            ? `Settled $${fmtUsd(tx.settledUsdc ?? 0)} of $${fmtUsd(tx.requestedUsdc ?? 0)} — rest pays out as liquidity allows`
                            : `Requested $${fmtUsd(tx.requestedUsdc ?? 0)} — pays out to USDC when a settlement runs`}
                        </div>
                      )}
                    {tx.tokenAmount != null && tx.tokenAmount > 0 && (
                      <div className="text-sm text-neutral-400">
                        {tx.type === "investment" ? "Received" : "Submitted"}{" "}
                        {tx.tokenAmount.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}{" "}
                        BNKR
                      </div>
                    )}
                    <div className="text-xs text-neutral-600 mt-1">
                      {tx.timestamp.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {tx.type === "investment" ? (
                    <div className="text-lg font-semibold text-[#00FFB2]">
                      + ${fmtUsd(tx.amount)}
                    </div>
                  ) : tx.status === "settled" || tx.status === "partial" ? (
                    <div className="text-lg font-semibold text-red-400">
                      - ${fmtUsd(tx.settledUsdc ?? tx.amount)}
                    </div>
                  ) : tx.status === "cancelled" ? (
                    <div className="text-lg font-semibold text-neutral-500">—</div>
                  ) : (
                    <div className="text-right">
                      <div className="text-lg font-semibold text-neutral-300">
                        ${fmtUsd(tx.requestedUsdc ?? tx.amount)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                        requested
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
