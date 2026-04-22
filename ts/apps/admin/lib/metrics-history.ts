/// <reference types="@cloudflare/workers-types" />
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  createMetricsClient,
  getSnapshotByDate,
  getSnapshotsByRange,
  getLatestSnapshot,
  validateDateRange,
  isValidDateString,
} from "@bunkercash/metrics-data";
import type {
  DailyMetricSnapshot,
  DateRangeQuery,
} from "@bunkercash/metrics-data";
import { authorizeAdminAccess } from "./geoblocking-auth";

async function getAuthenticatedClient(request: Request) {
  const wallet = request.headers.get("x-admin-wallet");
  const signature = request.headers.get("x-admin-signature");
  const issuedAt = request.headers.get("x-admin-issued-at");

  const auth = await authorizeAdminAccess({ wallet, signature, issuedAt });
  if (!auth.ok) throw new Error(auth.error);
  if (!auth.isAdmin) throw new Error("Connected wallet is not authorized");

  const { env } = await getCloudflareContext();
  const db = (env as Record<string, unknown>).METRICS_DB as D1Database;
  if (!db) throw new Error("METRICS_DB binding not found");

  return createMetricsClient(db);
}

export async function fetchMetricsByDate(
  request: Request,
  date: string,
): Promise<DailyMetricSnapshot | null> {
  const client = await getAuthenticatedClient(request);
  try {
    if (!isValidDateString(date)) throw new Error(`Invalid date: ${date}`);
    return await getSnapshotByDate(client, date);
  } finally {
    await client.$disconnect();
  }
}

export async function fetchMetricsByRange(
  request: Request,
  range: DateRangeQuery,
): Promise<DailyMetricSnapshot[]> {
  const client = await getAuthenticatedClient(request);
  try {
    const error = validateDateRange(range.from, range.to);
    if (error) throw new Error(error);
    return await getSnapshotsByRange(client, range);
  } finally {
    await client.$disconnect();
  }
}

export async function fetchLatestMetrics(
  request: Request,
): Promise<DailyMetricSnapshot | null> {
  const client = await getAuthenticatedClient(request);
  try {
    return await getLatestSnapshot(client);
  } finally {
    await client.$disconnect();
  }
}
