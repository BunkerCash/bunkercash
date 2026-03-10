"use client";

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { Wallet, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { type Claim, useMyClaims } from "@/hooks/useMyClaims";

const TOKEN_DECIMALS = 9;
const USDC_DECIMALS = 6;

function formatTokenAmount(raw: string) {
  return (Number(raw) / 10 ** TOKEN_DECIMALS).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function formatUsdcAmount(raw: bigint) {
  return Number(raw) / 10 ** USDC_DECIMALS;
}

function getClaimOwedRaw(claim: Claim) {
  if (!claim.priceUsdcPerTokenSnapshot) return null;
  return (
    (BigInt(claim.tokenAmountLocked) * BigInt(claim.priceUsdcPerTokenSnapshot)) /
    BigInt(10 ** TOKEN_DECIMALS)
  );
}

function getClaimProgress(claim: Claim) {
  const owedRaw = getClaimOwedRaw(claim);
  const paidRaw = BigInt(claim.usdcPaid);

  if (claim.isClosed) {
    return { owedRaw, paidRaw, progressPct: 100 };
  }

  if (!owedRaw || owedRaw <= BigInt(0)) {
    return { owedRaw, paidRaw, progressPct: paidRaw > BigInt(0) ? 100 : 0 };
  }

  const cappedPaidRaw = paidRaw > owedRaw ? owedRaw : paidRaw;
  const progressPct = Number((cappedPaidRaw * BigInt(10000)) / owedRaw) / 100;
  return { owedRaw, paidRaw: cappedPaidRaw, progressPct };
}

const MyPosition = () => {
  const { connected } = useWallet();
  const {
    balance: tokenBalance,
    loading: isLoadingBalance,
    error: fetchError,
  } = useTokenBalance();
  const { claims, loading: isLoadingClaims, error: claimsError } = useMyClaims();

  const lockedTokens = useMemo(
    () =>
      claims
        .filter((c) => !c.isClosed)
        .reduce((acc, c) => acc + Number(c.tokenAmountLocked) / 10 ** TOKEN_DECIMALS, 0),
    [claims]
  );

  const totalUsdcPaid = useMemo(
    () => claims.reduce((acc, c) => acc + Number(c.usdcPaid) / 10 ** USDC_DECIMALS, 0),
    [claims]
  );

  const totalClaims = claims.length;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              My Position
            </h1>
            {!connected && (
              <p className="text-muted-foreground text-sm">
                Connect wallet to see your real balance
              </p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div>
              <StatCard
                label={
                  isLoadingBalance
                    ? "Loading..."
                    : fetchError
                      ? "Error"
                      : "Token Balance"
                }
                value={
                  !connected
                    ? "-"
                    : isLoadingBalance
                      ? "..."
                      : fetchError
                        ? "N/A"
                        : `${tokenBalance} BNKR`
                }
                note={
                  fetchError ? (
                    <span className="text-destructive">Network Error</span>
                  ) : connected ? (
                    "Current wallet balance"
                  ) : (
                    "Connect wallet"
                  )
                }
              />
            </div>
            <div>
              <StatCard
                label="Locked Tokens"
                value={
                  !connected ? "-" : `${lockedTokens.toLocaleString()} BNKR`
                }
                note="In open claims"
              />
            </div>
            <div>
              <StatCard
                label="Total USDC Paid"
                value={
                  !connected ? (
                    "-"
                  ) : (
                    <span className="text-primary">
                      ${totalUsdcPaid.toLocaleString()}
                    </span>
                  )
                }
                note="Lifetime earnings"
              />
            </div>
            <div>
              <StatCard
                label="Total Claims"
                value={!connected ? "-" : totalClaims.toString()}
                note="Registered sells"
              />
            </div>
          </div>

          {/* Claims History */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Registered Sells</h2>
            </div>

            {claimsError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {claimsError}
              </div>
            ) : isLoadingClaims ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Loading claims...
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
                        Locked Amount
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        USDC Paid
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
                      const { owedRaw, paidRaw, progressPct } = getClaimProgress(claim);
                      const isPartiallyPaid = !claim.isClosed && paidRaw > BigInt(0);

                      return (
                        <tr
                          key={claim.id}
                          className="border-b border-border/30 last:border-0"
                        >
                          <td className="py-4 px-4 text-sm text-muted-foreground">
                            #{claim.id}
                          </td>
                          <td className="py-4 px-4 text-sm font-medium text-foreground">
                            {formatTokenAmount(claim.tokenAmountLocked)} BNKR
                          </td>
                          <td className="py-4 px-4 text-sm font-medium text-foreground">
                            ${formatUsdcAmount(BigInt(claim.usdcPaid)).toLocaleString()}
                          </td>
                          <td className="py-4 px-4 min-w-[220px]">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>
                                  {owedRaw ? (
                                    <>
                                      ${formatUsdcAmount(paidRaw).toLocaleString()} / $
                                      {formatUsdcAmount(owedRaw).toLocaleString()}
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
                                  style={{ width: `${Math.max(0, Math.min(progressPct, 100))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <Badge
                              variant={claim.isClosed ? "secondary" : "default"}
                              className={
                                claim.isClosed
                                  ? "bg-secondary/20 text-secondary hover:bg-secondary/30"
                                  : isPartiallyPaid
                                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                                    : "bg-muted text-muted-foreground hover:bg-muted"
                              }
                            >
                              {claim.isClosed ? (
                                <CheckCircle className="mr-1 h-3 w-3" />
                              ) : (
                                <AlertCircle className="mr-1 h-3 w-3" />
                              )}
                              {claim.isClosed
                                ? "Closed"
                                : isPartiallyPaid
                                  ? "Partially Paid"
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
                <p className="text-muted-foreground">
                  {!connected
                    ? "Connect wallet to view claims"
                    : "No registered sells found"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default MyPosition;
