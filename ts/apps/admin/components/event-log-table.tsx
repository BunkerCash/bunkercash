"use client";

import { useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClusterFromEndpoint } from "@/lib/constants";
import {
  useRecentProgramEvents,
  type EventType,
} from "@/hooks/useRecentProgramEvents";

const filterTabs: Array<{ label: string; value: EventType | "All" }> = [
  { label: "All", value: "All" },
  { label: "Buy", value: "Buy" },
  { label: "File Claim", value: "File Claim" },
  { label: "Settlement", value: "Settlement" },
  { label: "Withdraw", value: "Master Withdraw" },
  { label: "Repay", value: "Master Repay" },
  { label: "Cancel", value: "Master Cancel" },
];

const typeBadgeStyles: Record<EventType, string> = {
  Buy: "bg-[#00FFB2]/15 text-[#00FFB2]",
  "File Claim": "bg-emerald-500/15 text-emerald-400",
  Settlement: "bg-amber-500/15 text-amber-400",
  "Master Withdraw": "bg-rose-500/15 text-rose-300",
  "Master Repay": "bg-sky-500/15 text-sky-300",
  "Master Cancel": "bg-neutral-500/15 text-neutral-300",
};

function truncateWallet(wallet: string): string {
  if (wallet.length <= 10) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function truncateTx(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}...`;
}

function formatTime(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function EventLogTable() {
  const { connection } = useConnection();
  const [activeFilter, setActiveFilter] = useState<EventType | "All">("All");
  const { events, loading, error, refresh } = useRecentProgramEvents(10);

  const explorerClusterParam = useMemo(() => {
    const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "");
    return cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`;
  }, [connection]);

  const filteredEvents =
    activeFilter === "All"
      ? events
      : events.filter((e) => e.type === activeFilter);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Program Events</h1>

        <div className="flex items-center gap-3">
          {/* Filter tabs */}
          <div className="flex items-center gap-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveFilter(tab.value)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  activeFilter === tab.value
                    ? "bg-[#00FFB2] text-black"
                    : "text-neutral-400 hover:text-white"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800/40 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="border border-neutral-800/60 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800/60">
                <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Type</th>
                <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Time</th>
                <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Wallet</th>
                <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Amount</th>
                <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">TX</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 7 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-800/40 last:border-b-0">
                  <td className="px-5 py-3.5"><div className="h-5 w-16 bg-neutral-800/60 rounded animate-pulse" /></td>
                  <td className="px-5 py-3.5"><div className="h-4 w-28 bg-neutral-800/60 rounded animate-pulse" /></td>
                  <td className="px-5 py-3.5"><div className="h-4 w-20 bg-neutral-800/60 rounded animate-pulse" /></td>
                  <td className="px-5 py-3.5"><div className="h-4 w-24 bg-neutral-800/60 rounded animate-pulse ml-auto" /></td>
                  <td className="px-5 py-3.5"><div className="h-4 w-16 bg-neutral-800/60 rounded animate-pulse" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300 mb-1">
                Failed to load events
              </p>
              <p className="text-xs text-red-200/60">{error}</p>
            </div>
          </div>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-neutral-500 border border-neutral-800/60 rounded-xl">
          <p className="text-sm">No {activeFilter === "All" ? "" : activeFilter + " "}events found</p>
          <p className="text-xs text-neutral-600 mt-1">
            Last 10 program transactions scanned
          </p>
        </div>
      ) : (
        <div className="border border-neutral-800/60 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800/60">
                <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Type
                </th>
                <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Time
                </th>
                <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Wallet
                </th>
                <th className="text-right px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Amount
                </th>
                <th className="text-left px-5 py-3.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  TX
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr
                  key={event.id}
                  className="border-b border-neutral-800/40 last:border-b-0 hover:bg-neutral-900/30 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
                        typeBadgeStyles[event.type]
                      )}
                    >
                      {event.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-neutral-300 font-mono">
                    {formatTime(event.time)}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-neutral-300 font-mono">
                    {truncateWallet(event.wallet)}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-right text-neutral-200 font-mono">
                    {event.amount !== null && event.currency ? (
                      <>
                        {event.amount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}{" "}
                        <span className="text-neutral-500">{event.currency}</span>
                      </>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-neutral-500 font-mono">
                    <a
                      href={`https://explorer.solana.com/tx/${event.txHash}${explorerClusterParam}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-neutral-300 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {truncateTx(event.txHash)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
