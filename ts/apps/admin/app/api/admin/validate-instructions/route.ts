import { createHash } from "crypto";
import { NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAdminAuthDomain,
  getAdminAuthRoute,
} from "@/lib/admin-auth-nonce";
import { authorizeAdminAccess } from "@/lib/geoblocking-auth";
import {
  validateAdminInstructions,
  type SerializedAdminInstruction,
} from "@/lib/admin-instruction-validator";
import { getServerRpcEndpoint } from "@/lib/solana-env";

export const runtime = "nodejs";

function hashBodyText(bodyText: string): string {
  return createHash("sha256").update(bodyText).digest("hex");
}

function parseInstructions(value: unknown): SerializedAdminInstruction[] {
  if (!value || typeof value !== "object") {
    throw new Error("Validation payload is malformed");
  }
  const input = value as { instructions?: unknown };
  if (!Array.isArray(input.instructions)) {
    throw new Error("instructions must be an array");
  }

  return input.instructions.map((instruction) => {
    if (!instruction || typeof instruction !== "object") {
      throw new Error("instruction is malformed");
    }
    const item = instruction as Record<string, unknown>;
    if (
      typeof item.programId !== "string" ||
      typeof item.data !== "string" ||
      !Array.isArray(item.keys)
    ) {
      throw new Error("instruction is malformed");
    }
    return {
      programId: item.programId,
      data: item.data,
      keys: item.keys.map((key) => {
        if (!key || typeof key !== "object") {
          throw new Error("instruction account is malformed");
        }
        const meta = key as Record<string, unknown>;
        if (
          typeof meta.pubkey !== "string" ||
          typeof meta.isSigner !== "boolean" ||
          typeof meta.isWritable !== "boolean"
        ) {
          throw new Error("instruction account is malformed");
        }
        return {
          pubkey: meta.pubkey,
          isSigner: meta.isSigner,
          isWritable: meta.isWritable,
        };
      }),
    };
  });
}

function toTransactionInstruction(instruction: SerializedAdminInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(instruction.programId),
    keys: instruction.keys.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instruction.data, "base64"),
  });
}

async function simulateInstructions(
  instructions: SerializedAdminInstruction[],
  wallet: string,
) {
  const connection = new Connection(getServerRpcEndpoint(), "confirmed");
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: new PublicKey(wallet),
    recentBlockhash: blockhash,
    instructions: instructions.map(toTransactionInstruction),
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);

  const result = await connection.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });
  if (result.value.err) {
    throw new Error(`Instruction simulation failed: ${JSON.stringify(result.value.err)}`);
  }
  return result.value.logs ?? [];
}

export async function POST(request: Request) {
  try {
    const bodyText = await request.text();
    const authorization = await authorizeAdminAccess({
      wallet: request.headers.get("x-admin-wallet"),
      signature: request.headers.get("x-admin-signature"),
      issuedAt: request.headers.get("x-admin-issued-at"),
      nonce: request.headers.get("x-admin-nonce"),
      domain: getAdminAuthDomain(request),
      method: request.method,
      route: getAdminAuthRoute(request),
      bodyHash: hashBodyText(bodyText),
    });

    if (!authorization.ok || !authorization.isAdmin) {
      return NextResponse.json(
        {
          error: authorization.ok
            ? "Connected wallet is not authorized"
            : authorization.error,
        },
        { status: 401 },
      );
    }

    const payload = JSON.parse(bodyText) as unknown;
    const instructions = parseInstructions(payload);
    const decoded = validateAdminInstructions(
      instructions,
      authorization.identity,
    );
    const simulationLogs = await simulateInstructions(
      instructions,
      authorization.identity.wallet,
    );

    return NextResponse.json(
      { decodedInstructions: decoded, simulationLogs },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Admin instruction validation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
