/// <reference types="@cloudflare/workers-types" />
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  createMetricsClient,
  getSnapshotByDate,
  upsertSnapshot,
  previousUtcDate,
} from "@bunkercash/metrics-data";
import { collectSnapshot } from "@/lib/metrics-collector";

type MetricsCronEnv = {
  METRICS_DB?: D1Database;
};

function getMetricsDb(env: MetricsCronEnv): D1Database {
  const db = env.METRICS_DB;
  if (!db) throw new Error("METRICS_DB binding not found");
  return db;
}

export async function runDailyCollection(options?: {
  env?: MetricsCronEnv;
  snapshotDate?: string;
}): Promise<{
  snapshotDate: string;
  isPartial: boolean;
}> {
  const snapshotDate = options?.snapshotDate ?? previousUtcDate();

  const env =
    options?.env ??
    ((await getCloudflareContext()).env as Record<string, unknown>);
  const db = getMetricsDb(env);

  const client = createMetricsClient(db);
  try {
    const existing = await getSnapshotByDate(client, snapshotDate);

    if (existing && !existing.isPartial) {
      return {
        snapshotDate: existing.snapshotDate,
        isPartial: false,
      };
    }

    const input = await collectSnapshot(snapshotDate);
    const row = await upsertSnapshot(client, input);
    return { snapshotDate: row.snapshotDate, isPartial: row.isPartial };
  } finally {
    await client.$disconnect();
  }
}
