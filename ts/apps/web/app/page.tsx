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

            {/* Input Section */}
            <div className="space-y-4">
              <div>
                <label className="stat-label block mb-2">You Pay</label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={usdcAmount}
                    onChange={(e: any) => setUsdcAmount(e.target.value)}
                    className="pr-16 h-14 text-lg bg-muted/50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                    USDC
                  </span>
                </div>
              </div>

              <div className="flex justify-center">
                <div className="p-2 rounded-full bg-muted/50">
                  <ArrowDown className="h-4 w-4 text-muted-foreground" />
                </div>
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
                    className="pr-20 h-14 text-lg bg-muted/30"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                    BNKR
                  </span>
                </div>
              </div>
            </div>

            {/* Buy Button */}
            <Button className="w-full mt-6 h-12 text-base font-semibold">
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
