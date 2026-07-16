'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Idl, Program } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { BN } from '@coral-xyz/anchor'
import { PublicKey, SendTransactionError, SystemProgram, Transaction, type TransactionInstruction } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { useSetAtom } from "jotai";
import {
  fetchRawPoolAccountWithRetry,
  getBunkercashMintPda,
  getFeeConfigPda,
  getMinClaimConfigPda,
  getPoolPda,
  getProgram,
  getReadonlyProgram,
  type ProgramWallet,
  PROGRAM_ID,
} from '@/lib/program'
import { countFractionalDigits, parseUiAmountToBaseUnits } from '@/lib/amounts'
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { useMyClaims } from "@/hooks/useMyClaims";
import { usePoolStats } from "@/hooks/usePoolStats";
import { invalidateTransactionCache } from "@/hooks/useMyTransactions";
import { useToast } from "@/components/ui/ToastContext";
import { sendAndConfirmWalletTransaction } from "@/lib/sendAndConfirmWalletTransaction";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";
import { connectModalOpenAtom } from "@/lib/ui-atoms";
import {
  AckCheckbox,
  AmountInputCard,
  AmountOutputCard,
  ComposerCta,
  DetailRow,
  type CtaKind,
} from "@/components/trade/composerParts";
import {
  ReviewSheet,
  type SheetPhase,
  type SheetRow,
} from "@/components/trade/ReviewSheet";

function isWalletRejection(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message.toLowerCase()
      : String(e ?? "").toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected the request")
  );
}

interface Stringable {
  toString(): string
}

interface FeeConfigAccount {
  claimFeeBps: Stringable
}

interface MinClaimConfigAccount {
  minClaimUsdc: Stringable
}

interface WithdrawAccountApi {
  feeConfig?: { fetch: (pubkey: PublicKey) => Promise<FeeConfigAccount> }
  minClaimConfig?: { fetch: (pubkey: PublicKey) => Promise<MinClaimConfigAccount> }
}

// Mirrors DEFAULT_MIN_CLAIM_USDC in the program: the floor that applies while
// the MinClaimConfig PDA is uninitialized. $1.00 at 6 decimals.
const DEFAULT_MIN_CLAIM_USDC = 1_000_000n

interface FileClaimMethods {
  fileClaim: (amount: BN) => {
    accounts: (accounts: {
      pool: PublicKey
      claim: PublicKey
      user: PublicKey
      userBunkercash: PublicKey
      poolBunkercashEscrow: PublicKey
      masterWallet: PublicKey
      masterBunkercash: PublicKey
      bunkercashMint: PublicKey
      feeConfig: PublicKey
      minClaimConfig: PublicKey
      tokenProgram: PublicKey
      associatedTokenProgram: PublicKey
      systemProgram: PublicKey
    }) => {
      instruction: () => Promise<TransactionInstruction>
    }
  }
}

function toUi(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, "0")
  const head = s.slice(0, -decimals)
  const tail = s.slice(-decimals).replace(/0+$/, "")
  return tail.length ? `${head}.${tail}` : head
}

function formatPercentFromBps(bps: number): string {
  const formatted = (bps / 100).toFixed(2)
  return formatted.replace(/\.?0+$/, "")
}

