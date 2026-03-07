'use client'

import { Header } from '@/components/Header'
import { AdminWithdraw } from '@/components/AdminWithdraw'
import { AdminDeposit } from '@/components/AdminDeposit'
import { AdminProcessClaims } from '@/components/AdminProcessClaims'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useState, useMemo } from 'react'
import { Shield, Loader2, ShieldX, ExternalLink } from 'lucide-react'
import { getSquadsDashboardUrl, getClusterFromEndpoint, SQUADS_MULTISIG_PUBKEY } from '@/lib/constants'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'withdraw' | 'deposit' | 'claims'>('withdraw')
  const { connection } = useConnection()
  const { connected } = useWallet()
  const { isAdmin, loading, poolAdmin, isGovernedBySquads } = useIsAdmin()
  const cluster = useMemo(
    () => getClusterFromEndpoint(connection.rpcEndpoint ?? ''),
    [connection],
  )

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
