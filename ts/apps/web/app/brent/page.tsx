'use client'

import { Header } from '@/components/Header'
import { BuyPrimaryInterface } from '@/components/BuyPrimaryInterface'
import { WithdrawInterface } from '@/components/WithdrawInterface'
import { PoolTransactions } from '@/components/PoolTransactions'
import { useState } from 'react'

export default function BrentPage() {
  const [activeTab, setActiveTab] = useState<'buy-primary' | 'withdraw' | 'transactions'>('buy-primary')

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
              <div className="flex flex-wrap border-b border-neutral-800">
                <button
                  onClick={() => setActiveTab('buy-primary')}
                  className={`flex-shrink-0 px-5 py-4 text-sm font-medium transition-colors border-b-2 md:border-b-0 md:border-r border-neutral-800 ${
                    activeTab === 'buy-primary'
                      ? 'bg-neutral-900 text-[#00FFB2] border-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white border-transparent'
                  }`}
                >
                  Buy Primary
                </button>
                <button
                  onClick={() => setActiveTab('withdraw')}
                  className={`flex-shrink-0 px-5 py-4 text-sm font-medium transition-colors border-b-2 md:border-b-0 md:border-r border-neutral-800 ${
                    activeTab === 'withdraw'
                      ? 'bg-neutral-900 text-[#00FFB2] border-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white border-transparent'
                  }`}
                >
                  Sell
                </button>
                <button
                  onClick={() => setActiveTab('transactions')}
                  className={`flex-shrink-0 px-5 py-4 text-sm font-medium transition-colors border-b-2 md:border-b-0 border-neutral-800 ${
                    activeTab === 'transactions'
                      ? 'bg-neutral-900 text-[#00FFB2] border-[#00FFB2]'
                      : 'text-neutral-500 hover:text-white border-transparent'
                  }`}
                >
                  Transactions
                </button>
              </div>

              <div className="p-8">
                {activeTab === 'buy-primary' && (
                  <>
                    <h3 className="mb-6 text-lg font-semibold text-[#00FFB2]">Buy Bunker Cash (fixed price)</h3>
                    <BuyPrimaryInterface />
                  </>
                )}
                {activeTab === 'withdraw' && (
                  <>
                    <h3 className="mb-6 text-lg font-semibold text-[#00FFB2]">Register sell (escrow lock)</h3>
                    <WithdrawInterface />
                  </>
                )}
                {activeTab === 'transactions' && <PoolTransactions />}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
