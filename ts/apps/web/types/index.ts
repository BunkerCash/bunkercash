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
  type: "deposit" | "withdrawal" | "investment" | "flowback";
  amount: number;
  project: string;
  timestamp: Date;
  metadata?: {
    hash: string;
    purchasePrice: string;
    description: string;
    collateralRatio: string;
    propertyAddress?: string;
  };
}
