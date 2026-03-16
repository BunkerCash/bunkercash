"use client";

import { Layout } from "@/components/layout/Layout";
import { TradeInterface } from "@/components/TradeInterface";

export default function SellRegistration() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              File Claim
            </h1>
            <p className="text-muted-foreground mb-4">
              Burn bRENT to create a pending USDC redemption claim, or review
              your recent pool transactions.
            </p>
          </div>

          <div>
            <TradeInterface
              initialTab="withdraw"
              hiddenTabs={["buy-primary"]}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
