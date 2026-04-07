"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  AlertCircle,
  ChevronDown,
  Mail,
  Phone,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { buildAdminAccessMessage } from "@/lib/admin-auth-message";
import type { SupportRequestRecord } from "@/lib/support-requests";

const PAGE_SIZE = 25;
const ACCESS_HEADER_TTL_MS = 4 * 60 * 1000;

function getErrorMessage(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }

  return fallback;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SupportRequestsList() {
  const { publicKey, signMessage } = useWallet();
  const [requests, setRequests] = useState<SupportRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const accessHeadersRef = useRef<{
    wallet: string;
    issuedAtMs: number;
    headers: Record<string, string>;
  } | null>(null);

  const buildAccessHeaders = useCallback(async (forceRefresh = false) => {
    if (!publicKey || !signMessage) {
      throw new Error("Connect an admin wallet that supports message signing");
    }

    const wallet = publicKey.toBase58();
    const cachedHeaders = accessHeadersRef.current;
    if (
      !forceRefresh &&
      cachedHeaders &&
      cachedHeaders.wallet === wallet &&
      Date.now() - cachedHeaders.issuedAtMs < ACCESS_HEADER_TTL_MS
    ) {
      return cachedHeaders.headers;
    }

    const issuedAt = new Date().toISOString();
    const signatureBytes = await signMessage(
      new TextEncoder().encode(buildAdminAccessMessage(issuedAt)),
    );
    const signature = btoa(String.fromCharCode(...signatureBytes));

    const headers = {
      "x-admin-wallet": publicKey.toBase58(),
      "x-admin-issued-at": issuedAt,
      "x-admin-signature": signature,
    };
    accessHeadersRef.current = {
      wallet,
      issuedAtMs: Date.now(),
      headers,
    };

    return headers;
  }, [publicKey, signMessage]);

  useEffect(() => {
    accessHeadersRef.current = null;
  }, [publicKey]);

  const fetchRequests = useCallback(async (options?: {
    cursor?: string | null;
    append?: boolean;
  }) => {
    const cursor = options?.cursor ?? null;
    const append = options?.append ?? false;
    setError(null);

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const searchParams = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
      });
      if (cursor) {
        searchParams.set("cursor", cursor);
      }

      const requestUrl = `/api/support-requests?${searchParams.toString()}`;
      let response = await fetch(requestUrl, {
        headers: await buildAccessHeaders(),
      });

      if (response.status === 401) {
        accessHeadersRef.current = null;
        response = await fetch(requestUrl, {
          headers: await buildAccessHeaders(true),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data, "Failed to load support requests"),
        );
      }

      const nextRequests =
        data &&
        typeof data === "object" &&
        "requests" in data &&
        Array.isArray((data as { requests?: unknown }).requests)
          ? ((data as { requests: SupportRequestRecord[] }).requests ?? [])
          : [];
      const nextPageCursor =
        data &&
        typeof data === "object" &&
        "nextCursor" in data &&
        (typeof (data as { nextCursor?: unknown }).nextCursor === "string" ||
          (data as { nextCursor?: unknown }).nextCursor === null)
          ? ((data as { nextCursor: string | null }).nextCursor ?? null)
          : null;

      setRequests((current) => {
        if (!append) {
          return nextRequests;
        }

        const existingIds = new Set(current.map((request) => request.id));
        return [
          ...current,
          ...nextRequests.filter((request) => !existingIds.has(request.id)),
        ];
      });
      setNextCursor(nextPageCursor);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to load support requests",
      );
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [buildAccessHeaders]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Support Requests</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Submitted from the public support form and blocked-access notice.
          </p>
          {requests.length > 0 ? (
            <p className="mt-2 text-xs text-neutral-600">
              Showing {requests.length} request{requests.length === 1 ? "" : "s"}
              {nextCursor ? " with more available" : ""}
            </p>
          ) : null}
        </div>
        <button
          onClick={() => void fetchRequests()}
          disabled={loading || loadingMore}
          className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800/40 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-neutral-800/60 p-5"
            >
              <div className="h-4 w-48 animate-pulse rounded bg-neutral-800/60" />
              <div className="mt-4 h-4 w-72 animate-pulse rounded bg-neutral-800/60" />
              <div className="mt-2 h-20 w-full animate-pulse rounded bg-neutral-800/40" />
            </div>
          ))}
        </div>
      ) : error && requests.length === 0 ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="mb-1 text-sm font-medium text-red-300">
                Failed to load support requests
              </p>
              <p className="text-xs text-red-200/60">{error}</p>
            </div>
          </div>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-800/60 py-16 text-neutral-500">
          <ShieldAlert className="mb-4 h-8 w-8 text-neutral-600" />
          <p className="text-sm">No support requests submitted yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-300">
                    Failed to load more support requests
                  </p>
                  <p className="mt-1 text-xs text-red-200/60">{error}</p>
                </div>
              </div>
            </div>
          ) : null}

          {requests.map((request) => (
            <article
              key={request.id}
              className="rounded-2xl border border-neutral-800/60 bg-neutral-950/60 p-5"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-white">
                      {request.subject}
                    </h2>
                    <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-300">
                      {request.source === "blocked-page"
                        ? "Blocked Access"
                        : "Support Page"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-400">
                    Submitted by {request.fullName}
                    {request.country ? ` from ${request.country}` : ""}
                  </p>
                </div>
                <div className="text-sm text-neutral-500">
                  {formatDate(request.createdAt)}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-sm text-neutral-300">
                <a
                  href={`mailto:${request.email}`}
                  className="inline-flex items-center gap-2 transition-colors hover:text-white"
                >
                  <Mail className="h-4 w-4 text-cyan-300" />
                  {request.email}
                </a>
                {request.phone ? (
                  <a
                    href={`tel:${request.phone.replace(/[^+\d]/g, "")}`}
                    className="inline-flex items-center gap-2 transition-colors hover:text-white"
                  >
                    <Phone className="h-4 w-4 text-emerald-300" />
                    {request.phone}
                  </a>
                ) : null}
              </div>

              <div className="mt-4 rounded-xl border border-neutral-800/60 bg-black/20 p-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-200">
                  {request.message}
                </p>
              </div>

              {request.pageUrl ? (
                <div className="mt-4 text-xs text-neutral-500">
                  Submitted from: {request.pageUrl}
                </div>
              ) : null}
            </article>
          ))}

          {nextCursor ? (
            <div className="flex justify-center pt-2">
              <button
                onClick={() =>
                  void fetchRequests({ cursor: nextCursor, append: true })
                }
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white disabled:opacity-50"
              >
                <ChevronDown
                  className={`h-4 w-4 ${loadingMore ? "animate-bounce" : ""}`}
                />
                {loadingMore ? "Loading more" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
