"use client";

import { Layout } from "@/components/layout/Layout";
import { TradeInterface } from "@/components/TradeInterface";

export default function AcquireTokens() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Acquire Tokens
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Eligible users may acquire protocol tokens through the interface
              below, subject to access restrictions and available protocol
              parameters.
            </p>
          </div>

          <div>
            <TradeInterface hiddenTabs={["withdraw"]} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
