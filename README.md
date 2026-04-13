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

## Security

Never commit live Solana keypairs or wallet JSON files. If a keypair was ever committed, deleting it from the current branch is not sufficient because the secret remains in git history.

See [SECURITY.md](./SECURITY.md) for the remediation steps and run `node scripts/check-no-keypairs.mjs` before pushing wallet-related changes.
