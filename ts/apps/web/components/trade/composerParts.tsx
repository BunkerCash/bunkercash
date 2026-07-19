"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TokenChip({ token }: { token: "USDC" | "BNKR" }) {
  return (
    <span className="inline-flex h-[34px] flex-none items-center gap-[7px] rounded-lg border border-line-2 bg-surface-3 px-3 text-[13px] font-semibold">
      <span
        className={`h-3.5 w-3.5 flex-none rounded-full ${token === "USDC" ? "bg-info" : "bg-mint"}`}
      />
      <span>{token}</span>
    </span>
  );
}

/** "You pay / You sell" card with editable amount, balance and Max. */
export function AmountInputCard({
  label,
  token,
  value,
  onChange,
  balance,
  onMax,
  error,
}: {
  label: string;
  token: "USDC" | "BNKR";
  value: string;
  onChange: (v: string) => void;
  balance: string;
  onMax?: () => void;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2.5">
        <label htmlFor="trade-amount" className="text-xs text-ink-3">
          {label}
        </label>
        <span className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-ink-3">
            Balance <span className="font-mono text-ink-2">{balance}</span>
          </span>
          {onMax && (
            <button
              type="button"
              onClick={onMax}
              className="h-[22px] rounded-md border border-line-2 px-2 text-[11px] font-semibold text-ink-2 transition-colors hover:border-mint-line hover:text-mint"
            >
              Max
            </button>
          )}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          id="trade-amount"
          value={value}
          onChange={(e) => {
            // Digits and a single decimal point only.
            let v = e.target.value.replace(/[^0-9.]/g, "");
            const i = v.indexOf(".");
            if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
            onChange(v);
          }}
          placeholder="0.00"
          inputMode="decimal"
          aria-describedby={error ? "amount-help" : undefined}
          className="w-0 min-w-0 flex-1 bg-transparent font-mono text-[22px] font-medium tracking-[-0.01em] tabular-nums outline-none desk:text-[26px]"
        />
        <TokenChip token={token} />
      </div>
      {error && (
        <span id="amount-help" role="alert" className="text-[12.5px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

/** "You receive (estimated)" card. */
export function AmountOutputCard({
  label,
  token,
  value,
  balance,
}: {
  label: string;
  token: "USDC" | "BNKR";
  value: string;
  balance: string;
}) {
  const empty = !value || value === "0" || value === "0.00";
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-3">{label}</span>
        <span className="text-xs tabular-nums text-ink-3">
          Balance <span className="font-mono text-ink-2">{balance}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "w-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[22px] font-medium tracking-[-0.01em] tabular-nums desk:text-[26px]",
            empty ? "text-ink-3" : "text-ink",
          )}
        >
          {empty ? "0.00" : value}
        </span>
        <TokenChip token={token} />
      </div>
    </div>
  );
}

export function DetailRow({
  label,
  children,
  mono = true,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2.5 text-[13px]">
      <span className="text-ink-3">{label}</span>
      <span
        className={cn(
          "text-[12.5px] text-ink-2",
          mono && "font-mono tabular-nums",
        )}
      >
        {children}
      </span>
    </div>
  );
}

export type CtaKind = "primary" | "sell" | "secondary" | "disabled";

const ctaStyles: Record<CtaKind, string> = {
  primary: "bg-mint-btn text-mint-ink hover:bg-mint-btn-h",
  sell: "bg-sell text-[#2B0B10] hover:bg-sell-h",
  secondary: "border border-line-2 bg-surface-2 text-ink hover:border-mint-line",
  disabled: "bg-surface-3 text-ink-3 cursor-not-allowed",
};

/** The composer's main call-to-action button. */
export function ComposerCta({
  kind,
  disabled,
  busy,
  onClick,
  children,
}: {
  kind: CtaKind;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-12 items-center justify-center gap-2.5 rounded-[10px] text-[15px] font-semibold transition-colors",
        ctaStyles[disabled ? "disabled" : kind],
      )}
    >
      {busy && (
        <span className="block h-[15px] w-[15px] animate-spin rounded-full border-2 border-transparent border-r-current border-t-current" />
      )}
      <span>{children}</span>
    </button>
  );
}

/** Escrow acknowledgement toggle for the sell side. */
export function AckCheckbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex items-start gap-2.5 rounded-[10px] border border-line bg-surface-2 p-3 transition-colors hover:border-line-2"
    >
      <span
        className={cn(
          "mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
          checked ? "border-mint-btn bg-mint-btn" : "border-line-2 bg-transparent",
        )}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          className={cn("transition-opacity", checked ? "opacity-100" : "opacity-0")}
        >
          <path
            d="m2.5 6.5 2.4 2.4L9.7 3.5"
            stroke="var(--mint-ink)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[12.5px] leading-relaxed text-ink-2">
        {children}
      </span>
    </button>
  );
}
