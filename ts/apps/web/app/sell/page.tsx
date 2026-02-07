"use client";

import { Layout } from "@/components/layout/Layout";
import { WarningBox } from "@/components/ui/WarningBox";
import WalletButton from "@/components/wallet/WalletButton";
import { WithdrawInterface } from "@/components/WithdrawInterface";

export default function SellRegistration() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
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
                <li>Tokens are locked into a program-owned escrow vault (not burned).</li>
                <li>Payouts, if any, depend entirely on available liquidity.</li>
                <li>There is no obligation, no entitlement, and no guaranteed timeframe.</li>
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
    </Layout>
  );
}
