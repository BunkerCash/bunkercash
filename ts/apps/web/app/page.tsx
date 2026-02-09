"use client";

import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { TradeInterface } from "@/components/TradeInterface";

export default function Home() {
  const marketPrice = 1.24;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10 animate-fade-in">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Buy Token
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Bunker Cash is a freely tradable digital token. The token price is
              determined exclusively by open market activity. There is no
              guarantee of value, liquidity, or future price development.
            </p>
          </div>

          {/* Market Price Card */}
          <div
            className="mb-8 animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            <StatCard
              label="Current Market Price"
              value={
                <span className="text-primary">
                  ${marketPrice.toFixed(2)} USD
                </span>
              }
              note="Market price is determined by supply and demand."
              className="glow-primary"
            />
          </div>

          {/* Trade Interface */}
          <div className="animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <TradeInterface hiddenTabs={["withdraw"]} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
