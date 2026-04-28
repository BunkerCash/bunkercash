#!/usr/bin/env bash
set -euo pipefail

export RPC="https://api.devnet.solana.com"
export ANCHOR_PROVIDER_URL="$RPC"
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"

# Custom Devnet USDC Mint (controlled by us)
export USDC_MINT="4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

echo "RPC=$RPC"
echo "ANCHOR_WALLET=$ANCHOR_WALLET"
echo "USDC_MINT=$USDC_MINT"
