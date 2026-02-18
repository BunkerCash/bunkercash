'use client'

import { Header } from '@/components/Header'
import { AdminWithdraw } from '@/components/AdminWithdraw'
import { AdminDeposit } from '@/components/AdminDeposit'
import { AdminProcessClaims } from '@/components/AdminProcessClaims'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { useWallet } from '@solana/wallet-adapter-react'
import { useState } from 'react'
import { Shield, Loader2, ShieldX } from 'lucide-react'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'withdraw' | 'deposit' | 'claims'>('withdraw')
  const { connected, publicKey } = useWallet()
  const { isAdmin, loading, poolAdmin } = useIsAdmin()

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

    if (!isAdmin) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShieldX className="w-12 h-12 text-red-500/60 mb-4" />
          <h2 className="text-xl font-semibold mb-2 text-red-400">Access Denied</h2>
          <p className="text-neutral-500 text-sm mb-6">
            Only the pool admin can access this page.
          </p>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 text-xs font-mono space-y-2 max-w-md">
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500">Your address:</span>
              <span className="text-neutral-300 break-all">{publicKey?.toBase58()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-neutral-500">Admin address:</span>
              <span className="text-neutral-300 break-all">{poolAdmin?.toBase58() ?? 'Unknown'}</span>
            </div>
          </div>
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
          <div className="mb-8 flex items-center gap-3">
            <div className="bg-[#00FFB2]/10 p-3 rounded-xl border border-[#00FFB2]">
              <Shield className="w-6 h-6 text-[#00FFB2]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Admin Panel</h1>
              <p className="text-neutral-400 text-sm">Fund management operations</p>
            </div>
          </div>

          {gateContent ? (
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden p-8">
              {gateContent}
            </div>
          ) : (
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
          )}
        </div>
      </main>
    </div>
  )
}
