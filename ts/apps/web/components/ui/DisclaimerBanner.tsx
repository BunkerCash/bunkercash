"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DisclaimerBannerProps {
  className?: string;
}

const DISCLAIMER_TEXT =
  "The acquisition and use of digital tokens involves risks and may result in the total loss of the capital contributed. There is no guarantee of any performance, return, or increase in value. This digital token is a community-based token. It does not represent a deposit, equity interest, participation right, or any form of ownership, claim, or usage right, particularly with respect to assets, profits, or revenues. Contributed funds may be used at our sole discretion within the scope of general project development. There is no entitlement to any specific use of funds or to any influence over such use, particularly with regard to specific projects or assets. Any measures to support liquidity, including potential contributions to a liquidity pool, are undertaken solely at our discretion and may vary or may not occur at all. There is no entitlement to the availability, scope, or timing of such measures. The token is not tied to any specific projects and does not create any entitlement to financial performance, returns, or an increase in value. The information provided is for general informational purposes only and does not constitute an offer, solicitation, or recommendation. Access may be restricted in certain regions, including the European Union and the United States.";

export function DisclaimerBanner({
  className,
}: DisclaimerBannerProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      translate="no"
      className={cn(
        "notranslate rounded-xl border border-yellow-800/40 bg-yellow-950/20 px-3 py-2.5 sm:px-4 sm:py-3",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-yellow-700/40 bg-yellow-500/10 text-yellow-400">
          <AlertTriangle className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-yellow-300">
            Disclaimer
          </h2>

          <p
            className={cn(
              "mt-1.5 text-xs leading-5 text-yellow-100/75 sm:text-sm",
              !expanded && "line-clamp-4",
            )}
          >
            {DISCLAIMER_TEXT}
          </p>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs font-medium text-yellow-300 hover:text-yellow-200 sm:text-sm"
          >
            {expanded ? "Read less" : "Read more"}
          </button>
        </div>
      </div>
    </div>
  );
}
