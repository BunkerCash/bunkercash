'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { cn } from '@/lib/utils'

export function Header() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const isBrent = pathname === '/brent'

  return (
    <header className="border-b border-neutral-800 bg-black/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-12">
            <Link href="/" className="flex items-center">
              <img src="/logo.svg" alt="BunkerCash" className="h-8" />
            </Link>

            <nav className="hidden md:flex items-center gap-8">
              <Link
                href="/#about"
                className={cn(
                  "transition-colors",
                  isHome ? "text-[#00FFB2]" : "text-neutral-400 hover:text-white"
                )}
              >
                About
              </Link>
              <Link
                href="/brent"
                className={cn(
                  "transition-colors",
                  isBrent ? "text-[#00FFB2]" : "text-neutral-400 hover:text-white"
                )}
              >
                bRENT
              </Link>
            </nav>
          </div>

          <WalletMultiButton className="!bg-[#00FFB2] !text-black hover:!bg-[#00FFB2]/90 !transition-all !rounded-lg !font-semibold !px-6" />
        </div>
      </div>
    </header>
  )
}
