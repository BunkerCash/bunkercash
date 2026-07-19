"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/design/icons";

const STORAGE_KEY = "bnkr-disclaimer-ack";
/** Acceptance is honored for 5 minutes; after that the gate shows again. */
const ACK_TTL_MS = 5 * 60 * 1000;

function hasValidAck(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const acceptedAt = Number(raw);
    return Number.isFinite(acceptedAt) && Date.now() - acceptedAt < ACK_TTL_MS;
  } catch {
    // Storage unavailable (private mode) — treat as not accepted.
    return false;
  }
}

const TEXT =
  "The acquisition and use of digital tokens involves risks and may result in the total loss of the capital contributed. There is no guarantee of any performance, return, or increase in value. This digital token is a community-based token. It does not represent a deposit, equity interest, participation right, or any form of ownership, claim, or usage right. Contributed funds may be used at our sole discretion. The token is not tied to any specific projects and does not create any entitlement to financial performance, returns, or an increase in value. Access may be restricted in certain regions, including the European Union and the United States.";

/**
 * Disclaimer gate. Replaces the old scrolling marquee: shown as a blocking
 * modal when someone opens the site. Accepting is remembered locally for
 * 5 minutes — entering the site again after that shows the gate again.
 */
export function Disclaimer() {
  const [open, setOpen] = useState(false);
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!hasValidAck()) setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = "hidden";
    acceptRef.current?.focus();
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // Best effort — without storage the gate reappears on the next load.
    }
    setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex animate-fade-in items-center justify-center bg-[rgba(4,7,9,0.7)] p-5 backdrop-blur-[6px] max-[839px]:items-end max-[839px]:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
    >
      <div className="relative w-full max-w-[520px] animate-sheet-in overflow-hidden rounded-[14px] border border-line-2 bg-surface-2 shadow-pop max-[839px]:max-w-none max-[839px]:rounded-b-none">
        {/* Soft accent wash behind the header */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(60%_100%_at_50%_100%,var(--mint-soft),transparent_75%)]"
        />

        <div className="relative flex flex-col gap-4 p-6 pb-[calc(24px+env(safe-area-inset-bottom))] desk:pb-6">
          <div className="flex flex-col items-start gap-3.5">
            <span className="flex items-center gap-2.5">
              <LogoMark />
              <span className="text-[15.5px] font-semibold tracking-[-0.01em]">
                BunkerCash
              </span>
            </span>
            <div className="flex flex-col gap-1">
              <span
                id="disclaimer-title"
                className="text-[19px] font-semibold tracking-[-0.015em]"
              >
                Before you continue
              </span>
              <span className="text-[13px] text-ink-3">
                Please read this notice — it applies to everything on this
                site.
              </span>
            </div>
          </div>

          <p className="max-h-[240px] overflow-y-auto rounded-lg border border-line bg-surface px-4 py-3.5 text-[12.5px] leading-relaxed text-ink-2">
            {TEXT}
          </p>

          <button
            ref={acceptRef}
            type="button"
            onClick={accept}
            className="flex h-11 items-center justify-center rounded-lg bg-mint-btn text-[14.5px] font-semibold text-mint-ink transition-colors hover:bg-mint-btn-h"
          >
            I understand and accept
          </button>
          <Link
            href="/information#risks"
            onClick={accept}
            className="text-center text-[12.5px] text-ink-2 underline-offset-2 hover:text-ink"
          >
            Read the full risks &amp; limitations
          </Link>
        </div>
      </div>
    </div>
  );
}
