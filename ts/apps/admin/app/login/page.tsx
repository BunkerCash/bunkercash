"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const success = await login(username, password);
    if (success) {
      router.push("/dashboard");
    } else {
      setError("Invalid credentials");
    }
  };

  if (isLoading || isAuthenticated) {
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
        {/* Lock icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#00FFB2]/10 border border-[#00FFB2]/20 flex items-center justify-center mb-5">
            <Lock className="w-7 h-7 text-[#00FFB2]" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Bunker Cash</h1>
          <p className="text-sm text-neutral-500">Admin Dashboard</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full h-11 bg-neutral-900/60 border border-neutral-700/50 rounded-lg px-3.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/40 focus:border-[#00FFB2]/40 transition-colors"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-11 bg-neutral-900/60 border border-neutral-700/50 rounded-lg px-3.5 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/40 focus:border-[#00FFB2]/40 transition-colors"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            className="w-full h-11 rounded-lg bg-[#00FFB2] text-black text-sm font-semibold hover:bg-[#00FFB2]/90 transition-colors mt-2"
          >
            Sign In
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-600 mt-8">
          Secured admin access &middot; Wallet verification required
        </p>
      </div>
    </div>
  );
}
