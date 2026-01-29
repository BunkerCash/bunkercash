"use client";

import { Header } from "@/components/Header";
import { FundCard } from "@/components/FundCard";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-6 py-20">
        <section className="mb-32 text-center animate-fade-in-up">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">BunkerCash</h1>
          <p className="text-xl md:text-2xl text-neutral-400 mb-4 max-w-3xl mx-auto">
            Bridges real estate and DeFi — turning property yield into on-chain
            liquidity.
          </p>
          <div className="text-[#00FFB2] text-lg font-medium mb-2">
            Backed by overcollateralized, transparent real estate assets.
          </div>
          <p className="text-neutral-600 text-sm max-w-2xl mx-auto">
            Mint. Trade. Earn. Own real yield on Solana.
          </p>
        </section>

        <section id="about" className="mb-20">
          <h2 className="text-2xl font-medium mb-16 text-center text-neutral-300 animate-fade-in-up delay-100">
            Pick a BunkerCash Fund to Continue
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
            <div className="animate-fade-in-up delay-200">
              <FundCard
                name="bRENT"
                apy={6}
                description="Real estate rented out"
                issuedAmount="$20,000"
                href="/brent"
              />
            </div>

            <div className="animate-fade-in-up delay-300">
              <FundCard
                name="bBUILD"
                targetApy={10}
                description="Real estate project development"
                comingSoon
              />
            </div>

            <div className="animate-fade-in-up delay-500">
              <FundCard
                name="bPRIME"
                description="The most diversified RWA basket — combining real estate rental yield, development projects, and external monetary funds"
                comingSoon
                comingSoonText="COMING 2026"
              />
            </div>
          </div>
        </section>

        <section className="text-center text-neutral-600 text-sm max-w-2xl mx-auto py-16">
          <p>Semi-liquid, DeFi-native real-estate yield tokens on Solana</p>
        </section>
      </main>
    </div>
  );
}
