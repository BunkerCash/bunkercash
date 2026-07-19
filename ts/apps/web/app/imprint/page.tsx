import { Layout } from "@/components/layout/Layout";
import { PageContainer } from "@/components/design/PageContainer";
import { SectionCard, CardHeader } from "@/components/design/primitives";

export default function ImprintPage() {
  return (
    <Layout>
      <PageContainer className="gap-5">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Imprint</h1>
          <span className="text-[13px] text-ink-3">
            Provider information and legal contact details.
          </span>
        </div>

        <div className="flex max-w-2xl flex-col gap-4">
          <SectionCard label="Provider">
            <CardHeader title="Provider" />
            <div className="flex flex-col gap-1 px-[18px] py-4 text-[13.5px] leading-relaxed text-ink-2">
              <span className="font-medium text-ink">BunkerCash</span>
              <span>Office 2207, Boulevard Plaza Tower 1</span>
              <span>Sheikh Mohammed Bin Rashid Boulevard</span>
              <span>Downtown Dubai, P.O. Box 334036</span>
              <span>Dubai, United Arab Emirates</span>
            </div>
          </SectionCard>

          <SectionCard label="Contact">
            <CardHeader title="Contact" />
            <div className="flex flex-col gap-1 px-[18px] py-4 text-[13.5px] leading-relaxed text-ink-2">
              <span>
                Email:{" "}
                <a
                  href="mailto:contact@example.com"
                  className="font-medium text-mint no-underline transition-colors hover:underline"
                >
                  contact@example.com
                </a>
              </span>
            </div>
          </SectionCard>
        </div>
      </PageContainer>
    </Layout>
  );
}
