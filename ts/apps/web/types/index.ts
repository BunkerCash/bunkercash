export type SellStatus = "pending" | "partial" | "settled" | "cancelled";

export interface Transaction {
  id: string;
  type: "investment" | "withdrawal";
  amount: number; // USDC amount (for sells: actually-settled USDC)
  tokenAmount?: number; // BNKR token amount
  timestamp: Date;
  txSignature?: string; // Solana transaction signature for explorer link
  status?: SellStatus; // settlement state for sells
  requestedUsdc?: number; // USDC requested (sells)
  settledUsdc?: number; // USDC settled so far (sells)
}
