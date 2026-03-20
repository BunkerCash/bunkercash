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
        <h1 className="text-2xl font-bold text-white mb-3">
          Access Restricted
        </h1>
        <p className="text-neutral-400 text-sm leading-relaxed mb-6">
          BunkerCash is not available in your region due to regulatory
          requirements. We apologize for the inconvenience.
        </p>
        <div className="text-xs text-neutral-600">
          If you believe this is an error, please contact support.
        </div>
      </div>
    </div>
  );
}
