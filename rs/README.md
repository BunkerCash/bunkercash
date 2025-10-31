# bRENT - Solana Smart Contract

**Work in progress - Pre-MVP stage. This is the first sample pool implementation.**

Token-2022 based NAV system for managing bRENT tokens with withdrawal claims and on-chain metadata tracking.

## Devnet Deployment

- Program ID: `HaPTPu1ZWhMV1t7VtKDmytXpRhwhgxe3tdFMGpPueDsX`
- bRENT Token: `AEpJHgHRAH8a3oscNvaTG8LL5vEYgiTXNLxjAuJbHpvN`
- Pool PDA: `9nqr9Yq1kjtyjMtoPt1sz519qoouafwmAUk69ej4g4c2`
- Master Wallet: `6XxrfjnRTeHqh4nmJ5EmDqvPf39mCRfmrBGEVNpUL7EC`

Token-2022 with 0.25% transfer fee, 6 decimals. Pool PDA is mint authority.

## How It Works

Users deposit USDC and receive bRENT at NAV price (`Total Supply / NAV`). Users burn bRENT to file withdrawal claims. Monthly settlement distributes available USDC proportionally. Master wallet withdrawals store metadata hash on-chain (actual metadata in backend), repayments reference withdrawal ID and increase NAV.

## Core Structures

```rust
pub struct Pool {
    pub master_wallet: Pubkey,
    pub nav: u64,
    pub total_brent_supply: u64,
    pub total_pending_claims: u64,
    pub claim_counter: u64,
    pub withdrawal_counter: u64,
    pub bump: u8,
}

pub struct Withdrawal {
    pub id: u64,
    pub amount: u64,
    pub remaining: u64,
    pub metadata_hash: [u8; 32],  // SHA-256 hash of metadata
    pub timestamp: i64,
    pub bump: u8,
}

pub struct Claim {
    pub user: Pubkey,
    pub usdc_amount: u64,
    pub timestamp: i64,
    pub processed: bool,
    pub paid_amount: u64,
    pub bump: u8,
}
```

## Instructions

### Initialize Pool

```typescript
await program.methods
  .initialize(masterWallet)
  .accounts({ payer: wallet.publicKey })
  .rpc();
```

### Deposit USDC

First deposit 1:1, subsequent deposits: `bRENT_minted = (USDC_amount * total_supply) / NAV`

```typescript
await program.methods
  .depositUsdc(usdcAmount)
  .accounts({
    user: wallet.publicKey,
    userUsdc: userUsdcAccount,
    userBrent: userBrentAccount,
    poolUsdc: poolUsdcAccount,
    brentMint: brentMint,
    usdcMint: usdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .rpc();
```

### File Claim

```typescript
await program.methods
  .fileClaim(brentAmount)
  .accounts({
    user: wallet.publicKey,
    userBrent: userBrentAccount,
    brentMint: brentMint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .rpc();
```

### Settle Claims

Pays all claims if sufficient USDC, otherwise pro-rata.

```typescript
await program.methods
  .settleClaims([])
  .accounts({
    masterWallet: masterWallet,
    poolUsdc: poolUsdcAccount,
    usdcMint: usdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .remainingAccounts([
    { pubkey: claim1, isWritable: true, isSigner: false },
    { pubkey: userUsdc1, isWritable: true, isSigner: false },
    // ...more claim/usdc pairs
  ])
  .rpc();
```

### Master Withdraw

Creates withdrawal account with metadata hash. Metadata stored off-chain, hash proves integrity.

```typescript
// In your backend: hash the metadata
const metadata = { purpose: "Q1 Marketing", invoice: "INV-001", amount: 10000 };
const metadataHash = sha256(JSON.stringify(metadata));

await program.methods
  .masterWithdraw(amount, Array.from(metadataHash))
  .accounts({
    masterWallet: masterWallet,
    poolUsdc: poolUsdcAccount,
    masterUsdc: masterUsdcAccount,
    usdcMint: usdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .rpc();

// Store in backend: { withdrawal_id, metadata, hash }
```

### Master Repay

Repays specific withdrawal from earnings, increases NAV.

```typescript
const [withdrawalPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("withdrawal"), Buffer.from(withdrawalId.toString())],
  program.programId
);

await program.methods
  .masterRepay(amount)
  .accounts({
    masterWallet: masterWallet,
    withdrawal: withdrawalPda,
    masterUsdc: masterUsdcAccount,
    poolUsdc: poolUsdcAccount,
    usdcMint: usdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .rpc();
```

### Master Cancel Withdrawal

Returns funds from asset sale, NAV unchanged (asset converted back to USDC).

```typescript
const [withdrawalPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("withdrawal"), Buffer.from(withdrawalId.toString())],
  program.programId
);

await program.methods
  .masterCancelWithdrawal(amount)
  .accounts({
    masterWallet: masterWallet,
    withdrawal: withdrawalPda,
    masterUsdc: masterUsdcAccount,
    poolUsdc: poolUsdcAccount,
    usdcMint: usdcMint,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
  })
  .rpc();
```

## Querying

```typescript
// Pool state
const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from("pool")], program.programId);
const pool = await program.account.pool.fetch(poolPda);

// Withdrawal (verify hash matches backend metadata)
const [withdrawalPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("withdrawal"), Buffer.from(withdrawalId.toString())],
  program.programId
);
const withdrawal = await program.account.withdrawal.fetch(withdrawalPda);
const backendMetadata = await fetch(`/api/withdrawals/${withdrawalId}`);
const computedHash = sha256(JSON.stringify(backendMetadata));
assert(Buffer.from(withdrawal.metadataHash).equals(computedHash));

// Claim
const [claimPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("claim"), userPubkey.toBuffer(), Buffer.from(claimCounter.toString())],
  program.programId
);
const claim = await program.account.claim.fetch(claimPda);
```

## Development

Prerequisites: Rust 1.70+, Solana CLI 1.18+, Anchor 0.31.1, Node.js 18+

```bash
# Build
anchor build

# Deploy to devnet
solana config set --url devnet
solana airdrop 2
anchor deploy

# Setup
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-node scripts/setup-brent-mint.ts

ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-node scripts/initialize-pool.ts
```

## Events

```rust
pub struct MasterWithdrawalEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub metadata_hash: [u8; 32],
    pub timestamp: i64,
}

pub struct MasterRepaymentEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub remaining: u64,
    pub new_nav: u64,
    pub timestamp: i64,
}

pub struct MasterCancelWithdrawalEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub remaining: u64,
    pub nav: u64,
    pub timestamp: i64,
}
```

