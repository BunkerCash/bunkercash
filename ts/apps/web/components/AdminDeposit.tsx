"use client";

import { useState, useMemo, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, type TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { CreditCard, Building, Loader2, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { useAtom } from "jotai";
import { loansAtom } from "@/lib/atoms";
import { getProgram, getPoolPda, getPoolSignerPda, PROGRAM_ID } from "@/lib/program";
import { getClusterFromEndpoint, getUsdcMintForCluster, SQUADS_VAULT_PUBKEY } from "@/lib/constants";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSquadsTransaction } from "@/hooks/useSquadsTransaction";

const USDC_DECIMALS = 6;

export function AdminDeposit() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { isGovernedBySquads } = useIsAdmin();
  const { submit: submitSquads, isSubmitting: isSquadsSubmitting, error: squadsError, result: squadsResult } =
    useSquadsTransaction();

  const [amount, setAmount] = useState("");
  const [selectedLoan, setSelectedLoan] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [loans, setLoans] = useAtom(loansAtom);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda]);

  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet],
  );

  const usdcMint = useMemo(() => {
    if (!connection) return null;
    const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "");
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  const cluster = useMemo(() => {
    return getClusterFromEndpoint(connection.rpcEndpoint ?? "");
  }, [connection]);

  const getExplorerAccountUrl = (address: PublicKey) => {
    const base = `https://explorer.solana.com/address/${address.toBase58()}`;
    return cluster === "mainnet-beta" ? base : `${base}?cluster=${cluster}`;
  };

  // Parse entered amount into USDC base units (6 decimals) as BN (Anchor requires BN, not bigint)
  const usdcAmount = useMemo(() => {
    const raw = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (isNaN(raw) || raw <= 0) return null;
    return new BN(Math.round(raw * 10 ** USDC_DECIMALS).toString());
  }, [amount]);

  // Update local loan-tracking state after a successful deposit
  const applyLoanUpdate = useCallback(() => {
    const idx = loans.findIndex((l) => l.id === selectedLoan);
    if (idx === -1) return;
    const depositAmt = parseFloat(amount.replace(/[^0-9.]/g, ""));
    const current = parseFloat(loans[idx].outstanding.replace(/[^0-9.-]+/g, ""));
    const updated = [...loans];
    updated[idx] = {
      ...loans[idx],
      outstanding: `$${Math.max(0, current - depositAmt).toLocaleString()}`,
    };
    setLoans(updated);
  }, [loans, selectedLoan, amount, setLoans]);

  type AddLiquidityMethods = {
    addLiquidity: (usdcAmount: BN) => {
      accounts: (a: {
        pool: PublicKey;
        poolSigner: PublicKey;
        usdcMint: PublicKey;
        admin: PublicKey;
        adminUsdc: PublicKey;
        payoutUsdcVault: PublicKey;
        usdcTokenProgram: PublicKey;
        associatedTokenProgram: PublicKey;
        systemProgram: PublicKey;
      }) => { instruction: () => Promise<TransactionInstruction> };
    };
  };

  type ProviderLike = { sendAndConfirm: (tx: Transaction) => Promise<string> };

  const handleDeposit = async () => {
    if (!program || !usdcMint || !usdcAmount) return;

    const busy = isSubmitting || isSquadsSubmitting;
    if (busy) return;

    setIsSubmitting(true);
    setError(null);
    setTxSig(null);

    try {
      const payoutUsdcVault = getAssociatedTokenAddressSync(
        usdcMint,
        poolSignerPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      if (isGovernedBySquads) {
        if (!SQUADS_VAULT_PUBKEY) {
          throw new Error("Missing NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY (v4 multisig) in web env")
        }
        // ── Squads flow ──────────────────────────────────────────────────────
        // admin = Squads vault PDA; the vault's USDC ATA is the source
        const vaultUsdcAta = getAssociatedTokenAddressSync(
          usdcMint,
          SQUADS_VAULT_PUBKEY,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

        const ix = await (program.methods as unknown as AddLiquidityMethods)
          .addLiquidity(usdcAmount)
          .accounts({
            pool: poolPda,
            poolSigner: poolSignerPda,
            usdcMint,
            admin: SQUADS_VAULT_PUBKEY,
            adminUsdc: vaultUsdcAta,
            payoutUsdcVault,
            usdcTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction();

        const out = await submitSquads(
          [ix],
          `Add liquidity: ${amount} USDC → BunkerCash pool`,
        );
        if (out) {
          applyLoanUpdate();
          setAmount("");
          setSelectedLoan("");
          setNotes("");
        }
      } else {
        // ── Direct flow ──────────────────────────────────────────────────────
        // admin = connected wallet; wallet's USDC ATA is the source
        if (!wallet.publicKey) return;

        const adminUsdcAta = getAssociatedTokenAddressSync(
          usdcMint,
          wallet.publicKey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

        const ix = await (program.methods as unknown as AddLiquidityMethods)
          .addLiquidity(usdcAmount)
          .accounts({
            pool: poolPda,
            poolSigner: poolSignerPda,
            usdcMint,
            admin: wallet.publicKey,
            adminUsdc: adminUsdcAta,
            payoutUsdcVault,
            usdcTokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .instruction();

        const tx = new Transaction().add(ix);
        const sig = await (program.provider as unknown as ProviderLike).sendAndConfirm(tx);
        setTxSig(sig);
        applyLoanUpdate();
        setAmount("");
        setSelectedLoan("");
        setNotes("");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to deposit");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedLoanData = loans.find((l) => l.id === selectedLoan);
  const busy = isSubmitting || isSquadsSubmitting;
  const displayError = error ?? squadsError;

  return (
    <div className="space-y-6">
      {/* Context banner */}
      <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
        <div className="flex items-start gap-3">
          <Building className="w-5 h-5 text-[#00FFB2] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-neutral-300">
            <p className="font-medium text-white mb-1">Deposit Funds for Loan Repayment</p>
            <p className="text-xs text-neutral-500">
              {isGovernedBySquads
                ? "Creates a Squads vault transaction proposal. Members must approve before funds transfer."
                : "Transfers USDC from your wallet into the pool payout vault."}
            </p>
          </div>
        </div>
      </div>

      {/* Success states */}
      {txSig && (
        <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-green-300 mb-1">Deposit confirmed</p>
            <p className="text-xs font-mono text-green-200/60 break-all">{txSig}</p>
          </div>
        </div>
      )}

      {squadsResult && (
        <div className="flex items-start gap-3 bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
          <CheckCircle2 className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="font-medium text-purple-300 mb-1">
              Squads proposal created — tx&nbsp;#{squadsResult.txIndex.toString()}
            </p>
            <p className="text-xs text-purple-200/60 mb-2">
              Your approval has been cast. Share the link below with the other members.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <a
                href={squadsResult.squadsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 underline underline-offset-2"
              >
                Open in Squads <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={getExplorerAccountUrl(new PublicKey(squadsResult.proposalPda))}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-2 font-mono"
                title="View proposal PDA on Solana Explorer"
              >
                View proposal PDA
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {displayError && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{displayError}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Amount */}
        <div>
          <label className="block text-sm text-neutral-400 mb-2">Amount (USDC)</label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              disabled={busy}
              className="bg-transparent text-2xl font-medium w-full outline-none disabled:opacity-50"
            />
          </div>
        </div>

        {/* Loan selector */}
        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            Select Loan for Repayment
          </label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-neutral-500" />
              <select
                value={selectedLoan}
                onChange={(e) => setSelectedLoan(e.target.value)}
                disabled={busy}
                className="bg-transparent text-sm w-full outline-none disabled:opacity-50"
              >
                <option value="">Select loan ID</option>
                {loans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    {loan.loanId} - {loan.property}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedLoanData && (
            <div className="mt-3 text-xs bg-neutral-900/50 p-4 rounded-xl border border-neutral-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-neutral-500 mb-1">Property</div>
                  <div className="text-neutral-300">{selectedLoanData.property}</div>
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">Address</div>
                  <div className="text-neutral-300">{selectedLoanData.address}</div>
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">Loan Amount</div>
                  <div className="text-neutral-300">{selectedLoanData.amount}</div>
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">LTV</div>
                  <div className="text-neutral-300">{selectedLoanData.ltv}</div>
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">Outstanding Balance</div>
                  <div className="text-[#00FFB2] font-semibold">
                    {selectedLoanData.outstanding}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm text-neutral-400 mb-2">Notes (Optional)</label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Monthly rent collection Q1 2025"
              rows={3}
              disabled={busy}
              className="bg-transparent text-sm w-full outline-none resize-none disabled:opacity-50"
            />
          </div>
        </div>

        <button
          onClick={handleDeposit}
          disabled={busy || !amount || !selectedLoan || !usdcAmount}
          className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy
            ? isGovernedBySquads
              ? "Creating proposal…"
              : "Depositing…"
            : isGovernedBySquads
              ? "Propose via Squads"
              : "Deposit Funds"}
        </button>
      </div>
    </div>
  );
}
