"use client";

import { useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useSetAtom } from "jotai";
import { Layout } from "@/components/layout/Layout";
import { PageContainer } from "@/components/design/PageContainer";
import {
  SectionCard,
  CardHeader,
  MetricGrid,
  StatusPill,
  SegmentedTabs,
  Shimmer,
  type Metric,
  type PillTone,
} from "@/components/design/primitives";
import {
  CopyIcon,
  ExternalIcon,
  RefreshIcon,
  WalletIcon,
  Spinner,
} from "@/components/design/icons";
import { type Claim, useMyClaims } from "@/hooks/useMyClaims";
import { useOptionalWallet } from "@/hooks/useOptionalWallet";
import { usePoolStats } from "@/hooks/usePoolStats";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useUsdcBalance } from "@/hooks/useUsdcBalance";
import { useMyTransactions } from "@/hooks/useMyTransactions";
import { useCancelClaim, isClaimCancellable } from "@/hooks/useCancelClaim";
import { connectModalOpenAtom } from "@/lib/ui-atoms";
import { explorerTxUrl, explorerAddressUrl } from "@/lib/explorer";
import { getClusterFromEndpoint } from "@/lib/constants";
import type { Transaction, SellStatus } from "@/types";

const USDC_DECIMALS = 6;

function fmtNum(n: number, maxDec = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDec,
  });
}

function fmtUsdcRaw(raw: string): number {
  return Number(raw) / 10 ** USDC_DECIMALS;
}

function shortenSig(sig: string): string {
  return `${sig.slice(0, 4)}…${sig.slice(-4)}`;
}

function shortenAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

