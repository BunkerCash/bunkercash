# BunkerCash – Commands (Start to End)

All commands assume you are in the `rs` directory and use the **pool admin** wallet for admin-only steps. For **mainnet**, switch `ANCHOR_PROVIDER_URL` and `solana config` to a mainnet RPC and set `USDC_MINT` to mainnet USDC.

---

## 1. Environment (one-time per shell)

```bash
cd rs
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
export USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Or source the example env:

```bash
cd rs
source scripts/devnet.env.example.sh
```

---

## 2. Build & Deploy (admin / deployer)

```bash
cd rs
anchor build
solana config set --url devnet
solana airdrop 2
anchor deploy
```

---

## 3. Bootstrap pool (admin, first time only)

Creates the pool and BunkerCash mint if they don’t exist. The wallet in `ANCHOR_WALLET` becomes **pool admin** (stored in `PoolState.admin`).

```bash
cd rs
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
export USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
npx ts-node -P tsconfig.json scripts/bootstrap-fixed-price.ts
```

Optional: run a test buy during bootstrap (e.g. 2.5 USDC worth of tokens):

```bash
TEST_BUY_USDC=2.5 npx ts-node -P tsconfig.json scripts/bootstrap-fixed-price.ts
```

---

## 4. User: Buy (buy_primary)

User spends USDC and receives BunkerCash at the current pool price.

### Via script (bootstrap script with test buy)

```bash
TEST_BUY_USDC=2.5 npx ts-node -P tsconfig.json scripts/bootstrap-fixed-price.ts
```

### Via E2E script (user wallet = ANCHOR_WALLET)

```bash
export BUY_USDC=1
npm run -s e2e
```

Set `BUY_USDC=0` to skip buy and only run sell / liquidity / process_claims in the e2e flow.

### Via web app

Use the bRENT/Buy UI: connect wallet, enter USDC amount, submit. The app calls `buy_primary`.

---

## 5. User: Sell (register_sell)

User locks BunkerCash into the escrow vault and gets a claim. No burn; payouts happen when admin runs `process_claims`.

### Via script (base units; 9 decimals)

```bash
cd rs
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
export SELL_TOKEN_AMOUNT=1000000000
npx ts-node -P tsconfig.json scripts/register-sell-escrow.ts
```

`SELL_TOKEN_AMOUNT=1000000000` = 1.0 token (9 decimals).

### Via E2E script (human-readable amounts)

```bash
export SELL_BNKR=0.1
# Optional second sell (different amount):
export SELL_BNKR_1=0.1
export SELL_BNKR_2=0.3
npm run -s e2e
```

### Via web app

Use the Sell tab: connect wallet, enter token amount, submit. The app calls `register_sell`.

---

## 6. Admin: Update price (update_price)

Only the pool admin can change the fixed price (USDC per token, in base units).

```bash
cd rs
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
export NEW_PRICE_USDC_PER_TOKEN=1000000
npx ts-node -P tsconfig.json scripts/update-price.ts
```

Example: `1000000` = 1 USDC (6 decimals) per 1 token (9 decimals).

---

## 7. Admin: Add liquidity (add_liquidity)

Admin sends USDC into the payout vault so it can be distributed to sell claimants. No standalone script; use the E2E script with `LIQ_USDC`:

```bash
cd rs
source scripts/devnet.env.example.sh
export ANCHOR_WALLET=~/.config/solana/id.json   # must be pool admin
export LIQ_USDC=10
npm run -s e2e
```

This runs the full e2e flow (buy/sell if configured) and also calls `add_liquidity` with 10 USDC. To only add liquidity and process claims, you can set `BUY_USDC=0` and optionally adjust sell amounts.

---

## 8. Admin: Process claims (process_claims)

Admin triggers pro-rata USDC payouts from the payout vault to all open claims (and updates each claim’s `usdc_paid`). The E2E script does this when there are open claims and liquidity.

```bash
cd rs
source scripts/devnet.env.example.sh
export ANCHOR_WALLET=~/.config/solana/id.json   # must be pool admin
export BUY_USDC=0
export LIQ_USDC=5
npm run -s e2e
```

The script fetches open claims, ensures user USDC ATAs exist, then calls `process_claims` with the required remaining accounts. For production, use a dedicated admin tool or script that builds the same account list.

---

## 9. Admin: Init token metadata (init_mint_metadata)

So wallets (e.g. Phantom) show the token name/symbol/icon instead of “Unknown Token”. Admin only, once per mint.

```bash
cd rs
source scripts/devnet.env.example.sh
export TOKEN_NAME="bRENT"
export TOKEN_SYMBOL="bRENT"
export TOKEN_URI="https://your-domain.com/brent.json"
npm run -s init:metadata
```

`TOKEN_URI` must be a publicly reachable JSON (Metaplex-style: `name`, `symbol`, `image`, etc.).

---

## 10. Utility: Check pool & balances

```bash
cd rs
source scripts/devnet.env.example.sh
npx ts-node -P tsconfig.json scripts/check-pool-balances.ts
```

Or:

```bash
npm run -s check:pool
```

Prints pool PDA, pool state (price, claim_counter), and token balances (user USDC, payout vault, user BNKR, escrow vault).

---

## 11. Utility: Inspect open claims

```bash
cd rs
source scripts/devnet.env.example.sh
npx ts-node -P tsconfig.json scripts/inspect-open-claims.ts
```

Optional: `TOP_N=20` to show top 20 by locked amount (default 10).

---

## Quick reference

| Role   | Action           | Command / script / app |
|--------|------------------|-------------------------|
| User   | Buy (USDC → BNKR)| Web app, or `TEST_BUY_USDC=…` bootstrap, or `BUY_USDC=…` e2e |
| User   | Sell (lock BNKR) | Web app, or `register-sell-escrow.ts` (SELL_TOKEN_AMOUNT), or e2e (SELL_BNKR) |
| Admin  | Update price     | `update-price.ts` (NEW_PRICE_USDC_PER_TOKEN) |
| Admin  | Add liquidity    | e2e with `LIQ_USDC=…` (wallet = admin) |
| Admin  | Process claims   | e2e (wallet = admin; script calls process_claims when claims exist) |
| Admin  | Init metadata    | `npm run -s init:metadata` (TOKEN_NAME, TOKEN_SYMBOL, TOKEN_URI) |
| Anyone | Check balances   | `check-pool-balances.ts` / `npm run -s check:pool` |
| Anyone | List open claims| `inspect-open-claims.ts` |

---

## Summary flow

1. **Deploy** program and **bootstrap** pool (admin wallet becomes pool admin).
2. **Users** buy (USDC → BunkerCash) and sell (lock BunkerCash → claim).
3. **Admin** adds USDC to the payout vault (`add_liquidity` via e2e with `LIQ_USDC`).
4. **Admin** runs `process_claims` (e2e or custom tool) to distribute USDC pro-rata to claimants.
5. **Admin** can update price anytime (`update-price.ts`) and set token metadata once (`init:metadata`).
