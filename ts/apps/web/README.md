# BunkerCash — Web

Public Next.js app for interacting with the BunkerCash on-chain program (buy, sell, claim).

## Configuration (devnet)

- Copy `./.env.example` to `./.env.local`
- `NEXT_PUBLIC_USDC_MINT` controls which USDC-like mint is used for `buy_primary` on the current cluster.

## Production note

In production, **never hardcode a user address** — the app uses the connected wallet (`wallet.publicKey`) at runtime, so purchases are always made using the real user's token accounts.

Production should also target a single canonical mint (e.g. mainnet USDC), not multiple "dev USDC" mints.

## Develop

From the monorepo root (`ts/`):

```bash
bun run dev --filter=web
```

Or from this directory:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Related

- On-chain program: [`../../../rs`](../../../rs)
- Command reference: [`../../../rs/COMMANDS.md`](../../../rs/COMMANDS.md)
