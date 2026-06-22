import { createHash } from "crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const BINDING = "ADMIN_SIGNATURE_REPLAY";
const REPLAY_OBJECT_NAME = "admin-signature-replay-v1";

interface ConsumeResult {
  consumed: boolean;
}

function buildReplayKey(
  wallet: string,
  issuedAt: string,
  signature: string,
): string {
  return createHash("sha256")
    .update(wallet)
    .update("\0")
    .update(issuedAt)
    .update("\0")
    .update(signature)
    .digest("hex");
}

function isConsumeResult(value: unknown): value is ConsumeResult {
  return (
    !!value &&
    typeof value === "object" &&
    "consumed" in value &&
    typeof value.consumed === "boolean"
  );
}

export async function consumeAdminSignature(args: {
  wallet: string;
  issuedAt: string;
  signature: string;
  ttlMs: number;
}): Promise<boolean> {
  const { env } = await getCloudflareContext();
  const namespace = (env as Record<string, unknown>)[BINDING];

  if (
    !namespace ||
    typeof namespace !== "object" ||
    !("idFromName" in namespace) ||
    typeof namespace.idFromName !== "function" ||
    !("get" in namespace) ||
    typeof namespace.get !== "function"
  ) {
    throw new Error(`Durable Object binding "${BINDING}" not found`);
  }

  const replayNamespace = namespace as DurableObjectNamespace;
  const id = replayNamespace.idFromName(REPLAY_OBJECT_NAME);
  const stub = replayNamespace.get(id);
  const response = await stub.fetch("https://admin-signature-replay/consume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: buildReplayKey(args.wallet, args.issuedAt, args.signature),
      ttlMs: args.ttlMs,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Signature replay store failed with status ${response.status}`,
    );
  }

  const result: unknown = await response.json();
  if (!isConsumeResult(result)) {
    throw new Error("Signature replay store returned an invalid response");
  }

  return result.consumed;
}
