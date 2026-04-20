"use client";

import { useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { PoolTransactions } from "@/components/PoolTransactions";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Clock, Wallet } from "lucide-react";
import { type Claim, useMyClaims } from "@/hooks/useMyClaims";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";
import { usePoolStats } from "@/hooks/usePoolStats";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useMyTransactions } from "@/hooks/useMyTransactions";

const USDC_DECIMALS = 6;

function formatAmount(value: number, options?: Intl.NumberFormatOptions) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    ...options,
  });
}

function formatUsdcAmount(raw: bigint) {
  return Number(raw) / 10 ** USDC_DECIMALS;
}

function getClaimProgress(claim: Claim) {
  const requestedRaw = BigInt(claim.requestedUsdc);
  const paidRaw = BigInt(claim.paidUsdc);
  const cappedPaidRaw = paidRaw > requestedRaw ? requestedRaw : paidRaw;

  if (requestedRaw <= BigInt(0)) {
    return {
      requestedRaw,
      paidRaw: cappedPaidRaw,
      progressPct: paidRaw > BigInt(0) ? 100 : 0,
    };
  }

  const progressPct =
    Number((cappedPaidRaw * BigInt(10000)) / requestedRaw) / 100;
  return { requestedRaw, paidRaw: cappedPaidRaw, progressPct };
}

