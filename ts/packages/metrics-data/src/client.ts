/// <reference types="@cloudflare/workers-types" />
export interface MetricsClient {
  db: D1Database;
  $disconnect(): Promise<void>;
}

export function createMetricsClient(d1: D1Database): MetricsClient {
  return {
    db: d1,
    async $disconnect() {
      // Native D1 bindings do not hold a connection that needs explicit teardown.
    },
  };
}
