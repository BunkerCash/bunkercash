import { Layout } from "@/components/layout/Layout";
import { WarningBox } from "@/components/ui/WarningBox";
import { Shield, AlertTriangle, Info, FileText } from "lucide-react";

const Information = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10 animate-fade-in">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              Important Information and Risk Disclosure
            </h1>
          </div>

          {/* Main Warning */}
          <div
            className="mb-8 animate-slide-up"
            style={{ animationDelay: "0.1s" }}
          >
            <WarningBox title="Please Read Carefully">
              <p>
                This page contains critical information about the nature of
                Bunker Cash tokens and associated risks. Reading and
                understanding this information is essential before any
                interaction with this platform.
              </p>
            </WarningBox>
          </div>

          {/* Information Sections */}
          <div className="space-y-6">
            {/* Token Nature */}
            <div
              className="glass-card p-6 animate-slide-up"
              style={{ animationDelay: "0.15s" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Info className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Token Nature</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Bunker Cash is a digital token with no ownership rights, no
                claims, and no linkage to specific assets. The token does not
                represent any share, equity, debt, or other financial
                instrument. Holding tokens does not create any contractual
                relationship or entitlement.
              </p>
            </div>

            {/* Asset Separation */}
            <div
              className="glass-card p-6 animate-slide-up"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-secondary/10">
                  <Shield className="h-5 w-5 text-secondary" />
                </div>
                <h2 className="text-lg font-semibold">
                  Real-World Asset Separation
                </h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Real-world activities, including real-world assets, are not
                tokenized and are not represented on-chain. There is no direct
                or indirect connection between token holdings and any physical
                or financial assets. The token exists solely as a digital
                instrument on the blockchain.
              </p>
            </div>

            {/* Liquidity Notice */}
            <div
              className="glass-card p-6 animate-slide-up"
              style={{ animationDelay: "0.25s" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold">Liquidity Provision</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Any liquidity made available for optional token buybacks is
                discretionary and depends on external business decisions and
                available funds. There is no guarantee that liquidity will be
                provided at any time. Liquidity availability may change without
                notice and may be insufficient to fulfill all pending
                registrations.
              </p>
            </div>

            {/* Risk Disclosure */}
            <div
              className="glass-card p-6 border-destructive/30 animate-slide-up"
              style={{ animationDelay: "0.3s" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <h2 className="text-lg font-semibold text-destructive">
                  Risk Disclosure
                </h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed">
                  Token participation involves significant risks including but
                  not limited to:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    Market risk: Token value may decrease substantially or
                    become zero
                  </li>
                  <li>
                    Liquidity risk: You may not be able to sell or convert
                    tokens
                  </li>
                  <li>
                    Technical risk: Smart contracts may contain bugs or
                    vulnerabilities
                  </li>
                  <li>
                    Regulatory risk: Legal status may change in your
                    jurisdiction
                  </li>
                  <li>
                    Total loss: You may lose your entire participation amount
                  </li>
                </ul>
              </div>
            </div>

            {/* No Financial Advice */}
            <div
              className="glass-card p-6 animate-slide-up"
              style={{ animationDelay: "0.35s" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-muted">
                  <Info className="h-5 w-5 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold">No Financial Advice</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                This website does not provide financial, legal, or tax advice.
                Nothing on this website should be construed as a recommendation
                to purchase, sell, or hold any token. You should consult with
                qualified professional advisors before making any decisions
                related to digital tokens.
              </p>
            </div>
          </div>

          {/* Footer Notice */}
          <div
            className="mt-10 text-center animate-slide-up"
            style={{ animationDelay: "0.4s" }}
          >
            <p className="text-sm text-muted-foreground">
              This page serves as conceptual and technical visualization of
              token mechanics and risk disclosure — not as an offering or
              solicitation.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Information;
