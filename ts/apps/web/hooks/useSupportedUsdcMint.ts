"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";
import { fetchConfiguredUsdcMint, fetchMintTokenProgram } from "@/lib/program";

export function useSupportedUsdcMint() {
  const { connection } = useConnection();
  const fallbackMint = useMemo(() => {
    const endpoint = connection.rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  const [usdcMint, setUsdcMint] = useState<PublicKey | null>(fallbackMint);
  const [usdcTokenProgram, setUsdcTokenProgram] = useState<PublicKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (isMountedRef.current) {
      setLoading(true);
    }
    let nextMint = fallbackMint;
    try {
      const configuredMint = await fetchConfiguredUsdcMint(connection);
      nextMint = configuredMint ?? fallbackMint;
      const nextTokenProgram = nextMint
        ? await fetchMintTokenProgram(connection, nextMint)
        : null;
      if (
        isMountedRef.current &&
        requestIdRef.current === requestId
      ) {
        setUsdcMint(nextMint);
        setUsdcTokenProgram(nextTokenProgram);
        setError(null);
      }
    } catch (error: unknown) {
      if (
        isMountedRef.current &&
        requestIdRef.current === requestId
      ) {
        setUsdcMint(nextMint);
        setUsdcTokenProgram(null);
        setError(error instanceof Error ? error.message : "Failed to load configured USDC mint details");
      }
    } finally {
      if (
        isMountedRef.current &&
        requestIdRef.current === requestId
      ) {
        setLoading(false);
      }
    }
  }, [connection, fallbackMint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { usdcMint, usdcTokenProgram, loading, error, refresh };
}
