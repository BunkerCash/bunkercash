"use client";

import { Disclaimer } from "@/components/design/Disclaimer";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Disclaimer />
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="font-mono text-[80px] font-bold leading-none text-sell max-[839px]:text-[56px]">
            500
          </span>
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="max-w-sm text-[14px] leading-relaxed text-ink-3">
            An error occurred while processing your request.
          </p>
          <button
            type="button"
            onClick={reset}
            className="h-10 rounded-lg bg-mint-btn px-5 text-[13.5px] font-semibold text-mint-ink transition-colors hover:bg-mint-btn-h"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
