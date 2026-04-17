"use client";

import { TradePageContent } from "@/components/TradePageContent";

export default function SellPage() {
  return (
    <TradePageContent
      title="Sell"
      description="Submit a sell request for protocol tokens or review your recent request history. Selling burns the selected token amount and settlement depends on available protocol liquidity."
      initialTab="withdraw"
      hiddenTabs={["buy-primary"]}
    />
  );
}
