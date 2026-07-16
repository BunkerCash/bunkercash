'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { Idl, Program } from '@coral-xyz/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, SendTransactionError, SystemProgram, Transaction, type TransactionInstruction } from '@solana/web3.js'
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { useSetAtom } from "jotai";
import {
  getBunkercashMintPda,
  getFeeConfigPda,
  getPoolPda,
  getPurchaseLimitConfigPda,
  getSupportedUsdcConfigPda,
  fetchConfiguredUsdcMint,
  fetchMintTokenProgram,
  fetchRawPoolAccountWithRetry,
  getProgram,
  getReadonlyProgram,
  type ProgramWallet,
  PROGRAM_ID,
} from "@/lib/program";
import { countFractionalDigits, parseUiAmountToBaseUnits } from "@/lib/amounts";
import { getClusterFromEndpoint } from "@/lib/constants";
import { BN } from '@coral-xyz/anchor'
import { useToast } from "@/components/ui/ToastContext";
import { useSupportedUsdcMint } from "@/hooks/useSupportedUsdcMint";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { invalidateTransactionCache } from "@/hooks/useMyTransactions";
import { sendAndConfirmWalletTransaction } from "@/lib/sendAndConfirmWalletTransaction";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";
import { connectModalOpenAtom } from "@/lib/ui-atoms";
import {
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
import { WarnIcon } from "@/components/design/icons";

const USDC_DECIMALS = 6
const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS)
const MIN_USDC_AMOUNT_RAW = USDC_SCALE / 100n
const MAX_USDC_AMOUNT_RAW = 1_000_000n * USDC_SCALE

function toUi(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, '0')
  const head = s.slice(0, -decimals)
  const tail = s.slice(-decimals).replace(/0+$/, '')
  return tail.length ? `${head}.${tail}` : head
}

function derivePrice(navRaw: bigint, supplyRaw: bigint): number {
  if (supplyRaw === BigInt(0)) return 1
  return Number(navRaw) / Number(supplyRaw)
}

function formatPercentFromBps(bps: number): string {
  const formatted = (bps / 100).toFixed(2)
  return formatted.replace(/\.?0+$/, "")
}

/** Detect wallet rejection errors */
function isWalletRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e ?? '').toLowerCase()
  return msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')
}

interface Stringable {
  toString(): string;
}

interface PurchaseLimitConfigAccount {
  purchaseLimitUsdc: Stringable;
  totalDepositedUsdc: Stringable;
}

interface FeeConfigAccount {
  purchaseFeeBps: Stringable;
}

type BuyPoolState = {
  masterWallet: PublicKey;
  nav: bigint;
  totalBunkercashSupply: bigint;
  purchaseLimitUsdc: bigint;
  totalDepositedUsdc: bigint;
  purchaseFeeBps: number;
};

// Module-level cache of the last successfully fetched pool state. Survives
// component unmount/remount (tab/page switches) so the price shows instantly
// and we revalidate in the background instead of gating the whole UI behind a
// loading state. Keyed by RPC endpoint so a cluster switch never surfaces
// stale data.
let buyPoolStateCache: { endpoint: string; state: BuyPoolState } | null = null;

