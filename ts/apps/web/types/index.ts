export interface Transaction {
  id: string;
  type: "investment" | "withdrawal";
  amount: number; // USDC amount
  tokenAmount?: number; // BNKR token amount
  timestamp: Date;
  txSignature?: string; // Solana transaction signature for explorer link
}
