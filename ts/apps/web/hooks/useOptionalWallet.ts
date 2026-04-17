"use client";

import { useContext } from "react";
import {
  WalletContext,
  type WalletContextState,
} from "@solana/wallet-adapter-react";

function hasMissingProviderGetter(context: WalletContextState, key: string) {
  return typeof Object.getOwnPropertyDescriptor(context, key)?.get === "function";
}

export function useOptionalWallet(): WalletContextState | null {
  const context = useContext(WalletContext);

  if (
    hasMissingProviderGetter(context, "publicKey") ||
    hasMissingProviderGetter(context, "wallet")
  ) {
    return null;
  }

  return context;
}