interface BuyPrimaryMethods {
  depositUsdc: (amount: BN) => {
    accounts: (accounts: {
      pool: PublicKey;
      userUsdc: PublicKey;
      userBunkercash: PublicKey;
      poolUsdc: PublicKey;
      bunkercashMint: PublicKey;
      supportedUsdcConfig: PublicKey;
      purchaseLimitConfig: PublicKey;
      feeConfig: PublicKey;
      usdcMint: PublicKey;
      user: PublicKey;
      usdcTokenProgram: PublicKey;
      tokenProgram: PublicKey;
      systemProgram: PublicKey;
    }) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
}

export function BuyPrimaryInterface() {
  const { connection } = useConnection()
  const wallet = useOptionalWallet()
  const publicKey = wallet?.publicKey ?? null
  const signTransaction = wallet?.signTransaction
  const signAllTransactions = wallet?.signAllTransactions
  const { showToast } = useToast();
  const openConnect = useSetAtom(connectModalOpenAtom);
  const [usdcAmount, setUsdcAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phase, setPhase] = useState<SheetPhase>("review");
  const [liveSig, setLiveSig] = useState<string | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ k: string; v: string }[]>([]);
  const txInFlight = useRef(false);
  const endpoint = connection.rpcEndpoint ?? "";
  const [poolState, setPoolState] = useState<BuyPoolState | null>(() =>
    buyPoolStateCache?.endpoint === endpoint ? buyPoolStateCache.state : null,
  );
  const [poolError, setPoolError] = useState<string | null>(null);

