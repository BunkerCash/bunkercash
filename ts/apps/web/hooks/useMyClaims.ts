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
    id: Stringable;
    user: PublicKey;
    tokenAmountLocked: Stringable;
    usdcPaid: Stringable;
    isClosed: boolean;
    createdAt: Stringable;
  };
}

interface RawClaimPriceSnapshotRecord {
  account: {
    claim: PublicKey;
    priceUsdcPerToken: Stringable;
  };
}

interface ClaimsAccountApi {
  claimState: { all: () => Promise<RawClaimRecord[]> };
  claimPriceSnapshotState?: {
    all: () => Promise<RawClaimPriceSnapshotRecord[]>;
  };
}

export interface Claim {
  pubkey: PublicKey;
  id: string;
  tokenAmountLocked: string;
  priceUsdcPerTokenSnapshot: string | null;
  usdcPaid: string;
  isClosed: boolean;
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
    [connection, wallet]
  );

  const fetchClaims = useCallback(async () => {
    if (!program || !wallet.publicKey) {
      setClaims([]);
      return;
    }

    const userPublicKey = wallet.publicKey;

    setLoading(true);
    setError(null);
    try {
      const accountApi = program.account as ClaimsAccountApi;
      const [all, allSnapshots] = await Promise.all([
        accountApi.claimState.all(),
        accountApi.claimPriceSnapshotState?.all() ?? Promise.resolve([]),
      ]);

      const snapshotMap = new Map<string, string>();
      for (const snapshot of allSnapshots) {
        snapshotMap.set(
          snapshot.account.claim.toBase58(),
          snapshot.account.priceUsdcPerToken.toString()
        );
      }

      const mine = all.filter(
        (x) => x.account.user.toBase58() === userPublicKey.toBase58()
      );

      const normalized = mine
        .map((x) => ({
          pubkey: x.publicKey,
          id: x.account.id?.toString?.() ?? String(x.account.id),
          tokenAmountLocked:
            x.account.tokenAmountLocked?.toString?.() ??
            String(x.account.tokenAmountLocked),
          priceUsdcPerTokenSnapshot:
            snapshotMap.get(x.publicKey.toBase58()) ?? null,
          usdcPaid: x.account.usdcPaid?.toString?.() ?? String(x.account.usdcPaid),
          isClosed: Boolean(x.account.isClosed),
          createdAt: x.account.createdAt?.toString?.() ?? String(x.account.createdAt),
        }))
        .sort((a, b) => Number(b.id) - Number(a.id));
      setClaims(normalized);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch claims");
    } finally {
      setLoading(false);
    }
  }, [program, wallet.publicKey]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  return { claims, loading, error, refreshClaims: fetchClaims };
}
