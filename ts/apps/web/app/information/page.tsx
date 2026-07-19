"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { PageContainer } from "@/components/design/PageContainer";
import { SectionCard } from "@/components/design/primitives";
import { WarnIcon } from "@/components/design/icons";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
type Section = { id: string; title: string };

const SECTIONS: Section[] = [
  { id: "overview", title: "1. Overview" },
  { id: "mechanics", title: "2. Protocol Mechanics" },
  { id: "token-limitations", title: "3. Token Limitations" },
  { id: "no-ownership", title: "4. No Ownership / No Revenue Rights" },
  { id: "settlement-risks", title: "5. Settlement and Liquidity Risks" },
  { id: "technical-risks", title: "6. Technical Risks" },
  { id: "regulatory", title: "7. Regulatory and Jurisdictional Restrictions" },
  { id: "legal-disclaimer", title: "8. Legal Disclaimer" },
];

// ---------------------------------------------------------------------------
// TOC sidebar (sticky, desktop only)
// ---------------------------------------------------------------------------
function TocSidebar({ activeId }: { activeId: string }) {
  return (
    <nav
      aria-label="Table of contents"
      className="sticky top-[140px] hidden w-[220px] flex-none flex-col gap-0.5 self-start desk:flex"
    >
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-[12.5px] no-underline transition-colors hover:text-ink",
            activeId === s.id
              ? "bg-mint-soft font-semibold text-mint"
              : "text-ink-3",
          )}
        >
          {s.title}
        </a>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper + typography helpers
