"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import {
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Loader2,
  Settings,
  DollarSign,
} from "lucide-react";
import { usePayoutVault } from "@/hooks/usePayoutVault";
import {
  getProgram,
  getReadonlyProgram,
  getPoolPda,
  getPoolSignerPda,
  getBunkercashMintPda,
  PROGRAM_ID,
} from "@/lib/program";
import { getClusterFromEndpoint, getUsdcMintForCluster } from "@/lib/constants";

const USDC_DECIMALS = 6;
const BNKR_DECIMALS = 9;
const MAX_DEPOSIT_USDC = 1_000_000; // hardcoded in contract

interface PoolInfo {
  totalSupply: number;
  pricePerToken: number;
  admin: string;
}

const CACHE_TTL = 30_000 // 30 seconds
let poolInfoCache: { data: PoolInfo; timestamp: number } | null = null

export function PurchaseLimitsCard() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { balance: vaultBalance, loading: vaultLoading, error: vaultError, refresh: refreshVault } =
    usePayoutVault();

  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(poolInfoCache?.data ?? null);
  const [poolLoading, setPoolLoading] = useState(!poolInfoCache);
  const [poolError, setPoolError] = useState<string | null>(null);

  // Add liquidity state
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositSuccess, setDepositSuccess] = useState<string | null>(null);

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), []);
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda]);
  const mintPda = useMemo(() => getBunkercashMintPda(PROGRAM_ID), []);

  const program = useMemo(() => {
    if (wallet.publicKey) return getProgram(connection, wallet);
    return getReadonlyProgram(connection);
  }, [connection, wallet.publicKey]);

  const usdcMint = useMemo(() => {
    if (!connection) return null;
    const endpoint = (connection as any).rpcEndpoint ?? "";
    const cluster = getClusterFromEndpoint(endpoint);
    return getUsdcMintForCluster(cluster);
  }, [connection]);

  const fetchPoolInfo = useCallback(async (bypassCache = false) => {
    if (!program || !connection) return;

    if (!bypassCache && poolInfoCache && Date.now() - poolInfoCache.timestamp < CACHE_TTL) {
      setPoolInfo(poolInfoCache.data);
      setPoolLoading(false);
      return;
    }

    setPoolLoading(true);
    setPoolError(null);
    try {
      const [poolAccount, mintInfo] = await Promise.all([
        (program.account as any).poolState.fetch(poolPda),
        connection.getTokenSupply(mintPda, "confirmed"),
      ]);
      const price = Number(poolAccount.priceUsdcPerToken.toString()) / 10 ** USDC_DECIMALS;
      const supply = Number(mintInfo.value.amount) / 10 ** BNKR_DECIMALS;
      const info: PoolInfo = {
        totalSupply: supply,
        pricePerToken: price,
        admin: poolAccount.admin.toBase58(),
      };
      poolInfoCache = { data: info, timestamp: Date.now() };
      setPoolInfo(info);
    } catch (e: any) {
      setPoolError(e.message || "Failed to fetch pool info");
    } finally {
      setPoolLoading(false);
    }
  }, [program, connection, poolPda, mintPda]);

  useEffect(() => {
    fetchPoolInfo();
  }, [fetchPoolInfo]);

  const handleAddLiquidity = async () => {
    if (!program || !wallet.publicKey || !usdcMint) return;
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) return;

    setDepositing(true);
    setDepositError(null);
    setDepositSuccess(null);

    try {
      const usdcAmountBase = BigInt(Math.round(amount * 10 ** USDC_DECIMALS));

      const adminUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const payoutUsdcVault = getAssociatedTokenAddressSync(
        usdcMint,
        poolSignerPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Idempotently create vault ATA if needed
      const createVaultIx = createAssociatedTokenAccountIdempotentInstruction(
        wallet.publicKey,
        payoutUsdcVault,
        poolSignerPda,
        usdcMint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const addLiquidityIx = await (program.methods as any)
        .addLiquidity(new BN(usdcAmountBase.toString()))
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

      const tx = new Transaction();
      tx.add(createVaultIx);
      tx.add(addLiquidityIx);

      const sig = await (
        program.provider as { sendAndConfirm: (tx: Transaction) => Promise<string> }
      ).sendAndConfirm(tx);

      setDepositSuccess(`Deposited $${amount.toLocaleString()} USDC`);
      setDepositAmount("");
      refreshVault();
      fetchPoolInfo(true);
    } catch (e: any) {
      console.error("Error adding liquidity:", e);
      setDepositError(e.message || "Failed to add liquidity");
    } finally {
      setDepositing(false);
    }
  };

  const totalVolume = poolInfo
    ? Math.round(poolInfo.totalSupply * poolInfo.pricePerToken)
    : 0;
  const utilizationPercent = Math.min(
    Math.round((totalVolume / MAX_DEPOSIT_USDC) * 100),
    100
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Purchase Limits</h1>
        <button
          onClick={() => { fetchPoolInfo(true); refreshVault(); }}
          className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800/40 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Wallet warning */}
      {!wallet.publicKey && (
        <div className="flex items-center gap-3 px-4 py-3 mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-400">
            Connect admin wallet to add liquidity
          </p>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Current Volume Card */}
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Total Volume Bought
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 text-xs font-medium">
              Live
            </span>
          </div>

          {poolLoading ? (
            <div className="h-8 w-32 bg-neutral-800/60 rounded animate-pulse mb-4" />
          ) : poolError ? (
            <p className="text-sm text-red-400 mb-4">{poolError}</p>
          ) : (
            <>
              <div className="text-3xl font-bold text-white mb-1 font-mono tracking-tight">
                ${totalVolume.toLocaleString("en-US")}
              </div>
              <div className="text-xs text-neutral-500 mb-4">
                {poolInfo?.totalSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })} BNKR @ ${poolInfo?.pricePerToken.toFixed(2)} USDC
              </div>
            </>
          )}

          {poolLoading ? (
            <div className="flex items-center justify-between mb-2.5">
              <div className="h-3 w-16 bg-neutral-800/60 rounded animate-pulse" />
              <div className="h-3 w-24 bg-neutral-800/60 rounded animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-neutral-500 mb-2.5">
              <span>{utilizationPercent}% of max</span>
              <span>${MAX_DEPOSIT_USDC.toLocaleString()} max/tx</span>
            </div>
          )}

          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00FFB2] rounded-full transition-all duration-500"
              style={{ width: `${utilizationPercent}%` }}
            />
          </div>
        </div>

        {/* Treasury Card */}
        <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <DollarSign className="w-4 h-4 text-neutral-500" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Treasury (Payout Vault)
            </span>
          </div>

          {vaultLoading ? (
            <div className="h-8 w-24 bg-neutral-800/60 rounded animate-pulse mb-2" />
          ) : vaultError ? (
            <p className="text-sm text-red-400">{vaultError}</p>
          ) : (
            <>
              <div className="text-3xl font-bold text-[#00FFB2] mb-1 font-mono tracking-tight">
                ${Number(vaultBalance ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-neutral-500">USDC available for claims</div>
            </>
          )}

          {poolInfo && (
            <div className="mt-4 pt-4 border-t border-neutral-800/60">
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Current Price</span>
                <span className="text-white font-mono font-medium">
                  ${poolInfo.pricePerToken.toFixed(6)} USDC/BNKR
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Admin actions */}
      <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Settings className="w-4 h-4 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Add Liquidity
          </span>
        </div>

        <label className="block text-xs text-neutral-400 mb-2">
          Amount (USDC)
        </label>
        <input
          type="number"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          className="w-full h-10 bg-neutral-800/60 border border-neutral-700/60 rounded-lg px-3 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50 focus:border-[#00FFB2]/50 mb-4"
        />

        {depositError && (
          <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{depositError}</p>
          </div>
        )}
        {depositSuccess && (
          <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-xs text-emerald-400">{depositSuccess}</p>
          </div>
        )}

        <button
          onClick={handleAddLiquidity}
          disabled={!wallet.publicKey || !depositAmount || depositing}
          className="w-full h-10 rounded-lg bg-[#00FFB2] text-black text-sm font-medium hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 transition-colors flex items-center justify-center gap-2"
        >
          {depositing && <Loader2 className="w-4 h-4 animate-spin" />}
          {depositing ? "Depositing..." : "Deposit USDC"}
        </button>

        <p className="text-[11px] text-neutral-600 mt-3">
          Funds go directly to the payout vault for claims
        </p>
      </div>
    </div>
  );
}
