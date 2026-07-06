#!/usr/bin/env bash
set -euo pipefail

# Devnet env for BunkerCash scripts. Source before running scripts:
#   source scripts/devnet.env.sh
#
# Then run e.g.:
#   npx ts-node -P tsconfig.json scripts/bootstrap-fixed-price.ts
#   npx ts-node -P tsconfig.json scripts/check-pool-balances.ts
#   npm run -s e2e

export RPC="https://api.devnet.solana.com"
export ANCHOR_PROVIDER_URL="$RPC"
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

# USDC mint for the current devnet deployment.
# Set this explicitly before sourcing if your devnet deployment uses a custom mint.
export USDC_MINT="${USDC_MINT:-}"

# Optional: pool admin pubkey (e.g. your Phantom address). If unset, ANCHOR_WALLET becomes admin at bootstrap.
export ADMIN_PUBKEY="2epuXd6vjC4nYUEGZw8gSFhX3J73NDP5tpDtSf1XyqnQ"

# Required for governed deploys and governance verification.
# Confirm this Squads-controlled authority separately; it is not automatically
# the same address as ADMIN_PUBKEY or the pool master wallet.
export SQUADS_PROGRAM_UPGRADE_AUTHORITY="${SQUADS_PROGRAM_UPGRADE_AUTHORITY:-HMH1Ye2VJxWHfzRHNW6hU52gnsU1xpAsYa6t2ofxUrff}"

# Program ID (devnet) – for reference; scripts read from IDL.
# bRENT mint is derived from PDA seeds in the scripts; no env var needed.

echo "RPC=$RPC"
echo "ANCHOR_WALLET=$ANCHOR_WALLET"
echo "USDC_MINT=$USDC_MINT"
[ -n "${ADMIN_PUBKEY:-}" ] && echo "ADMIN_PUBKEY=$ADMIN_PUBKEY"
[ -n "${SQUADS_PROGRAM_UPGRADE_AUTHORITY:-}" ] && echo "SQUADS_PROGRAM_UPGRADE_AUTHORITY=$SQUADS_PROGRAM_UPGRADE_AUTHORITY"
