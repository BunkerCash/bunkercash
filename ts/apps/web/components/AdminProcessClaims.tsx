'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import * as multisig from '@sqds/multisig'
import {
  getPoolPda,
  getPoolSignerPda,
  getProgram,
  PROGRAM_ID,
} from '@/lib/program'
import {
  getClusterFromEndpoint,
  getUsdcMintForCluster,
  SQUADS_VAULT_PUBKEY,
  SQUADS_MULTISIG_PUBKEY,
} from '@/lib/constants'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useSquadsTransaction } from '@/hooks/useSquadsTransaction'
import type { SquadsSubmitResult } from '@/hooks/useSquadsTransaction'
import { useAllOpenClaims } from '@/hooks/useAllOpenClaims'
import { usePayoutVault } from '@/hooks/usePayoutVault'
import type { OpenClaim } from '@/hooks/useAllOpenClaims'
import { AlertCircle, CheckCircle2, Loader2, Inbox, History, ExternalLink, Clock } from 'lucide-react'

const USDC_DECIMALS = 6
const TOKEN_DECIMALS = 9

// ── localStorage persistence for Squads proposals ─────────────────────────────
// Scoped to the multisig pubkey so different networks don't collide.
const SQUADS_PROPOSALS_KEY = `bunkercash_squads_proposals_${SQUADS_MULTISIG_PUBKEY?.toBase58() ?? 'default'}`

type StoredProposal = Omit<SquadsSubmitResult, 'txIndex'> & { txIndex: string }

function loadStoredProposals(): Record<string, SquadsSubmitResult> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(SQUADS_PROPOSALS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, StoredProposal>
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [k, { ...v, txIndex: BigInt(v.txIndex) }]),
    )
  } catch {
    return {}
  }
}

