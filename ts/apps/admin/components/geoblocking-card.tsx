"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Globe,
  RefreshCw,
  Loader2,
  Plus,
  X,
  AlertCircle,
  Search,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { COUNTRIES, EU_COUNTRY_CODES } from "@/lib/countries";
import { ConfirmationDialog } from "./ui/confirmation-dialog";

export function GeoblockingCard() {
  const { publicKey, signMessage } = useWallet();
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const blockedRef = useRef<string[]>([]);
  const saveInFlightRef = useRef(false);

  // Derive EU toggle state from whether ALL EU countries are in the blocked list
  const isEuBlocked = useMemo(
    () => EU_COUNTRY_CODES.every((code) => blocked.includes(code)),
    [blocked]
  );

  // How many EU countries are currently blocked (for partial indicator)
  const euBlockedCount = useMemo(
    () => EU_COUNTRY_CODES.filter((code) => blocked.includes(code)).length,
    [blocked]
  );

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
    blockedRef.current = blocked;
  }, [blocked]);

  useEffect(() => {
    fetchBlocked();
  }, [fetchBlocked]);

  const save = async (countries: string[], previousCountries: string[]) => {
    if (saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (!publicKey || !signMessage) {
        throw new Error("Connect an admin wallet that supports message signing");
      }

      const body = JSON.stringify({ countries });
      const issuedAt = new Date().toISOString();
      const bodyHashBuffer = await crypto.subtle.digest(
        "SHA-256",
        await new Blob([body]).arrayBuffer()
      );
      const bodyHash = Array.from(new Uint8Array(bodyHashBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const message = `bunkercash-admin:geoblocking:update\n${issuedAt}\n${bodyHash}`;
      const signatureBytes = await signMessage(new TextEncoder().encode(message));
      const signature = btoa(
        String.fromCharCode(...signatureBytes)
      );

      const res = await fetch("/api/geoblocking", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-wallet": publicKey.toBase58(),
          "x-admin-issued-at": issuedAt,
          "x-admin-signature": signature,
        },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBlocked(data.countries);
      setSuccess(`Updated — ${data.countries.length} countries blocked`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setBlocked(previousCountries);
      setError(e.message || "Failed to save");
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const addCountry = async (code: string) => {
    if (saveInFlightRef.current) return;

    const previous = blockedRef.current;
    if (previous.includes(code)) return;

    const next = [...previous, code].sort();
    setBlocked(next);
    await save(next, previous);
    setSearch("");
  };

  const removeCountry = async (code: string) => {
    if (saveInFlightRef.current) return;

    const previous = blockedRef.current;
    const next = previous.filter((c) => c !== code);
    setBlocked(next);
    await save(next, previous);
  };

  const toggleEuBlock = async () => {
    if (saveInFlightRef.current) return;

    const previous = blockedRef.current;
    let next: string[];
    if (isEuBlocked) {
      // Remove all EU countries
      next = previous.filter((c) => !EU_COUNTRY_CODES.includes(c));
    } else {
      // Add all EU countries (merge with existing, deduplicate)
      const merged = new Set([...previous, ...EU_COUNTRY_CODES]);
      next = [...merged].sort();
    }
    setBlocked(next);
    await save(next, previous);
  };

  const unblockAll = async () => {
    if (saveInFlightRef.current || blockedRef.current.length === 0) return;
    setIsConfirmOpen(true);
  };

  const handleConfirmUnblockAll = async () => {
    const previous = blockedRef.current;
    setBlocked([]);
    await save([], previous);
  };

  const filteredCountries = COUNTRIES.filter(
    (c) =>
      !blocked.includes(c.code) &&
      (c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase()))
  );
  const visibleFilteredCountries = filteredCountries.slice(0, 20);
  const hasMoreFilteredCountries =
    filteredCountries.length > visibleFilteredCountries.length;

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

      {/* EU Block Toggle */}
      <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
                isEuBlocked
                  ? "bg-red-500/15 text-red-400"
                  : "bg-neutral-800/60 text-neutral-500"
              )}
            >
              <ShieldAlert className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  Block All EU Countries
                </span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/20">
                  🇪🇺 {EU_COUNTRY_CODES.length} countries
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {isEuBlocked
                  ? "All EU member states are blocked"
                  : euBlockedCount > 0
                  ? `${euBlockedCount} of ${EU_COUNTRY_CODES.length} EU countries blocked`
                  : "Toggle to block all European Union member states"}
              </p>
            </div>
          </div>

          {/* Toggle switch */}
          <button
            onClick={toggleEuBlock}
            disabled={saving}
            className={cn(
              "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:opacity-50",
              isEuBlocked
                ? "bg-red-500 focus:ring-red-500/50"
                : "bg-neutral-700 focus:ring-neutral-500/50"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white transition-transform duration-200 shadow-sm",
                isEuBlocked ? "translate-x-6" : "translate-x-1"
              )}
            />
          </button>
        </div>
      </div>

      {/* Blocked countries */}
      <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-xl p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-neutral-500" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Blocked Countries ({blocked.length})
            </span>
          </div>
          {blocked.length > 0 && (
            <button
              onClick={unblockAll}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <X className="w-3 h-3" />
              Unblock All
            </button>
          )}
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
              const isEu = EU_COUNTRY_CODES.includes(code);
              return (
                <span
                  key={code}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium",
                    isEu
                      ? "bg-blue-500/10 border border-blue-500/20 text-blue-400"
                      : "bg-red-500/10 border border-red-500/20 text-red-400"
                  )}
                >
                  {country?.flag} {code}
                  {isEu && (
                    <span className="text-[9px] opacity-60">EU</span>
                  )}
                  <button
                    onClick={() => removeCountry(code)}
                    disabled={saving}
                    className={cn(
                      "ml-0.5 transition-colors disabled:opacity-50",
                      isEu ? "hover:text-blue-300" : "hover:text-red-300"
                    )}
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
              <>
                {visibleFilteredCountries.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => addCountry(c.code)}
                    disabled={saving}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800/60 transition-colors disabled:opacity-50"
                  >
                    <span>{c.flag}</span>
                    <span>{c.name}</span>
                    {EU_COUNTRY_CODES.includes(c.code) && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        EU
                      </span>
                    )}
                    <span className="text-neutral-600 text-xs ml-auto font-mono">
                      {c.code}
                    </span>
                  </button>
                ))}
                {hasMoreFilteredCountries && (
                  <p className="px-3 py-2 text-[11px] text-neutral-500 border-t border-neutral-800/60">
                    Showing {visibleFilteredCountries.length} of {filteredCountries.length} matches
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <p className="text-[11px] text-neutral-600 mt-3">
          Changes take effect within 60 seconds on the user-facing app.
          Blocked users see a restriction notice.
        </p>
      </div>

      <ConfirmationDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmUnblockAll}
        title="Unblock All Countries"
        description="Are you sure you want to remove all geoblocking restrictions? This will allow access from all countries globally."
        confirmLabel="Unblock All"
        cancelLabel="Keep Blocked"
        variant="danger"
      />
    </div>
  );
}
