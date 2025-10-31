'use client'

import { useState } from 'react'
import { useAtom } from 'jotai'
import { withdrawalsAtom, type Withdrawal } from '@/lib/atoms'
import { CalendarIcon } from '@heroicons/react/24/outline'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function WithdrawInterface() {
  const [withdrawals, setWithdrawals] = useAtom(withdrawalsAtom)
  const [amount, setAmount] = useState('')
  const [activeView, setActiveView] = useState<'schedule' | 'history'>('schedule')
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const handleScheduleWithdrawal = () => {
    const numAmount = parseFloat(amount)
    if (!isNaN(numAmount) && numAmount > 0) {
      const newWithdrawal: Withdrawal = {
        id: Math.random().toString(36).substr(2, 9),
        amount: numAmount,
        requestedAt: new Date(),
        maturityDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'pending',
      }
      setWithdrawals([...withdrawals, newWithdrawal])
      setAmount('')
    }
  }

  const handleClaim = (withdrawalId: string) => {
    setClaimingId(withdrawalId)
    setTimeout(() => {
      setWithdrawals(withdrawals.filter((w) => w.id !== withdrawalId))
      setClaimingId(null)
    }, 1000)
  }

  return (
    <div className="space-y-8">
      <div className="flex gap-2 bg-neutral-900 p-1 rounded-xl">
        <button
          onClick={() => setActiveView('schedule')}
          className={`flex-1 px-4 py-3 text-sm rounded-lg transition-all ${
            activeView === 'schedule'
              ? 'bg-[#00FFB2] text-black font-semibold'
              : 'text-neutral-500 hover:text-white'
          }`}
        >
          Schedule Withdrawal
        </button>
        <button
          onClick={() => setActiveView('history')}
          className={`flex-1 px-4 py-3 text-sm rounded-lg transition-all ${
            activeView === 'history'
              ? 'bg-[#00FFB2] text-black font-semibold'
              : 'text-neutral-500 hover:text-white'
          }`}
        >
          History
        </button>
      </div>

      {activeView === 'schedule' ? (
        <div className="space-y-6">
          <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-neutral-400">
                <CalendarIcon className="w-4 h-4" />
                <span>Monthly Redemption Window</span>
              </div>
              <div className="text-[#00FFB2] text-sm font-semibold">
                Next: Nov 1, 2025
              </div>
            </div>
            <p className="text-xs text-neutral-600">
              Withdrawals are processed during the monthly redemption window, subject to available reserves
            </p>
          </div>

          <div className="bg-neutral-900 rounded-2xl p-6 border border-neutral-800">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs uppercase tracking-wider text-neutral-500">Amount</span>
              <span className="text-xs text-neutral-600">Balance: 0 bRENT</span>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="bg-transparent text-3xl font-bold flex-1 outline-none placeholder:text-neutral-800"
              />
              <div className="flex items-center gap-2 bg-[#00FFB2]/10 border-2 border-[#00FFB2] px-5 py-3 rounded-xl">
                <span className="font-semibold text-sm text-[#00FFB2]">bRENT</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleScheduleWithdrawal}
            disabled={!amount || parseFloat(amount) <= 0}
            className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-5 rounded-xl transition-all text-lg"
          >
            Schedule Withdrawal
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {withdrawals.length === 0 ? (
            <div className="text-center py-12 text-neutral-600">
              No withdrawal history
            </div>
          ) : (
            withdrawals.map((withdrawal) => (
              <div
                key={withdrawal.id}
                className="bg-neutral-900 rounded-xl p-5 border border-neutral-800"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-lg font-semibold">
                      {withdrawal.amount} bRENT
                    </div>
                    <div className="text-sm text-neutral-500">
                      Requested {withdrawal.requestedAt.toLocaleDateString()}
                    </div>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      withdrawal.status === 'completed'
                        ? 'bg-[#00FFB2]/20 text-[#00FFB2]'
                        : withdrawal.status === 'partial'
                        ? 'bg-yellow-500/20 text-yellow-500'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {withdrawal.status}
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Maturity</span>
                  <span>{withdrawal.maturityDate.toLocaleDateString()}</span>
                </div>
                {withdrawal.filledAmount && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-neutral-500">Filled</span>
                    <span className="text-[#00FFB2]">
                      {withdrawal.filledAmount} USDC
                    </span>
                  </div>
                )}
                {(withdrawal.status === 'completed' || withdrawal.status === 'partial') && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <button className="w-full mt-4 bg-[#00FFB2] hover:bg-[#00FFB2]/90 text-black font-semibold py-2.5 rounded-lg transition-all text-sm">
                        {withdrawal.status === 'partial' ? 'Claim Available' : 'Claim'}
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Claim Withdrawal</DialogTitle>
                        <DialogDescription>
                          {withdrawal.status === 'partial'
                            ? 'Your withdrawal was partially filled. Claim the available amount now.'
                            : 'Your withdrawal is ready to claim.'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm text-neutral-400">Requested</span>
                            <span className="text-sm font-semibold">{withdrawal.amount} bRENT</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-neutral-400">You will receive</span>
                            <span className="text-lg font-bold text-[#00FFB2]">
                              {withdrawal.filledAmount} USDC
                            </span>
                          </div>
                          {withdrawal.status === 'partial' && (
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-neutral-800">
                              <span className="text-xs text-neutral-500">Remaining in queue</span>
                              <span className="text-xs text-yellow-500">
                                {withdrawal.amount - (withdrawal.filledAmount || 0)} bRENT
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleClaim(withdrawal.id)}
                        disabled={claimingId === withdrawal.id}
                        className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-3 rounded-xl transition-all"
                      >
                        {claimingId === withdrawal.id ? 'Claiming...' : 'Claim to Wallet'}
                      </button>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