function saveStoredProposals(proposals: Record<string, SquadsSubmitResult>): void {
  try {
    const serializable: Record<string, StoredProposal> = Object.fromEntries(
      Object.entries(proposals).map(([k, v]) => [k, { ...v, txIndex: v.txIndex.toString() }]),
    )
    localStorage.setItem(SQUADS_PROPOSALS_KEY, JSON.stringify(serializable))
  } catch {
    // localStorage unavailable (e.g. private browsing quota) — ignore
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function formatUsdc(raw: bigint): string {
  if (raw === BigInt(0)) return '0.00'
  const s = raw.toString().padStart(USDC_DECIMALS + 1, '0')
  const head = s.slice(0, -USDC_DECIMALS)
  const tail = s.slice(-USDC_DECIMALS).slice(0, 2).padEnd(2, '0')
  return `${head}.${tail}`
}

function formatTokenAmount(raw: string, decimals: number): string {
  const s = raw.padStart(decimals + 1, '0')
  const head = s.slice(0, -decimals)
  const tail = s.slice(-decimals).replace(/0+$/, '')
  return tail.length ? `${head}.${tail}` : head
}

function truncateAddress(addr: string): string {
  return addr.slice(0, 4) + '...' + addr.slice(-4)
}

function getExplorerAccountUrl(pubkey: PublicKey, cluster: string): string {
  const base = `https://explorer.solana.com/address/${pubkey.toBase58()}`
  return cluster === 'mainnet-beta' ? base : `${base}?cluster=${cluster}`
}

function getRpcEndpoint(connection: unknown): string {
  return (connection as { rpcEndpoint?: string }).rpcEndpoint ?? ''
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminProcessClaims() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { isGovernedBySquads, isAdmin } = useIsAdmin()
  const { submit: submitSquads, error: squadsError } = useSquadsTransaction()
  const { claims, closedClaims, loading: claimsLoading, error: claimsError, refresh } = useAllOpenClaims()
  const { balance: vaultBalance, loading: vaultLoading, error: vaultError, refresh: refreshVault } = usePayoutVault()

  const [processingClaimId, setProcessingClaimId] = useState<string | null>(null)

  // Persisted across page refreshes via localStorage.
  // Key: claim pubkey (base58) → SquadsSubmitResult
  const [squadsProposals, setSquadsProposals] = useState<Record<string, SquadsSubmitResult>>(loadStoredProposals)

  // On-chain Squads proposal statuses fetched by polling.
  // Key: claim pubkey (base58) → 'Active' | 'Approved' | 'Executed' | 'Rejected' | 'Cancelled' | 'Unknown'
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, string>>({})

  const [error, setError] = useState<string | null>(null)
  const [poolPrice, setPoolPrice] = useState<bigint | null>(null)

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const poolSignerPda = useMemo(() => getPoolSignerPda(poolPda, PROGRAM_ID), [poolPda])

  const program = useMemo(
    () => (wallet.publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet],
  )

  const cluster = useMemo(() => getClusterFromEndpoint(getRpcEndpoint(connection)), [connection])
  const usdcMint = useMemo(() => getUsdcMintForCluster(cluster), [cluster])

  // ── Pool price ────────────────────────────────────────────────────────────

  const fetchPoolPrice = useCallback(async () => {
    if (!program) return
    try {
      const pool = await (program.account as {
        poolState: { fetch: (pk: PublicKey) => Promise<{ priceUsdcPerToken: unknown }> }
      }).poolState.fetch(poolPda)
      setPoolPrice(BigInt(String(pool.priceUsdcPerToken)))
    } catch (e: unknown) {
      console.error('Error fetching pool price:', e)
    }
  }, [program, poolPda])

  useEffect(() => {
    fetchPoolPrice()
  }, [fetchPoolPrice])

  // ── Squads proposal helpers ───────────────────────────────────────────────

  /** Persist a newly created proposal to state and localStorage. */
  const addSquadsProposal = useCallback((claimPubkeyStr: string, result: SquadsSubmitResult) => {
    setSquadsProposals(prev => {
      const next = { ...prev, [claimPubkeyStr]: result }
      saveStoredProposals(next)
      return next
    })
  }, [])

  /**
   * Fetch the on-chain status of every tracked Squads proposal.
   * Triggers a claims refresh when a proposal transitions to Executed/Executing.
   */
  const fetchProposalStatuses = useCallback(async () => {
    const entries = Object.entries(squadsProposals)
    if (entries.length === 0) return

    const statuses: Record<string, string> = {}
    await Promise.all(
      entries.map(async ([claimPubkeyStr, proposal]) => {
        try {
          const proposalPda = new PublicKey(proposal.proposalPda)
          const proposalAccount = await multisig.accounts.Proposal.fromAccountAddress(
            connection,
            proposalPda,
          )
          statuses[claimPubkeyStr] = (proposalAccount.status as { __kind: string }).__kind
        } catch {
          statuses[claimPubkeyStr] = 'Unknown'
        }
      }),
    )

    setProposalStatuses(prev => {
      // When a proposal transitions to Executed, refresh the open claims list
      // so the claim moves from "open" to "closed" on the next render.
      const newlyDone = Object.entries(statuses).some(
        ([k, s]) =>
          (s === 'Executed' || s === 'Executing') &&
          prev[k] !== 'Executed' &&
          prev[k] !== 'Executing',
      )
      if (newlyDone) {
        refresh()
        refreshVault()
      }
      return statuses
    })
  }, [squadsProposals, connection, refresh, refreshVault])

  // Poll every 10 s while there are pending proposals
  useEffect(() => {
    if (Object.keys(squadsProposals).length === 0) return
    void fetchProposalStatuses()
    const interval = setInterval(() => void fetchProposalStatuses(), 10_000)
    return () => clearInterval(interval)
  }, [fetchProposalStatuses, squadsProposals])

  // Auto-remove Rejected / Cancelled proposals so the Propose button reappears
  useEffect(() => {
    const toRemove = Object.entries(proposalStatuses)
      .filter(([, s]) => s === 'Rejected' || s === 'Cancelled')
      .map(([k]) => k)
    if (toRemove.length === 0) return
    setSquadsProposals(prev => {
      const next = { ...prev }
      toRemove.forEach(k => delete next[k])
      saveStoredProposals(next)
      return next
    })
  }, [proposalStatuses])

  // ── Derived data ──────────────────────────────────────────────────────────

  const computeOwed = (tokenAmountLocked: string): bigint => {
    if (!poolPrice) return BigInt(0)
    return (BigInt(tokenAmountLocked) * poolPrice) / BigInt(10 ** TOKEN_DECIMALS)
  }

  /**
   * Hide claims whose Squads proposal is already Executing or Executed.
   * Once the vault transaction is confirmed on-chain, isClosed flips to true
   * and the claim moves to closedClaims on the next refresh() call.
   */
  const openClaims = useMemo(() => {
    return claims.filter(claim => {
      const status = proposalStatuses[claim.pubkey.toBase58()]
      return status !== 'Executed' && status !== 'Executing'
    })
  }, [claims, proposalStatuses])

  // ── Process-claim handler ─────────────────────────────────────────────────

  type ProcessClaimMethods = {
    processClaim: () => {
      accounts: (a: {
        pool: PublicKey
        poolSigner: PublicKey
        admin: PublicKey
        claim: PublicKey
        payoutUsdcVault: PublicKey
        userUsdc: PublicKey
        usdcTokenProgram: PublicKey
      }) => { instruction: () => Promise<import('@solana/web3.js').TransactionInstruction> }
    }
  }

  const handleProcessClaim = async (claim: OpenClaim) => {
    if (!program || !usdcMint) return

    // Guard: only Squads members can propose in a Squads-governed pool
    if (isGovernedBySquads && !isAdmin) {
      setError(
        'Your wallet is not a member of the Squads multisig. ' +
          'Only multisig members can propose transactions.',
      )
      return
    }

    setProcessingClaimId(claim.id)
    setError(null)

    try {
      const payoutUsdcVault = getAssociatedTokenAddressSync(
        usdcMint,
        poolSignerPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      )

      const userUsdcAta = getAssociatedTokenAddressSync(
        usdcMint,
        claim.user,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      )

      if (isGovernedBySquads) {
        if (!SQUADS_VAULT_PUBKEY) {
          throw new Error('Missing NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY (v4 multisig) in web env')
        }
        if (!wallet.publicKey) return

        const ataIx = createAssociatedTokenAccountIdempotentInstruction(
          SQUADS_VAULT_PUBKEY,
          userUsdcAta,
          claim.user,
          usdcMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        )

        const processIx = await (program.methods as unknown as ProcessClaimMethods)
          .processClaim()
          .accounts({
            pool: poolPda,
            poolSigner: poolSignerPda,
            admin: SQUADS_VAULT_PUBKEY,
            claim: claim.pubkey,
            payoutUsdcVault,
            userUsdc: userUsdcAta,
            usdcTokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction()

        const out = await submitSquads(
          [ataIx, processIx],
          `Process claim #${claim.id} for ${truncateAddress(claim.user.toBase58())}`,
        )

        if (out) {
          addSquadsProposal(claim.pubkey.toBase58(), out)
        }
      } else {
        // ── Direct flow (wallet is the pool admin) ─────────────────────────
        if (!wallet.publicKey) return

        const ataIx = createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          userUsdcAta,
          claim.user,
          usdcMint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        )

        const processIx = await (program.methods as unknown as ProcessClaimMethods)
          .processClaim()
          .accounts({
            pool: poolPda,
            poolSigner: poolSignerPda,
            admin: wallet.publicKey,
            claim: claim.pubkey,
            payoutUsdcVault,
            userUsdc: userUsdcAta,
            usdcTokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction()

        const tx = new Transaction().add(ataIx).add(processIx)
        await (
          program.provider as { sendAndConfirm: (tx: Transaction) => Promise<string> }
        ).sendAndConfirm(tx)

        refresh()
        refreshVault()
      }
    } catch (e: unknown) {
      console.error('Error processing claim:', e)
      const msg = e instanceof Error ? e.message : null
      setError(msg ?? squadsError ?? 'Failed to process claim')
    } finally {
      setProcessingClaimId(null)
    }
  }

  const isLoading = claimsLoading || vaultLoading

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Vault Status Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="text-xs text-neutral-500 mb-1">Available USDC</div>
          <div className="text-lg font-semibold text-[#00FFB2]">
            {vaultLoading ? '...' : vaultError ? 'Error' : `$${vaultBalance ?? '0'}`}
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="text-xs text-neutral-500 mb-1">Open Claims</div>
          <div className="text-lg font-semibold">
            {claimsLoading ? '...' : openClaims.length}
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="text-xs text-neutral-500 mb-1">Processed</div>
          <div className="text-lg font-semibold text-neutral-400">
            {claimsLoading ? '...' : closedClaims.length}
          </div>
        </div>
      </div>

      {/* Error message */}
      {(error || claimsError) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-200/80">
              <p className="font-medium text-red-300 mb-1">Error</p>
              <p className="text-xs text-red-200/60 whitespace-pre-wrap">{error || claimsError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Open Claims Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-neutral-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading claims...
        </div>
      ) : (
        <>
          {openClaims.length > 0 ? (
            <div className="border border-neutral-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 bg-neutral-900/50">
                      <th className="px-4 py-3 text-left text-xs text-neutral-500 font-medium">ID</th>
                      <th className="px-4 py-3 text-left text-xs text-neutral-500 font-medium">User</th>
                      <th className="px-4 py-3 text-right text-xs text-neutral-500 font-medium">Locked Tokens</th>
                      <th className="px-4 py-3 text-right text-xs text-neutral-500 font-medium">Owed USDC</th>
                      <th className="px-4 py-3 text-right text-xs text-neutral-500 font-medium">Paid USDC</th>
                      <th className="px-4 py-3 text-right text-xs text-neutral-500 font-medium">Remaining</th>
                      <th className="px-4 py-3 text-center text-xs text-neutral-500 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openClaims.map((claim) => {
                      const owed = computeOwed(claim.tokenAmountLocked)
                      const paid = BigInt(claim.usdcPaid)
                      const remaining = owed > paid ? owed - paid : BigInt(0)
                      const isProcessing = processingClaimId === claim.id
                      const claimKey = claim.pubkey.toBase58()
                      const proposal = squadsProposals[claimKey]
                      const proposalStatus = proposalStatuses[claimKey]

                      return (
                        <tr key={claimKey} className="border-b border-neutral-800/50 hover:bg-neutral-900/30">
                          <td className="px-4 py-3 font-mono text-neutral-300">#{claim.id}</td>
                          <td className="px-4 py-3 font-mono text-neutral-400" title={claim.user.toBase58()}>
                            {truncateAddress(claim.user.toBase58())}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-300">
                            {formatTokenAmount(claim.tokenAmountLocked, TOKEN_DECIMALS)}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-300">
                            ${formatUsdc(owed)}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-400">
                            ${formatUsdc(paid)}
                          </td>
                          <td className="px-4 py-3 text-right text-[#00FFB2] font-medium">
                            ${formatUsdc(remaining)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {proposal ? (
                              // A Squads proposal exists for this claim — show its status
                              <div className="flex flex-col items-center gap-1">
                                <a
                                  href={proposal.squadsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                    proposalStatus === 'Approved'
                                      ? 'bg-green-500/10 text-green-300 border border-green-500/30 hover:bg-green-500/20'
                                      : 'bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20'
                                  }`}
                                >
                                  {proposalStatus === 'Approved' ? 'Execute in Squads' : 'Open Squads'}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {proposalStatus === 'Active'
                                    ? 'Awaiting approval'
                                    : proposalStatus === 'Approved'
                                    ? 'Ready to execute'
                                    : !proposalStatus
                                    ? 'Checking status…'
                                    : `Status: ${proposalStatus}`}
                                </span>
                                <a
                                  href={getExplorerAccountUrl(new PublicKey(proposal.proposalPda), cluster)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] text-neutral-500 hover:text-neutral-300 font-mono"
                                  title="View proposal PDA on Solana Explorer"
                                >
                                  tx #{proposal.txIndex.toString()}
                                </a>
                              </div>
                            ) : (
                              // No proposal yet — show the action button
                              <button
                                onClick={() => handleProcessClaim(claim)}
                                disabled={
                                  isProcessing ||
                                  !wallet.publicKey ||
                                  remaining === BigInt(0) ||
                                  (isGovernedBySquads && !isAdmin)
                                }
                                title={
                                  isGovernedBySquads && !isAdmin
                                    ? 'Your wallet is not a member of the Squads multisig'
                                    : undefined
                                }
                                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black transition-all flex items-center gap-1.5 mx-auto"
                              >
                                {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
                                {isProcessing
                                  ? isGovernedBySquads ? 'Proposing…' : 'Paying…'
                                  : isGovernedBySquads ? 'Propose' : 'Pay'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-neutral-500">
              <Inbox className="w-8 h-8 mb-2 text-neutral-600" />
              <p className="text-sm">No open claims to process</p>
            </div>
          )}

          {/* Claim History */}
          {closedClaims.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-neutral-500" />
                <h3 className="text-sm font-medium text-neutral-400">
                  Claim History
                  <span className="ml-2 text-xs text-neutral-600">({closedClaims.length})</span>
                </h3>
              </div>
              <div className="border border-neutral-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-800 bg-neutral-900/50">
                        <th className="px-4 py-3 text-left text-xs text-neutral-500 font-medium">ID</th>
                        <th className="px-4 py-3 text-left text-xs text-neutral-500 font-medium">User</th>
                        <th className="px-4 py-3 text-right text-xs text-neutral-500 font-medium">Locked Tokens</th>
                        <th className="px-4 py-3 text-right text-xs text-neutral-500 font-medium">USDC Paid</th>
                        <th className="px-4 py-3 text-center text-xs text-neutral-500 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closedClaims.map((claim) => (
                        <tr key={claim.pubkey.toBase58()} className="border-b border-neutral-800/50">
                          <td className="px-4 py-3 font-mono text-neutral-500">#{claim.id}</td>
                          <td className="px-4 py-3 font-mono text-neutral-500" title={claim.user.toBase58()}>
                            {truncateAddress(claim.user.toBase58())}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-500">
                            {formatTokenAmount(claim.tokenAmountLocked, TOKEN_DECIMALS)}
                          </td>
                          <td className="px-4 py-3 text-right text-neutral-400">
                            ${formatUsdc(BigInt(claim.usdcPaid))}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              Paid
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
