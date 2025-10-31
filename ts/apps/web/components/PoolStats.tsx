'use client'

import { useAtom } from 'jotai'
import { navAtom, reserveRatioAtom, apyAtom } from '@/lib/atoms'
import { ArrowTrendingUpIcon, LockClosedIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'

export function PoolStats() {
  const [nav] = useAtom(navAtom)
  const [reserveRatio] = useAtom(reserveRatioAtom)
  const [apy] = useAtom(apyAtom)

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold mb-6">Pool Overview</h3>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-[#00FFB2]/10 p-2 rounded-lg">
            <CurrencyDollarIcon className="w-5 h-5 text-[#00FFB2]" />
          </div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">NAV</div>
        </div>
        <div className="text-2xl sm:text-3xl font-bold break-all">${nav.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="text-xs text-neutral-600 mt-1">Net asset value</div>
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-[#00FFB2]/10 p-2 rounded-lg">
            <ArrowTrendingUpIcon className="w-5 h-5 text-[#00FFB2]" />
          </div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">Current APY</div>
        </div>
        <div className="text-3xl font-bold text-[#00FFB2]">{(apy * 100).toFixed(1)}%</div>
        <div className="text-xs text-neutral-600 mt-1">Annual yield</div>
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-[#00FFB2]/10 p-2 rounded-lg">
            <LockClosedIcon className="w-5 h-5 text-[#00FFB2]" />
          </div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">Reserve Ratio</div>
        </div>
        <div className="text-3xl font-bold">{(reserveRatio * 100).toFixed(0)}%</div>
        <div className="text-xs text-neutral-600 mt-1">Available liquidity</div>
      </div>

      <div className="bg-neutral-900/30 border border-neutral-800 rounded-xl p-4 mt-6">
        <div className="text-xs text-neutral-500 space-y-2">
          <p>
            <span className="text-[#00FFB2]">Primary market:</span> Mint/redeem at NAV price
          </p>
          <p>
            <span className="text-[#00FFB2]">Secondary markets:</span> Trade on DEXes (Raydium, Meteora)
          </p>
          <p className="text-neutral-600">
            Overcollateralized property loans · Monthly redemption windows
          </p>
        </div>
      </div>
    </div>
  )
}
