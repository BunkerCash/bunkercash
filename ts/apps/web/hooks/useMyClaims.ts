import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { fetchDecodedClaimAccounts, type DecodedClaimAccount } from "@/lib/claim-accounts";

export interface Claim extends DecodedClaimAccount {}

export function useMyClaims() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    if (!wallet.publicKey) {
      setClaims([]);
      return;
    }

    const userPublicKey = wallet.publicKey.toBase58();

    setLoading(true);
    setError(null);
    try {
      const all = await fetchDecodedClaimAccounts(connection);
      const mine = all
        .filter((item) => item.user.toBase58() === userPublicKey)
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));

      setClaims(mine);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch claims");
    } finally {
      setLoading(false);
    }
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    void fetchClaims();
  }, [fetchClaims]);

  return { claims, loading, error, refreshClaims: fetchClaims };
}
