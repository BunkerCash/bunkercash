'use client'

import { useAtom } from 'jotai'
import { transactionsAtom, type Transaction } from '@/lib/atoms'
import { ArrowDownIcon, ArrowUpIcon, ArrowRightIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function PoolTransactions() {
  const [transactions] = useAtom(transactionsAtom)

  const getTransactionIcon = (type: Transaction['type']) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownIcon className="w-4 h-4" />
      case 'withdrawal':
        return <ArrowUpIcon className="w-4 h-4" />
      case 'investment':
        return <ArrowRightIcon className="w-4 h-4" />
      case 'flowback':
        return <ArrowDownIcon className="w-4 h-4" />
    }
  }

  const getTransactionColor = (type: Transaction['type']) => {
    switch (type) {
      case 'deposit':
        return 'text-[#00FFB2]'
      case 'withdrawal':
        return 'text-red-400'
      case 'investment':
        return 'text-purple-400'
      case 'flowback':
        return 'text-blue-400'
    }
  }

  const getTransactionBgColor = (type: Transaction['type']) => {
    switch (type) {
      case 'deposit':
        return 'bg-[#00FFB2]/10'
      case 'withdrawal':
        return 'bg-red-400/10'
      case 'investment':
        return 'bg-purple-400/10'
      case 'flowback':
        return 'bg-blue-400/10'
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Pool Transactions</h3>
      <div className="space-y-3">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="bg-neutral-900 rounded-xl p-4 border border-neutral-800"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                <div className={`${getTransactionBgColor(tx.type)} ${getTransactionColor(tx.type)} p-2 rounded-lg mt-0.5`}>
                  {getTransactionIcon(tx.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold capitalize">{tx.type}</span>
                    {tx.metadata && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <button className="text-neutral-500 hover:text-[#00FFB2] transition-colors">
                            <DocumentTextIcon className="w-4 h-4" />
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Transaction Metadata</DialogTitle>
                            <DialogDescription>
                              Notarized document details for {tx.project}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                              <div className="grid gap-3">
                                <div>
                                  <div className="text-xs text-neutral-500 mb-1">Document Hash</div>
                                  <div className="font-mono text-xs bg-black/50 p-2 rounded break-all">
                                    {tx.metadata.hash}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-neutral-500 mb-1">Purchase Price</div>
                                  <div className="text-sm font-semibold">{tx.metadata.purchasePrice}</div>
                                </div>
                                <div>
                                  <div className="text-xs text-neutral-500 mb-1">Collateral Ratio</div>
                                  <div className="text-sm font-semibold text-[#00FFB2]">{tx.metadata.collateralRatio}</div>
                                </div>
                                {tx.metadata.propertyAddress && (
                                  <div>
                                    <div className="text-xs text-neutral-500 mb-1">Property Address</div>
                                    <div className="text-sm">{tx.metadata.propertyAddress}</div>
                                  </div>
                                )}
                                <div>
                                  <div className="text-xs text-neutral-500 mb-1">Description</div>
                                  <div className="text-sm text-neutral-300 leading-relaxed">
                                    {tx.metadata.description}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                  <div className="text-sm text-neutral-400">{tx.project}</div>
                  <div className="text-xs text-neutral-600 mt-1">
                    {tx.timestamp.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-semibold ${getTransactionColor(tx.type)}`}>
                  {tx.type === 'withdrawal' ? '-' : '+'} ${tx.amount.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
