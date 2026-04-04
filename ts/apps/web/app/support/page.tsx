import Link from "next/link";
import { Mail, Phone, ShieldCheck, ArrowLeftRight } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SupportRequestForm } from "@/components/SupportRequestForm";
import { getSupportContactDetails } from "@/lib/support-requests";

export const metadata = {
  title: "Support | Bunker Cash",
};

function buildTelHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

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
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-neutral-950/80 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
              <div className="mb-6 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                Support Request
              </div>
              <h1 className="max-w-2xl text-3xl font-semibold text-white sm:text-4xl">
                Contact the Bunker Cash support team
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-400 sm:text-base">
                Use this page if access was blocked in error or if you need help
                with protocol eligibility, account review, or operational support.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h2 className="text-sm font-semibold text-white">
                    Eligibility review
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">
                    Tell us why the restriction looks incorrect and include any
                    relevant jurisdiction details.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                    <ArrowLeftRight className="h-5 w-5" />
                  </div>
                  <h2 className="text-sm font-semibold text-white">
                    Follow-up channel
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-neutral-400">
                    Leave an email and optional phone number so the team can
                    respond without a wallet connection.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(34,211,238,0.12),rgba(10,10,10,0.92))] p-8">
              <h2 className="text-lg font-semibold text-white">
                Direct contact
              </h2>
              <div className="mt-6 space-y-4">
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-start gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 transition-colors hover:border-cyan-300/40 hover:bg-black/30"
                >
                  <div className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Email support</p>
                    <p className="mt-1 text-sm text-cyan-200">{contact.email}</p>
                  </div>
                </a>

                {contact.phone ? (
                  <a
                    href={buildTelHref(contact.phone)}
                    className="flex items-start gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 transition-colors hover:border-emerald-300/40 hover:bg-black/30"
                  >
                    <div className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                      <Phone className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Phone</p>
                      <p className="mt-1 text-sm text-emerald-200">
                        {contact.phone}
                      </p>
                    </div>
                  </a>
                ) : null}
              </div>

              <p className="mt-6 text-sm leading-6 text-neutral-300">
                Prefer a written record? Submit the form and the request will be
                logged for the admin team.
              </p>

              <Link
                href="/blocked"
                className="mt-6 inline-flex text-sm font-medium text-cyan-200 transition-colors hover:text-cyan-100"
              >
                Back to restricted-access notice
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-neutral-950/80 p-8 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-white">
                Submit a support request
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Requests submitted here are stored for review in the admin panel.
              </p>
            </div>
            <SupportRequestForm
              supportEmail={contact.email}
              initialSource={initialSource}
              initialSubject={initialSubject}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
