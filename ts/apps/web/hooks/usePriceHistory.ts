"use client";

import { useState, useEffect, useCallback } from "react";

export interface PricePoint {
  date: string;
  price: number | null;
}

export function usePriceHistory(days = 30) {
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`/api/price-history?days=${days}`);
      if (!res.ok) return;
      const json = (await res.json()) as { data: PricePoint[] };
      setData(json.data ?? []);
    } catch {
      // Silently fail — chart just stays empty
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { data, loading };
}
