import { Layout } from "@/components/layout/Layout";
import {
  BookOpen,
  TrendingUp,
  ArrowLeftRight,
  Coins,
  AlertTriangle,
  Scale,
} from "lucide-react";

const Information = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              How BunkerCash works
            </h1>
            <p className="text-muted-foreground text-lg">
              A plain-language guide to buying, selling, and how the price is
              set. Risks and limitations are summarized at the bottom.
            </p>
          </div>

          <div className="space-y-6">
            {/* What it is */}
            <section className="glass-card p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">What BunkerCash is</h2>
              </div>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  BunkerCash (BNKR) is a digital token you buy with USDC and
                  sell back for USDC, all on the Solana blockchain. Its price is
                  set by the protocol from on-chain pool data — there is no order
                  book and no third-party market maker.
                </p>
                <p>
                  Holding BNKR is not ownership of any company, asset, or revenue
                  stream. It is a digital token whose value can rise, fall, or
                  reach zero.
                </p>
              </div>
            </section>

            {/* Pricing */}
            <section className="glass-card p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-primary/10">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">How the price works</h2>
              </div>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  The price is a <span className="text-foreground font-medium">reference rate</span>{" "}
                  shown as <span className="text-foreground font-medium">USDC per token</span>. It is
                  calculated on-chain as:
                </p>
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-foreground">
                  reference rate = available pool value (NAV) ÷ circulating token supply
                </div>
                <p>
                  The rate moves when the pool&rsquo;s Net Asset Value (NAV) or
                  the circulating supply changes — for example when people buy or
                  sell, when sell requests settle, or when the pool&rsquo;s NAV
                  is updated. Both buying and selling use this same protocol
                  rate, so there is no spread between a &ldquo;buy price&rdquo;
                  and a &ldquo;sell price.&rdquo;
                </p>
              </div>
            </section>

            {/* Buying & selling */}
            <section className="glass-card p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-primary/10">
                  <ArrowLeftRight className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Buying and selling</h2>
              </div>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  <span className="text-foreground font-medium">Buying is instant.</span>{" "}
                  You send USDC and receive newly minted BNKR at the current
                  reference rate. Buys may be subject to per-wallet purchase
                  limits and regional eligibility checks.
                </p>
                <p>
                  <span className="text-foreground font-medium">Selling is a request, not an instant swap.</span>{" "}
                  When you sell, your BNKR is locked in the pool and a sell
                  request is created. You receive USDC when a{" "}
                  <span className="text-foreground font-medium">settlement</span>{" "}
                  runs, which pays requests from the pool&rsquo;s available
                  (&ldquo;liquid&rdquo;) USDC. If liquidity is limited, a request
                  may settle partially and the rest pays out as more liquidity
                  becomes available.
                </p>
                <p>
                  You can track a sell under{" "}
                  <span className="text-foreground font-medium">Transactions</span>{" "}
                  or <span className="text-foreground font-medium">History</span>,
                  where it shows as Pending, Partially settled, or Settled. While
                  a request is still pending you can{" "}
                  <span className="text-foreground font-medium">cancel</span> it
                  to get your locked BNKR back.
                </p>
                <p>
                  <span className="text-foreground font-medium">BunkerCash trades in USDC only</span>{" "}
                  — there is no buying or selling with SOL. You only need a small
                  amount of SOL in your wallet to pay Solana network fees.
                </p>
              </div>
            </section>

            {/* What happens to tokens */}
            <section className="glass-card p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Coins className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">What happens to your tokens</h2>
              </div>
              <ul className="space-y-3 text-muted-foreground leading-relaxed">
                <li className="flex gap-3">
                  <span className="text-primary">•</span>
                  <span>
                    <span className="text-foreground font-medium">Buy:</span> new
                    BNKR is minted to your wallet and circulating supply
                    increases.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">•</span>
                  <span>
                    <span className="text-foreground font-medium">Sell request:</span>{" "}
                    your BNKR is moved into pool escrow (locked, not yet
                    destroyed) and removed from circulating supply.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">•</span>
                  <span>
                    <span className="text-foreground font-medium">Settled:</span>{" "}
                    the settled portion of escrowed BNKR is permanently burned
                    and you receive the corresponding USDC.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-primary">•</span>
                  <span>
                    <span className="text-foreground font-medium">Cancelled:</span>{" "}
                    escrowed BNKR is returned to your wallet and rejoins
                    circulating supply.
                  </span>
                </li>
              </ul>
            </section>

            {/* Risks */}
            <section className="glass-card p-8 border-destructive/30">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold">Risks &amp; limitations</h2>
              </div>
              <ul className="space-y-3 text-muted-foreground leading-relaxed">
                <li className="flex gap-3">
                  <span className="text-destructive">•</span>
                  <span>
                    <span className="text-foreground font-medium">No guaranteed liquidity or timing.</span>{" "}
                    Sells settle only from available pool liquidity. You may not
                    be able to convert tokens quickly, fully, or at all.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-destructive">•</span>
                  <span>
                    <span className="text-foreground font-medium">Value can fall to zero.</span>{" "}
                    The reference rate can decrease substantially. Only use funds
                    you can afford to lose.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-destructive">•</span>
                  <span>
                    <span className="text-foreground font-medium">Technical risk.</span>{" "}
                    Smart contracts and the Solana network can have bugs,
                    outages, or congestion that delay or block actions.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="text-destructive">•</span>
                  <span>
                    <span className="text-foreground font-medium">Access can be restricted.</span>{" "}
                    Availability depends on your jurisdiction and eligibility,
                    and can be limited or suspended at any time.
                  </span>
                </li>
              </ul>
              <p className="mt-5 text-sm text-muted-foreground leading-relaxed">
                This page is informational only and is not financial, investment,
                legal, or tax advice, nor an offer or solicitation. All
                information is provided &ldquo;as is.&rdquo; By using BunkerCash
                you accept these risks. See the{" "}
                <a href="/imprint" className="text-primary hover:underline">
                  imprint
                </a>{" "}
                for legal details.
              </p>
            </section>

            <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
              <Scale className="h-4 w-4" />
              <span>Transparent, on-chain, and protocol-defined.</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Information;
