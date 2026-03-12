"use client";

import { useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SendTransactionError, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
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
  withdrawal: PublicKey;
  poolUsdc: PublicKey;
  masterUsdc: PublicKey;
  usdcMint: PublicKey;
  masterWallet: PublicKey;
  tokenProgram: PublicKey;
}

type MasterAdjustAccounts = MasterWithdrawAccounts;

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
  const poolSignerPda = useMemo(() => getMasterPoolSignerPda(MASTER_PROGRAM_ID), []);
  const program = useMemo(
    () => (wallet.publicKey ? getMasterProgram(connection, wallet) : null),
    [connection, wallet]
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
  const openWithdrawalUsdc = useMemo(
    () =>
      activeWithdrawals.reduce(
        (total, item) => total + BigInt(item.remaining),
        BigInt(0)
      ),
    [activeWithdrawals]
  );

  const repayTarget = useMemo(
    () => activeWithdrawals.find((item) => item.id === repayWithdrawalId) ?? null,
    [activeWithdrawals, repayWithdrawalId]
  );
  const cancelTarget = useMemo(
    () => activeWithdrawals.find((item) => item.id === cancelWithdrawalId) ?? null,
    [activeWithdrawals, cancelWithdrawalId]
  );

  const adminWallet = pool?.masterWallet ?? null;
  const adminWalletBase58 = adminWallet?.toBase58() ?? null;
  const connectedWalletBase58 = wallet.publicKey?.toBase58() ?? null;
  const isAuthorizedWallet =
    !!connectedWalletBase58 && !!adminWalletBase58 && connectedWalletBase58 === adminWalletBase58;

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
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const adminUsdcAta = getAssociatedTokenAddressSync(
      usdcMint,
      wallet.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const ensurePayoutVaultIx = createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      payoutUsdcVault,
      poolSignerPda,
      usdcMint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const ensureAdminAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      adminUsdcAta,
      wallet.publicKey,
      usdcMint,
      TOKEN_2022_PROGRAM_ID,
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
      const nextWithdrawalPda = getMasterWithdrawalPda(BigInt(pool.withdrawalCounter), MASTER_PROGRAM_ID);

      const ix = await ((program.methods as unknown as MasterProgramMethods)
        .masterWithdraw(new BN(amount.toString()), Array.from(metadataHash))
        .accounts({
          pool: poolPda,
          withdrawal: nextWithdrawalPda,
          poolUsdc: ataState.payoutUsdcVault,
          masterUsdc: ataState.adminUsdcAta,
          usdcMint,
          masterWallet: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
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
      if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error("Master withdraw transaction logs:", logs);
        }
      }
      const msg = getErrorMessage(e, "Failed to submit withdrawal");
      if (msg.includes("already in use") || msg.includes("0x0")) {
        setTxError("Withdrawal slot conflict. Refresh and retry.");
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
          withdrawal: repayTarget.pubkey,
          masterUsdc: ataState.adminUsdcAta,
          poolUsdc: ataState.payoutUsdcVault,
          usdcMint,
          masterWallet: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
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
      if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error("Master repay transaction logs:", logs);
        }
      }
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
          withdrawal: cancelTarget.pubkey,
          masterUsdc: ataState.adminUsdcAta,
          poolUsdc: ataState.payoutUsdcVault,
          usdcMint,
          masterWallet: wallet.publicKey,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
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
      if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error("Cancel withdrawal transaction logs:", logs);
        }
      }
      setTxError(getErrorMessage(e, "Failed to cancel withdrawal"));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Master Operations</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Admin withdrawals, repayments, and cancellations for the current program.
          </p>
        </div>
        <button
          onClick={() => {
            refresh();
            refreshVault();
          }}
          disabled={loading}
          className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800/40 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Program</div>
          <p className="break-all font-mono text-sm text-white">{MASTER_PROGRAM_ID.toBase58()}</p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Pool Admin</div>
          <p className="break-all font-mono text-sm text-white">{adminWallet?.toBase58() ?? "Pool not found"}</p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Payout Vault</div>
          <p className="font-mono text-sm text-white">
            {payoutVaultBalance !== null ? `$${payoutVaultBalance}` : "Unavailable"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">NAV / Open USDC</div>
          <p className="font-mono text-sm text-white">
            {pool ? `$${formatUsdc(pool.nav)} / $${formatUsdc(openWithdrawalUsdc)}` : "Unavailable"}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {activeWithdrawals.length} active withdrawal{activeWithdrawals.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {!wallet.publicKey && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-400">
            Connect the current pool admin wallet to submit master operations.
          </p>
        </div>
      )}

      {wallet.publicKey && adminWallet && !isAuthorizedWallet && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-400">
            Connected wallet {shortPk(wallet.publicKey.toBase58())} is not the current pool admin.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {txError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <p className="text-sm text-red-300">{txError}</p>
          </div>
        </div>
      )}

      {txSuccess && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-3">
            <p className="text-sm text-emerald-300">{txSuccess.label}</p>
            <a
              href={explorerTxUrl(txSuccess.signature)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-emerald-200/80 underline underline-offset-2 hover:text-emerald-200"
            >
              {shortPk(txSuccess.signature)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">Master Withdraw</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Moves USDC from the payout vault to the connected admin wallet and records a withdrawal without changing NAV or token price.
            </p>
          </div>
          <label className="mb-2 block text-xs text-neutral-400">Amount (USDC)</label>
          <input
            type="number"
            min="0"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="mb-4 h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 font-mono text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
            placeholder="0.00"
          />

          <label className="mb-2 block text-xs text-neutral-400">Metadata Hash or Reference</label>
          <textarea
            value={metadataInput}
            onChange={(e) => setMetadataInput(e.target.value)}
            className="min-h-[96px] w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 py-2 font-mono text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
            placeholder="Paste a 32-byte hex hash or a reference string to hash locally"
          />
          {metadataInput.trim() && (
            <p className="mt-2 break-all font-mono text-[11px] text-neutral-500">
              {metadataInput.trim().length > 64
                ? "SHA-256 will be derived from the entered text"
                : "64-char hex is used directly; anything else is SHA-256 hashed"}
            </p>
          )}

          <button
            onClick={handleMasterWithdraw}
            disabled={!isAuthorizedWallet || !withdrawAmount || !metadataInput || submitting !== null}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#00FFB2] text-sm font-medium text-black transition-colors hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600"
          >
            {submitting === "withdraw" && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting === "withdraw" ? "Submitting..." : "Create Withdrawal"}
          </button>
        </div>

        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">Master Repay</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Sends USDC from the admin wallet back into the payout vault. Any amount above the withdrawal's remaining balance still increases NAV.
            </p>
          </div>

          <label className="mb-2 block text-xs text-neutral-400">Withdrawal</label>
          <select
            value={repayWithdrawalId}
            onChange={(e) => setRepayWithdrawalId(e.target.value)}
            className="mb-4 h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
          >
            <option value="">Select withdrawal</option>
            {activeWithdrawals.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} - ${formatUsdc(item.remaining)} remaining
              </option>
            ))}
          </select>

          <label className="mb-2 block text-xs text-neutral-400">Amount (USDC)</label>
          <input
            type="number"
            min="0"
            value={repayAmount}
            onChange={(e) => setRepayAmount(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 font-mono text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
            placeholder="0.00"
          />
          {repayTarget && (
            <p className="mt-2 text-[11px] text-neutral-500">
              Remaining balance: <span className="font-mono text-neutral-300">${formatUsdc(repayTarget.remaining)}</span>. Extra repayment above this amount is treated as NAV growth.
            </p>
          )}

          <button
            onClick={handleRepay}
            disabled={!isAuthorizedWallet || !repayWithdrawalId || !repayAmount || submitting !== null}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#00FFB2] text-sm font-medium text-black transition-colors hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600"
          >
            {submitting === "repay" && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting === "repay" ? "Submitting..." : "Repay Withdrawal"}
          </button>
        </div>

        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">Cancel Withdrawal</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Returns USDC from the admin wallet to the payout vault and records a cancellation against the same withdrawal without changing NAV.
            </p>
          </div>

          <label className="mb-2 block text-xs text-neutral-400">Withdrawal</label>
          <select
            value={cancelWithdrawalId}
            onChange={(e) => setCancelWithdrawalId(e.target.value)}
            className="mb-4 h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
          >
            <option value="">Select withdrawal</option>
            {activeWithdrawals.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} - ${formatUsdc(item.remaining)} remaining
              </option>
            ))}
          </select>

          <label className="mb-2 block text-xs text-neutral-400">Amount (USDC)</label>
          <input
            type="number"
            min="0"
            value={cancelAmount}
            onChange={(e) => setCancelAmount(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 font-mono text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
            placeholder="0.00"
          />
          {cancelTarget && (
            <p className="mt-2 text-[11px] text-neutral-500">
              Remaining balance: <span className="font-mono text-neutral-300">${formatUsdc(cancelTarget.remaining)}</span>
            </p>
          )}

          <button
            onClick={handleCancel}
            disabled={!isAuthorizedWallet || !cancelWithdrawalId || !cancelAmount || submitting !== null}
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-neutral-200 text-sm font-medium text-black transition-colors hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600"
          >
            {submitting === "cancel" && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting === "cancel" ? "Submitting..." : "Cancel Amount"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-800/60 bg-neutral-900/40">
        <div className="flex items-center justify-between border-b border-neutral-800/60 px-5 py-4">
          <div>
            <h2 className="text-sm font-medium text-white">Withdrawals</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Current withdrawal records stored in the Bunker Cash program.
            </p>
          </div>
          <span className="text-xs text-neutral-500">{activeWithdrawals.length} open</span>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-neutral-500">Loading withdrawals...</div>
        ) : withdrawals.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">No withdrawal accounts found for this program.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800/40">
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">ID</th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-neutral-500">Amount</th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-neutral-500">Remaining</th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-neutral-500">Returned</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">Created</th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">Metadata Hash</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((item) => {
                return (
                  <tr key={item.pubkey.toBase58()} className="border-b border-neutral-800/30 last:border-b-0">
                    <td className="px-5 py-3 font-mono text-sm text-white">#{item.id}</td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-neutral-300">${formatUsdc(item.amount)}</td>
                    <td className="px-5 py-3 text-right font-mono text-sm">
                      <span className={BigInt(item.remaining) > BigInt(0) ? "text-[#00FFB2]" : "text-neutral-500"}>
                        ${formatUsdc(item.remaining)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-neutral-300">${formatUsdc(item.returned)}</td>
                    <td className="px-5 py-3 text-sm text-neutral-400">{formatTimestamp(item.createdAt)}</td>
                    <td className="px-5 py-3 text-xs font-mono text-neutral-500">
                      {metadataBytesToHex(item.metadataHash).slice(0, 24)}...
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
