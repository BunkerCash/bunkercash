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

# USDC mint (devnet USDC-Dev)
export USDC_MINT="${USDC_MINT:-Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr}"

# Optional: pool admin pubkey (e.g. your Phantom address). If unset, ANCHOR_WALLET becomes admin at bootstrap.
export ADMIN_PUBKEY="Hmod5q5Egi1yqiRCAAgZBh1iD8o8kALVQV8WKBM84JhK"

# Program ID (devnet) – for reference; scripts read from IDL.
# bRENT mint address on devnet — must be set before running init:metadata / update:metadata
export BRENT_MINT="${BRENT_MINT:-<your-devnet-brent-mint-address>}"

echo "RPC=$RPC"
echo "ANCHOR_WALLET=$ANCHOR_WALLET"
echo "USDC_MINT=$USDC_MINT"
echo "BUNKERCASH_PROGRAM_ID=$BUNKERCASH_PROGRAM_ID"
[ -n "${ADMIN_PUBKEY:-}" ] && echo "ADMIN_PUBKEY=$ADMIN_PUBKEY"
