"use client";

import { RefreshCw } from "lucide-react";
import { useAllOpenClaims } from "@/hooks/useAllOpenClaims";

const USDC_DECIMALS = 6;

function formatUsdc(raw: string): string {
  const amount = BigInt(raw);
  const normalized = amount.toString().padStart(USDC_DECIMALS + 1, "0");
  const head = normalized.slice(0, -USDC_DECIMALS);
  const tail = normalized.slice(-USDC_DECIMALS).slice(0, 2).padEnd(2, "0");
  return `${head}.${tail}`;
}

function formatTimestamp(raw: string): string {
  return new Date(Number(raw) * 1000).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortPk(value: string): string {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function ClaimsTable() {
  const { claims, closedClaims, totalRequested, loading, error, refresh } = useAllOpenClaims();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Claims Ledger</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Open claims come from the live `claim` accounts on-chain. Settled claims show the final paid USDC.
          </p>
        </div>
        <button
          onClick={() => refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-800/60 px-3 py-2 text-sm text-neutral-300 transition hover:border-neutral-700 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Open Claims</div>
          <div className="mt-2 text-2xl font-semibold text-white">{claims.length}</div>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Pending USDC</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-white">
            ${formatUsdc(totalRequested.toString())}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">Settled Claims</div>
          <div className="mt-2 text-2xl font-semibold text-white">{closedClaims.length}</div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          Failed to load claims: {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-neutral-800/60">
        <div className="border-b border-neutral-800/60 bg-neutral-900/30 px-5 py-3">
          <h3 className="text-sm font-medium text-white">Open Claims</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-neutral-800/60 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3">Claim</th>
                <th className="px-5 py-3">Wallet</th>
                <th className="px-5 py-3 text-right">Outstanding</th>
                <th className="px-5 py-3 text-right">Paid</th>
                <th className="px-5 py-3 text-right">Created</th>
                <th className="px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-500">
                    Loading claims...
                  </td>
                </tr>
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-500">
                    No open claims.
                  </td>
                </tr>
              ) : (
                claims.map((claim) => (
                  <tr key={claim.pubkey.toBase58()} className="border-b border-neutral-800/40 last:border-b-0">
                    <td className="px-5 py-4 font-mono text-sm text-white">{claim.id}</td>
                    <td className="px-5 py-4 font-mono text-sm text-neutral-300">
                      {shortPk(claim.user.toBase58())}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-white">
                      ${formatUsdc(claim.remainingUsdc)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-neutral-300">
                      ${formatUsdc(claim.paidUsdc)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-neutral-300">
                      {formatTimestamp(claim.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-amber-400">
                      {BigInt(claim.paidUsdc) > BigInt(0) ? "Partially Paid" : "Open"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-neutral-800/60">
        <div className="border-b border-neutral-800/60 bg-neutral-900/30 px-5 py-3">
          <h3 className="text-sm font-medium text-white">Recent Settlements</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-neutral-800/60 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3">Claim</th>
                <th className="px-5 py-3">Wallet</th>
                <th className="px-5 py-3 text-right">Requested</th>
                <th className="px-5 py-3 text-right">Paid</th>
                <th className="px-5 py-3 text-right">Settled</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-neutral-500">
                    Loading settled claims...
                  </td>
                </tr>
              ) : closedClaims.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-neutral-500">
                    No settled claims yet.
                  </td>
                </tr>
              ) : (
                closedClaims.slice(0, 20).map((claim) => (
                  <tr key={claim.pubkey.toBase58()} className="border-b border-neutral-800/40 last:border-b-0">
                    <td className="px-5 py-4 font-mono text-sm text-white">{claim.id}</td>
                    <td className="px-5 py-4 font-mono text-sm text-neutral-300">
                      {shortPk(claim.user.toBase58())}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-neutral-300">
                      ${formatUsdc(claim.requestedUsdc)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-white">
                      ${formatUsdc(claim.paidUsdc)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-[#00FFB2]">
                      {formatTimestamp(claim.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
