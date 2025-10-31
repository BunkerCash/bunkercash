'use client'

import { Header } from '@/components/Header'
import { SwapInterface } from '@/components/SwapInterface'
import { WithdrawInterface } from '@/components/WithdrawInterface'
import { NAVPerformance } from '@/components/NAVPerformance'
import { PoolStats } from '@/components/PoolStats'
import { PoolTransactions } from '@/components/PoolTransactions'
import { useState } from 'react'

export default function BrentPage() {
  const [activeTab, setActiveTab] = useState<'swap' | 'withdraw' | 'performance' | 'transactions'>('swap')

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-6 py-16">
        <div className="max-w-2xl mx-auto mb-12 text-center">
          <div className="mb-2">
            <span className="text-neutral-500 text-lg font-light">BunkerCash Rent</span>
          </div>
          <div className="flex items-center justify-center gap-4 mb-4">
            <h1 className="text-5xl font-bold">bRENT</h1>
            <div className="inline-flex items-center bg-[#00FFB2]/10 text-[#00FFB2]/70 px-3 py-1.5 rounded-md text-sm font-semibold">
              6% APY
            </div>
          </div>
          <p className="text-neutral-500 text-sm mb-2">Issued: $20k</p>
          <p className="text-neutral-400">
            Real estate rented out
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-800">
                <button
                  onClick={() => setActiveTab('swap')}
                  className={`px-4 py-4 text-sm font-medium transition-colors border-r border-b md:border-b-0 border-neutral-800 ${
                    activeTab === 'swap'
                      ? 'bg-neutral-900 text-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  Swap
                </button>
                <button
                  onClick={() => setActiveTab('withdraw')}
                  className={`px-4 py-4 text-sm font-medium transition-colors border-b md:border-b-0 md:border-r border-neutral-800 ${
                    activeTab === 'withdraw'
                      ? 'bg-neutral-900 text-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  Withdraw
                </button>
                <button
                  onClick={() => setActiveTab('performance')}
                  className={`px-4 py-4 text-sm font-medium transition-colors border-r md:border-r border-neutral-800 ${
                    activeTab === 'performance'
                      ? 'bg-neutral-900 text-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  Performance
                </button>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className={`px-4 py-4 text-sm font-medium transition-colors ${
                    activeTab === 'transactions'
                      ? 'bg-neutral-900 text-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white'
                  }`}
                >
                  Transactions
                </button>
              </div>

              <div className="p-8">
                {activeTab === 'swap' && <SwapInterface />}
                {activeTab === 'withdraw' && <WithdrawInterface />}
                {activeTab === 'performance' && <NAVPerformance />}
                {activeTab === 'transactions' && <PoolTransactions />}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <PoolStats />
          </div>
        </div>
      </main>
    </div>
  )
}
