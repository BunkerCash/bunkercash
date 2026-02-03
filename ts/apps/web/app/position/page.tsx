"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { Wallet, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const payoutHistory = [
  { date: "2024-01-14", amount: 1500, status: "completed" },
  { date: "2024-01-10", amount: 800, status: "completed" },
  { date: "2024-01-05", amount: 1200, status: "pending" },
];

const MyPosition = () => {
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();

  // Simulated Data (Demo)
  const registeredTokens = 500;
  const amountPaidOut = 2300;
  const amountPending = 1200;

  // Fetch token balance
  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connected) {
      setTokenBalance(0);
      setFetchError(null);
      return;
    }

    setIsLoadingBalance(true);
    setFetchError(null);
    try {
      const balance = await connection.getBalance(publicKey);
      const solBalance = balance / 1e9;
      const bnkrBalance = solBalance * 1000;
      setTokenBalance(bnkrBalance);
    } catch (error) {
      console.error("Error fetching balance:", error);
      setFetchError("Failed to fetch balance");
    } finally {
      setIsLoadingBalance(false);
    }
  }, [publicKey, connected, connection]);

  useEffect(() => {
    if (!publicKey || !connected) {
      setTokenBalance(0);
      return;
    }

    fetchBalance();

    let subscriptionId: number | undefined;

    try {
      subscriptionId = connection.onAccountChange(
        publicKey,
        (updatedAccountInfo) => {
          const balance = updatedAccountInfo.lamports;
          const solBalance = balance / 1e9;
          const bnkrBalance = solBalance * 1000;
          setTokenBalance(bnkrBalance);
        },
        "confirmed",
      );
    } catch (error) {
      console.error("Failed to subscribe to account changes:", error);
    }

    return () => {
      if (subscriptionId !== undefined) {
        try {
          connection.removeAccountChangeListener(subscriptionId);
        } catch (e) {
          console.error("Error removing listener:", e);
        }
      }
    };
  }, [publicKey, connected, connection, fetchBalance]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10 animate-fade-in">
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
            <div
              className="animate-slide-up"
              style={{ animationDelay: "0.1s" }}
            >
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
                        : `${tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} BNKR`
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
            <div
              className="animate-slide-up"
              style={{ animationDelay: "0.15s" }}
            >
              <StatCard
                label="Registered Tokens"
                value={`${registeredTokens.toLocaleString()} BNKR`}
                note="Simulated (Demo)"
              />
            </div>
            <div
              className="animate-slide-up"
              style={{ animationDelay: "0.2s" }}
            >
              <StatCard
                label="Amount Paid Out"
                value={
                  <span className="text-primary">
                    ${amountPaidOut.toLocaleString()}
                  </span>
                }
                note="Simulated (Demo)"
              />
            </div>
            <div
              className="animate-slide-up"
              style={{ animationDelay: "0.25s" }}
            >
              <StatCard
                label="Amount Pending"
                value={
                  <span className="text-secondary">
                    ${amountPending.toLocaleString()}
                  </span>
                }
                note="Simulated (Demo)"
              />
            </div>
          </div>

          {/* Payout History */}
          <div
            className="glass-card p-6 animate-slide-up"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="flex items-center gap-2 mb-6">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Payout History</h2>
            </div>

            {payoutHistory.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Date
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutHistory.map((item, index) => (
                      <tr
                        key={index}
                        className="border-b border-border/30 last:border-0"
                      >
                        <td className="py-4 px-4 text-sm text-muted-foreground">
                          {item.date}
                        </td>
                        <td className="py-4 px-4 text-sm font-medium text-foreground">
                          ${item.amount.toLocaleString()}
                        </td>
                        <td className="py-4 px-4">
                          <Badge
                            variant={
                              item.status === "completed"
                                ? "default"
                                : "secondary"
                            }
                            className={
                              item.status === "completed"
                                ? "bg-primary/20 text-primary hover:bg-primary/30"
                                : "bg-secondary/20 text-secondary hover:bg-secondary/30"
                            }
                          >
                            {item.status === "completed" ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <AlertCircle className="h-3 w-3 mr-1" />
                            )}
                            {item.status}
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
                  No payout history available
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
