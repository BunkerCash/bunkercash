"use client";

import Link from "next/link";
import { Layout } from "@/components/layout/Layout";
import { PageContainer } from "@/components/design/PageContainer";
import { BuyPrimaryInterface } from "@/components/BuyPrimaryInterface";
import { WithdrawInterface } from "@/components/WithdrawInterface";
import { ContextColumn } from "@/components/trade/ContextColumn";
import { cn } from "@/lib/utils";

export type TradeSide = "buy" | "sell";

function SideTab({
  side,
  active,
  href,
}: {
  side: TradeSide;
  active: boolean;
  href: string;
}) {
  const isBuy = side === "buy";
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        "flex h-9 items-center justify-center rounded-md text-[13.5px] font-semibold no-underline transition-colors hover:no-underline",
        active
          ? isBuy
            ? "bg-mint-soft text-mint shadow-[inset_0_0_0_1px_var(--mint-line)]"
            : "bg-sell-soft text-sell shadow-[inset_0_0_0_1px_var(--sell-line)]"
          : "text-ink-3 hover:text-ink-2",
      )}
    >
      {isBuy ? "Buy" : "Sell"}
    </Link>
  );
}

export function TradePageContent({ side }: { side: TradeSide }) {
  return (
    <Layout>
      <PageContainer className="gap-5">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Trade</h1>
          <span className="text-[13px] text-ink-3">
            Buy and sell BNKR at the on-chain reference rate. Non-custodial —
            every transaction is signed in your wallet.
          </span>
        </div>

        <div className="flex flex-wrap items-start gap-5">
          {/* Composer */}
          <section
            aria-label="Transaction composer"
            className="flex max-w-[600px] flex-[1.15_1_400px] flex-col gap-3.5 rounded-[14px] border border-line bg-surface p-4 desk:p-[18px]"
          >
            <div
              role="tablist"
              aria-label="Trade direction"
              className="grid grid-cols-2 gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
            >
              <SideTab side="buy" active={side === "buy"} href="/buy" />
              <SideTab side="sell" active={side === "sell"} href="/sell" />
            </div>

            {side === "buy" ? <BuyPrimaryInterface /> : <WithdrawInterface />}
          </section>

          <ContextColumn />
        </div>
      </PageContainer>
    </Layout>
  );
}
