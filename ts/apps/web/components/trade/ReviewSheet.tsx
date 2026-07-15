"use client";

import { useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useToast } from "@/components/ui/ToastContext";
import { getClusterFromEndpoint } from "@/lib/constants";
import { clusterLabel, explorerTxUrl } from "@/lib/explorer";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
} from "@/components/design/icons";

export type SheetPhase = "review" | "signing" | "pending" | "success" | "failed";

export type SheetRow = {
  k: string;
  v: string;
  /** Bold + emphasized (first and last rows in the design). */
  strong?: boolean;
  /** Value color accent. */
  tone?: "mint" | "warn";
  /** Highlighted row background (the "You receive" row). */
  highlight?: boolean;
};

function shortSig(sig: string): string {
  return `${sig.slice(0, 5)}…${sig.slice(-4)}`;
}

export function ReviewSheet({
  open,
  side,
  phase,
  rows,
  sellNote,
  liveSig,
  receipt,
  failureMessage,
  walletName,
  onClose,
  onConfirm,
  onRetry,
  onDone,
}: {
  open: boolean;
  side: "buy" | "sell";
  phase: SheetPhase;
  rows: SheetRow[];
  /** Escrow explainer under the review rows (sell only). */
  sellNote?: string;
  liveSig: string | null;
  receipt: { k: string; v: string }[];
  failureMessage?: string | null;
  walletName?: string;
  onClose: () => void;
  onConfirm: () => void;
  onRetry: () => void;
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const { showToast } = useToast();

  const canClose = phase !== "signing";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canClose) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open, canClose, onClose]);

  if (!open) return null;

  const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "");
  const isBuy = side === "buy";
  const title =
    phase === "review"
      ? isBuy
        ? "Review purchase"
        : "Review sell request"
      : isBuy
        ? "Buy BNKR"
        : "Sell BNKR";
  const sub =
    phase === "review"
      ? "Check the details before signing."
      : clusterLabel(cluster);

  return (
    <div
      onClick={() => canClose && onClose()}
      className="fixed inset-0 z-[90] flex animate-fade-in items-center justify-center bg-[rgba(4,7,9,0.6)] p-5 max-[839px]:items-end max-[839px]:p-0"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-full max-w-[440px] animate-sheet-in flex-col gap-4 rounded-[14px] border border-line-2 bg-surface-2 p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-pop max-[839px]:max-w-none max-[839px]:rounded-b-none desk:pb-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-[3px]">
            <span className="text-[16.5px] font-semibold">{title}</span>
            <span className="text-[12.5px] text-ink-3">{sub}</span>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-line text-ink-3 transition-colors hover:border-line-2 hover:text-ink"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        {phase === "review" && (
          <>
            <div className="flex flex-col overflow-hidden rounded-[10px] border border-line">
              {rows.map((r) => (
                <div
                  key={r.k}
                  className={cn(
                    "flex justify-between gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0",
                    r.highlight && "bg-surface-3",
                  )}
                >
                  <span className="text-[13px] text-ink-3">{r.k}</span>
                  <span
                    className={cn(
                      "text-right font-mono text-[12.5px] tabular-nums",
                      r.strong ? "font-semibold" : "font-normal",
                      r.tone === "mint"
                        ? "text-mint"
                        : r.tone === "warn"
                          ? "text-warn"
                          : r.strong
                            ? "text-ink"
                            : "text-ink-2",
                    )}
                  >
                    {r.v}
                  </span>
                </div>
              ))}
            </div>
            {!isBuy && sellNote && (
              <span className="px-0.5 text-[12.5px] leading-relaxed text-ink-2">
                {sellNote}
              </span>
            )}
            <button
              type="button"
              onClick={onConfirm}
              className={cn(
                "flex h-[46px] items-center justify-center rounded-[10px] text-[14.5px] font-semibold transition-colors",
                isBuy
                  ? "bg-mint-btn text-mint-ink hover:bg-mint-btn-h"
                  : "bg-sell text-[#2B0B10] hover:bg-sell-h",
              )}
            >
              {isBuy ? "Confirm purchase" : "Confirm sell request"}
            </button>
            <span className="text-center text-[11.5px] text-ink-3">
              You will be asked to approve this transaction in your wallet.
            </span>
          </>
        )}

        {phase === "signing" && (
          <>
            <div className="flex flex-col items-center gap-3 px-0 pb-2 pt-[22px] text-center">
              <span className="block h-10 w-10 animate-spin rounded-full border-[3px] border-line-2 border-t-mint" />
              <span className="text-[14.5px] font-semibold">
                Confirm in your wallet
              </span>
              <span className="max-w-[300px] text-[13px] leading-relaxed text-ink-2">
                {walletName ?? "Your wallet"} is asking you to approve this
                transaction. Nothing is submitted until you sign.
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="h-[38px] rounded-lg border border-line-2 bg-surface text-[13px] font-semibold text-ink-2 transition-colors hover:border-danger-line"
            >
              Dismiss
            </button>
          </>
        )}

        {phase === "pending" && (
          <div className="flex flex-col items-center gap-3 px-0 pb-2 pt-[22px] text-center">
            <span className="block h-10 w-10 animate-spin rounded-full border-[3px] border-line-2 border-t-warn" />
            <span className="text-[14.5px] font-semibold">
              Transaction submitted
            </span>
            <span className="max-w-[300px] text-[13px] leading-relaxed text-ink-2">
              Waiting for confirmation on {clusterLabel(cluster)}. This usually
              takes a few seconds.
            </span>
            {liveSig && (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(liveSig);
                  showToast("Signature copied", "success");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-[7px] font-mono text-xs text-ink-2 transition-colors hover:border-line-2"
              >
                <span>{shortSig(liveSig)}</span>
                <CopyIcon size={11} />
              </button>
            )}
          </div>
        )}

        {phase === "success" && (
          <>
            <div className="flex flex-col items-center gap-3 px-0 pb-1 pt-[18px] text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-mint-line bg-mint-soft text-mint">
                <CheckIcon />
              </span>
              <span className="text-[14.5px] font-semibold">
                {isBuy ? "Purchase complete" : "Sell request submitted"}
              </span>
              <span className="max-w-[320px] text-[13px] leading-relaxed text-ink-2">
                {isBuy
                  ? "BNKR was minted to your wallet. It may take a moment to appear in your balance."
                  : "Your BNKR is escrowed for settlement. Track or cancel the request from the Wallet page."}
              </span>
            </div>
            {receipt.length > 0 && (
              <div className="flex flex-col overflow-hidden rounded-[10px] border border-line">
                {receipt.map((r) => (
                  <div
                    key={r.k}
                    className="flex justify-between gap-3 border-b border-line px-3.5 py-[9px] last:border-b-0"
                  >
                    <span className="text-[12.5px] text-ink-3">{r.k}</span>
                    <span className="text-right font-mono text-xs tabular-nums text-ink-2">
                      {r.v}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              {liveSig && (
                <a
                  href={explorerTxUrl(cluster, liveSig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 flex-1 items-center justify-center gap-[7px] rounded-lg border border-line-2 bg-surface text-[13px] font-semibold text-ink-2 no-underline transition-colors hover:text-ink hover:no-underline"
                >
                  View on explorer
                </a>
              )}
              <button
                type="button"
                onClick={onDone}
                className="h-10 flex-1 rounded-lg bg-mint-btn text-center text-[13.5px] font-semibold text-mint-ink transition-colors hover:bg-mint-btn-h"
              >
                Done
              </button>
            </div>
          </>
        )}

        {phase === "failed" && (
          <>
            <div className="flex flex-col items-center gap-3 px-0 pb-1 pt-[18px] text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-danger-line bg-danger-soft text-danger">
                <CloseIcon size={16} />
              </span>
              <span className="text-[14.5px] font-semibold">
                Transaction failed
              </span>
              <span className="max-w-[320px] break-words text-[13px] leading-relaxed text-ink-2">
                {failureMessage ??
                  "The transaction was not confirmed. No funds moved."}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 flex-1 rounded-lg border border-line-2 bg-surface text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onRetry}
                className="h-10 flex-1 rounded-lg bg-mint-btn text-[13.5px] font-semibold text-mint-ink transition-colors hover:bg-mint-btn-h"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
