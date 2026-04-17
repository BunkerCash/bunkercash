'use client'

import { useState } from 'react'
import { BuyPrimaryInterface } from '@/components/BuyPrimaryInterface'
import { WithdrawInterface } from '@/components/WithdrawInterface'
import { PoolTransactions } from '@/components/PoolTransactions'

export type TradeTab = 'buy-primary' | 'withdraw' | 'transactions'

interface TradeInterfaceProps {
  initialTab?: TradeTab
  hiddenTabs?: TradeTab[]
}

export function TradeInterface({ initialTab = 'buy-primary', hiddenTabs = [] }: TradeInterfaceProps) {
  const [activeTab, setActiveTab] = useState<TradeTab>(initialTab)

  const isTabVisible = (tab: TradeTab) => !hiddenTabs.includes(tab)

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap border-b border-neutral-800">
        {isTabVisible('buy-primary') && (
          <button
            onClick={() => setActiveTab('buy-primary')}
            className={`flex-shrink-0 px-5 py-4 text-sm font-medium transition-colors border-b-2 md:border-b-0 md:border-r border-neutral-800 ${
              activeTab === 'buy-primary'
                ? 'bg-neutral-900 text-[#00FFB2] border-[#00FFB2]'
                : 'text-neutral-500 hover:text-white border-transparent'
            }`}
          >
            Buy
          </button>
        )}
        {isTabVisible('withdraw') && (
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
        )}
        {isTabVisible('transactions') && (
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
        )}
      </div>

      <div className="p-8">
        {activeTab === 'buy-primary' && isTabVisible('buy-primary') && (
          <>
            <h3 className="mb-6 text-lg font-semibold text-[#00FFB2]">Buy</h3>
            <BuyPrimaryInterface />
          </>
        )}
        {activeTab === 'withdraw' && isTabVisible('withdraw') && (
          <>
            <h3 className="mb-6 text-lg font-semibold text-[#00FFB2]">Sell</h3>
            <WithdrawInterface />
          </>
        )}
        {activeTab === 'transactions' && isTabVisible('transactions') && <PoolTransactions />}
      </div>
    </div>
  )
}
