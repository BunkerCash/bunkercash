"use client";

import { AlertTriangle, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DisclaimerBannerProps {
  className?: string;
}

export function DisclaimerBanner({
  className,
}: DisclaimerBannerProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-yellow-800/40 bg-yellow-950/20 px-3 py-2.5 sm:px-4 sm:py-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-yellow-700/40 bg-yellow-500/10 text-yellow-400">
          <AlertTriangle className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-yellow-300">
              Important Risk Notice
            </h2>
            <span className="inline-flex items-center gap-1 text-xs text-yellow-500/85">
              <Clock3 className="h-3.5 w-3.5" />
              Settlement depends on available liquidity
            </span>
          </div>

          <p className="mt-1.5 text-xs leading-5 text-yellow-100/75 sm:text-sm">
            Bunker Cash tokens are not investments or guaranteed stores of
            value. Prices may change, sell requests are not guaranteed within a
            fixed timeframe, and you are responsible for your own decisions.
            Nothing here is financial or investment advice.
          </p>
        </div>
      </div>
    </div>
  );
}
