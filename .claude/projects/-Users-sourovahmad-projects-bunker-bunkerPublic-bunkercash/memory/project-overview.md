---
name: project-overview
description: BunkerCash is a Solana tokenized fund — users deposit USDC, receive BunkerCash tokens, master wallet invests, settlement epochs pay claims
metadata:
  type: project
---

BunkerCash is a NAV-based tokenized fund on Solana. Pre-MVP stage, BUSL-1.1 licensed.

**Domain model:**
- Users deposit USDC into a pool, receive BunkerCash tokens (Token-2022, 6 decimals) priced at NAV / total_supply
- A master wallet (Squads v4 multisig vault) withdraws USDC to invest off-chain, creating tracked Withdrawal accounts
- Master repays/profits/cancels/closes withdrawals, adjusting NAV accordingly
- Users file claims to redeem BunkerCash for USDC — tokens are escrowed (not burned) and a USDC claim is created
- Settlement happens in epochs: open_settlement snapshots vault + pending claims, compute payout ratio (PPM), settle_claims pays proportionally, close_settlement verifies completeness
- Configurable purchase fees, claim fees (basis points), purchase limits, min settlement thresholds, and supported USDC mint

**Why:** The settlement epoch system with payout ratios handles underfunded vaults gracefully — all claimants share the haircut proportionally rather than first-come-first-served.

**How to apply:** NAV accounting is the core invariant. Every instruction carefully maintains nav, total_bunkercash_supply, and total_pending_claims. Changes to these fields need careful arithmetic review.

**Repo structure:**
- `rs/` — Anchor program (single program in `programs/bunkercash/src/program.rs`, ~3600 lines)
- `ts/apps/web/` — Public Next.js app (buy/sell interface, pool stats, price chart)
- `ts/apps/admin/` — Admin Next.js app (dashboard, settlement, withdrawal mgmt, claims, geoblocking)
- `ts/packages/` — Shared packages (cloudflare-kv, metrics-data, support-requests, eslint-config, typescript-config)

**Tech stack:** Anchor 0.30.1, Solana web3.js 1.x, Next.js 15, React 19, Tailwind, Radix UI, Recharts, Turborepo, Bun, Cloudflare Workers (OpenNext), Vitest
