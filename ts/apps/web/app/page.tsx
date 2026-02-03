"use client";

import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDown, Info } from "lucide-react";

export default function Home() {
  const [usdcAmount, setUsdcAmount] = useState("");
  const marketPrice = 1.24;

  const estimatedTokens = usdcAmount
    ? (parseFloat(usdcAmount) / marketPrice).toFixed(4)
    : "0.0000";

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

          {/* Buy Card */}
          <div
            className="glass-card p-6 animate-slide-up"
            style={{ animationDelay: "0.2s" }}
          >
            <h2 className="text-lg font-semibold mb-6">Purchase Tokens</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
            <div className={`transition-all duration-700 delay-100 ${showFunds ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <FundCard
                name="bRENT"
                apy={6}
                description="Real estate rented out · Buy at fixed price"
                issuedAmount="$20,000"
                href="/brent"
              />
            </div>

              <div>
                <label className="stat-label block mb-2">
                  You Receive (Estimated)
                </label>
                <div className="relative">
                  <Input
                    type="text"
                    value={estimatedTokens}
                    readOnly
                    className="pr-20 h-14 text-lg bg-transparent"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                    BNKR
                  </span>
                </div>
              </div>
            </div>

            {/* Buy Button */}
            <Button className="w-full mt-6 h-12 text-base font-semibold bg-primary text-primary-foreground">
              Buy Token
            </Button>

            {/* Disclaimer */}
            <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-muted/30">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Tokens are purchased via open market liquidity using your
                connected wallet. Actual amount received may vary due to market
                conditions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
