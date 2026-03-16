"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export default function LoginPage() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const { connected } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdmin) {
      router.replace("/dashboard");
    }
  }, [isAdmin, isAuthenticated, isLoading, router]);

  if (isLoading && connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-[#00FFB2]" />
      </div>
    );
  }

  if (isAuthenticated && isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-[#00FFB2]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Top accent line */}
      <div className="fixed top-0 left-0 right-0 h-[2px] bg-[#00FFB2]/60" />

      <div className="w-full max-w-sm">
        {/* Wallet icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#00FFB2]/10 border border-[#00FFB2]/20 flex items-center justify-center mb-5">
            <Wallet className="w-7 h-7 text-[#00FFB2]" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Bunker Cash</h1>
          <p className="text-sm text-neutral-500">Admin Dashboard</p>
        </div>

        {/* Connect wallet */}
        <div className="flex flex-col items-center gap-4">
          <WalletMultiButton
            style={{
              width: "100%",
              height: "44px",
              fontSize: "14px",
              fontWeight: 600,
              borderRadius: "8px",
              background: "#00FFB2",
              color: "#000",
              justifyContent: "center",
            }}
          />

          {connected && !isLoading && !isAdmin && (
            <p className="text-sm text-red-400 text-center">
              Connected wallet is not the pool admin. Please connect the admin
              wallet.
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-600 mt-8">
          Secured admin access &middot; Wallet verification required
        </p>
      </div>
    </div>
  );
}
