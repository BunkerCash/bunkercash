# BunkerCash - Solana Program

NAV-priced primary buy + escrowed sell claims with settlement epochs.

Current governance model:

- `pool.master_wallet` is the privileged authority and should be initialized to
  the Squads Vault PDA for production-like environments.
- Privileged actions are executed through Squads Vault Transactions, not direct
  human-wallet signatures.
- `update_master_wallet` exists for recovery/rotation and is gated by the
  current `pool.master_wallet`, so a Squads Vault can rotate authority through a
  vault transaction.
- Program upgrade authority is a separate, higher-power control and must be
  Squads-controlled or revoked before mainnet funding.

Current pricing/settlement model:

- Buy quotes use available NAV (`pool.nav - pool.total_pending_claims`) divided
  by circulating BunkerCash supply. UI surfaces the age of cached NAV reads.
- Sell requests create claim accounts and lock BunkerCash in escrow.
- Settlement eligibility uses monotonic claim sequence snapshots, not wall-clock
  timestamp comparisons.

## Development

Prerequisites: Rust 1.70+, Solana CLI 1.18+, Anchor 0.31.1, Node.js 18+

```bash
# Build
anchor build

# Deploy to devnet with mandatory program upgrade-authority handoff.
# SQUADS_PROGRAM_UPGRADE_AUTHORITY must be a confirmed Squads-controlled address.
solana config set --url devnet
solana airdrop 2
export SQUADS_PROGRAM_UPGRADE_AUTHORITY=<confirmed-squads-controlled-authority>
npm run -s deploy:governed
npm run -s verify:upgrade-authority
```

Do not bootstrap or fund mainnet until `npm run -s verify:governance` passes. The
program upgrade authority is above `pool.master_wallet`; setting `pool.master_wallet`
to a Squads vault does not by itself prevent a deployer wallet from upgrading the
program.

## Testing from the command line

Tests use the same IDL as the web app (`ts/apps/web/lib/bunkercash.fixed.idl.json`) so they match the current program.

**1. Run Anchor tests (initialize, or skip if pool exists)**

```bash
cd rs
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
anchor test
```

Or run only the TypeScript test file:

```bash
cd rs
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/bunkercash.ts
```

**2. Bootstrap pool + optional buy (full manual flow)**

Creates the pool and mint if needed, creates ATAs, and optionally runs a test buy:

```bash
cd rs
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
export USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
export SQUADS_PROGRAM_UPGRADE_AUTHORITY=<confirmed-squads-controlled-authority>
npm run -s verify:governance
npx ts-node -P tsconfig.json scripts/bootstrap-fixed-price.ts
# Optional: run a test buy (e.g. 2.5 USDC worth)
TEST_BUY_USDC=2.5 npx ts-node -P tsconfig.json scripts/bootstrap-fixed-price.ts
```

**3. Update pool price (admin only)**

```bash
cd rs
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
NEW_PRICE_USDC_PER_TOKEN=1000000 npx ts-node -P tsconfig.json scripts/update-price.ts
```

## Events

The program emits the following events (see `ts/apps/web/lib/bunkercash.fixed.idl.json`):

- `LiquidityAdded`: emitted when the pool admin transfers USDC into the payout vault via `add_liquidity`.
