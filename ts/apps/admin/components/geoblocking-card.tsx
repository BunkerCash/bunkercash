"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Globe,
  RefreshCw,
  Loader2,
  Plus,
  X,
  AlertCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { COUNTRIES } from "@/lib/countries";

export function GeoblockingCard() {
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchBlocked = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/geoblocking");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBlocked(data.countries);
    } catch (e: any) {
      setError(e.message || "Failed to load blocked countries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  const save = async (countries: string[]) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/geoblocking", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countries }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBlocked(data.countries);
      setSuccess(`Updated — ${data.countries.length} countries blocked`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const addCountry = (code: string) => {
    if (blocked.includes(code)) return;
    const next = [...blocked, code].sort();
    setBlocked(next);
    save(next);
    setSearch("");
  };

  const removeCountry = (code: string) => {
    const next = blocked.filter((c) => c !== code);
    setBlocked(next);
    save(next);
  };

  const filteredCountries = COUNTRIES.filter(
    (c) =>
      !blocked.includes(c.code) &&
      (c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">Geoblocking</h1>
        <button
          onClick={fetchBlocked}
          className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800/40 transition-colors"
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Status messages */}
      {error && (
        <div className="flex items-start gap-2 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-xs text-emerald-400">{success}</p>
        </div>
      )}

      {/* Blocked countries */}
      <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Blocked Countries ({blocked.length})
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-neutral-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : blocked.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No countries blocked. Add countries below.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {blocked.map((code) => {
              const country = COUNTRIES.find((c) => c.code === code);
              return (
                <span
                  key={code}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 font-medium"
                >
                  {country?.flag} {code}
                  <button
                    onClick={() => removeCountry(code)}
                    disabled={saving}
                    className="ml-0.5 hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Add country */}
      <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-4 h-4 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Add Country
          </span>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search countries..."
            className="w-full h-10 bg-neutral-800/60 border border-neutral-700/60 rounded-lg pl-9 pr-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#00FFB2]/50 focus:border-[#00FFB2]/50"
          />
        </div>

        {search.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-neutral-800/60 bg-neutral-900/60">
            {filteredCountries.length === 0 ? (
              <p className="px-3 py-2 text-xs text-neutral-600">
                No matching countries
              </p>
            ) : (
              filteredCountries.slice(0, 20).map((c) => (
                <button
                  key={c.code}
                  onClick={() => addCountry(c.code)}
                  disabled={saving}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800/60 transition-colors disabled:opacity-50"
                >
                  <span>{c.flag}</span>
                  <span>{c.name}</span>
                  <span className="text-neutral-600 text-xs ml-auto font-mono">
                    {c.code}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <p className="text-[11px] text-neutral-600 mt-3">
          Changes take effect within 60 seconds on the user-facing app.
          Blocked users see a restriction notice.
        </p>
      </div>
    </div>
  );
}
