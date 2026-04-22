import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata = {
  title: "Access Restricted | BunkerCash",
};

export default function BlockedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 mb-6">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">
          Access Restricted
        </h1>
        <div className="text-neutral-400 text-sm leading-relaxed mb-6 space-y-3">
          <p>BunkerCash is not available in your jurisdiction.</p>
          <p>
            Access to protocol functions has been restricted based on
            jurisdictional and eligibility requirements.
          </p>
          <p>No offer or solicitation is made where unlawful.</p>
        </div>
        <div className="space-y-4">
          <div className="text-xs text-neutral-600 leading-relaxed">
            If you believe this restriction is incorrect, contact support.
            Additional verification may be required.
          </div>
          <Link
            href="/support?source=blocked-page&subject=Access%20restriction%20review"
            className="inline-flex items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition-colors hover:border-cyan-300/50 hover:bg-cyan-400/15 hover:text-cyan-100"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
