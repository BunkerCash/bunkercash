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
import type { PoolDataResponse } from "@/lib/solana-server";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  adminAddress: string | null;
  error: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected, disconnect } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminAddress, setAdminAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setIsAdmin(false);
      setAdminAddress(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const walletAddr = publicKey.toBase58();

      try {
        let data: PoolDataResponse | null = null;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const res = await fetch("/api/pool-data", { cache: "no-store" });
            if (!res.ok) throw new Error(`pool-data: ${res.status}`);
            data = (await res.json()) as PoolDataResponse;
            break;
          } catch (error: unknown) {
            lastError =
              error instanceof Error ? error : new Error("Failed to fetch pool data");

            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
            }
          }
        }

        if (!data) {
          throw lastError ?? new Error("Failed to fetch pool data");
        }

        const onChainAdmin = data.adminWallet;
        if (!onChainAdmin) {
          throw new Error("Pool admin address is missing from pool-data response");
        }

        if (cancelled) return;

        setAdminAddress(onChainAdmin);
        setError(null);
        if (walletAddr === onChainAdmin) {
          setIsAdmin(true);
          return;
        }

        setIsAdmin(false);
      } catch (error: unknown) {
        if (!cancelled) {
          setIsAdmin(false);
          setAdminAddress(null);
          setError(
            error instanceof Error
              ? error.message
              : "Unable to verify admin wallet"
          );
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
      value={{ isAuthenticated, isLoading, isAdmin, adminAddress, error, logout }}
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
