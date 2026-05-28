// Canonical, user-facing definitions for pool/trading terms. Kept in one place
// so the same wording is reused across Home, the trade pages, and tooltips.
export const GLOSSARY = {
  poolNav:
    "Net Asset Value — the protocol's on-chain accounting of the total USDC value backing all BunkerCash tokens.",
  liquidUsdc:
    "USDC sitting in the payout vault right now, available to settle sell requests immediately.",
  referenceValue:
    "The pool's current Net Asset Value (NAV), read directly from the on-chain pool account.",
  liquidSize:
    "USDC currently available in the payout vault to settle sells. Sells larger than this settle over time as liquidity returns.",
  referenceRate:
    "USDC value of one BunkerCash token = available NAV ÷ token supply. Buys and sells both use this protocol-defined rate.",
  pendingClaims:
    "Total USDC of sell requests that have been filed but not yet settled.",
  totalSupply:
    "All BunkerCash tokens that currently exist, including tokens held in escrow for pending sell requests. Escrowed tokens are only burned when a sell settles.",
  circulatingSupply:
    "BunkerCash freely held by users. Filing a sell request moves tokens into escrow and lowers circulating supply; cancelling the request restores them.",
} as const;