  const { balance: usdcBalance } = useUsdcBalance();
  const { balance: bnkrBalance } = useTokenBalance();

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
  const bunkercashMintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);
  const purchaseLimitConfigPda = useMemo(
    () => getPurchaseLimitConfigPda(PROGRAM_ID),
    []
  );
  const feeConfigPda = useMemo(() => getFeeConfigPda(PROGRAM_ID), []);
  const supportedUsdcConfigPda = useMemo(
    () => getSupportedUsdcConfigPda(PROGRAM_ID),
    []
  );
  const currentCluster = useMemo(
    () => getClusterFromEndpoint(connection.rpcEndpoint ?? ""),
    [connection],
  );

  const { usdcMint, usdcTokenProgram, error: usdcMintError } = useSupportedUsdcMint();

  const fetchPoolState = useCallback(async () => {
    if (!connection) return;
    try {
      // Pool state is public — read it without a connected wallet too.
      // Raw decode instead of Anchor's typed fetch: the deployed program may
      // predate `settlement_epoch_seq`, and the typed decode throws on the
      // shorter account even though every field we need is present.
      const state = await fetchRawPoolAccountWithRetry(connection);
      if (!state) {
        setPoolError("not_initialized");
        setPoolState(null);
        return;
      }
      const readProgram = program ?? getReadonlyProgram(connection);
      const accountApi = (readProgram as Program<Idl>).account as {
        purchaseLimitConfig?: {
          fetch: (key: PublicKey) => Promise<PurchaseLimitConfigAccount>;
        };
        feeConfig?: {
          fetch: (key: PublicKey) => Promise<FeeConfigAccount>;
        };
      }
      let purchaseLimitUsdc = BigInt(0);
      let totalDepositedUsdc = BigInt(0);
      let purchaseFeeBps = 0;

      if (accountApi.purchaseLimitConfig) {
        try {
          const purchaseLimitConfig = await accountApi.purchaseLimitConfig.fetch(
            purchaseLimitConfigPda
          );
          purchaseLimitUsdc = BigInt(purchaseLimitConfig.purchaseLimitUsdc.toString());
          totalDepositedUsdc = BigInt(purchaseLimitConfig.totalDepositedUsdc.toString());
        } catch {
          purchaseLimitUsdc = BigInt(0);
          totalDepositedUsdc = BigInt(0);
        }
      }

      if (accountApi.feeConfig) {
        try {
          const feeConfig = await accountApi.feeConfig.fetch(feeConfigPda);
          purchaseFeeBps = Number(feeConfig.purchaseFeeBps.toString());
        } catch {
          purchaseFeeBps = 0;
        }
      }

      const nav = state.nav
      const totalPendingClaims = state.totalPendingClaims
      const availableNav = nav > totalPendingClaims ? nav - totalPendingClaims : 0n

      const nextState: BuyPoolState = {
        masterWallet: state.masterWallet,
        nav: availableNav,
        totalBunkercashSupply: state.totalBunkercashSupply,
        purchaseLimitUsdc,
        totalDepositedUsdc,
        purchaseFeeBps,
      };
      buyPoolStateCache = { endpoint, state: nextState };
      setPoolState(nextState);
      setPoolError(null);
    } catch {
      setPoolError("rpc_error");
      setPoolState(null);
    }
  }, [program, poolPda, connection, purchaseLimitConfigPda, feeConfigPda, endpoint]);

  useEffect(() => {
    void fetchPoolState();
  }, [fetchPoolState]);

  const pricePerToken = poolState
    ? derivePrice(poolState.nav, poolState.totalBunkercashSupply)
    : null;
  const supportsUsdcDeposits =
    !!usdcTokenProgram &&
    (usdcTokenProgram.equals(TOKEN_PROGRAM_ID) ||
      usdcTokenProgram.equals(TOKEN_2022_PROGRAM_ID))

  const usdcAmountRaw = useMemo(() => {
    return parseUiAmountToBaseUnits(usdcAmount, USDC_DECIMALS)
  }, [usdcAmount]);

  const usdcBalanceRaw = useMemo(() => {
    if (!usdcBalance) return null
    return parseUiAmountToBaseUnits(usdcBalance, USDC_DECIMALS)
  }, [usdcBalance])

  const tokenAmountRaw = useMemo(() => {
    if (!poolState || !usdcAmountRaw) return null;
    const purchaseFeeRaw = (usdcAmountRaw * BigInt(poolState.purchaseFeeBps)) / 10_000n;
    const netInvestmentRaw = usdcAmountRaw - purchaseFeeRaw;
    if (netInvestmentRaw <= 0n) return null;
    if (poolState.totalBunkercashSupply === BigInt(0) || poolState.nav === BigInt(0)) {
      return netInvestmentRaw;
    }
    return (netInvestmentRaw * poolState.totalBunkercashSupply) / poolState.nav;
  }, [poolState, usdcAmountRaw]);

  const purchaseFeeRaw = useMemo(() => {
    if (!poolState || !usdcAmountRaw) return null;
    return (usdcAmountRaw * BigInt(poolState.purchaseFeeBps)) / 10_000n;
  }, [poolState, usdcAmountRaw]);

  const tokenAmountUi =
    tokenAmountRaw != null ? toUi(tokenAmountRaw, USDC_DECIMALS) : "";

  const remainingPurchaseCapacityRaw = useMemo(() => {
    if (!poolState) return null;
    if (poolState.purchaseLimitUsdc === BigInt(0)) return null;
    return poolState.purchaseLimitUsdc > poolState.totalDepositedUsdc
      ? poolState.purchaseLimitUsdc - poolState.totalDepositedUsdc
      : BigInt(0);
  }, [poolState]);

  // Input validation
  const inputError = useMemo(() => {
    if (!usdcAmount) return null;
    if (countFractionalDigits(usdcAmount) > USDC_DECIMALS) return "Max 6 decimal places";
    if (usdcAmountRaw == null) return "Enter a valid number";
    if (usdcAmountRaw < MIN_USDC_AMOUNT_RAW) return "Minimum amount is 0.01 USDC";
    if (usdcAmountRaw > MAX_USDC_AMOUNT_RAW) return "Maximum per transaction is 1M USDC";
    if (
      remainingPurchaseCapacityRaw != null &&
      usdcAmountRaw > remainingPurchaseCapacityRaw
    ) {
      return remainingPurchaseCapacityRaw === BigInt(0)
        ? "Global purchase cap reached"
        : `Only ${toUi(remainingPurchaseCapacityRaw, USDC_DECIMALS)} USDC of purchase capacity remains`;
    }
    if (publicKey && usdcBalanceRaw != null && usdcAmountRaw > usdcBalanceRaw) {
      return `Amount exceeds your USDC balance of ${usdcBalance ?? "0"}.`;
    }
    if (tokenAmountRaw != null && tokenAmountRaw <= 0n) {
      return "Amount is too small after fees and current pricing";
    }
    return null;
  }, [usdcAmount, usdcAmountRaw, usdcBalanceRaw, usdcBalance, remainingPurchaseCapacityRaw, tokenAmountRaw, publicKey]);

  const handleBuy = async () => {
    if (!usdcMint) {
      const msg = `Unsupported network: no configured USDC mint for ${currentCluster}.`;
      setFailureMessage(msg);
      setPhase("failed");
      showToast(msg, "error");
      return;
    }
    if (usdcMintError) {
      setFailureMessage(usdcMintError);
      setPhase("failed");
      showToast(usdcMintError, "error");
      return;
    }
    if (
      !wallet ||
      !program ||
      !publicKey ||
      !poolState ||
      !usdcAmountRaw ||
      usdcAmountRaw <= BigInt(0) ||
      !usdcTokenProgram
    ) {
      return;
    }

    // Prevent duplicate submissions
    if (txInFlight.current) return;
    txInFlight.current = true;

    // Check insufficient balance before sending
    if (usdcBalanceRaw != null && usdcAmountRaw > usdcBalanceRaw) {
      setPhase("review");
      showToast("Insufficient USDC balance", "error");
      txInFlight.current = false;
      return;
    }

    const paidUi = toUi(usdcAmountRaw, USDC_DECIMALS);
    const receivedUi = tokenAmountUi;
    setFailureMessage(null);
    setLiveSig(null);
    setLoading(true);
    setPhase("signing");
    try {
      // Resolve the configured settlement mint fresh at submit time so we do not
      // build the transaction with stale client state after an admin-side mint change.
      const configuredUsdcMint =
        (await fetchConfiguredUsdcMint(connection)) ?? usdcMint;
      const configuredUsdcTokenProgram = await fetchMintTokenProgram(
        connection,
        configuredUsdcMint,
      );

      if (
        !configuredUsdcTokenProgram ||
        (!configuredUsdcTokenProgram.equals(TOKEN_PROGRAM_ID) &&
          !configuredUsdcTokenProgram.equals(TOKEN_2022_PROGRAM_ID))
      ) {
        const msg =
          `Configured USDC mint ${configuredUsdcMint.toBase58()} is missing or owned by an unexpected token program on ${currentCluster}.`;
        setFailureMessage(msg);
        setPhase("failed");
        showToast(msg, "error");
        return;
      }

      const userUsdc = getAssociatedTokenAddressSync(
        configuredUsdcMint,
        publicKey,
        false,
        configuredUsdcTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const poolUsdcVault = getAssociatedTokenAddressSync(
        configuredUsdcMint,
        poolPda,
        true,
        configuredUsdcTokenProgram,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const bunkercashMintInfo = await connection.getAccountInfo(bunkercashMintPda);
      if (!bunkercashMintInfo) {
        const msg =
          "The BunkerCash mint PDA is not initialized for this program yet.";
        setFailureMessage(msg);
        setPhase("failed");
        showToast(msg, "error");
        return;
      }
      const userBunkercash = getAssociatedTokenAddressSync(
        bunkercashMintPda,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      const createUserUsdcAtaIx =
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          userUsdc,
          publicKey,
          configuredUsdcMint,
          configuredUsdcTokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
      const createUserBunkercashAtaIx =
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          userBunkercash,
          publicKey,
          bunkercashMintPda,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );
      const createPoolUsdcVaultIx =
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          poolUsdcVault,
          poolPda,
          configuredUsdcMint,
          configuredUsdcTokenProgram,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

      const methodsApi = (program as Program<Idl>).methods as unknown as BuyPrimaryMethods
      const depositUsdcIx = await methodsApi
        .depositUsdc(new BN(usdcAmountRaw.toString()))
        .accounts({
          pool: poolPda,
          userUsdc,
          userBunkercash: userBunkercash,
          poolUsdc: poolUsdcVault,
          bunkercashMint: bunkercashMintPda,
          supportedUsdcConfig: supportedUsdcConfigPda,
          purchaseLimitConfig: purchaseLimitConfigPda,
          feeConfig: feeConfigPda,
          usdcMint: configuredUsdcMint,
          user: publicKey,
          usdcTokenProgram: configuredUsdcTokenProgram,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      const tx = new Transaction().add(
        createUserUsdcAtaIx,
        createUserBunkercashAtaIx,
        createPoolUsdcVaultIx,
        depositUsdcIx,
      );
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
        { k: "Paid", v: `${paidUi} USDC` },
        { k: "Received (est.)", v: `${receivedUi} BNKR` },
        { k: "Signature", v: `${sig.slice(0, 5)}…${sig.slice(-4)}` },
      ]);
      setLiveSig(sig);
      setPhase("success");
      setUsdcAmount("");
      void fetchPoolState();
      invalidateTransactionCache();
      showToast(`Purchase confirmed. Tx: ${sig.slice(0, 8)}…`, "success");
    } catch (e: unknown) {
      if (isWalletRejection(e)) {
        setPhase("review");
        showToast("Transaction rejected by wallet", "warning");
      } else if (e instanceof SendTransactionError) {
        const logs = await e.getLogs(connection);
        if (logs?.length) {
          console.error('Deposit transaction logs:', logs);
        }
        const msg = e.message || "Transaction failed";
        setFailureMessage(msg);
        setPhase("failed");
        showToast(msg, "error");
      } else {
        const msg = e instanceof Error ? e.message : "Transaction failed";
        setFailureMessage(msg);
        setPhase("failed");
        showToast(msg, "error");
      }
    } finally {
      setLoading(false);
      txInFlight.current = false;
    }
  };

  // ---- CTA state ----
  const ctaKind: CtaKind = "primary";
  let ctaLabel = "Review purchase";
  let ctaDisabled = false;
  let ctaAction: (() => void) | undefined;
  if (!publicKey) {
    ctaLabel = "Connect wallet";
    ctaAction = () => openConnect(true);
  } else if (poolError) {
    ctaLabel = "Pool unavailable";
    ctaDisabled = true;
  } else if (!poolState) {
    ctaLabel = "Loading pool data…";
    ctaDisabled = true;
  } else if (!usdcMint || !supportsUsdcDeposits) {
    ctaLabel = "Unsupported network";
    ctaDisabled = true;
  } else if (!usdcAmountRaw || usdcAmountRaw <= BigInt(0)) {
    ctaLabel = "Enter an amount";
    ctaDisabled = true;
  } else if (inputError) {
    ctaLabel = inputError.startsWith("Amount exceeds")
      ? "Insufficient USDC"
      : "Review purchase";
    ctaDisabled = true;
  } else {
    ctaAction = () => {
      setPhase("review");
      setSheetOpen(true);
    };
  }

  const rateFmt = pricePerToken != null ? pricePerToken.toFixed(4) : "—";
  const feePct =
    poolState != null ? formatPercentFromBps(poolState.purchaseFeeBps) : null;
  const capacityRemainingLabel =
    poolState == null
      ? "—"
      : remainingPurchaseCapacityRaw != null
        ? `${toUi(remainingPurchaseCapacityRaw, USDC_DECIMALS)} USDC`
        : "Unlimited";

  const sheetRows: SheetRow[] = [
    { k: "You pay", v: `${usdcAmount || "0"} USDC`, strong: true },
    { k: "Reference rate", v: `1 BNKR = ${rateFmt} USDC` },
    {
      k: "Protocol fee",
      v:
        feePct == null
          ? "—"
          : purchaseFeeRaw != null && purchaseFeeRaw > 0n
            ? `${feePct}% (${toUi(purchaseFeeRaw, USDC_DECIMALS)} USDC)`
            : `${feePct}%`,
    },
    {
      k: "Capacity remaining",
      v: capacityRemainingLabel,
    },
    {
      k: "You receive (est.)",
      v: `${tokenAmountUi || "0"} BNKR`,
      strong: true,
      tone: "mint",
      highlight: true,
    },
  ];

  return (
    <>
      <span className="text-[12.5px] leading-relaxed text-ink-3">
        USDC converts at the live reference rate. BNKR is minted directly to
        your wallet — keep a small amount of SOL to cover network fees.
      </span>

      <AmountInputCard
        label="You pay"
        token="USDC"
        value={usdcAmount}
        onChange={setUsdcAmount}
        balance={publicKey && usdcBalance != null ? usdcBalance : "—"}
        onMax={
          publicKey && usdcBalance != null
            ? () => setUsdcAmount(usdcBalance)
            : undefined
        }
        error={inputError}
      />

      <AmountOutputCard
        label="You receive (estimated)"
        token="BNKR"
        value={tokenAmountUi}
        balance={publicKey && bnkrBalance != null ? bnkrBalance : "—"}
      />

      <div className="flex flex-col gap-2 px-1 py-0.5">
        <DetailRow label="Reference rate">1 BNKR = {rateFmt} USDC</DetailRow>
        <DetailRow label="Protocol fee">
          {feePct != null ? `${feePct}%` : "—"}
        </DetailRow>
        <DetailRow label="Capacity remaining">{capacityRemainingLabel}</DetailRow>
        <DetailRow label="Delivery" mono={false}>
          Minted directly to your wallet
        </DetailRow>
      </div>

      {poolError === "not_initialized" && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-warn">
            <WarnIcon />
            Pool not initialized on this cluster
          </span>
          <span className="break-all font-mono text-[11.5px] text-ink-3">
            Program {PROGRAM_ID.toBase58()} · Pool {poolPda.toBase58()}
          </span>
          <button
            type="button"
            onClick={() => void fetchPoolState()}
            className="self-start rounded-lg border border-line-2 bg-surface-2 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-mint-line"
          >
            Retry
          </button>
        </div>
      )}
      {poolError === "rpc_error" && (
        <div className="flex flex-col gap-2 rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-warn">
            <WarnIcon />
            Unable to reach Solana network
          </span>
          <span className="text-[12px] text-ink-3">
            The RPC endpoint is not responding. Your funds are unaffected.
          </span>
          <button
            type="button"
            onClick={() => void fetchPoolState()}
            className="self-start rounded-lg border border-line-2 bg-surface-2 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-mint-line"
          >
            Retry connection
          </button>
        </div>
      )}
      {usdcMintError && (
        <div className="rounded-[10px] border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger">
          Failed to load configured USDC mint details: {usdcMintError}
        </div>
      )}
      {!usdcMintError && usdcMint && !supportsUsdcDeposits && (
        <div className="rounded-[10px] border border-warn-line bg-warn-soft px-4 py-3 text-[13px] text-warn">
          The configured USDC mint is unsupported for this deployment. Ask the
          team to verify the selected mint.
        </div>
      )}

      <ComposerCta
        kind={ctaKind}
        disabled={ctaDisabled || loading}
        busy={loading}
        onClick={ctaAction}
      >
        {loading ? "Processing…" : ctaLabel}
      </ComposerCta>

      <span className="text-center text-[11.5px] leading-relaxed text-ink-3">
        Displayed values are interface values only and do not constitute a
        guarantee of value, liquidity, or future settlement.
      </span>

      <ReviewSheet
        open={sheetOpen}
        side="buy"
        phase={phase}
        rows={sheetRows}
        liveSig={liveSig}
        receipt={receipt}
        failureMessage={failureMessage}
        walletName={wallet?.wallet?.adapter.name}
        onClose={() => {
          setSheetOpen(false);
          setPhase("review");
        }}
        onConfirm={() => void handleBuy()}
        onRetry={() => setPhase("review")}
        onDone={() => {
          setSheetOpen(false);
          setPhase("review");
        }}
      />
    </>
  );
}
