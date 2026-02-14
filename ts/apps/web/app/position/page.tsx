"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { Wallet, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useMyClaims } from "@/hooks/useMyClaims";

const MyPosition = () => {
  const { connected } = useWallet();
  const {
    balance: tokenBalance,
    loading: isLoadingBalance,
    error: fetchError,
  } = useTokenBalance();
  const { claims, loading: isLoadingClaims } = useMyClaims();

  // Calculate derived stats
  const lockedTokens = claims
    .filter((c) => !c.isClosed)
    .reduce((acc, c) => acc + Number(c.tokenAmountLocked) / 1e9, 0);

  const totalUsdcPaid = claims.reduce(
    (acc, c) => acc + Number(c.usdcPaid) / 1e6,
    0,
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

            {claims.length > 0 ? (
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
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim) => (
                      <tr
                        key={claim.id}
                        className="border-b border-border/30 last:border-0"
                      >
                        <td className="py-4 px-4 text-sm text-muted-foreground">
                          #{claim.id}
                        </td>
                        <td className="py-4 px-4 text-sm font-medium text-foreground">
                          {(
                            Number(claim.tokenAmountLocked) / 1e9
                          ).toLocaleString()}{" "}
                          BNKR
                        </td>
                        <td className="py-4 px-4 text-sm font-medium text-foreground">
                          ${(Number(claim.usdcPaid) / 1e6).toLocaleString()}
                        </td>
                        <td className="py-4 px-4">
                          <Badge
                            variant={claim.isClosed ? "secondary" : "default"}
                            className={
                              claim.isClosed
                                ? "bg-secondary/20 text-secondary hover:bg-secondary/30"
                                : "bg-primary/20 text-primary hover:bg-primary/30"
                            }
                          >
                            {claim.isClosed ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <AlertCircle className="h-3 w-3 mr-1" />
                            )}
                            {claim.isClosed ? "Closed" : "Open"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
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
};;

export default MyPosition;
