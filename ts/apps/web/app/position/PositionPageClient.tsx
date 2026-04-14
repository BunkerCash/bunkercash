"use client";

import { useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { Wallet, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { type Claim, useMyClaims } from "@/hooks/useMyClaims";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";

const USDC_DECIMALS = 6;

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

  const progressPct = Number((cappedPaidRaw * BigInt(10000)) / requestedRaw) / 100;
  return { requestedRaw, paidRaw: cappedPaidRaw, progressPct };
}

export default function PositionPageClient() {
  const wallet = useOptionalWallet();
  const connected = wallet?.connected ?? false;
  const {
    balance: tokenBalance,
    loading: isLoadingBalance,
    error: fetchError,
  } = useTokenBalance();
  const { claims, loading: isLoadingClaims, error: claimsError } = useMyClaims();

  const openRequests = useMemo(
    () => claims.filter((c) => !c.processed).length,
    [claims],
  );

  const totalRequestedUsdc = useMemo(
    () =>
      claims.reduce(
        (acc, c) => acc + Number(c.requestedUsdc) / 10 ** USDC_DECIMALS,
        0,
      ),
    [claims],
  );

  const totalSettledUsdc = useMemo(
    () =>
      claims.reduce(
        (acc, c) => acc + Number(c.paidUsdc) / 10 ** USDC_DECIMALS,
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
              <h1 className="text-3xl font-bold text-foreground mb-4">
                My Activity
              </h1>
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-500">
              Complete access check and connect wallet to view your activity.
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              My Activity
            </h1>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <StatCard
              label={
                isLoadingBalance
                  ? "Loading..."
                  : fetchError
                    ? "Error"
                    : "Token Balance"
              }
              value={
                isLoadingBalance
                  ? "..."
                  : fetchError
                    ? "N/A"
                    : `${tokenBalance} BNKR`
              }
              note={
                fetchError ? (
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
            <StatCard
              label="Requested Amount"
              value={
                <span className="text-primary">
                  ${totalRequestedUsdc.toLocaleString()}
                </span>
              }
              note="Total submitted requests"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            <StatCard
              label="Settled Amount"
              value={`$${totalSettledUsdc.toLocaleString()}`}
              note="Total completed settlements"
            />
            <StatCard
              label="Total Requests"
              value={totalRequests.toString()}
              note="Submitted requests"
            />
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Request History</h2>
            </div>

            {claimsError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {claimsError}
              </div>
            ) : isLoadingClaims ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Loading requests...
              </div>
            ) : claims.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        ID
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Requested
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Settled
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Progress
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
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
                          <td className="py-4 px-4 text-sm text-muted-foreground">
                            #{claim.id}
                          </td>
                          <td className="py-4 px-4 text-sm font-medium text-foreground">
                            ${formatUsdcAmount(BigInt(claim.requestedUsdc)).toLocaleString()}
                          </td>
                          <td className="py-4 px-4 text-sm font-medium text-foreground">
                            ${formatUsdcAmount(BigInt(claim.paidUsdc)).toLocaleString()}
                          </td>
                          <td className="py-4 px-4 min-w-[220px]">
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
                          <td className="py-4 px-4">
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
              <div className="text-center py-12">
                <Wallet className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">No requests found</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
