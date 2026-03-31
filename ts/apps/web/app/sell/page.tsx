"use client";

import { Layout } from "@/components/layout/Layout";
import { TradeInterface } from "@/components/TradeInterface";

export default function SubmitRequest() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Submit Request
            </h1>
            <p className="text-muted-foreground mb-4">
              Submit a settlement request for protocol tokens, or review your
              recent request history.
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
