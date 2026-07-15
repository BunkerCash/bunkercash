"use client";

/* eslint-disable @next/next/no-img-element -- wallet icons are data: URIs */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAtom } from "jotai";
import { useConnection } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { WalletName } from "@solana/wallet-adapter-base";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";
import { useToast } from "@/components/ui/ToastContext";
import { connectModalOpenAtom } from "@/lib/ui-atoms";
import { getClusterFromEndpoint } from "@/lib/constants";
import { clusterLabel } from "@/lib/explorer";
import { CloseIcon, Spinner } from "@/components/design/icons";

function readyStateLabel(state: WalletReadyState): string {
  switch (state) {
    case WalletReadyState.Installed:
      return "Detected";
    case WalletReadyState.Loadable:
      return "Available";
    default:
      return "Not installed";
  }
}

export function ConnectWalletModal() {
  const [open, setOpen] = useAtom(connectModalOpenAtom);
  const wallet = useOptionalWallet();
  const { connection } = useConnection();
  const { showToast } = useToast();
  const [connectingName, setConnectingName] = useState<string | null>(null);

  const connected = !!wallet?.connected;

  // Close automatically once a connection is established.
  useEffect(() => {
    if (open && connected) {
      setOpen(false);
      setConnectingName(null);
    }
  }, [open, connected, setOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open, setOpen]);

  if (!open || !wallet) return null;

  const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "");
  const wallets = wallet.wallets.filter(
    (w) => w.readyState !== WalletReadyState.Unsupported,
  );

  const pick = async (name: WalletName) => {
    if (connectingName) return;
    setConnectingName(name);
    try {
      wallet.select(name);
      await Promise.resolve();
      await wallet.connect();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message.toLowerCase() : String(e ?? "").toLowerCase();
      const rejected =
        msg.includes("user rejected") || msg.includes("user denied");
      if (rejected) {
        setConnectingName(null);
        return;
      }
      if (!wallet.connected && !wallet.connecting) {
        showToast(
          e instanceof Error ? e.message : "Failed to connect wallet.",
          "error",
        );
        setConnectingName(null);
      }
    }
  };

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[90] flex animate-fade-in items-center justify-center bg-[rgba(4,7,9,0.6)] p-5 max-[839px]:items-end max-[839px]:p-0"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Connect a wallet"
        className="flex w-full max-w-[420px] animate-sheet-in flex-col gap-4 rounded-[14px] border border-line-2 bg-surface-2 p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-pop max-[839px]:max-w-none max-[839px]:rounded-b-none desk:pb-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-[3px]">
            <span className="text-[16.5px] font-semibold">
              Connect a wallet
            </span>
            <span className="text-[12.5px] text-ink-3">
              {clusterLabel(cluster)}
              {cluster !== "mainnet-beta"
                ? " — no real funds are involved."
                : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close dialog"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-line text-ink-3 transition-colors hover:border-line-2 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          {wallets.length === 0 && (
            <span className="py-2 text-[13px] leading-relaxed text-ink-2">
              No Solana wallets detected in this browser. Install{" "}
              <a
                href="https://phantom.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Phantom
              </a>{" "}
              and reload the page.
            </span>
          )}
          {wallets.map((w) => {
            const isConnecting = connectingName === w.adapter.name;
            return (
              <button
                key={w.adapter.name}
                type="button"
                onClick={() => void pick(w.adapter.name)}
                className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-3 py-[11px] transition-colors hover:border-line-2"
              >
                <img
                  src={w.adapter.icon}
                  alt=""
                  className="h-9 w-9 flex-none rounded-[9px]"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13.5px] font-semibold">
                    {w.adapter.name}
                  </span>
                  <span
                    className={`text-xs ${isConnecting ? "text-mint" : "text-ink-3"}`}
                  >
                    {isConnecting
                      ? "Connecting…"
                      : readyStateLabel(w.readyState)}
                  </span>
                </span>
                {isConnecting && <Spinner className="h-[15px] w-[15px]" />}
              </button>
            );
          })}
        </div>

        <span className="text-center text-[11.5px] leading-relaxed text-ink-3">
          By connecting you accept the <Link href="/information">Terms</Link>.
          BunkerCash never has custody of your keys or funds.
        </span>
      </div>
    </div>
  );
}
