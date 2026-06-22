import { DurableObject } from "cloudflare:workers";

const MAX_TTL_MS = 10 * 60 * 1000;

interface ConsumeRequest {
  key: string;
  ttlMs: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function isConsumeRequest(value: unknown): value is ConsumeRequest {
  if (!value || typeof value !== "object") return false;

  const { key, ttlMs } = value as Partial<ConsumeRequest>;
  return (
    typeof key === "string" &&
    /^[a-f0-9]{64}$/.test(key) &&
    Number.isInteger(ttlMs) &&
    typeof ttlMs === "number" &&
    ttlMs > 0 &&
    ttlMs <= MAX_TTL_MS
  );
}

export class AdminSignatureReplay extends DurableObject {
  private readonly sql: SqlStorage;

  constructor(
    private readonly state: DurableObjectState,
    env: Cloudflare.Env,
  ) {
    super(state, env);
    this.sql = state.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS consumed_signatures (" +
        "replay_key TEXT PRIMARY KEY, " +
        "expires_at INTEGER NOT NULL" +
        ")",
    );
    this.sql.exec(
      "CREATE INDEX IF NOT EXISTS consumed_signatures_expires_at " +
        "ON consumed_signatures (expires_at)",
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/consume") {
      return jsonResponse({ error: "Not found" }, 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (!isConsumeRequest(body)) {
      return jsonResponse({ error: "Invalid consume request" }, 400);
    }

    const now = Date.now();
    const expiresAt = now + body.ttlMs;
    let consumed = false;

    this.state.storage.transactionSync(() => {
      this.sql.exec(
        "DELETE FROM consumed_signatures " +
          "WHERE replay_key = ? AND expires_at <= ?",
        body.key,
        now,
      );
      const insert = this.sql.exec(
        "INSERT OR IGNORE INTO consumed_signatures (replay_key, expires_at) " +
          "VALUES (?, ?)",
        body.key,
        expiresAt,
      );
      consumed = insert.rowsWritten === 1;
    });

    if (consumed) {
      const currentAlarm = await this.state.storage.getAlarm();
      if (currentAlarm === null || currentAlarm > expiresAt) {
        await this.state.storage.setAlarm(expiresAt);
      }
    }

    return jsonResponse({ consumed });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    let nextExpiration: number | null = null;

    this.state.storage.transactionSync(() => {
      this.sql.exec(
        "DELETE FROM consumed_signatures WHERE expires_at <= ?",
        now,
      );
      const row = this.sql
        .exec<{
          expires_at: number | null;
        }>("SELECT MIN(expires_at) AS expires_at FROM consumed_signatures")
        .one();
      nextExpiration =
        typeof row.expires_at === "number" ? row.expires_at : null;
    });

    if (nextExpiration === null) {
      await this.state.storage.deleteAlarm();
    } else {
      await this.state.storage.setAlarm(nextExpiration);
    }
  }
}
