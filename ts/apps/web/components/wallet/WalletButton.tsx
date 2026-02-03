"use client";

import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function WalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent SSR rendering to avoid hydration mismatch
  if (!mounted) {
    return (
      <button
        disabled
        style={{
          backgroundColor: "transparent",
          border: "1px solid hsl(var(--border))",
          color: "hsl(var(--foreground))",
          borderRadius: "0.5rem",
          padding: "0.5rem 1rem",
          fontSize: "0.875rem",
          fontWeight: "500",
          height: "2.5rem",
          minWidth: "150px",
          opacity: 0.6,
        }}
      >
        Loading...
      </button>
    );
  }

  return (
    <WalletMultiButton
      style={{
        backgroundColor: "transparent",
        border: "1px solid hsl(var(--border))",
        color: "hsl(var(--foreground))",
        borderRadius: "0.5rem",
        padding: "0.5rem 1rem",
        fontSize: "0.875rem",
        fontWeight: "500",
        height: "2.5rem",
        transition: "all 0.2s",
      }}
    />
  );
}
