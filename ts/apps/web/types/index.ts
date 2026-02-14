export interface Loan {
  id: string;
  loanId: string;
  property: string;
  address: string;
  amount: string;
  ltv: string;
  outstanding: string;
}

export interface Withdrawal {
  id: string;
  amount: number;
  requestedAt: Date;
  maturityDate: Date;
  status: "pending" | "partial" | "completed";
  filledAmount?: number;
}

export interface Transaction {
  id: string;
  type: "investment" | "withdrawal";
  amount: number; // USDC amount
  tokenAmount?: number; // BNKR token amount
  timestamp: Date;
  txSignature?: string; // Solana transaction signature for explorer link
}
