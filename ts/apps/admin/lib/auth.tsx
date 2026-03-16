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
import { useConnection } from "@solana/wallet-adapter-react";
import { getReadonlyProgram, getPoolPda } from "./program";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  adminAddress: string | null;
  logout: () => void;
}

interface PoolAccountLike {
  masterWallet: { toBase58: () => string };
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, connected, disconnect } = useWallet();
  const { connection } = useConnection();
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
        const program = getReadonlyProgram(connection);
        const poolPda = getPoolPda();
        const accountApi = program.account as {
          pool: { fetch: (pubkey: ReturnType<typeof getPoolPda>) => Promise<PoolAccountLike> };
        };
        const poolState = await accountApi.pool.fetch(poolPda);
        const onChainAdmin = poolState.masterWallet.toBase58();

        if (cancelled) return;

        setAdminAddress(onChainAdmin);

        const walletAddr = publicKey.toBase58();
        const override = process.env.NEXT_PUBLIC_ADMIN_OVERRIDE;
        setIsAdmin(
          walletAddr === onChainAdmin ||
            (!!override && walletAddr === override)
        );
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
  }, [connected, publicKey, connection]);

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
