import Link from "next/link";
import { WarnIcon } from "@/components/design/icons";
import { Disclaimer } from "@/components/design/Disclaimer";

export const metadata = {
  title: "Access Restricted | BunkerCash",
};

export default function BlockedPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Disclaimer />
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="flex max-w-md flex-col items-center gap-5 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sell-line bg-sell-soft">
            <WarnIcon size={24} className="text-sell" />
          </span>
          <h1 className="text-2xl font-semibold">Access restricted</h1>
          <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-ink-3">
            <p>BunkerCash is not available in your jurisdiction.</p>
            <p>
              Access to protocol functions has been restricted based on
              jurisdictional and eligibility requirements.
            </p>
            <p>No offer or solicitation is made where unlawful.</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <span className="text-[12px] text-ink-3">
              If you believe this restriction is incorrect, contact support.
            </span>
            <Link
              href="/support?source=blocked-page&subject=Access%20restriction%20review"
              className="h-10 rounded-lg border border-line-2 bg-surface-2 px-5 text-[13.5px] font-semibold leading-10 text-ink no-underline transition-colors hover:border-mint-line"
            >
              Contact support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
