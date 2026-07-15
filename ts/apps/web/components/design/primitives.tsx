"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Card wrapper used by every module on the platform screens. */
export function SectionCard({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-surface",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Header row inside a SectionCard: title on the left, optional right slot. */
export function CardHeader({
  title,
  right,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-line px-[18px] py-3.5",
        className,
      )}
    >
      <span className="text-sm font-semibold">{title}</span>
      {right}
    </div>
  );
}

/** "i" affordance with a hover/tap tooltip, as used in metric cells. */
export function InfoTip({ label, tip }: { label: string; tip: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className="flex h-4 w-4 flex-none items-center justify-center rounded-full border border-line-2 text-[10px] leading-none text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-3.5 right-3.5 top-11 z-20 animate-rise rounded-lg border border-line-2 bg-surface-3 px-[11px] py-[9px] text-[12.5px] leading-normal text-ink-2 shadow-pop"
        >
          {tip}
        </span>
      )}
    </>
  );
}

export type Metric = {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Tooltip copy; renders the "i" affordance when present. */
  tip?: string;
  /** Secondary line under the value. */
  sub?: ReactNode;
  /** Overrides the value color (defaults to --text). */
  valueClassName?: string;
};

/**
 * Responsive metric grid with hairline separators, as used on Home, Wallet
 * and Pool. Cells share borders via -1px margins so edges never double up.
 */
export function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="metric-grid grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] max-[839px]:grid-cols-2 max-[359px]:grid-cols-1">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="metric-cell relative -mb-px -mr-px flex flex-col gap-1.5 border-b border-r border-line px-[18px] py-4 max-[839px]:px-3.5 max-[839px]:py-[13px]"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-[12.5px] text-ink-2">{m.label}</span>
            {m.tip && <InfoTip label={m.label} tip={m.tip} />}
          </span>
          <span
            className={cn(
              "font-mono text-[19px] font-medium tabular-nums tracking-[-0.01em] max-[839px]:text-[17px] max-[480px]:text-[15.5px]",
              m.valueClassName,
            )}
          >
            {m.value}
            {m.unit ? (
              <span className="text-xs font-normal text-ink-3"> {m.unit}</span>
            ) : null}
          </span>
          {m.sub != null && <span className="text-xs text-ink-3">{m.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export type PillTone = "mint" | "warn" | "danger" | "info" | "neutral";

const pillTones: Record<PillTone, string> = {
  mint: "text-mint bg-mint-soft",
  warn: "text-warn bg-warn-soft",
  danger: "text-danger bg-danger-soft",
  info: "text-info bg-info-soft",
  neutral: "text-ink-2 bg-surface-3",
};

/** Status pill with a current-color dot (transaction/queue statuses). */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-[9px] text-xs font-medium",
        pillTones[tone],
        className,
      )}
    >
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {children}
    </span>
  );
}

/**
 * Segmented tab strip (chart periods, trade direction, tx filters).
 * Items render as accessible tabs inside the bordered track.
 */
export function SegmentedTabs<T extends string>({
  label,
  items,
  value,
  onChange,
  size = "sm",
}: {
  label: string;
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
    >
      {items.map((it) => {
        const sel = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(it.value)}
            className={cn(
              "rounded-md text-[12.5px] font-semibold transition-colors",
              size === "sm"
                ? "h-[26px] px-[11px] max-[839px]:h-8"
                : "flex h-9 items-center justify-center text-[13.5px]",
              sel ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** Shimmer placeholder block for loading states. */
export function Shimmer({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-lg bg-[linear-gradient(90deg,var(--surface-2)_25%,var(--surface-3)_40%,var(--surface-2)_60%)] bg-[length:1000px_100%]",
        className,
      )}
      style={style}
    />
  );
}
