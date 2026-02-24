"use client"
import { useCallback, useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { PROGRAM_ID } from '@/lib/program'

export type EventType = "Buy" | "Claim" | "Register Sell" | "Liquidity" | "Update Price"

export interface ProgramEvent {
  id: string
  type: EventType
  time: Date
  wallet: string
  amount: number | null
  currency: "BNKR" | "USDC" | null
  txHash: string
}

// Maps instruction discriminator key (comma-joined bytes) to event metadata
const DISC_MAP: Record<string, { type: EventType; currency: "BNKR" | "USDC" | null; hasAmount: boolean }> = {
  // buy_primary(usdc_amount: u64) — user pays USDC
  "89,86,227,49,41,118,66,248": { type: "Buy", currency: "USDC", hasAmount: true },
  // register_sell(token_amount: u64) — user locks BNKR
  "220,250,100,136,104,188,72,230": { type: "Register Sell", currency: "BNKR", hasAmount: true },
  // process_claim() — admin pays USDC to user (amount resolved from emitted event log)
  "220,115,149,228,217,142,240,115": { type: "Claim", currency: "USDC", hasAmount: false },
  // add_liquidity(usdc_amount: u64) — admin deposits USDC
  "181,157,89,67,143,182,52,72": { type: "Liquidity", currency: "USDC", hasAmount: true },
  // update_price(new_price: u64)
  "61,34,117,155,75,34,123,208": { type: "Update Price", currency: "USDC", hasAmount: true },
}

// Anchor event discriminator for ClaimProcessed: sha256("event:ClaimProcessed")[:8]
// Fields (borsh, after 8-byte disc): admin(32) | claim_id(8) | user(32) | usdc_paid(8) | token_amount_locked(8)
const CLAIM_PROCESSED_DISC = [214, 130, 82, 189, 1, 255, 166, 249]
const CLAIM_PROCESSED_USDC_PAID_OFFSET = 8 + 32 + 8 + 32 // = 80

function parseClaimAmountFromLogs(logMessages: string[]): number | null {
  for (const log of logMessages) {
    if (!log.startsWith("Program data: ")) continue
    try {
      const b64 = log.slice("Program data: ".length)
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      if (bytes.length < CLAIM_PROCESSED_USDC_PAID_OFFSET + 8) continue
      const discMatch = CLAIM_PROCESSED_DISC.every((b, i) => bytes[i] === b)
      if (!discMatch) continue
      const raw = decodeU64LE(bytes, CLAIM_PROCESSED_USDC_PAID_OFFSET)
      return Number(raw) / 10 ** USDC_DECIMALS
    } catch (_) {}
  }
  return null
}

const USDC_DECIMALS = 6
const BNKR_DECIMALS = 9

function decodeU64LE(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0)
  for (let i = 0; i < 8 && (offset + i) < bytes.length; i++) {
    value += BigInt(bytes[offset + i]!) << BigInt(8 * i)
  }
  return value
}

// Delay helper to throttle sequential RPC calls below devnet rate limits
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function useRecentProgramEvents(limit = 10) {
  const { connection } = useConnection()
  const [events, setEvents] = useState<ProgramEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, { limit })

      if (sigs.length === 0) {
        setEvents([])
        return
      }

      // Fetch each transaction individually with a delay between calls.
      // getTransactions() sends a single HTTP batch containing all sub-requests,
      // which bypasses the rate-limiter and triggers 429 on devnet.
      // Individual getTransaction() calls each go through the rate-limiter middleware.
      const txs = []
      for (const sig of sigs) {
        const tx = await connection.getTransaction(sig.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        })
        txs.push(tx)
        await sleep(450)
      }

      const parsed: ProgramEvent[] = []
      const programIdStr = PROGRAM_ID.toBase58()

      for (let i = 0; i < sigs.length; i++) {
        const sig = sigs[i]!
        const tx = txs[i]
        if (!tx) continue

        const timestamp = sig.blockTime ? new Date(sig.blockTime * 1000) : new Date()
        const msg = tx.transaction.message
        const accountKeys = msg.staticAccountKeys
        const wallet = accountKeys[0]?.toBase58() ?? 'unknown'
        const instructions = msg.compiledInstructions

        for (const ix of instructions) {
          const ixProgramId = accountKeys[ix.programIdIndex]?.toBase58()
          if (ixProgramId !== programIdStr) continue

          const data = ix.data
          if (data.length < 8) continue

          const discKey = Array.from(data.slice(0, 8)).join(',')
          const info = DISC_MAP[discKey]
          if (!info) continue

          let amount: number | null = null
          if (info.hasAmount && data.length >= 16) {
            try {
              const raw = decodeU64LE(data, 8)
              const decimals = info.currency === "BNKR" ? BNKR_DECIMALS : USDC_DECIMALS
              amount = Number(raw) / 10 ** decimals
            } catch (_) {}
          } else if (info.type === "Claim") {
            // process_claim has no instruction args; parse usdc_paid from the emitted ClaimProcessed event log
            amount = parseClaimAmountFromLogs(tx.meta?.logMessages ?? [])
          }

          parsed.push({
            id: `${sig.signature}-${parsed.length}`,
            type: info.type,
            time: timestamp,
            wallet,
            amount,
            currency: info.currency,
            txHash: sig.signature,
          })
        }
      }

      setEvents(parsed)
    } catch (e: any) {
      console.error('Error fetching program events:', e)
      setError(e.message || 'Failed to fetch events')
    } finally {
      setLoading(false)
    }
  }, [connection, limit])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  return { events, loading, error, refresh: fetchEvents }
}
