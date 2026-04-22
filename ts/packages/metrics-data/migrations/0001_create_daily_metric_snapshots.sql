-- Migration: Create daily_metric_snapshots table
-- Applied via: wrangler d1 migrations apply METRICS_DB --local (or --remote)

CREATE TABLE "daily_metric_snapshots" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshotDate" TEXT NOT NULL,
    "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "navUsdc" REAL,
    "pendingClaimsUsdc" REAL,
    "treasuryUsdc" REAL,
    "totalSupply" REAL,
    "tokenPrice" REAL,
    "pricePerToken" REAL,
    "openClaimsCount" INTEGER,
    "supportRequestCount" INTEGER,
    "holderCount" INTEGER,
    "adminWallet" TEXT,
    "isPartial" BOOLEAN NOT NULL DEFAULT 0,
    "errorsJson" TEXT
);

CREATE UNIQUE INDEX "daily_metric_snapshots_snapshotDate_key" ON "daily_metric_snapshots"("snapshotDate");