export default function WalletPageClient() {
  const [activeTab, setActiveTab] = useState<"transactions" | "settlements">(
    "transactions",
  );
  const wallet = useOptionalWallet();
  const connected = wallet?.connected ?? false;
  const { balance, loading: isLoadingBalance, error: balanceError } = useTokenBalance();
  const { stats, loading: isLoadingStats, error: statsError } = usePoolStats();
  const { transactions } = useMyTransactions();
  const { claims, loading: isLoadingClaims, error: claimsError } = useMyClaims();

  const tokenBalance = useMemo(() => Number(balance || "0"), [balance]);
  const pricePerToken = stats.pricePerToken;
  const estimatedAssetValue =
    pricePerToken != null && Number.isFinite(tokenBalance)
      ? tokenBalance * pricePerToken
      : null;

  const boughtUsdcTotal = useMemo(
    () =>
      transactions
        .filter((tx) => tx.type === "investment")
        .reduce((sum, tx) => sum + tx.amount, 0),
    [transactions],
  );

  const soldUsdcTotal = useMemo(
    () =>
      transactions
        .filter((tx) => tx.type === "withdrawal")
        .reduce((sum, tx) => sum + tx.amount, 0),
    [transactions],
  );

  const openRequests = useMemo(
    () => claims.filter((claim) => !claim.processed).length,
    [claims],
  );

  const totalSettledUsdc = useMemo(
    () =>
      claims.reduce(
        (sum, claim) => sum + Number(claim.paidUsdc) / 10 ** USDC_DECIMALS,
        0,
      ),
    [claims],
  );

  const totalRequestedUsdc = useMemo(
    () =>
      claims.reduce(
        (sum, claim) => sum + Number(claim.requestedUsdc) / 10 ** USDC_DECIMALS,
        0,
      ),
    [claims],
  );

  const totalRequests = claims.length;

  if (!connected) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold text-foreground mb-4">Wallet</h1>
              <p className="text-muted-foreground">
                Connect your wallet to view your assets, transactions, and settlement activity.
              </p>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-500">
              Complete access check and connect wallet to open your wallet overview.
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center mb-10">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
              <Wallet className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-4">Wallet</h1>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Your balance, buy and sell transactions, and settlement progress in one place.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <StatCard
              label="Total Assets"
              value={
                isLoadingBalance || isLoadingStats
                  ? "Loading..."
                  : balanceError || statsError
                    ? "Unavailable"
                    : estimatedAssetValue != null
                      ? `$${formatAmount(estimatedAssetValue)}`
                      : "—"
              }
              note={
                balanceError || statsError
                  ? "Unable to price holdings right now"
                  : "Estimated from your BNKR balance and live token price"
              }
            />
            <StatCard
              label={
                isLoadingBalance
                  ? "Loading..."
                  : balanceError
                    ? "Error"
                    : "Token Balance"
              }
              value={
                isLoadingBalance
                  ? "..."
                  : balanceError
                    ? "N/A"
                    : `${formatAmount(tokenBalance, { maximumFractionDigits: 4 })} BNKR`
              }
              note={
                balanceError ? (
                  <span className="text-destructive">Network Error</span>
                ) : (
                  "Current wallet balance"
                )
              }
            />
            <StatCard
              label="Open Requests"
              value={openRequests.toString()}
              note="Awaiting settlement"
            />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <StatCard
              label="Requested Amount"
              value={
                <span className="text-primary">
                  ${formatAmount(totalRequestedUsdc)}
                </span>
              }
              note="Total submitted sell requests"
            />
            <StatCard
              label="Settled Amount"
              value={`$${formatAmount(totalSettledUsdc)}`}
              note="Total completed sell settlements"
            />
            <StatCard
              label="Total Requests"
              value={totalRequests.toString()}
              note="Submitted sell requests"
            />
          </div>

          <section className="glass-card p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Wallet Activity</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Switch between buy/sell transactions and settlement progress.
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-border/60 bg-background/60 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("transactions")}
                  className={
                    activeTab === "transactions"
                      ? "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      : "rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  Transactions
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("settlements")}
                  className={
                    activeTab === "settlements"
                      ? "rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                      : "rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  Settlements
                </button>
              </div>
            </div>

            {activeTab === "transactions" ? (
              <>
                <div className="grid sm:grid-cols-2 gap-4 mb-6">
                  <StatCard
                    label="Total Bought"
                    value={`$${formatAmount(boughtUsdcTotal)}`}
                    note="Aggregate buy-side transaction value"
                  />
                  <StatCard
                    label="Total Sold"
                    value={`$${formatAmount(soldUsdcTotal)}`}
                    note="Aggregate sell-side transaction value"
                  />
                </div>

                <div className="flex items-center gap-2 mb-6">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold">Transaction History</h3>
                    <p className="text-sm text-muted-foreground">
                      All recorded buy and sell activity for your connected wallet.
                    </p>
                  </div>
                </div>
                <PoolTransactions />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-6">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold">Settlement History</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Progress bars and statuses for every sell request connected to this wallet.
                    </p>
                  </div>
                </div>

                {claimsError ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                    {claimsError}
                  </div>
                ) : isLoadingClaims ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Loading sell requests...
                  </div>
                ) : claims.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            ID
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            Requested
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            Settled
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            Progress
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {claims.map((claim) => {
                          const { requestedRaw, paidRaw, progressPct } =
                            getClaimProgress(claim);
                          const isPartiallySettled =
                            !claim.processed && paidRaw > BigInt(0);

                          return (
                            <tr
                              key={claim.id}
                              className="border-b border-border/30 last:border-0"
                            >
                              <td className="px-4 py-4 text-sm text-muted-foreground">
                                #{claim.id}
                              </td>
                              <td className="px-4 py-4 text-sm font-medium text-foreground">
                                ${formatUsdcAmount(BigInt(claim.requestedUsdc)).toLocaleString()}
                              </td>
                              <td className="px-4 py-4 text-sm font-medium text-foreground">
                                ${formatUsdcAmount(BigInt(claim.paidUsdc)).toLocaleString()}
                              </td>
                              <td className="min-w-[220px] px-4 py-4">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>
                                      {requestedRaw > BigInt(0) ? (
                                        <>
                                          ${formatUsdcAmount(paidRaw).toLocaleString()} / $
                                          {formatUsdcAmount(requestedRaw).toLocaleString()}
                                        </>
                                      ) : (
                                        "Settlement amount pending"
                                      )}
                                    </span>
                                    <span>{progressPct.toFixed(2)}%</span>
                                  </div>
                                  <div className="h-2 overflow-hidden rounded-full bg-border/60">
                                    <div
                                      className="h-full rounded-full bg-primary transition-all duration-500"
                                      style={{
                                        width: `${Math.max(0, Math.min(progressPct, 100))}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <Badge
                                  variant={claim.processed ? "secondary" : "default"}
                                  className={
                                    claim.processed
                                      ? "bg-secondary/20 text-secondary hover:bg-secondary/30"
                                      : isPartiallySettled
                                        ? "bg-primary/20 text-primary hover:bg-primary/30"
                                        : "bg-muted text-muted-foreground hover:bg-muted"
                                  }
                                >
                                  {claim.processed ? (
                                    <CheckCircle className="mr-1 h-3 w-3" />
                                  ) : (
                                    <AlertCircle className="mr-1 h-3 w-3" />
                                  )}
                                  {claim.processed
                                    ? "Settled"
                                    : isPartiallySettled
                                      ? "Partially Settled"
                                      : "Open"}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center">
                    <Wallet className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No settlement activity found</p>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
