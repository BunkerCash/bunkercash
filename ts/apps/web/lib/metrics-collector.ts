import { Connection } from "@solana/web3.js";
import { fetchPoolData, fetchAllClaims } from "@/lib/solana-server";
import { fetchHolderCount } from "@/lib/holder-count";
import { kvList } from "@bunkercash/cloudflare-kv";
import { SUPPORT_REQUEST_KEY_PREFIX } from "@bunkercash/support-requests";
import type {
  MetricSnapshotInput,
  CollectionError,
} from "@bunkercash/metrics-data";

function getConnection(): Connection {
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet";
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_ENDPOINT ||
    `https://api.${cluster}.solana.com`;
  return new Connection(endpoint, "confirmed");
}

async function countSupportRequestsForDate(
  snapshotDate: string,
): Promise<number> {
  const dayStartMs = Date.parse(`${snapshotDate}T00:00:00.000Z`);
  const dayEndMs = Date.parse(`${snapshotDate}T23:59:59.999Z`);

  if (!Number.isFinite(dayStartMs) || !Number.isFinite(dayEndMs)) {
    throw new Error(`Invalid snapshotDate: ${snapshotDate}`);
  }

  let count = 0;
  let cursor: string | undefined;

  for (;;) {
    const result = await kvList("GEOBLOCKING_KV", {
      prefix: SUPPORT_REQUEST_KEY_PREFIX,
      limit: 1000,
      cursor,
    });

    for (const key of result.keys) {
      const keyName = key.name;
      const afterPrefix = keyName.slice(SUPPORT_REQUEST_KEY_PREFIX.length);
      const lastSeparator = afterPrefix.lastIndexOf(":");
      const createdAt =
        lastSeparator === -1 ? afterPrefix : afterPrefix.slice(0, lastSeparator);
      const createdAtMs = Date.parse(createdAt);

      if (
        Number.isFinite(createdAtMs) &&
        createdAtMs >= dayStartMs &&
        createdAtMs <= dayEndMs
      ) {
        count++;
      }
    }

    if (result.list_complete) break;
    cursor = result.cursor;
  }

  return count;
}

const MAX_REASON_LENGTH = 150;
const SENSITIVE_PATTERN = /https?:\/\/\S+|[A-Za-z0-9+/]{32,}={0,2}/g;

function sanitizeReason(e: unknown): string {
  if (!(e instanceof Error)) return "unknown error";
  const name = e.constructor.name || "Error";
  const scrubbed = e.message.replace(SENSITIVE_PATTERN, "[redacted]");
  return `${name}: ${scrubbed.slice(0, MAX_REASON_LENGTH)}`;
}

export async function collectSnapshot(
  snapshotDate: string,
): Promise<MetricSnapshotInput> {
  const errors: CollectionError[] = [];
  const input: MetricSnapshotInput = { snapshotDate };

  const connection = getConnection();

  try {
    const pool = await fetchPoolData();
    input.navUsdc = pool.navUsdcRaw;
    input.pendingClaimsUsdc = pool.pendingClaimsUsdcRaw;
    input.treasuryUsdc = pool.treasuryUsdcRaw;
    input.totalSupply = pool.totalSupplyRaw;
    input.tokenPrice = pool.tokenPrice;
    input.pricePerToken = pool.pricePerToken;
    input.adminWallet = pool.adminWallet;
  } catch (e) {
    errors.push({ source: "fetchPoolData", reason: sanitizeReason(e) });
  }

  try {
    const claims = await fetchAllClaims();
    input.openClaimsCount = claims.openCount;
  } catch (e) {
    errors.push({ source: "fetchAllClaims", reason: sanitizeReason(e) });
  }

  try {
    input.supportRequestCount =
      await countSupportRequestsForDate(snapshotDate);
  } catch (e) {
    errors.push({ source: "supportRequestCount", reason: sanitizeReason(e) });
  }

  try {
    input.holderCount = await fetchHolderCount(connection);
  } catch (e) {
    errors.push({ source: "holderCount", reason: sanitizeReason(e) });
  }

  if (errors.length > 0) {
    input.isPartial = true;
    input.errorsJson = JSON.stringify(errors);
  }

  return input;
}