export function WithdrawInterface() {
  const { connection } = useConnection()
  const wallet = useOptionalWallet()
  const publicKey = wallet?.publicKey ?? null
  const signTransaction = wallet?.signTransaction
  const signAllTransactions = wallet?.signAllTransactions
  const { showToast } = useToast();
  const openConnect = useSetAtom(connectModalOpenAtom);
  const [amountUi, setAmountUi] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phase, setPhase] = useState<SheetPhase>("review");
  const [liveSig, setLiveSig] = useState<string | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ k: string; v: string }[]>([]);
  const txInFlight = useRef(false);
  const [poolState, setPoolState] = useState<{
    masterWallet: PublicKey
    nav: bigint
    totalBunkercashSupply: bigint
    claimCounter: bigint
    claimFeeBps: number
    minClaimUsdc: bigint
  } | null>(null)

  const program = useMemo(
    () =>
      publicKey && signTransaction && signAllTransactions
        ? getProgram(connection, {
            publicKey,
            signTransaction,
            signAllTransactions,
          } satisfies ProgramWallet)
        : null,
    [connection, publicKey, signTransaction, signAllTransactions]
  )
  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), [])
  const feeConfigPda = useMemo(() => getFeeConfigPda(PROGRAM_ID), [])
  const minClaimConfigPda = useMemo(() => getMinClaimConfigPda(PROGRAM_ID), [])

  const { balance: tokenBalanceUi, refreshBalance: fetchTokenBalance } =
    useTokenBalance();
  const { balance: usdcBalance } = useUsdcBalance();
  const { claims, refreshClaims: fetchClaims } = useMyClaims();
  const { stats } = usePoolStats();
  const amountRaw = useMemo(() => parseUiAmountToBaseUnits(amountUi, 6), [amountUi])
  const tokenBalanceRaw = useMemo(
    () => parseUiAmountToBaseUnits(tokenBalanceUi, 6),
    [tokenBalanceUi]
  )

  const fetchPoolState = useCallback(async () => {
    try {
      // Pool state is public — read it without a connected wallet too.
      // Raw decode: tolerant of a deployed program older than the bundled IDL.
      const state = await fetchRawPoolAccountWithRetry(connection)
      if (!state) {
        setPoolState(null)
        return
      }
      const readProgram = program ?? getReadonlyProgram(connection)
      const accountApi = (readProgram as Program<Idl>).account as WithdrawAccountApi
      let claimFeeBps = 0

      if (accountApi.feeConfig) {
        try {
          const feeConfig = await accountApi.feeConfig.fetch(feeConfigPda)
          claimFeeBps = Number(feeConfig.claimFeeBps.toString())
        } catch {
          claimFeeBps = 0
        }
      }

      // An uninitialized config PDA means the program enforces its built-in
      // $1.00 default, so mirror that here rather than treating it as "no
      // minimum".
      let minClaimUsdc = DEFAULT_MIN_CLAIM_USDC
      if (accountApi.minClaimConfig) {
        try {
          const minClaimConfig = await accountApi.minClaimConfig.fetch(minClaimConfigPda)
          minClaimUsdc = BigInt(minClaimConfig.minClaimUsdc.toString())
        } catch {
          minClaimUsdc = DEFAULT_MIN_CLAIM_USDC
        }
      }

      const nav = state.nav
      const totalPendingClaims = state.totalPendingClaims
      const availableNav = nav > totalPendingClaims ? nav - totalPendingClaims : 0n

      setPoolState({
        masterWallet: state.masterWallet,
        nav: availableNav,
        totalBunkercashSupply: state.totalBunkercashSupply,
        claimCounter: state.claimCounter,
        claimFeeBps,
        minClaimUsdc,
      })
    } catch {
      setPoolState(null)
    }
  }, [connection, feeConfigPda, minClaimConfigPda, poolPda, program])

  useEffect(() => {
    void fetchPoolState()
  }, [fetchPoolState])

  const userBunkercashAta = useMemo(() => {
    if (!publicKey) return null
    return getAssociatedTokenAddressSync(
      mintPda,
      publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  }, [publicKey, mintPda])

  const feeBunkercashRaw = useMemo(() => {
    if (!poolState || amountRaw == null) return null
    if (amountRaw <= 0n) return null
    return (amountRaw * BigInt(poolState.claimFeeBps)) / 10_000n
  }, [amountRaw, poolState])

  const netBunkercashRaw = useMemo(() => {
    if (amountRaw == null || feeBunkercashRaw == null) return null
    return amountRaw - feeBunkercashRaw
  }, [amountRaw, feeBunkercashRaw])

  const netClaimUsdcRaw = useMemo(() => {
    if (!poolState || netBunkercashRaw == null) return null
    if (netBunkercashRaw <= 0n || poolState.nav <= 0n || poolState.totalBunkercashSupply <= 0n) return null
    return (netBunkercashRaw * poolState.nav) / poolState.totalBunkercashSupply
  }, [netBunkercashRaw, poolState])

  const inputError = useMemo(() => {
    if (!amountUi) return null
    if (countFractionalDigits(amountUi) > 6) return "Max 6 decimal places"
    if (amountRaw == null) return "Enter a valid amount"
    if (amountRaw <= 0n) return "Amount must be greater than 0"
    if (netClaimUsdcRaw !== null && netClaimUsdcRaw <= 0n) {
      return "Amount is too small to produce any USDC at the current reference value"
    }
    if (
      netClaimUsdcRaw !== null &&
      poolState !== null &&
      netClaimUsdcRaw < poolState.minClaimUsdc
    ) {
      return `Sell request must be worth at least ${toUi(poolState.minClaimUsdc, 6)} USDC after fees`
    }
    if (publicKey && tokenBalanceRaw != null && amountRaw > tokenBalanceRaw) {
      return `Amount exceeds your BNKR balance of ${tokenBalanceUi}.`
    }
    return null
  }, [amountRaw, amountUi, netClaimUsdcRaw, poolState, tokenBalanceRaw, tokenBalanceUi, publicKey])

  const canSubmitSell = Boolean(
    wallet && program && publicKey && connection && userBunkercashAta
  );

  const handleRegisterSell = async () => {
    if (!wallet || !program || !publicKey || !connection || !userBunkercashAta)
      return;

    if (txInFlight.current) return;
    txInFlight.current = true;

    const soldUi = amountUi || "0";
    const receivedUi = netClaimUsdcRaw != null ? toUi(netClaimUsdcRaw, 6) : "0";
    setFailureMessage(null);
    setLiveSig(null);
    setSubmitting(true);
    setPhase("signing");
    try {
      if (inputError || amountRaw == null || amountRaw <= 0n) {
        throw new Error(inputError ?? "Amount must be greater than 0")
      }

      const sellAmount = new BN(amountRaw.toString())

      if (tokenBalanceRaw != null && amountRaw > tokenBalanceRaw) {
        setPhase("review");
        showToast("Insufficient BNKR balance", "error");
        txInFlight.current = false;
        setSubmitting(false);
        return;
      }

      // Always read the latest on-chain counter before deriving the claim PDA.
      // A cached counter can drift after a prior sell request and trigger Anchor's
      // `ConstraintSeeds` check on the `claim` account.
      const livePoolState = await fetchRawPoolAccountWithRetry(connection)
      if (!livePoolState) {
        throw new Error("Pool account not found — pool not initialized on this cluster")
      }
      const claimId = new BN(livePoolState.claimCounter.toString());
      const idLe = Uint8Array.from(claimId.toArray("le", 8));
      const [claimPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("claim"), publicKey.toBuffer(), idLe],
        PROGRAM_ID,
      );
      const masterWallet = livePoolState.masterWallet;
      const poolBunkercashEscrow = getAssociatedTokenAddressSync(
        mintPda,
        poolPda,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const masterBunkercash = getAssociatedTokenAddressSync(
        mintPda,
        masterWallet,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const createUserAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        publicKey,
        userBunkercashAta,
        publicKey,
        mintPda,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const methodsApi = (program as Program<Idl>).methods as unknown as FileClaimMethods
      const registerIx = await methodsApi
        .fileClaim(sellAmount)
        .accounts({
          pool: poolPda,
          claim: claimPda,
          user: publicKey,
          userBunkercash: userBunkercashAta,
          poolBunkercashEscrow,
          masterWallet,
          masterBunkercash,
          bunkercashMint: mintPda,
          feeConfig: feeConfigPda,
          minClaimConfig: minClaimConfigPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(createUserAtaIx, registerIx);
      const sig = await sendAndConfirmWalletTransaction({
        connection,
        wallet,
        transaction: tx,
        onSigned: (signature) => {
          setLiveSig(signature);
          setPhase("pending");
        },
      });
      setReceipt([
        { k: "Escrowed", v: `${soldUi} BNKR` },
        { k: "Received (est.)", v: `${receivedUi} USDC` },
        { k: "Signature", v: `${sig.slice(0, 5)}…${sig.slice(-4)}` },
      ]);
      setLiveSig(sig);
      setPhase("success");
      setAmountUi("");
      setConfirmed(false);
      await fetchTokenBalance();
      await fetchClaims();
      await fetchPoolState();
      invalidateTransactionCache();
      showToast(`Sell request submitted. Tx: ${sig.slice(0, 8)}…`, "success");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (isWalletRejection(e)) {
        setPhase("review");
        showToast("Transaction rejected by wallet", "warning");
      } else if (msg.includes("already been processed")) {
        setSheetOpen(false);
        setPhase("review");
        await fetchTokenBalance();
        await fetchClaims();
        invalidateTransactionCache();
        showToast("Sell request was already processed. Check your wallet page.", "success");
      } else if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error('File claim transaction logs:', logs);
        }
        setFailureMessage(e.message || "Transaction failed");
        setPhase("failed");
        showToast(e.message || "Transaction failed", "error");
      } else if (msg.includes("ConstraintSeeds")) {
        setFailureMessage("Sell request counter changed before submission. Please retry.");
        setPhase("failed");
        showToast("Sell request counter changed, please retry", "warning");
        await fetchPoolState();
      } else if (msg.includes("ClaimAmountTooSmall") || msg.includes("non-zero USDC value")) {
        setFailureMessage("Amount is too small to produce any USDC at the current reference value.");
        setPhase("failed");
        showToast("Sell amount too small at current reference value", "warning");
      } else if (msg.includes("ClaimBelowMinimum") || msg.includes("below the minimum claim size")) {
        const minUi = toUi(poolState?.minClaimUsdc ?? DEFAULT_MIN_CLAIM_USDC, 6);
        setFailureMessage(`Sell request must be worth at least ${minUi} USDC after fees.`);
        setPhase("failed");
        showToast(`Sell request below the ${minUi} USDC minimum`, "warning");
      } else if (msg.includes("already in use") || msg.includes("0x0")) {
        setFailureMessage("Sell request slot conflict — another transaction landed first. Please try again.");
        setPhase("failed");
        showToast("Sell request slot taken, please retry", "warning");
      } else {
        setFailureMessage(msg || "Transaction failed");
        setPhase("failed");
        showToast(msg || "Transaction failed", "error");
      }
    } finally {
      setSubmitting(false);
      txInFlight.current = false;
    }
  };

  const openClaims = claims.filter(
    (c) => !c.cancelled && !c.processed && c.bunkercashRemaining !== "0",
  );

  const rate =
    poolState && poolState.totalBunkercashSupply > 0n
      ? Number(poolState.nav) / Number(poolState.totalBunkercashSupply)
      : null;
  const rateFmt = rate != null ? rate.toFixed(4) : "—";
  const feePct = formatPercentFromBps(poolState?.claimFeeBps ?? 0);
  const estUsdcUi = netClaimUsdcRaw != null ? toUi(netClaimUsdcRaw, 6) : "";

  const liquidRaw = stats.treasuryUsdcRaw;
  const estUsdcNum = netClaimUsdcRaw != null ? Number(netClaimUsdcRaw) / 1e6 : 0;
  const expectImmediate = liquidRaw != null && estUsdcNum <= liquidRaw;

  // ---- CTA state ----
  const ctaKind: CtaKind = "sell";
  let ctaLabel = "Review sell request";
  let ctaDisabled = false;
  let ctaAction: (() => void) | undefined;
  if (!publicKey) {
    ctaLabel = "Connect wallet";
    ctaAction = () => openConnect(true);
  } else if (!poolState) {
    ctaLabel = "Loading pool data…";
    ctaDisabled = true;
  } else if (!amountRaw || amountRaw <= 0n) {
    ctaLabel = "Enter an amount";
    ctaDisabled = true;
  } else if (inputError) {
    ctaLabel = inputError.startsWith("Amount exceeds")
      ? "Insufficient BNKR"
      : "Review sell request";
    ctaDisabled = true;
  } else if (!confirmed) {
    ctaLabel = "Accept the settlement terms";
    ctaDisabled = true;
  } else if (!canSubmitSell) {
    ctaLabel = "Wallet unavailable";
    ctaDisabled = true;
  } else {
    ctaAction = () => {
      setPhase("review");
      setSheetOpen(true);
    };
  }

  const sheetRows: SheetRow[] = [
    { k: "You sell", v: `${amountUi || "0"} BNKR`, strong: true },
    { k: "Reference rate", v: `1 BNKR = ${rateFmt} USDC` },
    {
      k: "Claim fee",
      v:
        feeBunkercashRaw != null && feeBunkercashRaw > 0n
          ? `${feePct}% (${toUi(feeBunkercashRaw, 6)} BNKR)`
          : `${feePct}%`,
    },
    {
      k: "Escrowed after fee",
      v: netBunkercashRaw != null ? `${toUi(netBunkercashRaw, 6)} BNKR` : "—",
    },
    {
      k: "Expected settlement",
      v: expectImmediate ? "Immediate" : "Queued — depends on liquidity",
      tone: expectImmediate ? "mint" : "warn",
    },
    {
      k: "You receive (est.)",
      v: `${estUsdcUi || "0"} USDC`,
      strong: true,
      tone: "mint",
      highlight: true,
    },
  ];

  return (
    <>
      <span className="text-[12.5px] leading-relaxed text-ink-3">
        Selling files a settlement request. Your BNKR is escrowed and USDC is
        paid from pool liquidity — cancellable while unsettled.
      </span>

      <AmountInputCard
        label="You sell"
        token="BNKR"
        value={amountUi}
        onChange={setAmountUi}
        balance={publicKey && tokenBalanceUi != null ? tokenBalanceUi : "—"}
        onMax={
          publicKey && tokenBalanceUi != null
            ? () => setAmountUi(tokenBalanceUi)
            : undefined
        }
        error={inputError}
      />

      <AmountOutputCard
        label="You receive (estimated)"
        token="USDC"
        value={estUsdcUi}
        balance={publicKey && usdcBalance != null ? usdcBalance : "—"}
      />

      <div className="flex flex-col gap-2 px-1 py-0.5">
        <DetailRow label="Reference rate">1 BNKR = {rateFmt} USDC</DetailRow>
        <DetailRow label="Claim fee">{feePct}%</DetailRow>
        <DetailRow label="Est. network fee">0.000005 SOL</DetailRow>
        <DetailRow label="Liquid USDC available">
          {stats.treasuryUsdc != null ? `$${stats.treasuryUsdc}` : "—"}
        </DetailRow>
        <DetailRow label="Expected settlement" mono={false}>
          <span
            className={`font-medium ${expectImmediate ? "text-mint" : "text-warn"}`}
          >
            {expectImmediate ? "Immediate" : "Queued — partial fill likely"}
          </span>
        </DetailRow>
      </div>

      <AckCheckbox checked={confirmed} onToggle={() => setConfirmed(!confirmed)}>
        I understand a claim fee is deducted, my remaining BNKR is locked in
        escrow while the request is open, settlement depends on available pool
        liquidity, and I can cancel an unsettled request at any time.
      </AckCheckbox>

      {publicKey && openClaims.length > 0 && (
        <span className="px-1 text-[12.5px] text-ink-3">
          You have {openClaims.length} open sell{" "}
          {openClaims.length === 1 ? "request" : "requests"} — track or cancel
          {openClaims.length === 1 ? " it" : " them"} on the{" "}
          <a href="/wallet">Wallet page</a>.
        </span>
      )}

      <ComposerCta
        kind={ctaKind}
        disabled={ctaDisabled || submitting}
        busy={submitting}
        onClick={ctaAction}
      >
        {submitting ? "Submitting…" : ctaLabel}
      </ComposerCta>

      <span className="text-center text-[11.5px] leading-relaxed text-ink-3">
        Displayed values are interface values only and do not constitute a
        guarantee of value, liquidity, or future settlement.
      </span>

      <ReviewSheet
        open={sheetOpen}
        side="sell"
        phase={phase}
        rows={sheetRows}
        sellNote={
          expectImmediate
            ? "Your BNKR moves to escrow when the request is created. At current liquidity this request is expected to settle immediately."
            : "Your BNKR moves to escrow when the request is created. This request may exceed liquid USDC and will queue until liquidity is replenished."
        }
        liveSig={liveSig}
        receipt={receipt}
        failureMessage={failureMessage}
        walletName={wallet?.wallet?.adapter.name}
        onClose={() => {
          setSheetOpen(false);
          setPhase("review");
        }}
        onConfirm={() => void handleRegisterSell()}
        onRetry={() => setPhase("review")}
        onDone={() => {
          setSheetOpen(false);
          setPhase("review");
        }}
      />
    </>
  );
}
