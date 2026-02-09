"use client";

import { Layout } from "@/components/layout/Layout";
import { TradeInterface } from "@/components/TradeInterface";

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
              Register tokens for sell (escrow lock) or view pool transactions.
            </p>
          </div>

          <div className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
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
