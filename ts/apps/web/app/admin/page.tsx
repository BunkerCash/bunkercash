'use client'

import { Header } from '@/components/Header'
import { AdminWithdraw } from '@/components/AdminWithdraw'
import { AdminDeposit } from '@/components/AdminDeposit'
import { AdminProcessClaims } from '@/components/AdminProcessClaims'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useState, useMemo } from 'react'
import { PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js'
import { Shield, Loader2, ShieldX, ExternalLink, UserPlus, CheckCircle2, AlertCircle } from 'lucide-react'
import { getSquadsDashboardUrl, getClusterFromEndpoint, SQUADS_MULTISIG_PUBKEY, SQUADS_VAULT_PUBKEY } from '@/lib/constants'
import { getProgram, getPoolPda, PROGRAM_ID } from '@/lib/program'
import { useSquadsTransaction } from '@/hooks/useSquadsTransaction'

type UpdateAdminMethods = {
  updateAdmin: (newAdmin: PublicKey) => {
    accounts: (a: { pool: PublicKey; admin: PublicKey }) => {
      instruction: () => Promise<TransactionInstruction>
    }
  }
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'withdraw' | 'deposit' | 'claims'>('withdraw')
  const { connection } = useConnection()
  const wallet = useWallet()
  const { connected, publicKey } = wallet
  const { isAdmin, loading, poolAdmin, isGovernedBySquads } = useIsAdmin()
  const [transferAdminLoading, setTransferAdminLoading] = useState(false)
  const [transferAdminError, setTransferAdminError] = useState<string | null>(null)
  const [transferAdminTx, setTransferAdminTx] = useState<string | null>(null)
  useSquadsTransaction()

  const cluster = useMemo(
    () => getClusterFromEndpoint(connection.rpcEndpoint ?? ''),
    [connection],
  )

  const poolPda = useMemo(() => getPoolPda(PROGRAM_ID), [])
  const program = useMemo(
    () => (publicKey ? getProgram(connection, wallet) : null),
    [connection, wallet, publicKey]
  )

  const handleTransferAdminToSquads = async () => {
    if (!program || !publicKey) return
    if (!SQUADS_MULTISIG_PUBKEY) {
      setTransferAdminError('Squads multisig pubkey is not available. Ensure NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY is set in .env.local')
      return
    }
    setTransferAdminLoading(true)
    setTransferAdminError(null)
    setTransferAdminTx(null)
    try {
      const ix = await (program.methods as unknown as UpdateAdminMethods)
        .updateAdmin(SQUADS_MULTISIG_PUBKEY)
        .accounts({ pool: poolPda, admin: publicKey })
        .instruction()
      const tx = new Transaction().add(ix)
      const sig = await (program.provider as { sendAndConfirm: (tx: Transaction) => Promise<string> }).sendAndConfirm(tx)
      setTransferAdminTx(sig)
    } catch (e: unknown) {
      setTransferAdminError(e instanceof Error ? e.message : 'Failed to transfer admin')
    } finally {
      setTransferAdminLoading(false)
    }
  }

  const renderGate = () => {
    if (!connected) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShieldX className="w-12 h-12 text-neutral-600 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
          <p className="text-neutral-500 text-sm">
            Connect your wallet to access the admin panel.
          </p>
        </div>
      )
    }

    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-500">
          <Loader2 className="w-8 h-8 animate-spin mb-4" />
          <p className="text-sm">Verifying admin access...</p>
        </div>
      )
    }

    return null
  }

  const gateContent = renderGate()

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-[#00FFB2]/10 p-3 rounded-xl border border-[#00FFB2]">
                <Shield className="w-6 h-6 text-[#00FFB2]" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Admin Panel</h1>
                <p className="text-neutral-400 text-sm">Fund management operations</p>
              </div>
            </div>
            {isGovernedBySquads && (
              <a
                href={getSquadsDashboardUrl(cluster, SQUADS_MULTISIG_PUBKEY ?? undefined)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                Governed by Squads
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {gateContent ? (
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden p-8">
              {gateContent}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-[#00FFB2]/10 border border-[#00FFB2]/30 rounded-2xl p-4">
                <p className="text-sm font-medium text-[#00FFB2] mb-1">Admin (vault) address</p>
                <p className="text-xs font-mono text-neutral-300 break-all">{poolAdmin?.toBase58() ?? 'Unknown'}</p>
                <p className="text-xs text-neutral-500 mt-2">
                  This is the current on-chain <span className="font-mono">pool.admin</span>.
                </p>
              </div>
              {/* Transfer admin to Squads — only when current admin (e.g. Phantom) and not yet governed */}
              {isAdmin && !isGovernedBySquads && (
                <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-6">
                  <div className="flex items-start gap-3">
                    <UserPlus className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-purple-200 mb-1">Transfer admin to Squads multisig</h3>
                      <p className="text-xs text-neutral-400 mb-4">
                        Hand over pool admin to the Squads multisig PDA. This enables multisig governance for admin actions.
                      </p>
                      </p>
                      {transferAdminTx && (
                        <div className="flex items-center gap-2 text-green-400 text-xs mb-4">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Admin transferred. Tx: {transferAdminTx.slice(0, 8)}…{transferAdminTx.slice(-8)}</span>
                        </div>
                      )}
                      {transferAdminError && (
                        <div className="flex items-center gap-2 text-red-400 text-xs mb-4">
                          <AlertCircle className="w-4 h-4" />
                          <span>{transferAdminError}</span>
                        </div>
                      )}
                      <button
                        onClick={handleTransferAdminToSquads}
                        disabled={transferAdminLoading || !!transferAdminTx}
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-purple-500/20 text-purple-200 border border-purple-500/40 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {transferAdminLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {transferAdminLoading ? 'Transferring…' : transferAdminTx ? 'Transferred' : 'Transfer admin to Squads vault'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="flex border-b border-neutral-800">
                <button
                  onClick={() => setActiveTab('withdraw')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                    activeTab === 'withdraw'
                      ? 'bg-neutral-900 text-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  Withdraw USDC
                </button>
                <button
                  onClick={() => setActiveTab('deposit')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                    activeTab === 'deposit'
                      ? 'bg-neutral-900 text-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  Deposit Funds
                </button>
                <button
                  onClick={() => setActiveTab('claims')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                    activeTab === 'claims'
                      ? 'bg-neutral-900 text-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  Process Claims
                </button>
              </div>

              <div className="p-8">
                {activeTab === 'withdraw' && <AdminWithdraw />}
                {activeTab === 'deposit' && <AdminDeposit />}
                {activeTab === 'claims' && <AdminProcessClaims />}
              </div>
            </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
