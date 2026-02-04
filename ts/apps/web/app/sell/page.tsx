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
            <p className="text-muted-foreground mb-4">
              Irreversible escrow lock (no burn)
            </p>
            <div className="flex flex-col items-center gap-3 mb-4">
              <WalletButton />
            </div>
          </div>

          <div className="mb-8 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <WarningBox title="Important Notice">
              <ul className="list-disc list-inside space-y-1">
                <li>Registering a sell is optional and irreversible.</li>
                <li>Tokens are locked into a program-owned escrow vault (not burned).</li>
                <li>Payouts, if any, depend entirely on available liquidity.</li>
                <li>There is no obligation, no entitlement, and no guaranteed timeframe.</li>
              </ul>
            </WarningBox>
          </div>

          <WithdrawInterface />
        </div>
      </div>
    </Layout>
  );
}
