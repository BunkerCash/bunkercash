import Link from "next/link";
import { Layout } from "@/components/layout/Layout";
import { PageContainer } from "@/components/design/PageContainer";
import { SectionCard, CardHeader } from "@/components/design/primitives";
import { SupportRequestForm } from "@/components/SupportRequestForm";
import { getSupportContactDetails } from "@/lib/support-requests";

export const metadata = {
  title: "Support | BunkerCash",
};

interface SupportPageProps {
  searchParams?: Promise<{
    source?: string;
    subject?: string;
  }>;
}

export default async function SupportPage({ searchParams }: SupportPageProps) {
  const contact = getSupportContactDetails();
  const params = searchParams ? await searchParams : undefined;
  const initialSource =
    params?.source === "blocked-page" ? "blocked-page" : "support-page";
  const initialSubject =
    params?.subject ||
    (initialSource === "blocked-page" ? "Access restriction review" : "");

  return (
    <Layout>
      <PageContainer className="gap-5">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Support</h1>
          <span className="text-[13px] text-ink-3">
            Get help with access, eligibility, or operational issues.
          </span>
        </div>

        <div className="flex flex-wrap items-start gap-5">
          {/* Left: info cards */}
          <div className="flex min-w-0 flex-[1.2_1_340px] flex-col gap-4">
            <SectionCard label="How we can help">
              <div className="flex flex-col gap-4 px-[18px] py-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13.5px] font-semibold">
                    Eligibility review
                  </span>
                  <span className="text-[13px] leading-relaxed text-ink-3">
                    Tell us why the restriction looks incorrect and include any
                    relevant jurisdiction details.
                  </span>
                </div>
                <div className="border-t border-line" />
                <div className="flex flex-col gap-1.5">
                  <span className="text-[13.5px] font-semibold">
                    Follow-up channel
                  </span>
                  <span className="text-[13px] leading-relaxed text-ink-3">
                    Leave an email and optional phone number so the team can
                    respond without a wallet connection.
                  </span>
                </div>
              </div>
            </SectionCard>

            <SectionCard label="Direct contact">
              <CardHeader title="Direct contact" />
              <div className="flex flex-col gap-3 px-[18px] py-4">
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink no-underline transition-colors hover:border-mint-line"
                >
                  <span className="text-ink-3">Email</span>
                  <span className="font-medium text-mint">{contact.email}</span>
                </a>
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink no-underline transition-colors hover:border-mint-line"
                  >
                    <span className="text-ink-3">Phone</span>
                    <span className="font-medium">{contact.phone}</span>
                  </a>
                )}
              </div>
              <div className="border-t border-line px-[18px] py-3">
                <Link
                  href="/blocked"
                  className="text-[12.5px] font-medium text-ink-2 no-underline transition-colors hover:text-mint"
                >
                  ← Back to restricted-access notice
                </Link>
              </div>
            </SectionCard>
          </div>

          {/* Right: form */}
          <SectionCard
            label="Submit a request"
            className="min-w-0 flex-[1.5_1_400px]"
          >
            <CardHeader
              title="Submit a support request"
              className="border-b-0 pb-0"
            />
            <div className="px-[18px] pb-5 pt-1">
              <p className="mb-4 text-[13px] text-ink-3">
                Requests submitted here are stored for review by the admin team.
              </p>
              <SupportRequestForm
                supportEmail={contact.email}
                initialSource={initialSource}
                initialSubject={initialSubject}
              />
            </div>
          </SectionCard>
        </div>
      </PageContainer>
    </Layout>
  );
}
