"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";
import { fetchConfiguredUsdcMint } from "@/lib/program";

export function useSupportedUsdcMint() {
  const { connection } = useConnection();
  const fallbackMint = useMemo(() => {
    const endpoint = connection.rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  const [usdcMint, setUsdcMint] = useState<PublicKey | null>(fallbackMint);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const configuredMint = await fetchConfiguredUsdcMint(connection);
      setUsdcMint(configuredMint ?? fallbackMint);
    } finally {
      setLoading(false);
    }
  }, [connection, fallbackMint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { usdcMint, loading, refresh };
}
