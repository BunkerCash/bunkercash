import { getConfiguredSolanaCluster } from "@/lib/solana-env";
import { clusterLabel } from "@/lib/explorer";

/** Slim banner flagging non-mainnet deployments. Hidden on mainnet. */
export function EnvNotice() {
  const cluster = getConfiguredSolanaCluster();
  if (cluster === "mainnet-beta") return null;

  return (
    <div className="flex-none border-b border-line bg-surface">
      <div className="mx-auto flex min-h-[30px] max-w-[1320px] items-center justify-center gap-2 px-6 py-[5px] text-center max-[839px]:px-4">
        <span className="h-1.5 w-1.5 flex-none rounded-full bg-warn" />
        <span className="text-xs text-ink-2">
          <span className="font-semibold text-ink">{clusterLabel(cluster)}</span>{" "}
          · Early testing — assets on this network hold no real-world value.
        </span>
      </div>
    </div>
  );
}
