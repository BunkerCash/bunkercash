'use client'

import { useState } from 'react'
import { useAtom } from 'jotai'
import { currentPriceAtom, navAtom } from '@/lib/atoms'
import { ArrowDown } from 'lucide-react'

export function SwapInterface() {
  const [currentPrice] = useAtom(currentPriceAtom)
  const [nav] = useAtom(navAtom)
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')

  const handleFromChange = (value: string) => {
    setFromAmount(value)
    const numValue = parseFloat(value)
    if (!isNaN(numValue)) {
      setToAmount((numValue / currentPrice).toFixed(6))
    } else {
      setToAmount('')
    }
  }

  const handleSwap = () => {
    console.log('Swapping', fromAmount, 'USDC for', toAmount, 'bRENT')
  }

  return (
    <div className="space-y-8">
      <div className="bg-neutral-900/50 rounded-2xl p-6 border border-neutral-800">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Current Price</div>
            <div className="text-2xl font-bold text-[#00FFB2]">${currentPrice.toFixed(4)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">NAV</div>
            <div className="text-2xl font-bold">${nav.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-neutral-900 rounded-2xl p-6 border border-neutral-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs uppercase tracking-wider text-neutral-500">You Pay</span>
            <span className="text-xs text-neutral-600">Balance: 0</span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={fromAmount}
              onChange={(e) => handleFromChange(e.target.value)}
              placeholder="0.00"
              className="bg-transparent text-3xl font-bold flex-1 outline-none placeholder:text-neutral-800"
            />
            <div className="flex items-center gap-2 bg-neutral-800 px-5 py-3 rounded-xl border border-neutral-700">
              <span className="font-semibold text-sm">USDC</span>
            </div>
          </div>
        </div>

        <div className="flex justify-center -my-1 relative z-10">
          <div className="bg-neutral-900 p-3 rounded-xl border-2 border-neutral-800">
            <ArrowDown className="w-5 h-5 text-neutral-500" />
          </div>
        </div>

        <div className="bg-neutral-900 rounded-2xl p-6 border border-neutral-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs uppercase tracking-wider text-neutral-500">You Receive</span>
            <span className="text-xs text-neutral-600">Balance: 0</span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={toAmount}
              readOnly
              placeholder="0.00"
              className="bg-transparent text-3xl font-bold flex-1 outline-none placeholder:text-neutral-800"
            />
            <div className="flex items-center gap-2 bg-[#00FFB2]/10 border-2 border-[#00FFB2] px-5 py-3 rounded-xl">
              <span className="font-semibold text-sm text-[#00FFB2]">bRENT</span>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSwap}
        disabled={!fromAmount || parseFloat(fromAmount) <= 0}
        className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-5 rounded-xl transition-all text-lg"
      >
        Swap
      </button>

      <div className="text-xs text-neutral-600 text-center">
        Minting at NAV price · Primary market
      </div>
    </div>
  )
}
