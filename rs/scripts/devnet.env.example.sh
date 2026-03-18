#!/usr/bin/env bash
set -euo pipefail

# Source this file to set up devnet env for scripts:
#   source scripts/devnet.env.example.sh
#
# Then run:
#   npx ts-node -P tsconfig.json scripts/check-pool-balances.ts

export RPC="https://api.devnet.solana.com"
export ANCHOR_PROVIDER_URL="$RPC"
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

# Choose the USDC mint your pool uses.
# - Token-2022 USDC supported by the current devnet deployment: Fr1JKnAfaspPUpsQBsYPfKmMak5tL6VXixibKJX5roJx
# - Circle devnet USDC (alternative): 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
# - Or set to your own devnet test mint.
export USDC_MINT="${USDC_MINT:-Fr1JKnAfaspPUpsQBsYPfKmMak5tL6VXixibKJX5roJx}"

# Optional: pool admin pubkey (e.g. your Phantom address). If unset, ANCHOR_WALLET becomes admin.
# export ADMIN_PUBKEY="YourPhantomOrAdminBase58Address"

echo "RPC=$RPC"
echo "ANCHOR_WALLET=$ANCHOR_WALLET"
echo "USDC_MINT=$USDC_MINT"
[ -n "${ADMIN_PUBKEY:-}" ] && echo "ADMIN_PUBKEY=$ADMIN_PUBKEY"

