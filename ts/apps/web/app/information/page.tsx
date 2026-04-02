import { Layout } from "@/components/layout/Layout";
import { WarningBox } from "@/components/ui/WarningBox";
import { Shield, AlertTriangle, Info, FileText, BookOpen } from "lucide-react";

const Information = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Information & Whitepaper
            </h1>
            <p className="text-muted-foreground text-lg">
              Complete documentation and risk disclosure for Bunkercoin Cash
            </p>
          </div>

          {/* Main Warning */}
          <div className="mb-8">
            <WarningBox title="Please Read Carefully">
              <p>
                This page contains critical information about the nature of
                Bunkercoin Cash tokens and associated risks. Reading and
                understanding this information is essential before any
                interaction with this platform.
              </p>
            </WarningBox>
          </div>

          {/* Information Sections */}
          <div className="space-y-8">
            {/* Whitepaper Section */}
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">Whitepaper</h2>
              </div>

              <div className="space-y-6 text-muted-foreground">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Overview
                  </h3>
                  <p className="leading-relaxed">
                    Bunkercoin Cash is a freely tradable digital token designed
                    to support long-term system activity through an optional
                    liquidity-based mechanism. It does not represent ownership,
                    equity, debt, or a claim on any specific asset.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Protocol Mechanics
                  </h3>
                  <p className="leading-relaxed mb-3">
                    The protocol facilitates optional liquidity-based token
                    buybacks funded by external business activities. These
                    buybacks depend solely on available liquidity and are not
                    guaranteed, scheduled, or obligated.
                  </p>
                  <p className="leading-relaxed">
                    Tokens registered for sell are permanently locked and cannot
                    be traded or transferred again. Once registered, tokens
                    await potential buyback based on liquidity availability,
                    which may occur at any time or not at all.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Key Principles
                  </h3>
                  <ul className="space-y-2 ml-4">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>
                        <strong className="text-foreground">
                          No Guarantees:
                        </strong>{" "}
                        No guarantees of value, liquidity, or buyback execution
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>
                        <strong className="text-foreground">
                          Liquidity-Based:
                        </strong>{" "}
                        All mechanisms depend on discretionary liquidity
                        provision
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>
                        <strong className="text-foreground">
                          No Ownership:
                        </strong>{" "}
                        Tokens do not confer ownership rights or entitlements
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-1">•</span>
                      <span>
                        <strong className="text-foreground">
                          Permanent Lock:
                        </strong>{" "}
                        Registered tokens are irreversibly locked from trading
                      </span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    Tokenomics
                  </h3>
                  <p className="leading-relaxed">
                    Token value is determined solely by market forces of supply
                    and demand. There is no intrinsic value, no backing by
                    assets, and no guaranteed price floor. The buyback mechanism
                    provides optional exit liquidity when and if external
                    business activities generate sufficient funds.
                  </p>
                </div>
              </div>
            </div>

            {/* Token Nature */}
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-secondary/10">
                  <Info className="h-5 w-5 text-secondary" />
                </div>
                <h2 className="text-xl font-semibold">Token Nature</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Bunkercoin Cash is a digital token with no ownership rights, no
                claims, and no linkage to specific assets. The token does not
                represent any share, equity, debt, or other financial
                instrument. Holding tokens does not create any contractual
                relationship or entitlement to any benefits, profits, or
                distributions.
              </p>
            </div>

            {/* Asset Separation */}
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">
                  Real-World Asset Separation
                </h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Real-world activities, including real-world assets, are not
                tokenized and are not represented on-chain. There is no direct
                or indirect connection between token holdings and any physical
                or financial assets. The token exists solely as a digital
                instrument on the blockchain, completely separate from any
                off-chain business operations.
              </p>
            </div>

            {/* Liquidity Notice */}
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold">Liquidity Provision</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Any liquidity made available for optional token buybacks is
                entirely discretionary and depends on external business
                decisions and available funds. There is no guarantee that
                liquidity will be provided at any time, in any amount, or at any
                particular price. Liquidity availability may change without
                notice and may be insufficient to fulfill all pending
                registrations. No timeline or schedule for buybacks exists or is
                implied.
              </p>
            </div>

            {/* Risk Disclosure */}
            <div className="glass-card p-6 border-destructive/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <h2 className="text-xl font-semibold text-destructive">
                  Risk Notice & Disclosure
                </h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed font-semibold text-foreground">
                  Participation involves market risk, liquidity risk, and
                  potential total loss. This website is provided for
                  informational purposes only.
                </p>
                <p className="leading-relaxed">
                  Token participation involves significant risks including but
                  not limited to:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    <strong className="text-foreground">Market Risk:</strong>{" "}
                    Token value may decrease substantially or become zero with
                    no guarantee of recovery
                  </li>
                  <li>
                    <strong className="text-foreground">Liquidity Risk:</strong>{" "}
                    You may not be able to sell or convert tokens at any price
                    or at all
                  </li>
                  <li>
                    <strong className="text-foreground">Technical Risk:</strong>{" "}
                    Smart contracts may contain bugs, vulnerabilities, or
                    exploits
                  </li>
                  <li>
                    <strong className="text-foreground">
                      Regulatory Risk:
                    </strong>{" "}
                    Legal status may change in your jurisdiction, potentially
                    restricting access
                  </li>
                  <li>
                    <strong className="text-foreground">
                      Counterparty Risk:
                    </strong>{" "}
                    No guarantees exist regarding platform operation or
                    continuity
                  </li>
                  <li>
                    <strong className="text-foreground">Total Loss:</strong> You
                    may lose your entire participation amount without recourse
                  </li>
                </ul>
                <p className="leading-relaxed text-sm pt-2">
                  Only participate with funds you can afford to lose completely.
                  Past performance is not indicative of future results.
                </p>
              </div>
            </div>

            {/* No Financial Advice */}
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-muted">
                  <Info className="h-5 w-5 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold">No Financial Advice</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                This website does not provide financial, investment, legal, or
                tax advice. Nothing on this website should be construed as a
                recommendation to purchase, sell, or hold any token. All
                information is provided &quot;as is&quot; without warranties of any kind.
                You should consult with qualified professional advisors before
                making any decisions related to digital tokens.
              </p>
            </div>
          </div>

          {/* Footer Disclaimer */}
          <div className="mt-12 p-6 glass-card">
            <h3 className="text-sm font-semibold text-foreground mb-3 text-center">
              Legal Disclaimer
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed text-center">
              This interface is informational only and does not constitute
              financial advice, an offer to sell, or a solicitation to purchase
              any security or financial instrument. This page serves as
              conceptual and technical visualization of token mechanics and risk
              disclosure. By using this platform, you acknowledge that you have
              read, understood, and accepted all risks and disclaimers. No
              content on this website creates any contractual obligation or
              liability.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Information;
