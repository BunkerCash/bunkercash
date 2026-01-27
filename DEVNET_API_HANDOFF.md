## Devnet backend hand-off (v1)

### Deployed program (devnet)
- **Program ID**: `4or1tGUSc8tWixaMcb3yBSRmrjd7jZmC5PDWgAwRQUND`
- **Pool PDA** (seed `["pool"]`): `BRL4BFdDCFwTxoBYQQTxCpRYM3ZHC95wwFz9s4g9QRRy`
- **bRENT mint** (Token-2022): `3dV3PH7Zk9grQUz48Cms15YSAYXsrRLmvStiAS3MyzWn`
- **Token program**: Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`

### Frozen IDL (use this for frontend integration)
- **Path**: `ts/apps/web/lib/bunkercash.idl.json`

### Instruction name mapping (product → on-chain)
- **initialize** → `initialize`
- **buy_primary** → `deposit_usdc`
- **register_sell** → `file_claim`
- **add_liquidity** → `master_repay` *(requires a `master_withdraw` first to create a `Withdrawal` account)*
- **process_claims** → `settle_claims`

> Note: Anchor TS clients typically expose camelCase method names (e.g. `depositUsdc`) even if the IDL instruction is snake_case (`deposit_usdc`).

## API reference (accounts + signers)

### `initialize(master_wallet: Pubkey)`
- **Purpose**: Create the singleton `Pool` account and set the admin/master wallet.
- **Accounts**:
  - **pool** *(writable)*: PDA `findProgramAddressSync(["pool"], programId)`
  - **payer** *(writable, signer)*
  - **system_program**
- **Signers**: `payer`

### `deposit_usdc(usdc_amount: u64)` *(buy_primary)*
- **Purpose**: User deposits USDC into the pool and receives bRENT minted at NAV.
- **Accounts**:
  - **pool** *(writable)*: PDA `["pool"]`
  - **user_usdc** *(writable)*: user Token-2022 USDC token account
  - **user_brent** *(writable)*: user Token-2022 bRENT token account
  - **pool_usdc** *(writable)*: pool PDA Token-2022 USDC token account (ATA of pool PDA)
  - **brent_mint** *(writable)*: Token-2022 bRENT mint
  - **usdc_mint**: Token-2022 USDC mint (in tests we use a mock USDC mint)
  - **user** *(writable, signer)*
  - **token_program**: Token-2022 program id
  - **system_program**
- **Signers**: `user`

### `file_claim(brent_amount: u64)` *(register_sell)*
- **Purpose**: User burns bRENT and creates a Claim (redemption request) valued at current NAV.
- **Accounts**:
  - **pool** *(writable)*: PDA `["pool"]`
  - **claim** *(writable)*: PDA `["claim", user, pool.claim_counter]`
  - **user_brent** *(writable)*: user Token-2022 bRENT token account
  - **brent_mint** *(writable)*: Token-2022 bRENT mint
  - **user** *(writable, signer)*
  - **token_program**: Token-2022 program id
  - **system_program**
- **Signers**: `user`

### `master_repay(amount: u64)` *(add_liquidity)*
- **Purpose**: Admin adds USDC liquidity back to the pool (e.g., rent/profits) and increases NAV.
- **Precondition**: A `Withdrawal` must already exist. In this codebase, it’s created by calling `master_withdraw(...)` first.
- **Accounts**:
  - **pool** *(writable)*: PDA `["pool"]`
  - **withdrawal** *(writable)*: PDA `["withdrawal", withdrawal.id]`
  - **master_usdc** *(writable)*: admin Token-2022 USDC token account (source)
  - **pool_usdc** *(writable)*: pool PDA Token-2022 USDC token account (destination)
  - **usdc_mint**: Token-2022 USDC mint
  - **master_wallet** *(signer)*: must equal `pool.master_wallet`
  - **token_program**: Token-2022 program id
- **Signers**: `master_wallet`

### `settle_claims(_claim_indices: bytes)` *(process_claims)*
- **Purpose**: Admin processes pending claims and pays out from pool USDC (pro-rata if needed).
- **Accounts**:
  - **pool** *(writable)*: PDA `["pool"]`
  - **pool_usdc** *(writable)*: pool PDA Token-2022 USDC token account (source)
  - **usdc_mint**: Token-2022 USDC mint
  - **master_wallet** *(signer)*: must equal `pool.master_wallet`
  - **token_program**: Token-2022 program id
- **Signers**: `master_wallet`
- **Remaining accounts (required, in pairs)**:
  - For each claim to process, pass:
    1. **claim account** *(writable)*
    2. **user USDC token account** *(writable)* (destination)

## Devnet verification (successful txs)
These were executed via `rs/scripts/devnet-e2e.ts` on devnet:
- **deposit_usdc**: `2WNPDobWtvf3qDhk9CoeScJ8aC32qBJ5br9JdsmbwAW6nX7iAzU6ewMr5AJk3shR3fvK5h7bp8Sx6mfDuPhv7pHA`
- **master_withdraw** *(creates Withdrawal for repay)*: `XTsgkYTL8WV1G9npEhyHBXgUYjpeCcCynRTUtimAAXb3TumfRRKYubzHgTKhwmtP4PtwPipqsTQA4fcMeHKgagT`
- **master_repay** *(add_liquidity)*: `z9tdh39VJYSmSvd8ETFXFvSBifhechbPXzPXXum3HzL7GB9C6aVL58gnNTakRypWFPFKvYoVTTMaPGyh33NFuVY`
- **file_claim**: `2UmnzESvT3vY3zh4xtVpqcS1HRWgSFSrFVWn2oA3YbjP7Q1rTTi2XZW8iLMcYfCdQabCyZEq76VjwpEMcKfD7Px5`
- **settle_claims**: `54UhVZo4fhs68YV4YXktxiWNqjNHtPdWK5DPp7KKWnn8gd4F35f6yZSarHMkcZ8pth6dCVbWvuknMor4p6JAYuNg`

## How to run the devnet E2E locally
From `rs/`:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET="$HOME/.config/solana/id.json" yarn ts-node scripts/devnet-e2e.ts
```
