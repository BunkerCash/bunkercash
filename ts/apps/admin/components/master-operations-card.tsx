"use client";

import { useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { useMasterWithdrawals } from "@/hooks/useMasterWithdrawals";
import { usePayoutVault } from "@/hooks/usePayoutVault";
import {
  getMasterOpsPda,
  getMasterPoolPda,
  getMasterPoolSignerPda,
  getMasterProgram,
  getMasterWithdrawalPda,
  MASTER_PROGRAM_ID,
} from "@/lib/master-program";
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";
import {
  formatUsdc,
  metadataBytesToHex,
  parseMetadataHashInput,
  parseUsdcInput,
  shortPk,
} from "@/lib/master-operations";

interface InstructionBuilder {
  instruction: () => Promise<Transaction["instructions"][number]>;
}

interface MasterWithdrawAccounts {
  pool: PublicKey;
  masterOps: PublicKey;
  poolSigner: PublicKey;
  withdrawal: PublicKey;
  admin: PublicKey;
  usdcMint: PublicKey;
  payoutUsdcVault: PublicKey;
  adminUsdc: PublicKey;
  usdcTokenProgram: PublicKey;
  systemProgram: PublicKey;
}

type MasterAdjustAccounts = Omit<MasterWithdrawAccounts, "systemProgram">;

interface MasterOpsAccount {
  withdrawalCounter: { toString(): string };
}

interface MasterOpsAccountApi {
  masterOpsState: { fetchNullable: (pubkey: PublicKey) => Promise<MasterOpsAccount | null> };
}

interface MasterProgramMethods {
  masterWithdraw: (amount: BN, metadataHash: number[]) => {
    accounts: (accounts: MasterWithdrawAccounts) => InstructionBuilder;
  };
  masterRepay: (amount: BN) => {
    accounts: (accounts: MasterAdjustAccounts) => InstructionBuilder;
  };
  masterCancelWithdrawal: (amount: BN) => {
    accounts: (accounts: MasterAdjustAccounts) => InstructionBuilder;
  };
}

interface ProviderLike {
  sendAndConfirm: (tx: Transaction) => Promise<string>;
}

function formatTimestamp(raw: string): string {
  return new Date(Number(raw) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function MasterOperationsCard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { pool, withdrawals, loading, error, refresh } = useMasterWithdrawals();
  const { balance: payoutVaultBalance, refresh: refreshVault } = usePayoutVault();

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [metadataInput, setMetadataInput] = useState("");
  const [repayWithdrawalId, setRepayWithdrawalId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [cancelWithdrawalId, setCancelWithdrawalId] = useState("");
  const [cancelAmount, setCancelAmount] = useState("");
  const [submitting, setSubmitting] = useState<"withdraw" | "repay" | "cancel" | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<{ label: string; signature: string } | null>(null);

  const poolPda = useMemo(() => getMasterPoolPda(MASTER_PROGRAM_ID), []);
  const masterOpsPda = useMemo(() => getMasterOpsPda(MASTER_PROGRAM_ID), []);
  const poolSignerPda = useMemo(() => getMasterPoolSignerPda(MASTER_PROGRAM_ID), []);
  const program = useMemo(
    () => (wallet.publicKey ? getMasterProgram(connection, wallet) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, wallet.publicKey]
  );
  const cluster = useMemo(
    () => getClusterFromEndpoint(connection.rpcEndpoint ?? ""),
    [connection]
  );
  const usdcMint = useMemo(() => getUsdcMintForCluster(cluster), [cluster]);

  const activeWithdrawals = useMemo(
    () => withdrawals.filter((item) => BigInt(item.remaining) > BigInt(0)),
    [withdrawals]
  );

  const repayTarget = useMemo(
    () => activeWithdrawals.find((item) => item.id === repayWithdrawalId) ?? null,
    [activeWithdrawals, repayWithdrawalId]
  );
  const cancelTarget = useMemo(
    () => activeWithdrawals.find((item) => item.id === cancelWithdrawalId) ?? null,
    [activeWithdrawals, cancelWithdrawalId]
  );

  const adminWallet = pool?.admin ?? null;
  const isAuthorizedWallet =
    !!wallet.publicKey && !!adminWallet && wallet.publicKey.equals(adminWallet);

  const explorerTxUrl = (signature: string) => {
    const base = `https://explorer.solana.com/tx/${signature}`;
    return cluster === "mainnet-beta" ? base : `${base}?cluster=${cluster}`;
  };

  const buildAtaInstructions = () => {
    if (!wallet.publicKey || !usdcMint) return null;

    const payoutUsdcVault = getAssociatedTokenAddressSync(
      usdcMint,
      poolSignerPda,
      true,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const adminUsdcAta = getAssociatedTokenAddressSync(
      usdcMint,
      wallet.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const ensurePayoutVaultIx = createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      payoutUsdcVault,
      poolSignerPda,
      usdcMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const ensureAdminAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      adminUsdcAta,
      wallet.publicKey,
      usdcMint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    return { payoutUsdcVault, adminUsdcAta, ensurePayoutVaultIx, ensureAdminAtaIx };
  };

  const handleMasterWithdraw = async () => {
    if (!program || !wallet.publicKey || !pool || !usdcMint) return;

    const amount = parseUsdcInput(withdrawAmount);
    if (!amount) {
      setTxError("Enter a valid USDC withdrawal amount.");
      return;
    }
    if (!metadataInput.trim()) {
      setTxError("Enter a metadata hash or reference.");
      return;
    }

    const ataState = buildAtaInstructions();
    if (!ataState) return;

    setSubmitting("withdraw");
    setTxError(null);
    setTxSuccess(null);

    try {
      const metadataHash = await parseMetadataHashInput(metadataInput);

      // Fetch fresh on-chain counter to avoid stale-cache PDA collisions.
      const accountApi = program.account as unknown as MasterOpsAccountApi;
      const freshMasterOps = await accountApi.masterOpsState.fetchNullable(masterOpsPda);
      const freshCounter = BigInt(freshMasterOps?.withdrawalCounter?.toString() ?? "0");
      const nextWithdrawalPda = getMasterWithdrawalPda(
        freshCounter + BigInt(1),
        MASTER_PROGRAM_ID
      );

      const ix = await ((program.methods as unknown as MasterProgramMethods)
        .masterWithdraw(new BN(amount.toString()), Array.from(metadataHash))
        .accounts({
          pool: poolPda,
          masterOps: masterOpsPda,
          poolSigner: poolSignerPda,
          withdrawal: nextWithdrawalPda,
          admin: wallet.publicKey,
          usdcMint,
          payoutUsdcVault: ataState.payoutUsdcVault,
          adminUsdc: ataState.adminUsdcAta,
          usdcTokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction());

      const tx = new Transaction();
      tx.add(ataState.ensurePayoutVaultIx);
      tx.add(ataState.ensureAdminAtaIx);
      tx.add(ix);

      const provider = program.provider as ProviderLike;
      const signature = await provider.sendAndConfirm(tx);

      setTxSuccess({ label: "Withdrawal recorded and sent to admin wallet", signature });
      setWithdrawAmount("");
      setMetadataInput("");
      refresh();
      refreshVault();
    } catch (e: unknown) {
      console.error("Error submitting master withdraw:", e);
      const msg = getErrorMessage(e, "Failed to submit withdrawal");
      if (msg.includes("already in use") || msg.includes("0x0")) {
        setTxError("Withdrawal slot conflict — another withdrawal was submitted first. Please refresh and try again.");
        refresh();
      } else {
        setTxError(msg);
      }
    } finally {
      setSubmitting(null);
    }
  };

  const handleRepay = async () => {
    if (!program || !wallet.publicKey || !repayTarget || !usdcMint) return;

    const amount = parseUsdcInput(repayAmount);
    if (!amount) {
      setTxError("Enter a valid repay amount.");
      return;
    }
    if (amount > BigInt(repayTarget.remaining)) {
      setTxError("Repay amount exceeds the selected withdrawal's remaining balance.");
      return;
    }

    const ataState = buildAtaInstructions();
    if (!ataState) return;

    setSubmitting("repay");
    setTxError(null);
    setTxSuccess(null);

    try {
      const ix = await ((program.methods as unknown as MasterProgramMethods)
        .masterRepay(new BN(amount.toString()))
        .accounts({
          pool: poolPda,
          masterOps: masterOpsPda,
          poolSigner: poolSignerPda,
          withdrawal: repayTarget.pubkey,
          admin: wallet.publicKey,
          usdcMint,
          payoutUsdcVault: ataState.payoutUsdcVault,
          adminUsdc: ataState.adminUsdcAta,
          usdcTokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction());

      const tx = new Transaction();
      tx.add(ataState.ensurePayoutVaultIx);
      tx.add(ataState.ensureAdminAtaIx);
      tx.add(ix);

      const provider = program.provider as ProviderLike;
      const signature = await provider.sendAndConfirm(tx);

      setTxSuccess({ label: `Repaid withdrawal #${repayTarget.id}`, signature });
      setRepayAmount("");
      refresh();
      refreshVault();
    } catch (e: unknown) {
      console.error("Error submitting master repay:", e);
      setTxError(getErrorMessage(e, "Failed to submit repayment"));
    } finally {
      setSubmitting(null);
    }
  };

  const handleCancel = async () => {
    if (!program || !wallet.publicKey || !cancelTarget || !usdcMint) return;

    const amount = parseUsdcInput(cancelAmount);
    if (!amount) {
      setTxError("Enter a valid cancel amount.");
      return;
    }
    if (amount > BigInt(cancelTarget.remaining)) {
      setTxError("Cancel amount exceeds the selected withdrawal's remaining balance.");
      return;
    }

    const ataState = buildAtaInstructions();
    if (!ataState) return;

    setSubmitting("cancel");
    setTxError(null);
    setTxSuccess(null);

    try {
      const ix = await ((program.methods as unknown as MasterProgramMethods)
        .masterCancelWithdrawal(new BN(amount.toString()))
        .accounts({
          pool: poolPda,
          masterOps: masterOpsPda,
          poolSigner: poolSignerPda,
          withdrawal: cancelTarget.pubkey,
          admin: wallet.publicKey,
          usdcMint,
          payoutUsdcVault: ataState.payoutUsdcVault,
          adminUsdc: ataState.adminUsdcAta,
          usdcTokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction());

      const tx = new Transaction();
      tx.add(ataState.ensurePayoutVaultIx);
      tx.add(ataState.ensureAdminAtaIx);
      tx.add(ix);

      const provider = program.provider as ProviderLike;
      const signature = await provider.sendAndConfirm(tx);

      setTxSuccess({ label: `Cancelled withdrawal #${cancelTarget.id}`, signature });
      setCancelAmount("");
      refresh();
      refreshVault();
    } catch (e: unknown) {
      console.error("Error submitting cancel withdrawal:", e);
      setTxError(getErrorMessage(e, "Failed to cancel withdrawal"));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-xl font-semibold text-white">Master Operations</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Current-program admin withdrawals backed by the payout vault.
          </p>
        </div>
        <button
          onClick={() => {
            refresh();
            refreshVault();
          }}
          disabled={loading}
          className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800/40 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
            Program
          </div>
          <p className="font-mono text-sm text-white break-all">
            {MASTER_PROGRAM_ID.toBase58()}
          </p>
        </div>
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
            Pool Admin
          </div>
          <p className="font-mono text-sm text-white break-all">
            {adminWallet?.toBase58() ?? "Pool not found"}
          </p>
        </div>
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
            Payout Vault
          </div>
          <p className="text-white text-sm font-mono">
            {payoutVaultBalance !== null ? `$${payoutVaultBalance}` : "Unavailable"}
          </p>
        </div>
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5">
          <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 mb-2">
            Price / Open
          </div>
          <p className="text-white text-sm font-mono">
            {pool ? `$${formatUsdc(pool.priceUsdcPerToken)} / ${activeWithdrawals.length}` : "Unavailable"}
          </p>
        </div>
      </div>

      {!wallet.publicKey && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <Wallet className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-400">
            Connect the current pool admin wallet to submit master operations.
          </p>
        </div>
      )}

      {wallet.publicKey && adminWallet && !isAuthorizedWallet && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5">
          <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">
            Connected wallet {shortPk(wallet.publicKey.toBase58())} is not the current pool admin.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {txError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{txError}</p>
          </div>
        </div>
      )}

      {txSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <p className="text-sm text-emerald-300">{txSuccess.label}</p>
            <a
              href={explorerTxUrl(txSuccess.signature)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-200/80 hover:text-emerald-200 font-mono underline underline-offset-2"
            >
              {shortPk(txSuccess.signature)}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">Master Withdraw</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Moves USDC from the current payout vault to the connected admin wallet and records a withdrawal.
            </p>
          </div>
          <label className="block text-xs text-neutral-400 mb-2">Amount (USDC)</label>
          <input
            type="number"
            min="0"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="w-full h-10 bg-neutral-800/60 border border-neutral-700/60 rounded-lg px-3 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50 focus:border-[#00FFB2]/50 mb-4"
            placeholder="0.00"
          />

          <label className="block text-xs text-neutral-400 mb-2">
            Metadata Hash or Reference
          </label>
          <textarea
            value={metadataInput}
            onChange={(e) => setMetadataInput(e.target.value)}
            className="w-full min-h-[96px] bg-neutral-800/60 border border-neutral-700/60 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50 focus:border-[#00FFB2]/50"
            placeholder="Paste a 32-byte hex hash or a reference string to hash locally"
          />
          {metadataInput.trim() && (
            <p className="text-[11px] text-neutral-500 mt-2 break-all font-mono">
              {metadataInput.trim().length > 64
                ? "SHA-256 will be derived from the entered text"
                : "64-char hex is used directly; anything else is SHA-256 hashed"}
            </p>
          )}

          <button
            onClick={handleMasterWithdraw}
            disabled={!isAuthorizedWallet || !withdrawAmount || !metadataInput || submitting !== null}
            className="mt-4 w-full h-10 rounded-lg bg-[#00FFB2] text-black text-sm font-medium hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors flex items-center justify-center gap-2"
          >
            {submitting === "withdraw" && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting === "withdraw" ? "Submitting..." : "Create Withdrawal"}
          </button>
        </div>

        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">Master Repay</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Sends USDC from the connected admin wallet back into the payout vault and reduces the outstanding balance.
            </p>
          </div>

          <label className="block text-xs text-neutral-400 mb-2">Withdrawal</label>
          <select
            value={repayWithdrawalId}
            onChange={(e) => setRepayWithdrawalId(e.target.value)}
            className="w-full h-10 bg-neutral-800/60 border border-neutral-700/60 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50 focus:border-[#00FFB2]/50 mb-4"
          >
            <option value="">Select withdrawal</option>
            {activeWithdrawals.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} - ${formatUsdc(item.remaining)} remaining
              </option>
            ))}
          </select>

          <label className="block text-xs text-neutral-400 mb-2">Amount (USDC)</label>
          <input
            type="number"
            min="0"
            value={repayAmount}
            onChange={(e) => setRepayAmount(e.target.value)}
            className="w-full h-10 bg-neutral-800/60 border border-neutral-700/60 rounded-lg px-3 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50 focus:border-[#00FFB2]/50"
            placeholder="0.00"
          />
          {repayTarget && (
            <p className="text-[11px] text-neutral-500 mt-2">
              Remaining balance:{" "}
              <span className="font-mono text-neutral-300">${formatUsdc(repayTarget.remaining)}</span>
            </p>
          )}

          <button
            onClick={handleRepay}
            disabled={!isAuthorizedWallet || !repayWithdrawalId || !repayAmount || submitting !== null}
            className="mt-4 w-full h-10 rounded-lg bg-[#00FFB2] text-black text-sm font-medium hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors flex items-center justify-center gap-2"
          >
            {submitting === "repay" && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting === "repay" ? "Submitting..." : "Repay Withdrawal"}
          </button>
        </div>

        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">Cancel Withdrawal</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Returns USDC from the connected admin wallet to the payout vault and marks the return as cancellation.
            </p>
          </div>

          <label className="block text-xs text-neutral-400 mb-2">Withdrawal</label>
          <select
            value={cancelWithdrawalId}
            onChange={(e) => setCancelWithdrawalId(e.target.value)}
            className="w-full h-10 bg-neutral-800/60 border border-neutral-700/60 rounded-lg px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50 focus:border-[#00FFB2]/50 mb-4"
          >
            <option value="">Select withdrawal</option>
            {activeWithdrawals.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} - ${formatUsdc(item.remaining)} remaining
              </option>
            ))}
          </select>

          <label className="block text-xs text-neutral-400 mb-2">Amount (USDC)</label>
          <input
            type="number"
            min="0"
            value={cancelAmount}
            onChange={(e) => setCancelAmount(e.target.value)}
            className="w-full h-10 bg-neutral-800/60 border border-neutral-700/60 rounded-lg px-3 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50 focus:border-[#00FFB2]/50"
            placeholder="0.00"
          />
          {cancelTarget && (
            <p className="text-[11px] text-neutral-500 mt-2">
              Remaining balance:{" "}
              <span className="font-mono text-neutral-300">${formatUsdc(cancelTarget.remaining)}</span>
            </p>
          )}

          <button
            onClick={handleCancel}
            disabled={!isAuthorizedWallet || !cancelWithdrawalId || !cancelAmount || submitting !== null}
            className="mt-4 w-full h-10 rounded-lg bg-neutral-200 text-black text-sm font-medium hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors flex items-center justify-center gap-2"
          >
            {submitting === "cancel" && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting === "cancel" ? "Submitting..." : "Cancel Amount"}
          </button>
        </div>
      </div>

      <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-800/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-white">Withdrawals</h2>
            <p className="text-xs text-neutral-500 mt-1">
              Master withdrawal records stored in the current Bunker Cash program.
            </p>
          </div>
          <span className="text-xs text-neutral-500">{activeWithdrawals.length} open</span>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-neutral-500">Loading withdrawals...</div>
        ) : withdrawals.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">
            No withdrawal accounts found for this program.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800/40">
                <th className="text-left px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  ID
                </th>
                <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Amount
                </th>
                <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Remaining
                </th>
                <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Repaid
                </th>
                <th className="text-right px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Cancelled
                </th>
                <th className="text-left px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Created
                </th>
                <th className="text-left px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Metadata Hash
                </th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((item) => (
                <tr
                  key={item.pubkey.toBase58()}
                  className="border-b border-neutral-800/30 last:border-b-0"
                >
                  <td className="px-5 py-3 text-sm font-mono text-white">#{item.id}</td>
                  <td className="px-5 py-3 text-sm font-mono text-right text-neutral-300">
                    ${formatUsdc(item.amount)}
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-right">
                    <span
                      className={BigInt(item.remaining) > BigInt(0) ? "text-[#00FFB2]" : "text-neutral-500"}
                    >
                      ${formatUsdc(item.remaining)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-right text-neutral-300">
                    ${formatUsdc(item.repaidAmount)}
                  </td>
                  <td className="px-5 py-3 text-sm font-mono text-right text-neutral-300">
                    ${formatUsdc(item.cancelledAmount)}
                  </td>
                  <td className="px-5 py-3 text-sm text-neutral-400">
                    {formatTimestamp(item.createdAt)}
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-neutral-500">
                    {metadataBytesToHex(item.metadataHash).slice(0, 24)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
