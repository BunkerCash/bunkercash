'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

interface FundCardProps {
  name: string
  apy?: number
  targetApy?: number
  description: string
  issuedAmount?: string
  comingSoon?: boolean
  comingSoonText?: string
  href?: string
}

export function FundCard({
  name,
  apy,
  targetApy,
  description,
  issuedAmount,
  comingSoon,
  comingSoonText = 'COMING SOON',
  href
}: FundCardProps) {
  const CardWrapper = href && !comingSoon ? Link : 'div'
  const cardProps = href && !comingSoon ? { href } : {}

  return (
    <CardWrapper
      {...cardProps}
      className={cn(
        'relative h-[600px] bg-gradient-to-br from-neutral-900 to-neutral-950 border border-neutral-800 rounded-3xl p-12 flex flex-col justify-between overflow-hidden transition-all duration-300',
        !comingSoon && 'hover:border-[#00FFB2] hover:shadow-2xl hover:shadow-[#00FFB2]/10 cursor-pointer',
        comingSoon && 'opacity-50'
      )}
    >
      {comingSoon && (
        <div className="absolute top-6 right-6 bg-[#00FFB2]/10 text-[#00FFB2]/70 text-xs font-semibold px-3 py-1.5 rounded-md">
          {comingSoonText}
        </div>
      )}

      <div>
        <h3 className="text-6xl font-bold mb-4">{name}</h3>
        <div className="flex flex-col gap-2 mb-6">
          {apy && (
            <div className="inline-flex items-center bg-[#00FFB2]/10 text-[#00FFB2]/70 px-3 py-1.5 rounded-md text-xs font-semibold w-fit">
              {apy}% APY
            </div>
          )}
          {targetApy && (
            <div className="inline-flex items-center bg-[#00FFB2]/10 text-[#00FFB2]/70 px-3 py-1.5 rounded-md text-xs font-semibold w-fit">
              Target: {targetApy}% APY
            </div>
          )}
          {issuedAmount && (
            <div className="text-neutral-500 text-sm">
              Issued: {issuedAmount}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-neutral-400 text-lg leading-relaxed">
          {description}
        </p>
      </div>
    </CardWrapper>
  )
}
