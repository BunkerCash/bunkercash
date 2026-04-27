# BunkerCash — TypeScript Monorepo

Turborepo workspace for the BunkerCash web apps and shared packages. Uses Bun as the package manager.

## Apps

- `apps/web` — public Next.js app (buy / sell / claim)
- `apps/admin` — admin dashboard (price, liquidity, claims)

## Packages

- `packages/cloudflare-kv` — Cloudflare KV helpers
- `packages/metrics-data` — metrics + chart data
- `packages/support-requests` — support request handling
- `packages/eslint-config` — shared ESLint configs
- `packages/typescript-config` — shared `tsconfig.json`s

## Setup

```bash
cd ts
bun install
```

## Scripts

```bash
bun run dev          # run all apps in dev
bun run build        # build all apps
bun run lint         # lint all workspaces
bun run check-types  # typecheck all workspaces
bun run format       # prettier across the repo
```

Filter to a single app:

```bash
bun run dev --filter=web
bun run build --filter=admin
```

## Solana program

The on-chain program lives in [`../rs`](../rs). See [`../rs/README.md`](../rs/README.md) for build/deploy and [`../rs/COMMANDS.md`](../rs/COMMANDS.md) for the end-to-end command reference.