// ---------------------------------------------------------------------------
function ContentSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-36">
      <h2 className="mb-3 text-base font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13.5px] leading-[1.7] text-ink-2">{children}</p>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-ink">{children}</span>;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function InformationPage() {
  const [activeId, setActiveId] = useState(SECTIONS[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setupObserver = useCallback(() => {
    observerRef.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-140px 0px -60% 0px", threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    setupObserver();
    return () => observerRef.current?.disconnect();
  }, [setupObserver]);

  return (
    <Layout>
      <PageContainer className="gap-5">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">
            Documentation
          </h1>
          <span className="text-[13px] text-ink-3">
            Documentation, restrictions, and risk disclosures for BunkerCash.
          </span>
        </div>

        {/* Important notice banner */}
        <div className="flex items-start gap-2.5 rounded-lg border border-warn-line bg-warn-soft px-4 py-3 text-[13px] leading-relaxed text-warn">
          <WarnIcon size={14} className="mt-0.5 flex-none" />
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">Please Read Carefully</span>
            <span className="text-[12.5px] text-ink-2">
              This page contains important information about protocol
              restrictions, token limitations, and associated risks.
            </span>
          </div>
        </div>

        <div className="flex items-start gap-8">
          <TocSidebar activeId={activeId} />

          <SectionCard className="min-w-0 flex-1 px-[22px] py-5 max-[839px]:px-4">
            <div className="flex flex-col gap-7">
              {/* 1. Overview */}
              <ContentSection id="overview" title="1. Overview">
                <P>
                  BunkerCash is an access-restricted digital token protocol. The
                  protocol does not provide ownership in assets, rights to
                  revenue, guaranteed liquidity, or guaranteed future value.
                </P>
                <P>
                  Protocol functions are available only in eligible
                  jurisdictions and subject to applicable restrictions. Access
                  may be limited, suspended, or unavailable at any time without
                  notice.
                </P>
              </ContentSection>

              {/* 2. Protocol Mechanics */}
              <ContentSection id="mechanics" title="2. Protocol Mechanics">
                <P>
                  The protocol enables eligible users to acquire tokens through
                  a defined interface, subject to protocol-defined parameters
                  and access restrictions. Token pricing is determined by
                  protocol-defined reference rates derived from on-chain state.
                </P>
                <P>
                  Users may submit settlement requests to remove tokens from
                  circulation. Submitted tokens are permanently removed and
                  cannot be recovered, traded, or transferred. Settlement of
                  requests depends entirely on available protocol liquidity and
                  is not guaranteed in timing or amount.
                </P>
                <P>
                  Protocol interactions may be unavailable or delayed due to
                  network conditions, maintenance, or other factors outside
                  user control.
                </P>
              </ContentSection>

              {/* 3. Token Limitations */}
              <ContentSection
                id="token-limitations"
                title="3. Token Limitations"
              >
                <P>
                  BunkerCash tokens are digital protocol tokens only. They do
                  not represent any share, equity, debt, security, or other
                  financial instrument. Holding tokens does not create any
                  contractual relationship or entitlement to benefits, profits,
                  or distributions of any kind.
                </P>
                <P>
                  There is no guarantee of future value. Token value may
                  decrease substantially or become zero with no guarantee of
                  recovery. Displayed interface values are informational only.
                </P>
              </ContentSection>

              {/* 4. No Ownership / No Revenue Rights */}
              <ContentSection
                id="no-ownership"
                title="4. No Ownership / No Revenue Rights"
              >
                <P>
                  Tokens confer no ownership in real estate or other assets, no
                  equity rights, and no revenue rights.
                </P>
                <P>
                  Real-world activities, including real-world assets, are not
                  represented on-chain in any form. There is no direct or
                  indirect connection between token holdings and any physical,
                  financial, or business assets. The token exists solely as a
                  digital instrument on the blockchain, completely separate from
                  any off-chain operations.
                </P>
                <P>
                  No content on this interface or in protocol documentation
                  implies or creates any ownership interest, profit-sharing
                  arrangement, or revenue entitlement.
                </P>
              </ContentSection>

              {/* 5. Settlement and Liquidity Risks */}
              <ContentSection
                id="settlement-risks"
                title="5. Settlement and Liquidity Risks"
              >
                <P>
                  <Strong>
                    There is no guaranteed liquidity and no guaranteed
                    settlement timing.
                  </Strong>
                </P>
                <P>
                  Settlement of requests depends entirely on available protocol
                  liquidity, which is discretionary and may change without
                  notice. Liquidity may be insufficient to fulfill all pending
                  requests. No timeline or schedule for settlements exists or is
                  implied.
                </P>
                <P>
                  You may not be able to convert tokens at any price or at all.
                  Only interact with the protocol using amounts you can afford
                  to lose completely.
                </P>
                <P>
                  This website does not provide financial, investment, legal, or
                  tax advice. Nothing on this website should be construed as a
                  recommendation to purchase, sell, or hold any token. All
                  information is provided &ldquo;as is&rdquo; without
                  warranties of any kind. You should consult with qualified
                  professional advisors before making any decisions related to
                  digital tokens.
                </P>
              </ContentSection>

              {/* 6. Technical Risks */}
              <ContentSection
                id="technical-risks"
                title="6. Technical Risks"
              >
                <P>
                  Smart contracts may contain bugs, vulnerabilities, or
                  exploits. The underlying blockchain network may experience
                  congestion, outages, or other disruptions that affect
                  protocol availability.
                </P>
                <P>
                  Protocol interactions may be unavailable or delayed due to
                  network conditions, smart contract state, or infrastructure
                  issues. No guarantees exist regarding platform operation,
                  uptime, or continuity. You may lose your entire participation
                  amount without recourse due to technical failures.
                </P>
              </ContentSection>

              {/* 7. Regulatory and Jurisdictional Restrictions */}
              <ContentSection
                id="regulatory"
                title="7. Regulatory and Jurisdictional Restrictions"
              >
                <P>
                  <Strong>Access is restricted by jurisdiction.</Strong>
                </P>
                <P>
                  Protocol access is not available in all jurisdictions. Users
                  are responsible for ensuring compliance with all applicable
                  local laws and regulations. The legal status of digital tokens
                  may change in your jurisdiction, potentially restricting or
                  prohibiting access without notice.
                </P>
                <P>
                  The protocol operator reserves the right to restrict, suspend,
                  or terminate access for any user or jurisdiction at any time
                  and for any reason.
                </P>
              </ContentSection>

              {/* 8. Legal Disclaimer */}
              <ContentSection
                id="legal-disclaimer"
                title="8. Legal Disclaimer"
              >
                <P>
                  This interface is informational only and does not constitute
                  financial advice, an offer to sell, or a solicitation to
                  purchase any security or financial instrument. Nothing on this
                  interface should be construed as a recommendation to acquire,
                  sell, or hold any token.
                </P>
                <P>
                  All information is provided &ldquo;as is&rdquo; without
                  warranties of any kind. You should consult with qualified
                  professional advisors before making any decisions related to
                  digital tokens.
                </P>
                <P>
                  By using this protocol, you acknowledge that you have read,
                  understood, and accepted all restrictions, risks, and
                  disclaimers described on this page. No content on this
                  interface creates any contractual obligation or liability.
                </P>
              </ContentSection>
            </div>
          </SectionCard>
        </div>
      </PageContainer>
    </Layout>
  );
}
