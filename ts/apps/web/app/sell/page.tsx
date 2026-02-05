"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { RefreshCcw } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { WarningBox } from "@/components/ui/WarningBox";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import WalletButton from "@/components/wallet/WalletButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SellRegistration = () => {
  const [tokenAmount, setTokenAmount] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();

  // Define fetchBalance as a reusable function
  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connected) {
      setTokenBalance(0);
      return;
    }

    setIsLoadingBalance(true);
    try {
      const balance = await connection.getBalance(publicKey);
      const solBalance = balance / 1e9;
      const bnkrBalance = solBalance * 1000;
      setTokenBalance(bnkrBalance);
    } catch (error) {
      console.error("Error fetching balance:", error);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [publicKey, connected, connection]);

  // Initial fetch and subscribe to account changes
  useEffect(() => {
    if (!publicKey || !connected) return;

    // Initial fetch
    fetchBalance();

    // Subscribe to account changes (live updates)
    const subscriptionId = connection.onAccountChange(
      publicKey,
      (updatedAccountInfo) => {
        const balance = updatedAccountInfo.lamports;
        const solBalance = balance / 1e9;
        const bnkrBalance = solBalance * 1000;
        setTokenBalance(bnkrBalance);
      },
      "confirmed",
    );

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [publicKey, connected, connection, fetchBalance]);

  const handleRegister = () => {
    if (parseFloat(tokenAmount) > 0) {
      setIsModalOpen(true);
    }
  };

  const handleConfirm = () => {
    setIsModalOpen(false);
    setIsConfirmed(false);
    setTokenAmount("");
    // Handle actual registration
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10 animate-fade-in">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Sell Registration
            </h1>
            <p className="text-muted-foreground mb-4">Liquidity Based</p>

            {/* Wallet Connection Section */}
            <div className="flex flex-col items-center gap-3 mb-4">
              <WalletButton />
              {connected && (
                <div className="text-xs text-muted-foreground">
                  Connected to Solana Devnet
                </div>
              )}
            </div>
          </div>

          {/* Show connection prompt if not connected */}
          {!connected && (
            <div className="glass-card p-8 text-center mb-8">
              <h2 className="text-xl font-semibold mb-3">
                Connect Your Wallet
              </h2>
              <p className="text-muted-foreground">
                Please connect your Solana wallet to view your balance and
                register tokens for sell.
              </p>
            </div>
          )}

          {/* Warning Box */}
          <div
            className="mb-8 animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            <WarningBox title="Important Notice">
              <ul className="list-disc list-inside space-y-1">
                <li>Registering a sell is optional and irreversible.</li>
                <li>
                  Tokens registered for sell will be permanently removed from
                  circulation.
                </li>
                <li>
                  Tokens are destroyed (burned) and cannot be traded again.
                </li>
                <li>
                  Payouts, if any, depend entirely on available liquidity.
                </li>
                <li>
                  There is no obligation, no entitlement, and no guaranteed
                  timeframe.
                </li>
              </ul>
            </WarningBox>
          </div>

          {/* Balance Card - Only show when connected */}
          {connected && (
            <>
              <div
                className="mb-6 animate-slide-up"
                style={{ animationDelay: "0.15s" }}
              >
                <div className="relative">
                  <StatCard
                    label={
                      isLoadingBalance
                        ? "Loading Balance..."
                        : "Your Token Balance"
                    }
                    value={
                      isLoadingBalance
                        ? "..."
                        : `${tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} BNKR`
                    }
                  />
                  <button
                    onClick={fetchBalance}
                    disabled={isLoadingBalance}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted/50 transition-colors"
                    title="Refresh Balance"
                  >
                    <RefreshCcw
                      className={`w-4 h-4 text-muted-foreground ${
                        isLoadingBalance ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                </div>
                <div className="text-xs text-muted-foreground text-center mt-2">
                  Demo: 1 SOL = 1000 BNKR tokens
                </div>
              </div>

              {/* Registration Card */}
              <div
                className="glass-card p-6 animate-slide-up"
                style={{ animationDelay: "0.2s" }}
              >
                <h2 className="text-lg font-semibold mb-6">
                  Register Tokens for Sell
                </h2>

                <div className="mb-6">
                  <label className="stat-label block mb-2">Token Amount</label>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={tokenAmount}
                      onChange={(e) => setTokenAmount(e.target.value)}
                      max={tokenBalance}
                      className="pr-16 h-14 text-lg bg-transparent"
                      disabled={!connected}
                    />
                    <button
                      onClick={() => setTokenAmount(tokenBalance.toString())}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-primary text-sm font-medium hover:underline disabled:opacity-50"
                      disabled={!connected}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleRegister}
                  className="w-full h-12 text-base font-semibold"
                  disabled={
                    !connected || !tokenAmount || parseFloat(tokenAmount) <= 0
                  }
                >
                  Register Sell
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Confirm Sell Registration
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              By continuing, you understand and accept that:
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-destructive">•</span>
                Your tokens will be permanently destroyed
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive">•</span>
                You will no longer participate in market price movements
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive">•</span>
                Any payout depends solely on available liquidity
              </li>
              <li className="flex items-start gap-2">
                <span className="text-destructive">•</span>
                Payouts may be partial, delayed, or not occur at all
              </li>
            </ul>

            <div className="flex items-center gap-3 mt-6 p-3 rounded-lg bg-muted/30">
              <Checkbox
                id="confirm"
                checked={isConfirmed}
                onCheckedChange={(checked) =>
                  setIsConfirmed(checked as boolean)
                }
              />
              <label
                htmlFor="confirm"
                className="text-sm text-foreground cursor-pointer"
              >
                I understand and accept
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!isConfirmed}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default SellRegistration;
