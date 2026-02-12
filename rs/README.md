# BunkerCash - Solana Program

Fixed-price primary buy + irreversible sell registration (escrow lock; no burn).

## Development

Prerequisites: Rust 1.70+, Solana CLI 1.18+, Anchor 0.31.1, Node.js 18+

```bash
# Build
anchor build

# Deploy to devnet
solana config set --url devnet
solana airdrop 2
anchor deploy
```

## Testing from the command line

Tests use the same IDL as the web app (`ts/apps/web/lib/bunkercash.fixed.idl.json`) so they match the current program (initialize, buy_primary, update_price, register_sell).

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
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/bunkercash.ts
```

**2. Bootstrap pool + optional buy (full manual flow)**

Creates the pool and mint if needed, creates ATAs, and optionally runs a test buy:

```bash
cd rs
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
export USDC_MINT=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr
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

