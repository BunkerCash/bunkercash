"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";
import { useSupportedUsdcMint } from "@/hooks/useSupportedUsdcMint";

/**
 * Live USDC balance of the connected wallet for the configured settlement
 * mint, kept fresh via an account subscription.
 */
export function useUsdcBalance() {
  const { connection } = useConnection();
  const wallet = useOptionalWallet();
  const publicKey = wallet?.publicKey ?? null;
  const { usdcMint, usdcTokenProgram } = useSupportedUsdcMint();
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey || !connection || !usdcMint || !usdcTokenProgram) {
      setBalance(null);
      return;
    }
    const userUsdc = getAssociatedTokenAddressSync(
      usdcMint,
      publicKey,
      false,
      usdcTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const fetchBalance = async () => {
      try {
        const value = await connection.getTokenAccountBalance(userUsdc);
        setBalance(value.value.uiAmountString ?? "0");
      } catch {
        // Missing ATA (never held USDC) reads as zero.
        setBalance("0");
      }
    };
    void fetchBalance();
    const id = connection.onAccountChange(userUsdc, () => {
      void fetchBalance();
    });
    return () => {
      void connection.removeAccountChangeListener(id);
    };
  }, [publicKey, connection, usdcMint, usdcTokenProgram]);

  return { balance };
}
