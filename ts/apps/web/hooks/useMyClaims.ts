import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getProgram } from "@/lib/program";

interface Stringable {
  toString(): string;
}

interface RawClaimRecord {
  publicKey: PublicKey;
  account: {
    user: PublicKey;
    usdcAmount: Stringable;
    timestamp: Stringable;
    processed: boolean;
    paidAmount: Stringable;
  };
}

interface ClaimsAccountApi {
  claim: { all: () => Promise<RawClaimRecord[]> };
}

export interface Claim {
  pubkey: PublicKey;
  id: string;
  requestedUsdc: string;
  paidUsdc: string;
  processed: boolean;
  createdAt: string;
}

export function useMyClaims() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet],
  );

  const fetchClaims = useCallback(async () => {
    if (!program || !wallet.publicKey) {
      setClaims([]);
      return;
    }

    const userPublicKey = wallet.publicKey.toBase58();

    setLoading(true);
    setError(null);
    try {
      const accountApi = program.account as ClaimsAccountApi;
      const all = await accountApi.claim.all();

      const mine = all.filter(
        (item) => item.account.user.toBase58() === userPublicKey,
      );

      const normalized = mine
        .map((item) => ({
          pubkey: item.publicKey,
          id: item.publicKey.toBase58().slice(0, 8),
          requestedUsdc:
            item.account.usdcAmount?.toString?.() ?? String(item.account.usdcAmount),
          paidUsdc:
            item.account.paidAmount?.toString?.() ?? String(item.account.paidAmount),
          processed: Boolean(item.account.processed),
          createdAt:
            item.account.timestamp?.toString?.() ?? String(item.account.timestamp),
        }))
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

      setClaims(normalized);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch claims");
    } finally {
      setLoading(false);
    }
  }, [program, wallet.publicKey]);

  useEffect(() => {
    void fetchClaims();
  }, [fetchClaims]);

  return { claims, loading, error, refreshClaims: fetchClaims };
}
