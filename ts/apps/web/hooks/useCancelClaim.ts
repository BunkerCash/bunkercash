"use client";

import { useMemo, useRef, useState } from "react";
import type { Idl, Program } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  getBunkercashMintPda,
  getPoolPda,
  getProgram,
  getSettlementStatePda,
  type ProgramWallet,
  PROGRAM_ID,
} from "@/lib/program";
import {
  markClaimCancelledOptimistic,
  type Claim,
} from "@/hooks/useMyClaims";
import { invalidateTransactionCache } from "@/hooks/useMyTransactions";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";
import { useToast } from "@/components/ui/ToastContext";
import { sendAndConfirmWalletTransaction } from "@/lib/sendAndConfirmWalletTransaction";

function isWalletRejection(e: unknown): boolean {
  const msg =
    e instanceof Error ? e.message.toLowerCase() : String(e ?? "").toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected the request")
  );
}

interface CancelClaimMethods {
  cancelClaim: () => {
    accounts: (accounts: {
      pool: PublicKey;
      claim: PublicKey;
      user: PublicKey;
      userBunkercash: PublicKey;
      poolBunkercashEscrow: PublicKey;
      bunkercashMint: PublicKey;
      tokenProgram: PublicKey;
      systemProgram: PublicKey;
      settlementState: PublicKey;
    }) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
}

interface MigrateClaimMethods {
  migrateClaim: () => {
    accounts: (accounts: {
      pool: PublicKey;
      claim: PublicKey;
      settlementCheck: PublicKey;
      payer: PublicKey;
      systemProgram: PublicKey;
    }) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
}

export function isClaimCancellable(claim: Claim): boolean {
  return (
    !claim.cancelled && !claim.processed && claim.bunkercashRemaining !== "0"
  );
}

/**
 * Cancels an open sell request (claim), migrating legacy claim accounts in
 * the same transaction when needed. Shared by the Trade and Wallet screens.
 */
export function useCancelClaim({ onDone }: { onDone?: () => void } = {}) {
  const { connection } = useConnection();
  const wallet = useOptionalWallet();
  const publicKey = wallet?.publicKey ?? null;
  const signTransaction = wallet?.signTransaction;
  const signAllTransactions = wallet?.signAllTransactions;
  const { showToast } = useToast();
  const [cancellingClaim, setCancellingClaim] = useState<string | null>(null);
  const inFlight = useRef(false);

  const program = useMemo(
    () =>
      publicKey && signTransaction && signAllTransactions
        ? getProgram(connection, {
            publicKey,
            signTransaction,
            signAllTransactions,
          } satisfies ProgramWallet)
        : null,
    [connection, publicKey, signTransaction, signAllTransactions],
  );
  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);
  const settlementStatePda = useMemo(
    () => getSettlementStatePda(poolPda, PROGRAM_ID),
    [poolPda],
  );

  const cancelClaim = async (claim: Claim) => {
    if (!wallet || !program || !publicKey || !connection) return;
    if (inFlight.current || !isClaimCancellable(claim)) return;
    inFlight.current = true;
    setCancellingClaim(claim.pubkey);
    try {
      const userBunkercashAta = getAssociatedTokenAddressSync(
        mintPda,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const claimPk = new PublicKey(claim.pubkey);
      const poolBunkercashEscrow = getAssociatedTokenAddressSync(
        mintPda,
        poolPda,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const tx = new Transaction();

      // Legacy claims (pre-epoch-fields layout) can't be deserialized by
      // cancel_claim, which uses the current Claim struct. Migrate the
      // account in the same atomic transaction first — migrate_claim is
      // permissionless and the user already signs/pays — so cancel_claim
      // then sees the current layout. (migrate_claim itself reverts if a
      // settlement epoch is open, surfaced as a clear error below.)
      if (claim.needsMigration) {
        const migrateApi = (program as Program<Idl>)
          .methods as unknown as MigrateClaimMethods;
        const migrateIx = await migrateApi
          .migrateClaim()
          .accounts({
            pool: poolPda,
            claim: claimPk,
            settlementCheck: settlementStatePda,
            payer: publicKey,
            systemProgram: SystemProgram.programId,
          })
          .instruction();
        tx.add(migrateIx);
      }

      const methodsApi = (program as Program<Idl>)
        .methods as unknown as CancelClaimMethods;
      const cancelIx = await methodsApi
        .cancelClaim()
        .accounts({
          pool: poolPda,
          claim: claimPk,
          user: publicKey,
          userBunkercash: userBunkercashAta,
          poolBunkercashEscrow,
          bunkercashMint: mintPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          settlementState: settlementStatePda,
        })
        .instruction();

      tx.add(cancelIx);
      const sig = await sendAndConfirmWalletTransaction({
        connection,
        wallet,
        transaction: tx,
      });
      markClaimCancelledOptimistic(claim.pubkey);
      invalidateTransactionCache();
      showToast(
        `Request cancelled — BNKR returned to your wallet. Tx: ${sig.slice(0, 8)}…`,
        "success",
      );
      onDone?.();
    } catch (e: unknown) {
      if (isWalletRejection(e)) {
        showToast("Transaction rejected by wallet", "warning");
      } else {
        const msg = e instanceof Error ? e.message : String(e ?? "");
        if (msg.includes("already been cancelled")) {
          markClaimCancelledOptimistic(claim.pubkey);
          invalidateTransactionCache();
          showToast("Sell request was already cancelled.", "success");
          onDone?.();
        } else if (msg.includes("MigrationBlockedDuringSettlement")) {
          showToast(
            "This older sell request must be upgraded before cancelling, but a settlement is in progress. Try again after it closes.",
            "warning",
          );
        } else {
          showToast(msg || "Failed to cancel sell request", "error");
        }
      }
    } finally {
      setCancellingClaim(null);
      inFlight.current = false;
    }
  };

  return { cancelClaim, cancellingClaim };
}
