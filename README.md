# BunkerCash Monorepo

**Work in progress - Pre-MVP stage**

## Solana Program

Fixed-price primary buy + fixed-price redemption program (no asset-backed accounting).

See [rs/README.md](./rs/README.md) for contract documentation.

## Web Interface

Next.js web app in `./ts/apps/web` for interacting with the on-chain program.

## Repository Structure

- `./rs`: Solana smart contracts (Anchor/Rust)
- `./ts`: TypeScript monorepo (Turborepo)
  - `./ts/apps/web`: Next.js web interface

## Tools

- Rust
- Bun
- Yarn