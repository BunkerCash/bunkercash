"use client";

import { useState } from "react";
import { Info } from "lucide-react";

interface InfoTooltipProps {
  /** Definition shown on hover/focus/tap. */
  text: string;
  /** Accessible label for the trigger, e.g. the term being explained. */
  label?: string;
  className?: string;
}

// Dependency-free tooltip: opens on hover and keyboard focus, and toggles on
// click so it also works on touch devices.
export function InfoTooltip({ text, label, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex items-center align-middle ${className ?? ""}`}>
      <button
        type="button"
        aria-label={label ? `What is ${label}?` : "More information"}
        className="inline-flex text-neutral-500 transition-colors hover:text-neutral-200 focus:text-neutral-200 focus:outline-none"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-neutral-300 shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}
