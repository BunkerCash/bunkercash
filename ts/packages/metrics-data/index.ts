export { createMetricsClient } from "./src/client";
export type { MetricsClient } from "./src/client";

export {
  upsertSnapshot,
  getSnapshotByDate,
  getSnapshotsByRange,
  getLatestSnapshot,
} from "./src/repository";

export {
  isValidDateString,
  validateDateRange,
  previousUtcDate,
} from "./src/validation";

export type {
  MetricSnapshotInput,
  DailyMetricSnapshot,
  DateRangeQuery,
  CollectionError,
} from "./src/types";
