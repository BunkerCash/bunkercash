"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  adminAddress: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected, disconnect } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminAddress, setAdminAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setIsAdmin(false);
      setAdminAddress(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const walletAddr = publicKey.toBase58();
        const res = await fetch(
          `/api/admin?wallet=${encodeURIComponent(walletAddr)}`,
          { cache: "no-store" }
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to resolve admin access");
        }

        if (cancelled) return;

        setAdminAddress(data.adminAddress ?? null);
        setIsAdmin(Boolean(data.isAdmin));
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
          setAdminAddress(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey]);

  const logout = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const isAuthenticated = connected;

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, isAdmin, adminAddress, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
