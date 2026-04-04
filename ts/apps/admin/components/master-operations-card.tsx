"use client";

import { useMemo, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SendTransactionError, Transaction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
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
  getNextMasterWithdrawalPda,
  MASTER_PROGRAM_ID,
} from "@/lib/master-program";
import { getClusterFromEndpoint } from "@/lib/constants";
import { getSupportedUsdcConfigPda } from "@/lib/program";
import {
  formatUsdc,
  metadataBytesToHex,
  parseMetadataHashInput,
  parseUsdcInput,
  shortPk,
} from "@/lib/master-operations";
import { useSupportedUsdcMint } from "@/hooks/useSupportedUsdcMint";
import { useAuth } from "@/lib/auth";

interface InstructionBuilder {
  instruction: () => Promise<Transaction["instructions"][number]>;
}

interface MasterWithdrawAccounts {
  pool: PublicKey;
  withdrawal: PublicKey;
  poolUsdc: PublicKey;
  masterUsdc: PublicKey;
  supportedUsdcConfig: PublicKey;
  usdcMint: PublicKey;
  masterWallet: PublicKey;
  usdcTokenProgram: PublicKey;
}

type MasterAdjustAccounts = MasterWithdrawAccounts;

interface MasterProgramMethods {
  masterWithdraw: (
    amount: BN,
    metadataHash: number[],
  ) => {
    accounts: (accounts: MasterWithdrawAccounts) => InstructionBuilder;
  };
  masterRepay: (amount: BN) => {
    accounts: (accounts: MasterAdjustAccounts) => InstructionBuilder;
  };
  masterProfit: (amount: BN) => {
    accounts: (accounts: MasterAdjustAccounts) => InstructionBuilder;
  };
  masterCloseWithdrawal: (amount: BN) => {
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
  if (error instanceof Error) {
    const message = error.message;
    if (
      message.includes("InstructionFallbackNotFound") ||
      message.includes("Fallback functions are not supported") ||
      message.includes("custom program error: 0x65")
    ) {
      return "The connected program deployment does not include this instruction yet. Rebuild and redeploy the updated on-chain program before using Repay, Profit, or Close Withdrawal.";
    }
    return message;
  }

  return fallback;
}

export function MasterOperationsCard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { isAdmin } = useAuth();
  const { publicKey, signTransaction, signAllTransactions } = wallet;
  const { pool, withdrawals, loading, error, refresh } = useMasterWithdrawals();
  const { balance: payoutVaultBalance, refresh: refreshVault } =
    usePayoutVault();

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [metadataInput, setMetadataInput] = useState("");
  const [repayWithdrawalId, setRepayWithdrawalId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [profitWithdrawalId, setProfitWithdrawalId] = useState("");
  const [profitAmount, setProfitAmount] = useState("");
  const [closeWithdrawalId, setCloseWithdrawalId] = useState("");
  const [closeAmount, setCloseAmount] = useState("");
  const [submitting, setSubmitting] = useState<
    "withdraw" | "repay" | "profit" | "close" | null
  >(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<{
    label: string;
    signature: string;
  } | null>(null);

  const poolPda = useMemo(() => getMasterPoolPda(MASTER_PROGRAM_ID), []);
  const poolSignerPda = useMemo(
    () => getMasterPoolSignerPda(MASTER_PROGRAM_ID),
    [],
  );
  const program = useMemo(
    () =>
      publicKey && signTransaction && signAllTransactions
        ? getMasterProgram(connection, {
            publicKey,
            signTransaction,
            signAllTransactions,
          })
        : null,
    [connection, publicKey, signTransaction, signAllTransactions],
  );
  const cluster = useMemo(
    () => getClusterFromEndpoint(connection.rpcEndpoint ?? ""),
    [connection],
  );
  const { usdcMint, usdcTokenProgram } = useSupportedUsdcMint();
  const supportedUsdcConfigPda = useMemo(
    () => getSupportedUsdcConfigPda(MASTER_PROGRAM_ID),
    []
  );

  const activeWithdrawals = useMemo(
    () => withdrawals.filter((item) => BigInt(item.remaining) > BigInt(0)),
    [withdrawals],
  );
  const openWithdrawalUsdc = useMemo(
    () =>
      activeWithdrawals.reduce(
        (total, item) => total + BigInt(item.remaining),
        BigInt(0),
      ),
    [activeWithdrawals],
  );

  const profitTarget = useMemo(
    () =>
      activeWithdrawals.find((item) => item.id === profitWithdrawalId) ?? null,
    [activeWithdrawals, profitWithdrawalId],
  );
  const repayTarget = useMemo(
    () =>
      activeWithdrawals.find((item) => item.id === repayWithdrawalId) ?? null,
    [activeWithdrawals, repayWithdrawalId],
  );
  const closeTarget = useMemo(
    () =>
      activeWithdrawals.find((item) => item.id === closeWithdrawalId) ?? null,
    [activeWithdrawals, closeWithdrawalId],
  );
  const parsedCloseAmount = useMemo(
    () => parseUsdcInput(closeAmount, { allowZero: true }),
    [closeAmount],
  );
  const closePnlDelta = useMemo(() => {
    if (!closeTarget || parsedCloseAmount === null) return null;
    return parsedCloseAmount - BigInt(closeTarget.remaining);
  }, [closeTarget, parsedCloseAmount]);

  const adminWallet = pool?.masterWallet ?? null;
  const isAuthorizedWallet = isAdmin;

  const explorerTxUrl = (signature: string) => {
    const base = `https://explorer.solana.com/tx/${signature}`;
    return cluster === "mainnet-beta" ? base : `${base}?cluster=${cluster}`;
  };

  const buildAtaInstructions = () => {
    if (!wallet.publicKey || !usdcMint || !usdcTokenProgram) return null;

    const payoutUsdcVault = getAssociatedTokenAddressSync(
      usdcMint,
      poolSignerPda,
      true,
      usdcTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const adminUsdcAta = getAssociatedTokenAddressSync(
      usdcMint,
      wallet.publicKey,
      false,
      usdcTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const ensurePayoutVaultIx =
      createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        payoutUsdcVault,
        poolSignerPda,
        usdcMint,
        usdcTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
    const ensureAdminAtaIx = createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      adminUsdcAta,
      wallet.publicKey,
      usdcMint,
      usdcTokenProgram,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    return {
      payoutUsdcVault,
      adminUsdcAta,
      ensurePayoutVaultIx,
      ensureAdminAtaIx,
    };
  };

  const ensureAdminUsdcBalance = async (
    adminUsdcAta: PublicKey,
    amount: bigint,
  ): Promise<boolean> => {
    try {
      const balance = await connection.getTokenAccountBalance(adminUsdcAta);
      const available = BigInt(balance.value.amount);
      if (available < amount) {
        setTxError(
          `Insufficient USDC in the admin wallet ATA. Available: $${formatUsdc(available)}, requested: $${formatUsdc(amount)}.`,
        );
        return false;
      }
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to fetch balance";
      if (message.includes("could not find account")) {
        setTxError(
          `Admin USDC ATA does not exist. Fund ${adminUsdcAta.toBase58()} first.`,
        );
        return false;
      }
      throw e;
    }
  };

  const handleMasterWithdraw = async () => {
    if (!program || !wallet.publicKey || !pool || !usdcMint || !usdcTokenProgram) return;

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
      const nextWithdrawalPda = await getNextMasterWithdrawalPda(
        connection,
        MASTER_PROGRAM_ID,
      );

      const ix = await (program.methods as unknown as MasterProgramMethods)
        .masterWithdraw(new BN(amount.toString()), Array.from(metadataHash))
        .accounts({
          pool: poolPda,
          withdrawal: nextWithdrawalPda,
          poolUsdc: ataState.payoutUsdcVault,
          masterUsdc: ataState.adminUsdcAta,
          supportedUsdcConfig: supportedUsdcConfigPda,
          usdcMint,
          masterWallet: wallet.publicKey,
          usdcTokenProgram,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(ataState.ensurePayoutVaultIx);
      tx.add(ataState.ensureAdminAtaIx);
      tx.add(ix);

      const provider = program.provider as ProviderLike;
      const signature = await provider.sendAndConfirm(tx);

      setTxSuccess({
        label: "Withdrawal recorded and sent to admin wallet",
        signature,
      });
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

  const handleProfit = async () => {
    if (!program || !wallet.publicKey || !profitTarget || !usdcMint || !usdcTokenProgram) return;

    const amount = parseUsdcInput(profitAmount);
    if (!amount) {
      setTxError("Enter a valid profit amount.");
      return;
    }

    const ataState = buildAtaInstructions();
    if (!ataState) return;
    if (!(await ensureAdminUsdcBalance(ataState.adminUsdcAta, amount))) return;

    setSubmitting("profit");
    setTxError(null);
    setTxSuccess(null);

    try {
      const ix = await (program.methods as unknown as MasterProgramMethods)
        .masterProfit(new BN(amount.toString()))
        .accounts({
          pool: poolPda,
          withdrawal: profitTarget.pubkey,
          masterUsdc: ataState.adminUsdcAta,
          poolUsdc: ataState.payoutUsdcVault,
          supportedUsdcConfig: supportedUsdcConfigPda,
          usdcMint,
          masterWallet: wallet.publicKey,
          usdcTokenProgram,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(ataState.ensurePayoutVaultIx);
      tx.add(ataState.ensureAdminAtaIx);
      tx.add(ix);

      const provider = program.provider as ProviderLike;
      const signature = await provider.sendAndConfirm(tx);

      setTxSuccess({
        label: `Recorded profit against withdrawal #${profitTarget.id}`,
        signature,
      });
      setProfitAmount("");
      refresh();
      refreshVault();
    } catch (e: unknown) {
      console.error("Error submitting master profit:", e);
      if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error("Master profit transaction logs:", logs);
        }
      }
      setTxError(getErrorMessage(e, "Failed to submit profit"));
    } finally {
      setSubmitting(null);
    }
  };

  const handleRepay = async () => {
    if (!program || !wallet.publicKey || !repayTarget || !usdcMint || !usdcTokenProgram) return;

    const amount = parseUsdcInput(repayAmount);
    if (!amount) {
      setTxError("Enter a valid repayment amount.");
      return;
    }

    const remaining = BigInt(repayTarget.remaining);
    if (amount > remaining) {
      setTxError(
        `Repayment cannot exceed the outstanding $${formatUsdc(remaining)}. Use Profit to book upside without reducing the withdrawal.`,
      );
      return;
    }

    const ataState = buildAtaInstructions();
    if (!ataState) return;
    if (!(await ensureAdminUsdcBalance(ataState.adminUsdcAta, amount))) return;

    setSubmitting("repay");
    setTxError(null);
    setTxSuccess(null);

    try {
      const ix = await (program.methods as unknown as MasterProgramMethods)
        .masterRepay(new BN(amount.toString()))
        .accounts({
          pool: poolPda,
          withdrawal: repayTarget.pubkey,
          masterUsdc: ataState.adminUsdcAta,
          poolUsdc: ataState.payoutUsdcVault,
          supportedUsdcConfig: supportedUsdcConfigPda,
          usdcMint,
          masterWallet: wallet.publicKey,
          usdcTokenProgram,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(ataState.ensurePayoutVaultIx);
      tx.add(ataState.ensureAdminAtaIx);
      tx.add(ix);

      const provider = program.provider as ProviderLike;
      const signature = await provider.sendAndConfirm(tx);

      setTxSuccess({
        label: `Repaid $${formatUsdc(amount)} against withdrawal #${repayTarget.id}`,
        signature,
      });
      setRepayAmount("");
      refresh();
      refreshVault();
    } catch (e: unknown) {
      console.error("Error submitting master repayment:", e);
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

  const handleClose = async () => {
    if (!program || !wallet.publicKey || !closeTarget || !usdcMint || !usdcTokenProgram) return;

    const amount = parseUsdcInput(closeAmount, { allowZero: true });
    if (amount === null) {
      setTxError("Enter a valid close amount.");
      return;
    }

    const ataState = buildAtaInstructions();
    if (!ataState) return;
    if (amount > BigInt(0)) {
      const hasBalance = await ensureAdminUsdcBalance(ataState.adminUsdcAta, amount);
      if (!hasBalance) return;
    }

    setSubmitting("close");
    setTxError(null);
    setTxSuccess(null);

    try {
      const ix = await (program.methods as unknown as MasterProgramMethods)
        .masterCloseWithdrawal(new BN(amount.toString()))
        .accounts({
          pool: poolPda,
          withdrawal: closeTarget.pubkey,
          masterUsdc: ataState.adminUsdcAta,
          poolUsdc: ataState.payoutUsdcVault,
          supportedUsdcConfig: supportedUsdcConfigPda,
          usdcMint,
          masterWallet: wallet.publicKey,
          usdcTokenProgram,
        })
        .instruction();

      const tx = new Transaction();
      tx.add(ataState.ensurePayoutVaultIx);
      tx.add(ataState.ensureAdminAtaIx);
      tx.add(ix);

      const provider = program.provider as ProviderLike;
      const signature = await provider.sendAndConfirm(tx);

      const remaining = BigInt(closeTarget.remaining);
      const pnlDelta = amount - remaining;
      let label = `Closed withdrawal #${closeTarget.id} at breakeven`;
      if (pnlDelta > BigInt(0)) {
        label = `Closed withdrawal #${closeTarget.id} with profit of $${formatUsdc(pnlDelta)}`;
      } else if (pnlDelta < BigInt(0)) {
        label = `Closed withdrawal #${closeTarget.id} with loss of $${formatUsdc(-pnlDelta)}`;
      }

      setTxSuccess({
        label,
        signature,
      });
      setCloseAmount("");
      refresh();
      refreshVault();
    } catch (e: unknown) {
      console.error("Error closing withdrawal:", e);
      if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error("Close withdrawal transaction logs:", logs);
        }
      }
      setTxError(getErrorMessage(e, "Failed to close withdrawal"));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">
            Master Operations
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Admin withdrawals, repayments, profit bookings, and withdrawal
            closeouts for the current program.
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
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Program
          </div>
          <p className="break-all font-mono text-sm text-white">
            {MASTER_PROGRAM_ID.toBase58()}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Pool Admin
          </div>
          <p className="break-all font-mono text-sm text-white">
            {adminWallet?.toBase58() ?? "Pool not found"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Payout Vault
          </div>
          <p className="font-mono text-sm text-white">
            {payoutVaultBalance !== null
              ? `$${payoutVaultBalance}`
              : "Unavailable"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-5">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            NAV / Open USDC
          </div>
          <p className="font-mono text-sm text-white">
            {pool
              ? `$${formatUsdc(pool.nav)} / $${formatUsdc(openWithdrawalUsdc)}`
              : "Unavailable"}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {activeWithdrawals.length} active withdrawal
            {activeWithdrawals.length === 1 ? "" : "s"}
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
            Connected wallet {shortPk(wallet.publicKey.toBase58())} is not the
            current pool admin.
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

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">Master Withdraw</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Moves USDC from the payout vault to the connected admin wallet and
              records a withdrawal without changing NAV or token price.
            </p>
          </div>
          <label className="mb-2 block text-xs text-neutral-400">
            Amount (USDC)
          </label>
          <input
            type="number"
            min="0"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="mb-4 h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 font-mono text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
            placeholder="0.00"
          />

          <label className="mb-2 block text-xs text-neutral-400">
            Metadata Hash or Reference
          </label>
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
            disabled={
              !isAuthorizedWallet ||
              !withdrawAmount ||
              !metadataInput ||
              submitting !== null
            }
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#00FFB2] text-sm font-medium text-black transition-colors hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600"
          >
            {submitting === "withdraw" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {submitting === "withdraw" ? "Submitting..." : "Create Withdrawal"}
          </button>
        </div>

        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">Repay</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Returns principal from the admin wallet to the payout vault and
              reduces the selected withdrawal&apos;s remaining balance without
              changing NAV.
            </p>
          </div>

          <label className="mb-2 block text-xs text-neutral-400">
            Withdrawal
          </label>
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

          <label className="mb-2 block text-xs text-neutral-400">
            Amount (USDC)
          </label>
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
              Outstanding balance will drop from{" "}
              <span className="font-mono text-neutral-300">
                ${formatUsdc(repayTarget.remaining)}
              </span>
              . Use Profit instead if the returned cash should increase NAV
              without reducing this withdrawal.
            </p>
          )}

          <button
            onClick={handleRepay}
            disabled={
              !isAuthorizedWallet ||
              !repayWithdrawalId ||
              !repayAmount ||
              submitting !== null
            }
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-300 text-sm font-medium text-black transition-colors hover:bg-sky-200 disabled:bg-neutral-800 disabled:text-neutral-600"
          >
            {submitting === "repay" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {submitting === "repay" ? "Submitting..." : "Repay Withdrawal"}
          </button>
        </div>

        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">Profit</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Returns USDC from the admin wallet to the payout vault and books
              the full amount as profit against the selected withdrawal. Profit
              always increases NAV and does not reduce the withdrawal&apos;s
              remaining balance.
            </p>
          </div>

          <label className="mb-2 block text-xs text-neutral-400">
            Withdrawal
          </label>
          <select
            value={profitWithdrawalId}
            onChange={(e) => setProfitWithdrawalId(e.target.value)}
            className="mb-4 h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
          >
            <option value="">Select withdrawal</option>
            {activeWithdrawals.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} - ${formatUsdc(item.amount)} withdrawn
                {` ($${formatUsdc(item.remaining)} remaining)`}
              </option>
            ))}
          </select>

          <label className="mb-2 block text-xs text-neutral-400">
            Amount (USDC)
          </label>
          <input
            type="number"
            min="0"
            value={profitAmount}
            onChange={(e) => setProfitAmount(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 font-mono text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
            placeholder="0.00"
          />
          {profitTarget && (
            <p className="mt-2 text-[11px] text-neutral-500">
              Remaining balance stays unchanged at{" "}
              <span className="font-mono text-neutral-300">
                ${formatUsdc(profitTarget.remaining)}
              </span>
              . The submitted amount is treated as pure profit and increases NAV
              one-for-one.
            </p>
          )}

          <button
            onClick={handleProfit}
            disabled={
              !isAuthorizedWallet ||
              !profitWithdrawalId ||
              !profitAmount ||
              submitting !== null
            }
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#00FFB2] text-sm font-medium text-black transition-colors hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600"
          >
            {submitting === "profit" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {submitting === "profit" ? "Submitting..." : "Record Profit"}
          </button>
        </div>

        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/40 p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-white">
              Close Withdrawal
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Returns the final USDC amount from the admin wallet to the payout
              vault, closes the selected withdrawal, and adjusts NAV by the
              difference between the returned amount and the withdrawal&apos;s
              remaining balance.
            </p>
          </div>

          <label className="mb-2 block text-xs text-neutral-400">
            Withdrawal
          </label>
          <select
            value={closeWithdrawalId}
            onChange={(e) => setCloseWithdrawalId(e.target.value)}
            className="mb-4 h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
          >
            <option value="">Select withdrawal</option>
            {activeWithdrawals.map((item) => (
              <option key={item.id} value={item.id}>
                #{item.id} - ${formatUsdc(item.remaining)} remaining
              </option>
            ))}
          </select>

          <label className="mb-2 block text-xs text-neutral-400">
            Returned Amount (USDC)
          </label>
          <input
            type="number"
            min="0"
            value={closeAmount}
            onChange={(e) => setCloseAmount(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-700/60 bg-neutral-800/60 px-3 font-mono text-sm text-white focus:border-[#00FFB2]/50 focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50"
            placeholder="0.00"
          />
          {closeTarget && (
            <p className="mt-2 text-[11px] text-neutral-500">
              Remaining balance:{" "}
              <span className="font-mono text-neutral-300">
                ${formatUsdc(closeTarget.remaining)}
              </span>
              {closePnlDelta === null ? (
                ". Enter the final returned amount to preview the closeout result."
              ) : closePnlDelta > BigInt(0) ? (
                <>
                  . This closes with profit of{" "}
                  <span className="font-mono text-neutral-300">
                    ${formatUsdc(closePnlDelta)}
                  </span>{" "}
                  and increases NAV by the same amount.
                </>
              ) : closePnlDelta < BigInt(0) ? (
                <>
                  . This closes with loss of{" "}
                  <span className="font-mono text-neutral-300">
                    ${formatUsdc(-closePnlDelta)}
                  </span>{" "}
                  and reduces NAV by the same amount.
                </>
              ) : (
                ". This closes at breakeven with no NAV change."
              )}
            </p>
          )}

          <button
            onClick={handleClose}
            disabled={
              !isAuthorizedWallet ||
              !closeWithdrawalId ||
              closeAmount.trim() === "" ||
              submitting !== null
            }
            className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-neutral-200 text-sm font-medium text-black transition-colors hover:bg-white disabled:bg-neutral-800 disabled:text-neutral-600"
          >
            {submitting === "close" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {submitting === "close" ? "Submitting..." : "Close Withdrawal"}
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
          <span className="text-xs text-neutral-500">
            {activeWithdrawals.length} open
          </span>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-neutral-500">
            Loading withdrawals...
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">
            No withdrawal accounts found for this program.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-800/40">
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  ID
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Amount
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Remaining
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Settled
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Created
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  Metadata Hash
                </th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((item) => {
                return (
                  <tr
                    key={item.pubkey.toBase58()}
                    className="border-b border-neutral-800/30 last:border-b-0"
                  >
                    <td className="px-5 py-3 font-mono text-sm text-white">
                      #{item.id}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-neutral-300">
                      ${formatUsdc(item.amount)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm">
                      <span
                        className={
                          BigInt(item.remaining) > BigInt(0)
                            ? "text-[#00FFB2]"
                            : "text-neutral-500"
                        }
                      >
                        ${formatUsdc(item.remaining)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-sm text-neutral-300">
                      ${formatUsdc(item.settled)}
                    </td>
                    <td className="px-5 py-3 text-sm text-neutral-400">
                      {formatTimestamp(item.createdAt)}
                    </td>
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
