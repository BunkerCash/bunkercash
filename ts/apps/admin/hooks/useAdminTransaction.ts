"use client";

import { useCallback, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { getClusterFromEndpoint } from "@/lib/constants";
import { sendAndConfirmWalletTransaction } from "@/lib/sendAndConfirmWalletTransaction";
import { useAuth } from "@/lib/auth";

export type AdminTransactionResult =
  | {
      mode: "single-wallet";
      signature: string;
    }
  | {
      mode: "squads-v4";
      signature: string;
      executedSignature?: string;
      txIndex: bigint;
      proposalPda: string;
      transactionPda: string;
      squadsUrl: string;
      autoApproved: boolean;
    };

interface SubmitAdminInstructionsInput {
  instructions: TransactionInstruction[];
  memo: string;
}

function getSquadsDashboardUrl(cluster: string, multisigPda: PublicKey): string {
  const base =
    cluster === "mainnet-beta"
      ? "https://app.squads.so"
      : "https://devnet.squads.so";
  return `${base}/multisig/${multisigPda.toBase58()}`;
}

function assertSingleInstructionList(instructions: TransactionInstruction[]) {
  if (instructions.length === 0) {
    throw new Error("No instructions provided");
  }
}

export function useAdminTransaction() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const auth = useAuth();

  const authority = useMemo(() => {
    if (auth.governanceMode === "squads-v4") {
      return auth.squadsVault ? new PublicKey(auth.squadsVault) : null;
    }
    return wallet.publicKey ?? null;
  }, [auth.governanceMode, auth.squadsVault, wallet.publicKey]);

  const submit = useCallback(
    async ({
      instructions,
      memo,
    }: SubmitAdminInstructionsInput): Promise<AdminTransactionResult> => {
      assertSingleInstructionList(instructions);

      if (!wallet.publicKey) {
        throw new Error("Wallet not connected");
      }

      if (auth.governanceMode === "squads-v4") {
        if (!auth.squadsMultisig || !auth.squadsVault) {
          throw new Error("Squads governance is not configured for admin actions");
        }
        if (!wallet.signAllTransactions) {
          throw new Error("Wallet does not support signing Squads proposal transactions");
        }

        const multisigPda = new PublicKey(auth.squadsMultisig);
        const vaultPda = new PublicKey(auth.squadsVault);
        const vaultIndex = auth.squadsVaultIndex ?? 0;
        const ms = await multisig.accounts.Multisig.fromAccountAddress(
          connection,
          multisigPda,
        );
        const isMember = ms.members.some((member) =>
          member.key.equals(wallet.publicKey!),
        );
        if (!isMember) {
          throw new Error("Connected wallet is not a current Squads member");
        }

        const currentIndex = BigInt(ms.transactionIndex.toString());
        const nextIndex = currentIndex + BigInt(1);
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        const innerMessage = new TransactionMessage({
          payerKey: vaultPda,
          recentBlockhash: blockhash,
          instructions,
        });

        const createVaultTxIx = multisig.instructions.vaultTransactionCreate({
          multisigPda,
          transactionIndex: nextIndex,
          creator: wallet.publicKey,
          vaultIndex,
          ephemeralSigners: 0,
          transactionMessage: innerMessage,
          memo,
        });
        const createProposalIx = multisig.instructions.proposalCreate({
          multisigPda,
          creator: wallet.publicKey,
          transactionIndex: nextIndex,
          isDraft: false,
        });
        const approveProposalIx = multisig.instructions.proposalApprove({
          multisigPda,
          transactionIndex: nextIndex,
          member: wallet.publicKey,
          memo: `approve: ${memo}`,
        });

        const tx1Message = new TransactionMessage({
          payerKey: wallet.publicKey,
          recentBlockhash: blockhash,
          instructions: [createVaultTxIx],
        }).compileToV0Message();
        const tx2Message = new TransactionMessage({
          payerKey: wallet.publicKey,
          recentBlockhash: blockhash,
          instructions: [createProposalIx, approveProposalIx],
        }).compileToV0Message();

        const signed = await wallet.signAllTransactions([
          new VersionedTransaction(tx1Message),
          new VersionedTransaction(tx2Message),
        ]);
        if (signed.length < 2) {
          throw new Error("Wallet returned fewer signed transactions than expected");
        }

        const signature = await connection.sendTransaction(signed[0], {
          preflightCommitment: "confirmed",
        });
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );

        try {
          const proposalSignature = await connection.sendTransaction(signed[1], {
            preflightCommitment: "confirmed",
          });
          await connection.confirmTransaction(
            { signature: proposalSignature, blockhash, lastValidBlockHeight },
            "confirmed",
          );
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "";
          if (!message.toLowerCase().includes("blockhash")) throw error;

          const fresh = await connection.getLatestBlockhash("confirmed");
          const retryMessage = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: fresh.blockhash,
            instructions: [createProposalIx, approveProposalIx],
          }).compileToV0Message();
          const [retrySigned] = await wallet.signAllTransactions([
            new VersionedTransaction(retryMessage),
          ]);
          const retrySignature = await connection.sendTransaction(retrySigned, {
            preflightCommitment: "confirmed",
          });
          await connection.confirmTransaction(
            {
              signature: retrySignature,
              blockhash: fresh.blockhash,
              lastValidBlockHeight: fresh.lastValidBlockHeight,
            },
            "confirmed",
          );
        }

        let executedSignature: string | undefined;
        if (ms.threshold <= 1) {
          const executeBlockhash = await connection.getLatestBlockhash("confirmed");
          const { instruction, lookupTableAccounts } =
            await multisig.instructions.vaultTransactionExecute({
              connection,
              multisigPda,
              transactionIndex: nextIndex,
              member: wallet.publicKey,
            });
          const executeMessage = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: executeBlockhash.blockhash,
            instructions: [instruction],
          }).compileToV0Message(lookupTableAccounts);
          const [executeSigned] = await wallet.signAllTransactions([
            new VersionedTransaction(executeMessage),
          ]);
          executedSignature = await connection.sendTransaction(executeSigned, {
            preflightCommitment: "confirmed",
          });
          await connection.confirmTransaction(
            {
              signature: executedSignature,
              blockhash: executeBlockhash.blockhash,
              lastValidBlockHeight: executeBlockhash.lastValidBlockHeight,
            },
            "confirmed",
          );
        }

        const [proposalPda] = multisig.getProposalPda({
          multisigPda,
          transactionIndex: nextIndex,
        });
        const [transactionPda] = multisig.getTransactionPda({
          multisigPda,
          index: nextIndex,
        });
        const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "");

        return {
          mode: "squads-v4",
          signature,
          executedSignature,
          txIndex: nextIndex,
          proposalPda: proposalPda.toBase58(),
          transactionPda: transactionPda.toBase58(),
          squadsUrl: getSquadsDashboardUrl(cluster, multisigPda),
          autoApproved: true,
        };
      }

      const tx = new Transaction();
      for (const instruction of instructions) tx.add(instruction);
      const signature = await sendAndConfirmWalletTransaction({
        connection,
        wallet,
        transaction: tx,
      });
      return { mode: "single-wallet", signature };
    },
    [
      auth.governanceMode,
      auth.squadsMultisig,
      auth.squadsVault,
      auth.squadsVaultIndex,
      connection,
      wallet,
    ],
  );

  return {
    authority,
    isSquadsMode: auth.governanceMode === "squads-v4",
    submit,
  };
}
