import type { MetricsClient } from "./client";
import type {
  MetricSnapshotInput,
  DailyMetricSnapshot,
  DateRangeQuery,
  DailyMetricSnapshotRow,
} from "./types";
import { validateDateRange, isValidDateString } from "./validation";

const MAX_ROWS = 400;

function toSnapshot(row: DailyMetricSnapshotRow): DailyMetricSnapshot {
  return {
    ...row,
    collectedAt: new Date(row.collectedAt),
    isPartial: row.isPartial === true || row.isPartial === 1,
  };
}

async function first<T>(statement: D1PreparedStatement): Promise<T | null> {
  const result = await statement.first<T>();
  return result ?? null;
}

export async function upsertSnapshot(
  client: MetricsClient,
  input: MetricSnapshotInput,
): Promise<DailyMetricSnapshot> {
  if (!isValidDateString(input.snapshotDate)) {
    throw new Error(`Invalid snapshotDate: ${input.snapshotDate}`);
  }

  const now = new Date().toISOString();

  await client.db
    .prepare(
      `INSERT INTO daily_metric_snapshots (
        snapshotDate, collectedAt, navUsdc, pendingClaimsUsdc, treasuryUsdc,
        totalSupply, tokenPrice, pricePerToken, openClaimsCount,
        supportRequestCount, holderCount, adminWallet, isPartial, errorsJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshotDate) DO UPDATE SET
        collectedAt = excluded.collectedAt,
        navUsdc = excluded.navUsdc,
        pendingClaimsUsdc = excluded.pendingClaimsUsdc,
        treasuryUsdc = excluded.treasuryUsdc,
        totalSupply = excluded.totalSupply,
        tokenPrice = excluded.tokenPrice,
        pricePerToken = excluded.pricePerToken,
        openClaimsCount = excluded.openClaimsCount,
        supportRequestCount = excluded.supportRequestCount,
        holderCount = excluded.holderCount,
        adminWallet = excluded.adminWallet,
        isPartial = excluded.isPartial,
        errorsJson = excluded.errorsJson`
    )
    .bind(
      input.snapshotDate,
      now,
      input.navUsdc ?? null,
      input.pendingClaimsUsdc ?? null,
      input.treasuryUsdc ?? null,
      input.totalSupply ?? null,
      input.tokenPrice ?? null,
      input.pricePerToken ?? null,
      input.openClaimsCount ?? null,
      input.supportRequestCount ?? null,
      input.holderCount ?? null,
      input.adminWallet ?? null,
      input.isPartial ? 1 : 0,
      input.errorsJson ?? null,
    )
    .run();

  const row = await first<DailyMetricSnapshotRow>(
    client.db
      .prepare(
        `SELECT id, snapshotDate, collectedAt, navUsdc, pendingClaimsUsdc, treasuryUsdc,
          totalSupply, tokenPrice, pricePerToken, openClaimsCount, supportRequestCount,
          holderCount, adminWallet, isPartial, errorsJson
         FROM daily_metric_snapshots
         WHERE snapshotDate = ?`
      )
      .bind(input.snapshotDate),
  );
  if (!row) {
    throw new Error(`Failed to load snapshot after upsert: ${input.snapshotDate}`);
  }
  return toSnapshot(row);
}

export async function getSnapshotByDate(
  client: MetricsClient,
  date: string,
): Promise<DailyMetricSnapshot | null> {
  if (!isValidDateString(date)) {
    throw new Error(`Invalid date: ${date}`);
  }

  const row = await first<DailyMetricSnapshotRow>(
    client.db
      .prepare(
        `SELECT id, snapshotDate, collectedAt, navUsdc, pendingClaimsUsdc, treasuryUsdc,
          totalSupply, tokenPrice, pricePerToken, openClaimsCount, supportRequestCount,
          holderCount, adminWallet, isPartial, errorsJson
         FROM daily_metric_snapshots
         WHERE snapshotDate = ?`
      )
      .bind(date),
  );

  return row ? toSnapshot(row) : null;
}

export async function getSnapshotsByRange(
  client: MetricsClient,
  range: DateRangeQuery,
): Promise<DailyMetricSnapshot[]> {
  const error = validateDateRange(range.from, range.to);
  if (error) throw new Error(error);

  const { results } = await client.db
    .prepare(
      `SELECT id, snapshotDate, collectedAt, navUsdc, pendingClaimsUsdc, treasuryUsdc,
        totalSupply, tokenPrice, pricePerToken, openClaimsCount, supportRequestCount,
        holderCount, adminWallet, isPartial, errorsJson
       FROM daily_metric_snapshots
       WHERE snapshotDate >= ? AND snapshotDate <= ?
       ORDER BY snapshotDate ASC
       LIMIT ?`
    )
    .bind(range.from, range.to, MAX_ROWS)
    .all<DailyMetricSnapshotRow>();

  return (results ?? []).map(toSnapshot);
}

export async function getLatestSnapshot(
  client: MetricsClient,
): Promise<DailyMetricSnapshot | null> {
  const row = await first<DailyMetricSnapshotRow>(
    client.db.prepare(
      `SELECT id, snapshotDate, collectedAt, navUsdc, pendingClaimsUsdc, treasuryUsdc,
        totalSupply, tokenPrice, pricePerToken, openClaimsCount, supportRequestCount,
        holderCount, adminWallet, isPartial, errorsJson
       FROM daily_metric_snapshots
       ORDER BY snapshotDate DESC
       LIMIT 1`
    ),
  );

  return row ? toSnapshot(row) : null;
}
