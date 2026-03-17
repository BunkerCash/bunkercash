"use client"

import { useCallback, useEffect, useState } from 'react'
import type { EventsResponse, SerializedEvent } from "@/lib/solana-server"

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

function deserializeEvent(e: SerializedEvent): ProgramEvent {
  return {
    id: e.id,
    type: e.type as EventType,
    time: new Date(e.time),
    wallet: e.wallet,
    amount: e.amount,
    currency: e.currency,
    txHash: e.txHash,
  }
}

export function useRecentProgramEvents(_limit = 20) {
  const [events, setEvents] = useState<ProgramEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/events")
      if (!res.ok) throw new Error(`events: ${res.status}`)
      const data: EventsResponse = await res.json()
      setEvents(data.events.map(deserializeEvent))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch events')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  return { events, loading, error, refresh: fetchEvents }
}
