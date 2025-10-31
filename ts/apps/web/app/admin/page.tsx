'use client'

import { Header } from '@/components/Header'
import { AdminWithdraw } from '@/components/AdminWithdraw'
import { AdminDeposit } from '@/components/AdminDeposit'
import { useState } from 'react'
import { Shield } from 'lucide-react'

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'withdraw' | 'deposit'>('withdraw')

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
            </div>

            <div className="p-8">
              {activeTab === 'withdraw' ? <AdminWithdraw /> : <AdminDeposit />}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
