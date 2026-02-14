"use client";

import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { Info } from "lucide-react";

import { usePayoutVault } from "@/hooks/usePayoutVault";
import { useOpenClaimsCount } from "@/hooks/useOpenClaimsCount";
import { useTokenPrice } from "@/hooks/useTokenPrice";
import { useTokenBalance } from "@/hooks/useTokenBalance";

const PoolStatus = () => {
  const {
    balance: poolLiquidity,
    loading: liquidityLoading,
    error: liquidityError,
  } = usePayoutVault();
  const {
    count: openClaimsCount,
    loading: claimsLoading,
    error: claimsError,
  } = useOpenClaimsCount();
  const { price, loading: priceLoading, error: priceError } = useTokenPrice();
  const {
    balance,
    loading: balanceLoading,
    error: balanceError,
  } = useTokenBalance();

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Liquidity Pool Status
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Real-time transparency into the payout vault and active claims.
              This page is read-only.
            </p>
          </div>

          {/* Main Stats */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div>
              <StatCard
                label="My Bunker Cash Value"
                value={
                  balanceLoading || priceLoading ? (
                    <span className="text-muted-foreground text-2xl animate-pulse">
                      Loading...
                    </span>
                  ) : balanceError || priceError ? (
                    <span className="text-destructive text-sm">
                      Error loading data
                    </span>
                  ) : (
                    <span className="text-primary">
                      $
                      {(Number(balance) * (price || 0)).toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 2,
                        },
                      )}{" "}
                      USDC
                    </span>
                  )
                }
                note={`Based on your ${Number(balance).toLocaleString()} BNKR balance`}
                className="glow-primary h-full"
              />
            </div>

            <div>
              <StatCard
                label="Open Claims"
                value={
                  claimsLoading ? (
                    <span className="text-muted-foreground text-2xl animate-pulse">
                      Loading...
                    </span>
                  ) : claimsError ? (
                    <span className="text-destructive text-sm">
                      Error loading claims
                    </span>
                  ) : (
                    <span className="text-foreground">{openClaimsCount}</span>
                  )
                }
                note="Active claims waiting for payout"
                className="glass-card h-full"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-1 gap-6 mb-8">
            <div className="glass-card p-6 h-full">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  The values shown above are read directly from the Solana
                  blockchain. "Available Pool Liquidity" represents the USDC
                  balance in the program's payout vault. "Open Claims"
                  represents the number of active claim accounts that have not
                  yet been closed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PoolStatus;
