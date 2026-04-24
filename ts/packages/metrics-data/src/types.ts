export interface MetricSnapshotInput {
  snapshotDate: string;
  navUsdc?: number | null;
  pendingClaimsUsdc?: number | null;
  treasuryUsdc?: number | null;
  totalSupply?: number | null;
  tokenPrice?: number | null;
  pricePerToken?: number | null;
  openClaimsCount?: number | null;
  supportRequestCount?: number | null;
  holderCount?: number | null;
  adminWallet?: string | null;
  isPartial?: boolean;
  errorsJson?: string | null;
}

export interface DailyMetricSnapshot {
  id: number;
  snapshotDate: string;
  collectedAt: Date;
  navUsdc: number | null;
  pendingClaimsUsdc: number | null;
  treasuryUsdc: number | null;
  totalSupply: number | null;
  tokenPrice: number | null;
  pricePerToken: number | null;
  openClaimsCount: number | null;
  supportRequestCount: number | null;
  holderCount: number | null;
  adminWallet: string | null;
  isPartial: boolean;
  errorsJson: string | null;
}

export interface DateRangeQuery {
  from: string;
  to: string;
}

export interface CollectionError {
  source: string;
  reason: string;
}

export interface DailyMetricSnapshotRow {
  id: number;
  snapshotDate: string;
  collectedAt: string;
  navUsdc: number | null;
  pendingClaimsUsdc: number | null;
  treasuryUsdc: number | null;
  totalSupply: number | null;
  tokenPrice: number | null;
  pricePerToken: number | null;
  openClaimsCount: number | null;
  supportRequestCount: number | null;
  holderCount: number | null;
  adminWallet: string | null;
  isPartial: number | boolean;
  errorsJson: string | null;
}
