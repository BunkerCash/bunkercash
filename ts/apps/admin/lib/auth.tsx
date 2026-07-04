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
import { buildAdminAuthHeaders } from "@/lib/admin-auth-client";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  adminAddress: string | null;
  error: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AdminMeResponse {
  wallet: string;
  isAdmin: boolean;
  role: "single-wallet" | "squads-member" | "override" | "none";
  governanceMode: "single-wallet" | "squads-v4";
  poolMasterWallet: string;
  squadsMultisig: string | null;
  squadsVault: string | null;
  squadsVaultIndex: number | null;
  squadsPermissions: string[];
  error?: unknown;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected, disconnect, signMessage } = useWallet();
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
      try {
        if (!signMessage) {
          throw new Error("Connected wallet does not support message signing");
        }

        const route = "/api/admin/me";
        const authHeaders = await buildAdminAuthHeaders({
          publicKey,
          signMessage,
          method: "GET",
          route,
        });
        const res = await fetch(route, {
          cache: "no-store",
          headers: authHeaders,
        });
        const data = (await res.json().catch(() => null)) as AdminMeResponse | null;

        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : `admin verification failed: ${res.status}`,
          );
        }

        if (
          !data ||
          typeof data.isAdmin !== "boolean" ||
          typeof data.poolMasterWallet !== "string"
        ) {
          throw new Error("Admin verification response is malformed");
        }

        if (cancelled) return;

        setAdminAddress(data.poolMasterWallet);
        setError(null);
        setIsAdmin(data.isAdmin);
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
  }, [connected, publicKey, signMessage]);

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
