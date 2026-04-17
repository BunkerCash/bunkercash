"use client";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { PoolDataResponse } from "@/lib/solana-server";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";

export function useIsAdmin() {
  const wallet = useOptionalWallet();
  const publicKey = wallet?.publicKey ?? null;
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSquadsMember, setIsSquadsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [poolAdmin, setPoolAdmin] = useState<PublicKey | null>(null);
  const [isGovernedBySquads, setIsGovernedBySquads] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchAdmin() {
      setLoading(true);
      try {
        const res = await fetch("/api/pool-data");
        if (!res.ok) throw new Error(`pool-data: ${res.status}`);
        const data: PoolDataResponse = await res.json();

        if (cancelled) return;

        const adminPubkey = new PublicKey(data.adminWallet);
        setPoolAdmin(adminPubkey);
        setIsGovernedBySquads(false);
        setIsSquadsMember(false);
        setIsAdmin(
          !!publicKey && publicKey.toBase58() === data.adminWallet,
        );
      } catch (e: unknown) {
        if (cancelled) return;
        console.error("Error fetching pool admin:", e);
        setPoolAdmin(null);
        setIsAdmin(false);
        setIsSquadsMember(false);
        setIsGovernedBySquads(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAdmin();
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  return { isAdmin, isSquadsMember, loading, poolAdmin, isGovernedBySquads };
}
