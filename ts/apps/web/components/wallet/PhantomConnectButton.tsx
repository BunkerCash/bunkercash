"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

interface PhantomConnectButtonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function PhantomConnectButton({
  className,
  style,
}: PhantomConnectButtonProps) {
  const {
    connected,
    connecting,
    disconnecting,
    publicKey,
    wallets,
    select,
    connect,
    disconnect,
  } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const phantomName = useMemo(() => {
    const phantomWallet = wallets.find((wallet) =>
      wallet.adapter.name.toLowerCase().includes("phantom"),
    );
    return phantomWallet?.adapter.name ?? null;
  }, [wallets]);

  const handleConnect = async () => {
    if (!phantomName) {
      setError("Phantom wallet is not available in this browser.");
      return;
    }

    setError(null);

    try {
      select(phantomName);
      await Promise.resolve();
      await connect();
    } catch (connectError: unknown) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Failed to connect Phantom.",
      );
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await disconnect();
    } catch (disconnectError: unknown) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Failed to disconnect wallet.",
      );
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={connected ? () => void handleDisconnect() : () => void handleConnect()}
        disabled={connecting || disconnecting}
        className={className}
        style={style}
      >
        {connected && publicKey
          ? shortAddress(publicKey.toBase58())
          : connecting
            ? "Connecting..."
            : "Connect Wallet"}
      </button>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
