"use client";

import { Provider as JotaiProvider } from "jotai";
import { SolanaProvider } from "@/providers/SolanaProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SolanaProvider>
      <JotaiProvider>{children}</JotaiProvider>
    </SolanaProvider>
  );
}
