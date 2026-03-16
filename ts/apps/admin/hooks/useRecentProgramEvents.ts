"use client"

import { useCallback, useEffect, useState } from 'react'
import { useConnection } from '@solana/wallet-adapter-react'
import { PROGRAM_ID } from '@/lib/program'

export type EventType =
  | "Buy"
  | "File Claim"
  | "Settlement"
  | "Master Withdraw"
  | "Master Repay"
  | "Master Cancel"

export interface ProgramEvent {
  id: string
  type: EventType
  time: Date
  wallet: string
  amount: number | null
  currency: "BNKR" | "USDC" | null
  txHash: string
}

interface EventMeta {
  type: EventType
  currency: "BNKR" | "USDC" | null
  amountSource: "ix_arg" | "claims_settled_event"
}

const DISC_MAP: Record<string, EventMeta> = {
  "184,148,250,169,224,213,34,126": { type: "Buy", currency: "USDC", amountSource: "ix_arg" },
  "187,254,40,13,146,223,230,97": { type: "File Claim", currency: "BNKR", amountSource: "ix_arg" },
  "58,91,9,15,201,59,179,94": { type: "Settlement", currency: "USDC", amountSource: "claims_settled_event" },
  "251,226,132,202,30,7,50,85": { type: "Master Withdraw", currency: "USDC", amountSource: "ix_arg" },
  "196,123,175,178,81,52,168,164": { type: "Master Repay", currency: "USDC", amountSource: "ix_arg" },
  "254,236,97,119,73,158,24,170": { type: "Master Cancel", currency: "USDC", amountSource: "ix_arg" },
}

const CLAIMS_SETTLED_EVENT_DISC = [88, 125, 52, 74, 137, 168, 85, 245]
const CLAIMS_SETTLED_TOTAL_PAID_OFFSET = 8 + 32 + 32 + 8 + 8 + 8 // 96

const USDC_DECIMALS = 6
const BNKR_DECIMALS = 6

function decodeU64LE(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0)
  for (let i = 0; i < 8 && offset + i < bytes.length; i++) {
    value += BigInt(bytes[offset + i]!) << BigInt(8 * i)
  }
  return value
}

function parseBase64Log(log: string): Uint8Array | null {
  if (!log.startsWith("Program data: ")) return null

  try {
    const b64 = log.slice("Program data: ".length)
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

function parseClaimsSettledAmount(logMessages: string[] | null | undefined): number | null {
  if (!logMessages) return null

  for (const log of logMessages) {
    const bytes = parseBase64Log(log)
    if (!bytes || bytes.length < CLAIMS_SETTLED_TOTAL_PAID_OFFSET + 8) continue

    const discMatch = CLAIMS_SETTLED_EVENT_DISC.every((b, i) => bytes[i] === b)
    if (!discMatch) continue

    const raw = decodeU64LE(bytes, CLAIMS_SETTLED_TOTAL_PAID_OFFSET)
    return Number(raw) / 10 ** USDC_DECIMALS
  }

  return null
}

const CACHE_TTL = 30_000
let eventsCache: { data: ProgramEvent[]; timestamp: number; endpoint: string } | null = null

export function useRecentProgramEvents(limit = 20) {
  const { connection } = useConnection()
  const [events, setEvents] = useState<ProgramEvent[]>(eventsCache?.data ?? [])
  const [loading, setLoading] = useState(!eventsCache)
  const [error, setError] = useState<string | null>(null)

  const rpcEndpoint = connection.rpcEndpoint ?? ""

  const fetchEvents = useCallback(async (bypassCache = false) => {
    if (
      !bypassCache &&
      eventsCache &&
      eventsCache.endpoint === rpcEndpoint &&
      Date.now() - eventsCache.timestamp < CACHE_TTL
    ) {
      setEvents(eventsCache.data)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, { limit })

      if (sigs.length === 0) {
        setEvents([])
        eventsCache = { data: [], timestamp: Date.now(), endpoint: rpcEndpoint }
        return
      }

      const txs = await Promise.all(
        sigs.map(async (sig) => {
          try {
            return await connection.getTransaction(sig.signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            })
          } catch (e) {
            console.warn(`Failed to fetch tx ${sig.signature}:`, e)
            return null
          }
        })
      )

      const parsed: ProgramEvent[] = []
      const programIdStr = PROGRAM_ID.toBase58()

      for (let i = 0; i < sigs.length; i++) {
        const sig = sigs[i]!
        const tx = txs[i]
        if (!tx) continue

        const timestamp = sig.blockTime ? new Date(sig.blockTime * 1000) : new Date()
        const msg = tx.transaction.message
        const accountKeys = msg.staticAccountKeys
        const instructions = msg.compiledInstructions
        const defaultWallet = accountKeys[0]?.toBase58() ?? 'unknown'

        for (const ix of instructions) {
          const ixProgramId = accountKeys[ix.programIdIndex]?.toBase58()
          if (ixProgramId !== programIdStr) continue

          const data = ix.data
          if (data.length < 8) continue

          const discKey = Array.from(data.slice(0, 8)).join(',')
          const info = DISC_MAP[discKey]
          if (!info) continue

          let amount: number | null = null
          if (info.amountSource === "ix_arg" && data.length >= 16) {
            const raw = decodeU64LE(data, 8)
            const decimals = info.currency === "BNKR" ? BNKR_DECIMALS : USDC_DECIMALS
            amount = Number(raw) / 10 ** decimals
          } else if (info.amountSource === "claims_settled_event") {
            amount = parseClaimsSettledAmount(tx.meta?.logMessages)
          }

          parsed.push({
            id: `${sig.signature}-${parsed.length}`,
            type: info.type,
            time: timestamp,
            wallet: defaultWallet,
            amount,
            currency: info.currency,
            txHash: sig.signature,
          })
        }
      }

      eventsCache = { data: parsed, timestamp: Date.now(), endpoint: rpcEndpoint }
      setEvents(parsed)
    } catch (e: unknown) {
      console.error('Error fetching program events:', e)
      setError(e instanceof Error ? e.message : 'Failed to fetch events')
    } finally {
      setLoading(false)
    }
  }, [connection, limit, rpcEndpoint])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  const refresh = useCallback(() => fetchEvents(true), [fetchEvents])

  return { events, loading, error, refresh }
}
