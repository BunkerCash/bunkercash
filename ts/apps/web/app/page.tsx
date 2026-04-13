"use client";

import Link from "next/link";
import { Layout } from "@/components/layout/Layout";
import { StatCard } from "@/components/ui/StatCard";
import { PROGRAM_ID } from "@/lib/program";

export default function Home() {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "testnet";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
              Overview
            </h1>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              Bunker Cash is an access-restricted digital token protocol. The
              protocol does not provide ownership in assets, rights to revenue,
              guaranteed liquidity, or guaranteed future value. Protocol
              functions are available only in eligible jurisdictions and subject
              to applicable restrictions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <StatCard label="Protocol Status" value="Active" />
            <StatCard
              label="Network"
              value={cluster.charAt(0).toUpperCase() + cluster.slice(1)}
            />
            <StatCard
              label="Token Identifier"
              value={
                <span
                  className="text-sm break-all"
                  title={PROGRAM_ID.toBase58()}
                >
                  {PROGRAM_ID.toBase58()}
                </span>
              }
            />
            <StatCard
              label="Last Update"
              value="—"
            />
          </div>

          {/* Disclaimers */}
          <div className="glass-card p-6 mb-8 space-y-2 text-sm text-muted-foreground">
            <p>No public market price exists for this protocol token.</p>
            <p>Total value locked is not publicly disclosed.</p>
            <p>Reference value is determined by the protocol administrator and is not independently verifiable.</p>
          </div>

          {/* Primary CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/acquire"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Check Access
            </Link>
            <Link
              href="/information"
              className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"
            >
              View Mechanics
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