// ---------------------------------------------------------------------------
// Disconnected state
// ---------------------------------------------------------------------------
function DisconnectedState() {
  const openConnect = useSetAtom(connectModalOpenAtom);
  return (
    <div className="flex flex-col items-center gap-5 rounded-xl border border-line bg-surface px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line-2 bg-surface-3">
        <WalletIcon size={24} className="text-ink-3" />
      </span>
      <div className="flex flex-col gap-1.5">
        <span className="text-base font-semibold">No wallet connected</span>
        <span className="mx-auto max-w-sm text-[13px] leading-relaxed text-ink-3">
          Connect your Solana wallet to view balances, transaction history, and
          settlement activity.
        </span>
      </div>
      <button
        type="button"
        onClick={() => openConnect(true)}
        className="h-10 rounded-lg bg-mint-btn px-5 text-[13.5px] font-semibold text-mint-ink transition-colors hover:bg-mint-btn-h"
      >
        Connect wallet
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wallet summary card
// ---------------------------------------------------------------------------
function WalletSummary({
  address,
  cluster,
}: {
  address: string;
  cluster: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    copyText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-[18px] py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-line-2 bg-surface-3">
          <WalletIcon size={18} className="text-mint" />
        </span>
        <div className="flex flex-col">
          <span className="font-mono text-[13.5px] font-medium tabular-nums">
            {shortenAddr(address)}
          </span>
          <span className="text-[11.5px] text-ink-3">Connected wallet</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={copy}
          title="Copy address"
          className="flex h-7 items-center gap-1.5 rounded-md border border-line-2 bg-surface-2 px-2 text-[11.5px] text-ink-2 transition-colors hover:border-ink-3"
        >
          <CopyIcon size={11} />
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={explorerAddressUrl(cluster as Parameters<typeof explorerAddressUrl>[0], address)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-7 items-center gap-1.5 rounded-md border border-line-2 bg-surface-2 px-2 text-[11.5px] text-ink-2 no-underline transition-colors hover:border-ink-3 hover:text-ink"
        >
          <ExternalIcon size={11} />
          Explorer
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Balance metrics
// ---------------------------------------------------------------------------
function BalanceMetrics() {
  const { balance: bnkrBalance, loading: bnkrLoading } = useTokenBalance();
  const { balance: usdcBalance } = useUsdcBalance();
  const { stats, loading: statsLoading } = usePoolStats();
  const { claims } = useMyClaims();

  const bnkr = Number(bnkrBalance || "0");
  const usdc = Number(usdcBalance || "0");
  const price = stats.pricePerToken;

  const openClaims = claims.filter(
    (c) => !c.cancelled && !c.processed && c.bunkercashRemaining !== "0",
  );
  const escrowBnkr = openClaims.reduce(
    (sum, c) => sum + Number(c.bunkercashRemaining) / 1e6,
    0,
  );

  const pendingUsdc = openClaims.reduce(
    (sum, c) => sum + fmtUsdcRaw(c.requestedUsdc) - fmtUsdcRaw(c.paidUsdc),
    0,
  );

  const totalExposure =
    price != null ? bnkr * price + escrowBnkr * price + usdc : null;

  const loading = bnkrLoading || statsLoading;

  const metrics: Metric[] = [
    {
      label: "USDC balance",
      value: loading ? <Shimmer className="h-5 w-20" /> : fmtNum(usdc),
      unit: "USDC",
      tip: "Available USDC in your connected wallet.",
    },
    {
      label: "BNKR balance",
      value: loading ? <Shimmer className="h-5 w-20" /> : fmtNum(bnkr, 4),
      unit: "BNKR",
      tip: "BunkerCash tokens held in your wallet.",
    },
    {
      label: "In escrow",
      value: loading ? <Shimmer className="h-5 w-20" /> : fmtNum(escrowBnkr, 4),
      unit: "BNKR",
      tip: "BNKR locked in open sell requests — returned if you cancel.",
    },
    {
      label: "Pending USDC",
      value: loading ? (
        <Shimmer className="h-5 w-20" />
      ) : (
        fmtNum(Math.max(0, pendingUsdc))
      ),
      unit: "USDC",
      tip: "USDC you've requested but hasn't settled yet.",
    },
    {
      label: "Total exposure",
      value: loading ? (
        <Shimmer className="h-5 w-20" />
      ) : totalExposure != null ? (
        `$${fmtNum(totalExposure)}`
      ) : (
        "—"
      ),
      tip: "Estimated total value of all positions at current reference rate.",
    },
    {
      label: "Open requests",
      value: loading ? (
        <Shimmer className="h-5 w-12" />
      ) : (
        openClaims.length.toString()
      ),
      tip: "Active sell requests awaiting settlement.",
    },
  ];

  return (
    <SectionCard label="Balance overview">
      <CardHeader title="Balances" />
      <MetricGrid metrics={metrics} />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Transaction row + table
// ---------------------------------------------------------------------------
type TxFilter = "all" | "buys" | "sells";

const TX_FILTER_ITEMS: { value: TxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "buys", label: "Buys" },
  { value: "sells", label: "Sells" },
];

function statusTone(status?: SellStatus): PillTone {
  switch (status) {
    case "pending":
      return "warn";
    case "partial":
      return "info";
    case "settled":
      return "mint";
    case "cancelled":
      return "neutral";
    default:
      return "mint";
  }
}

function statusLabel(tx: Transaction): string {
  if (tx.type === "investment") return "Completed";
  switch (tx.status) {
    case "pending":
      return "Pending";
    case "partial":
      return "Partial";
    case "settled":
      return "Settled";
    case "cancelled":
      return "Cancelled";
    default:
      return "Completed";
  }
}

function TxDesktopRow({
  tx,
  cluster,
}: {
  tx: Transaction;
  cluster: string;
}) {
  const isBuy = tx.type === "investment";
  const amount = isBuy
    ? `+$${fmtNum(tx.amount)}`
    : tx.status === "settled" || tx.status === "partial"
      ? `-$${fmtNum(tx.settledUsdc ?? tx.amount)}`
      : tx.status === "cancelled"
        ? "—"
        : `$${fmtNum(tx.requestedUsdc ?? tx.amount)}`;

  return (
    <tr className="border-t border-line transition-colors hover:bg-surface-2/50">
      <td className="px-[18px] py-3">
        <span className="flex items-center gap-2.5">
          <span
            className={`h-[7px] w-[7px] flex-none rounded-sm ${isBuy ? "bg-mint" : "bg-sell"}`}
          />
          <span className="text-[13px] font-medium">
            {isBuy ? "Buy" : "Sell"}
          </span>
        </span>
      </td>
      <td className="px-3 py-3">
        <span
          className={`whitespace-nowrap font-mono text-[13px] tabular-nums ${isBuy ? "text-mint" : "text-sell"}`}
        >
          {amount}
        </span>
      </td>
      <td className="px-3 py-3">
        {tx.tokenAmount != null && tx.tokenAmount > 0 && (
          <span className="whitespace-nowrap font-mono text-[12.5px] tabular-nums text-ink-2">
            {tx.tokenAmount.toLocaleString("en-US", { maximumFractionDigits: 4 })}{" "}
            BNKR
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <StatusPill tone={statusTone(isBuy ? undefined : tx.status)}>
          {statusLabel(tx)}
        </StatusPill>
      </td>
      <td className="px-3 py-3 text-[12.5px] text-ink-3">
        {tx.timestamp.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}
        ,{" "}
        {tx.timestamp.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </td>
      <td className="px-3 py-3">
        <span className="flex items-center gap-1.5">
          {tx.txSignature && (
            <>
              <button
                type="button"
                onClick={() => copyText(tx.txSignature!)}
                title="Copy signature"
                className="text-ink-3 transition-colors hover:text-ink-2"
              >
                <CopyIcon size={11} />
              </button>
              <a
                href={explorerTxUrl(cluster as Parameters<typeof explorerTxUrl>[0], tx.txSignature)}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Explorer"
                className="text-ink-3 no-underline transition-colors hover:text-mint"
              >
                <ExternalIcon size={11} />
              </a>
            </>
          )}
        </span>
      </td>
    </tr>
  );
}

function TxMobileCard({
  tx,
  cluster,
}: {
  tx: Transaction;
  cluster: string;
}) {
  const isBuy = tx.type === "investment";
  const amount = isBuy
    ? `+$${fmtNum(tx.amount)}`
    : tx.status === "settled" || tx.status === "partial"
      ? `-$${fmtNum(tx.settledUsdc ?? tx.amount)}`
      : tx.status === "cancelled"
        ? "—"
        : `$${fmtNum(tx.requestedUsdc ?? tx.amount)}`;

  return (
    <div className="flex flex-col gap-2.5 border-t border-line px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className={`h-[7px] w-[7px] flex-none rounded-sm ${isBuy ? "bg-mint" : "bg-sell"}`}
          />
          <span className="text-[13px] font-medium">
            {isBuy ? "Buy" : "Sell"}
          </span>
          <StatusPill tone={statusTone(isBuy ? undefined : tx.status)}>
            {statusLabel(tx)}
          </StatusPill>
        </span>
        <span
          className={`whitespace-nowrap font-mono text-[13px] font-medium tabular-nums ${isBuy ? "text-mint" : "text-sell"}`}
        >
          {amount}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px] text-ink-3">
        <span>
          {tx.timestamp.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
          ,{" "}
          {tx.timestamp.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {tx.tokenAmount != null && tx.tokenAmount > 0 && (
            <>
              {" · "}
              <span className="font-mono tabular-nums">
                {tx.tokenAmount.toLocaleString("en-US", {
                  maximumFractionDigits: 4,
                })}
              </span>{" "}
              BNKR
            </>
          )}
        </span>
        {tx.txSignature && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => copyText(tx.txSignature!)}
              title="Copy signature"
              className="text-ink-3 transition-colors hover:text-ink-2"
            >
              <CopyIcon size={11} />
            </button>
            <a
              href={explorerTxUrl(cluster as Parameters<typeof explorerTxUrl>[0], tx.txSignature)}
              target="_blank"
              rel="noopener noreferrer"
              title="View on Explorer"
              className="text-ink-3 no-underline transition-colors hover:text-mint"
            >
              <ExternalIcon size={11} />
            </a>
          </span>
        )}
      </div>
    </div>
  );
}

function TransactionsSection({ cluster }: { cluster: string }) {
  const { transactions, loading, error, refresh } = useMyTransactions();
  const [filter, setFilter] = useState<TxFilter>("all");
  const [showCount, setShowCount] = useState(20);

  const filtered = useMemo(() => {
    if (filter === "buys")
      return transactions.filter((t) => t.type === "investment");
    if (filter === "sells")
      return transactions.filter((t) => t.type === "withdrawal");
    return transactions;
  }, [transactions, filter]);

  const visible = filtered.slice(0, showCount);
  const hasMore = filtered.length > showCount;

  return (
    <SectionCard label="Transactions">
      <CardHeader
        title="Transactions"
        right={
          <div className="flex items-center gap-2.5">
            <SegmentedTabs
              label="Transaction type"
              items={TX_FILTER_ITEMS}
              value={filter}
              onChange={setFilter}
            />
            <button
              type="button"
              onClick={() => void refresh()}
              title="Refresh"
              className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-line-2 bg-surface-2 text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2"
            >
              <RefreshIcon size={12} />
            </button>
          </div>
        }
      />

      {loading && transactions.length === 0 ? (
        <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-ink-3">
          <Spinner />
          Loading transactions…
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <span className="text-[13px] text-sell">{error}</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="h-8 rounded-lg border border-line-2 bg-surface-2 px-3 text-[12.5px] font-semibold transition-colors hover:border-ink-3"
          >
            Retry
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-12 text-center">
          <span className="text-[13px] text-ink-2">
            {filter === "all"
              ? "No transactions yet."
              : `No ${filter} found.`}
          </span>
          <span className="text-[12.5px] text-ink-3">
            {filter === "all"
              ? "Transactions will appear here after your first trade."
              : 'Try switching to "All" to see all activity.'}
          </span>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto desk:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-t border-line text-[12px] text-ink-3">
                  <th className="px-[18px] py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Tokens</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visible.map((tx) => (
                  <TxDesktopRow key={tx.id} tx={tx} cluster={cluster} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="desk:hidden">
            {visible.map((tx) => (
              <TxMobileCard key={tx.id} tx={tx} cluster={cluster} />
            ))}
          </div>

          {hasMore && (
            <div className="border-t border-line px-[18px] py-3">
              <button
                type="button"
                onClick={() => setShowCount((c) => c + 20)}
                className="w-full rounded-lg border border-line-2 bg-surface-2 py-2 text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-ink-3"
              >
                Load more ({filtered.length - showCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Settlements section
// ---------------------------------------------------------------------------
function ClaimRow({
  claim,
  cluster,
  cancelling,
  onCancel,
}: {
  claim: Claim;
  cluster: string;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const requested = fmtUsdcRaw(claim.requestedUsdc);
  const paid = fmtUsdcRaw(claim.paidUsdc);
  const progress =
    requested > 0 ? Math.min(100, (paid / requested) * 100) : paid > 0 ? 100 : 0;

  const tone: PillTone = claim.cancelled
    ? "neutral"
    : claim.processed
      ? "mint"
      : paid > 0
        ? "info"
        : "warn";

  const label = claim.cancelled
    ? "Cancelled"
    : claim.processed
      ? "Settled"
      : paid > 0
        ? "Partial"
        : "Pending";

  const cancellable = isClaimCancellable(claim);

  return (
    <div className="flex flex-col gap-2.5 border-t border-line px-[18px] py-3.5 max-[839px]:px-4">
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex items-center gap-2.5">
          <span className="text-[13px] font-medium">
            Sell #{claim.id}
          </span>
          <StatusPill tone={tone}>{label}</StatusPill>
        </span>
        <span className="flex items-center gap-2">
          {cancellable && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              className="flex h-7 items-center gap-1 rounded-md border border-sell-line bg-sell-soft px-2.5 text-[11.5px] font-semibold text-sell transition-colors hover:bg-sell/10 disabled:opacity-50"
            >
              {cancelling ? <Spinner className="h-3 w-3" /> : null}
              Cancel
            </button>
          )}
          <a
            href={explorerAddressUrl(cluster as Parameters<typeof explorerAddressUrl>[0], claim.pubkey)}
            target="_blank"
            rel="noopener noreferrer"
            title="View on Explorer"
            className="text-ink-3 no-underline transition-colors hover:text-mint"
          >
            <ExternalIcon size={12} />
          </a>
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-mint transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="whitespace-nowrap font-mono text-[11.5px] tabular-nums text-ink-3">
          {progress.toFixed(1)}%
        </span>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
        <span className="text-ink-3">
          Requested{" "}
          <span className="font-mono tabular-nums text-ink-2">
            ${fmtNum(requested)}
          </span>
        </span>
        <span className="text-ink-3">
          Settled{" "}
          <span className="font-mono tabular-nums text-ink-2">
            ${fmtNum(paid)}
          </span>
        </span>
      </div>
    </div>
  );
}

function SettlementsSection({ cluster }: { cluster: string }) {
  const {
    claims,
    loading: claimsLoading,
    error: claimsError,
    refreshClaims,
  } = useMyClaims();
  const { cancelClaim, cancellingClaim } = useCancelClaim({
    onDone: () => void refreshClaims(),
  });

  return (
    <SectionCard label="Settlement history">
      <CardHeader
        title="Settlements"
        right={
          <button
            type="button"
            onClick={() => void refreshClaims()}
            title="Refresh"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-md border border-line-2 bg-surface-2 text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2"
          >
            <RefreshIcon size={12} />
          </button>
        }
      />

      {claimsLoading && claims.length === 0 ? (
        <div className="flex items-center justify-center gap-2.5 py-12 text-[13px] text-ink-3">
          <Spinner />
          Loading settlements…
        </div>
      ) : claimsError ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <span className="text-[13px] text-sell">{claimsError}</span>
          <button
            type="button"
            onClick={() => void refreshClaims()}
            className="h-8 rounded-lg border border-line-2 bg-surface-2 px-3 text-[12.5px] font-semibold transition-colors hover:border-ink-3"
          >
            Retry
          </button>
        </div>
      ) : claims.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-12 text-center">
          <span className="text-[13px] text-ink-2">No settlement activity</span>
          <span className="text-[12.5px] text-ink-3">
            Sell requests and their settlement progress will appear here.
          </span>
        </div>
      ) : (
        claims.map((claim) => (
          <ClaimRow
            key={claim.pubkey}
            claim={claim}
            cluster={cluster}
            cancelling={cancellingClaim === claim.pubkey}
            onCancel={() => void cancelClaim(claim)}
          />
        ))
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
type WalletTab = "transactions" | "settlements";

const TAB_ITEMS: { value: WalletTab; label: string }[] = [
  { value: "transactions", label: "Transactions" },
  { value: "settlements", label: "Settlements" },
];

export default function WalletPageClient() {
  const wallet = useOptionalWallet();
  const connected = !!wallet?.connected;
  const address = wallet?.publicKey?.toBase58() ?? "";
  const { connection } = useConnection();
  const cluster = getClusterFromEndpoint(connection.rpcEndpoint ?? "");
  const [tab, setTab] = useState<WalletTab>("transactions");

  return (
    <Layout>
      <PageContainer className="gap-5">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold tracking-[-0.01em]">Wallet</h1>
          <span className="text-[13px] text-ink-3">
            Your balances, transaction history, and settlement progress in one
            place.
          </span>
        </div>

        {!connected ? (
          <DisconnectedState />
        ) : (
          <>
            <WalletSummary address={address} cluster={cluster} />
            <BalanceMetrics />

            <div className="flex flex-col gap-0">
              <div className="pb-3">
                <SegmentedTabs
                  label="Wallet activity"
                  items={TAB_ITEMS}
                  value={tab}
                  onChange={setTab}
                  size="md"
                />
              </div>

              {tab === "transactions" ? (
                <TransactionsSection cluster={cluster} />
              ) : (
                <SettlementsSection cluster={cluster} />
              )}
            </div>
          </>
        )}
      </PageContainer>
    </Layout>
  );
}
