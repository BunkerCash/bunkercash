import type { TransactionInstruction } from "@solana/web3.js";

export interface TransactionReviewField {
  label: string;
  value: string;
}

export interface TransactionReviewInput {
  title?: string;
  summary?: string;
  fields?: TransactionReviewField[];
  accountLabels?: Record<string, string>;
  remainingAccounts?: TransactionReviewField[];
}

export interface TransactionReviewAccount {
  label: string;
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface TransactionReviewInstruction {
  index: number;
  programId: string;
  accounts: TransactionReviewAccount[];
}

export interface TransactionReview {
  title: string;
  summary: string;
  fields: TransactionReviewField[];
  remainingAccounts: TransactionReviewField[];
  instructions: TransactionReviewInstruction[];
}

function accountLabel(
  accountLabels: Record<string, string> | undefined,
  pubkey: string,
  fallback: string,
): string {
  return accountLabels?.[pubkey] ?? fallback;
}

export function buildTransactionReview({
  instructions,
  title,
  summary,
  fields = [],
  accountLabels,
  remainingAccounts = [],
}: TransactionReviewInput & {
  instructions: TransactionInstruction[];
}): TransactionReview {
  return {
    title: title ?? "Pre-sign transaction review",
    summary: summary ?? "Review the exact programs and accounts before signing.",
    fields,
    remainingAccounts,
    instructions: instructions.map((instruction, index) => ({
      index,
      programId: instruction.programId.toBase58(),
      accounts: instruction.keys.map((key, accountIndex) => {
        const pubkey = key.pubkey.toBase58();
        return {
          label: accountLabel(accountLabels, pubkey, `Account ${accountIndex}`),
          pubkey,
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        };
      }),
    })),
  };
}

export function formatTransactionReview(review: TransactionReview): string {
  const lines = [
    review.title,
    "",
    review.summary,
  ];

  if (review.fields.length > 0) {
    lines.push("", "Action details");
    for (const field of review.fields) {
      lines.push(`${field.label}: ${field.value}`);
    }
  }

  for (const instruction of review.instructions) {
    lines.push("", `Instruction ${instruction.index + 1}`);
    lines.push(`program ID: ${instruction.programId}`);
    for (const account of instruction.accounts) {
      const flags = [
        account.isSigner ? "signer" : "non-signer",
        account.isWritable ? "writable" : "readonly",
      ].join(", ");
      lines.push(`${account.label}: ${account.pubkey} (${flags})`);
    }
  }

  if (review.remainingAccounts.length > 0) {
    lines.push("", "Remaining accounts");
    for (const account of review.remainingAccounts) {
      lines.push(`${account.label}: ${account.value}`);
    }
  }

  lines.push("", "Continue to wallet signature?");
  return lines.join("\n");
}

export function requirePreSignReview(review: TransactionReview): void {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return;
  }

  if (!window.confirm(formatTransactionReview(review))) {
    throw new Error("Transaction review rejected before signing");
  }
}

