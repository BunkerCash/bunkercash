import { ShieldAlert } from "lucide-react";

export const metadata = {
  title: "Access Restricted | Bunker Cash",
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
          <p>Bunker Cash is not available in your jurisdiction.</p>
          <p>
            Access to protocol functions has been restricted based on
            jurisdictional and eligibility requirements.
          </p>
          <p>No offer or solicitation is made where unlawful.</p>
        </div>
        <div className="text-xs text-neutral-600 leading-relaxed">
          If you believe this restriction is incorrect, contact support.
          Additional verification may be required.
        </div>
      </div>
    </div>
  );
}
