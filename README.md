# BunkerCash Monorepo

**Work in progress - Pre-MVP stage**

## Solana Smart Contract (bRENT - Sample Pool)

bRENT is the first sample pool implementation. A Token-2022 based NAV system where users deposit USDC and receive bRENT tokens. Features include withdrawal claims with monthly settlement, master wallet operations with on-chain metadata tracking, and 0.25% transfer fees.

(very very early, pre-MVP stage)

**Devnet Deployment:**
- Program ID: `HaPTPu1ZWhMV1t7VtKDmytXpRhwhgxe3tdFMGpPueDsX`
- bRENT Token: `AEpJHgHRAH8a3oscNvaTG8LL5vEYgiTXNLxjAuJbHpvN`
- Pool PDA: `9nqr9Yq1kjtyjMtoPt1sz519qoouafwmAUk69ej4g4c2`

See [rs/README.md](./rs/README.md) for full contract documentation.

## Web Interface

Next.js web app in `./ts/apps/web` for interacting with the bRENT pool. React, TypeScript. Not connected with smart contract (yet).

## Repository Structure

- `./rs`: Solana smart contracts (Anchor/Rust)
- `./ts`: TypeScript monorepo (Turborepo)
  - `./ts/apps/web`: Next.js web interface

## Tools

- Rust
- Bun
- Yarn