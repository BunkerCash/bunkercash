import { Layout } from "@/components/layout/Layout";
import { WarningBox } from "@/components/ui/WarningBox";
import { Shield, AlertTriangle, Info, FileText, BookOpen, Scale, Globe, Code } from "lucide-react";

const Information = () => {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              Documentation
            </h1>
            <p className="text-muted-foreground text-lg">
              Documentation, restrictions, and risk disclosures for Bunker Cash.
            </p>
          </div>

          {/* Main Warning */}
          <div className="mb-8">
            <WarningBox title="Please Read Carefully">
              <p>
                This page contains important information about protocol
                restrictions, token limitations, and associated risks.
              </p>
            </WarningBox>
          </div>

          {/* Information Sections */}
          <div className="space-y-8">
            {/* 1. Overview */}
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">1. Overview</h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed">
                  Bunker Cash is an access-restricted digital token protocol.
                  The protocol does not provide ownership in assets, rights to
                  revenue, guaranteed liquidity, or guaranteed future value.
                </p>
                <p className="leading-relaxed">
                  Protocol functions are available only in eligible
                  jurisdictions and subject to applicable restrictions. Access
                  may be limited, suspended, or unavailable at any time without
                  notice.
                </p>
              </div>
            </div>

            {/* 2. Protocol Mechanics */}
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Info className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold">2. Protocol Mechanics</h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed">
                  The protocol enables eligible users to acquire tokens through
                  a defined interface, subject to protocol-defined parameters
                  and access restrictions. Token pricing is determined by
                  protocol-defined reference rates derived from on-chain state.
                </p>
                <p className="leading-relaxed">
                  Users may submit settlement requests to remove tokens from
                  circulation. Submitted tokens are permanently removed and
                  cannot be recovered, traded, or transferred. Settlement of
                  requests depends entirely on available protocol liquidity and
                  is not guaranteed in timing or amount.
                </p>
                <p className="leading-relaxed">
                  Protocol interactions may be unavailable or delayed due to
                  network conditions, maintenance, or other factors outside user
                  control.
                </p>
              </div>
            </div>

            {/* 3. Token Limitations */}
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-secondary/10">
                  <Shield className="h-6 w-6 text-secondary" />
                </div>
                <h2 className="text-2xl font-bold">3. Token Limitations</h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed">
                  Bunker Cash tokens are digital protocol tokens only. They do
                  not represent any share, equity, debt, security, or other
                  financial instrument. Holding tokens does not create any
                  contractual relationship or entitlement to benefits, profits,
                  or distributions of any kind.
                </p>
                <p className="leading-relaxed">
                  There is no guarantee of future value. Token value may
                  decrease substantially or become zero with no guarantee of
                  recovery. Displayed interface values are informational only.
                </p>
              </div>
            </div>

            {/* 4. No Ownership / No Revenue Rights */}
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <FileText className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold">
                  4. No Ownership / No Revenue Rights
                </h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed font-semibold text-foreground">
                  Tokens confer no ownership in real estate or other assets, no
                  equity rights, and no revenue rights.
                </p>
                <p className="leading-relaxed">
                  Real-world activities, including real-world assets, are not
                  tokenized and are not represented on-chain. There is no direct
                  or indirect connection between token holdings and any
                  physical, financial, or business assets. The token exists
                  solely as a digital instrument on the blockchain, completely
                  separate from any off-chain operations.
                </p>
                <p className="leading-relaxed">
                  No content on this interface or in protocol documentation
                  implies or creates any ownership interest, profit-sharing
                  arrangement, or revenue entitlement.
                </p>
              </div>
            </div>

            {/* 5. Settlement and Liquidity Risks */}
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold">
                  5. Settlement and Liquidity Risks
                </h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed font-semibold text-foreground">
                  There is no guaranteed liquidity and no guaranteed settlement
                  timing.
                </p>
                <p className="leading-relaxed">
                  Settlement of requests depends entirely on available protocol
                  liquidity, which is discretionary and may change without
                  notice. Liquidity may be insufficient to fulfill all pending
                  requests. No timeline or schedule for settlements exists or is
                  implied.
                </p>
                <p className="leading-relaxed">
                  You may not be able to convert tokens at any price or at all.
                  Only interact with the protocol using amounts you can afford
                  to lose completely.
                </p>
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

            {/* 6. Technical Risks */}
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-muted">
                  <Code className="h-6 w-6 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold">6. Technical Risks</h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed">
                  Smart contracts may contain bugs, vulnerabilities, or
                  exploits. The underlying blockchain network may experience
                  congestion, outages, or other disruptions that affect protocol
                  availability.
                </p>
                <p className="leading-relaxed">
                  Protocol interactions may be unavailable or delayed due to
                  network conditions, smart contract state, or infrastructure
                  issues. No guarantees exist regarding platform operation,
                  uptime, or continuity. You may lose your entire participation
                  amount without recourse due to technical failures.
                </p>
              </div>
            </div>

            {/* 7. Regulatory and Jurisdictional Restrictions */}
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-muted">
                  <Globe className="h-6 w-6 text-muted-foreground" />
                </div>
                <h2 className="text-2xl font-bold">
                  7. Regulatory and Jurisdictional Restrictions
                </h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed font-semibold text-foreground">
                  Access is restricted by jurisdiction.
                </p>
                <p className="leading-relaxed">
                  Protocol access is not available in all jurisdictions. Users
                  are responsible for ensuring compliance with all applicable
                  local laws and regulations. The legal status of digital tokens
                  may change in your jurisdiction, potentially restricting or
                  prohibiting access without notice.
                </p>
                <p className="leading-relaxed">
                  The protocol operator reserves the right to restrict, suspend,
                  or terminate access for any user or jurisdiction at any time
                  and for any reason.
                </p>
              </div>
            </div>

            {/* 8. Legal Disclaimer */}
            <div className="glass-card p-8 border-destructive/30">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <Scale className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold">8. Legal Disclaimer</h2>
              </div>
              <div className="space-y-4 text-muted-foreground">
                <p className="leading-relaxed">
                  This interface is informational only and does not constitute
                  financial advice, an offer to sell, or a solicitation to
                  purchase any security or financial instrument. Nothing on this
                  interface should be construed as a recommendation to acquire,
                  sell, or hold any token.
                </p>
                <p className="leading-relaxed">
                  All information is provided &ldquo;as is&rdquo; without
                  warranties of any kind. You should consult with qualified
                  professional advisors before making any decisions related to
                  digital tokens.
                </p>
                <p className="leading-relaxed">
                  By using this protocol, you acknowledge that you have read,
                  understood, and accepted all restrictions, risks, and
                  disclaimers described on this page. No content on this
                  interface creates any contractual obligation or liability.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Information;
