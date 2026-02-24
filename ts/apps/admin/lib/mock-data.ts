// ── Event Log ──

export type EventType = "Buy" | "Claim" | "Register Sell" | "Liquidity";

export interface ProgramEvent {
  id: string;
  type: EventType;
  time: Date;
  wallet: string;
  amount: number;
  currency: "BNKR" | "USDC";
  txHash: string;
}

export const mockEvents: ProgramEvent[] = [
  {
    id: "1",
    type: "Buy",
    time: new Date("2026-02-24T15:04:00"),
    wallet: "ehA4kF9Dz2mN3qR7wYpLcXvT8jB5sU6nH2E89",
    amount: 341.78,
    currency: "BNKR",
    txHash: "ri5y0sxiK8mN3qR7wYpLcXvT8jB5sU6nH2E89a",
  },
  {
    id: "2",
    type: "Buy",
    time: new Date("2026-02-24T13:18:00"),
    wallet: "1wWbkM9Tz5nW3eJ8xYdAhF6gQ4pLcQiV5",
    amount: 322.86,
    currency: "BNKR",
    txHash: "f08i2rkuW5nR7jT3eA9dYhF6gQ4pLcVuS1K0ib",
  },
  {
    id: "3",
    type: "Claim",
    time: new Date("2026-02-24T12:40:00"),
    wallet: "5rtCnP6Wz8kM2eR5xYdAhF3gQ7pLgeQK",
    amount: 29.58,
    currency: "BNKR",
    txHash: "l4jjg5glR2mT5wA9jY8dXeF6gQ4hLcVuS1K0ib",
  },
  {
    id: "4",
    type: "Register Sell",
    time: new Date("2026-02-24T12:04:00"),
    wallet: "pryNkR8Tz3nW5eM9xYbAhP4gQ7jLqYcd",
    amount: 499.07,
    currency: "BNKR",
    txHash: "8lr9k813P7nR2T5eA8jY3dXhF6gQ1pLcVuS0K0",
  },
  {
    id: "5",
    type: "Claim",
    time: new Date("2026-02-24T11:34:00"),
    wallet: "7am3kF9Dz2mN3qR7wYpLcXvT8jEABJ",
    amount: 170.19,
    currency: "BNKR",
    txHash: "5jkute7uK8mN3qR7wYpLcXvT8jB5sU6nH2E89a",
  },
  {
    id: "6",
    type: "Register Sell",
    time: new Date("2026-02-24T11:10:00"),
    wallet: "SuWtkM9Tz5nW3eJ8xYdAhF6gQ4pvQmq",
    amount: 278.92,
    currency: "BNKR",
    txHash: "tcldbtafW5nR7jT3eA9dYhF6gQ4pLcVuS1K0ib",
  },
  {
    id: "7",
    type: "Claim",
    time: new Date("2026-02-24T10:40:00"),
    wallet: "rGKgnP6Wz8kM2eR5xYdAhF3gQ7pUFBB",
    amount: 426.65,
    currency: "BNKR",
    txHash: "8ml39vnvR2mT5wA9jY8dXeF6gQ4hLcVuS1K0ib",
  },
  {
    id: "8",
    type: "Buy",
    time: new Date("2026-02-24T06:43:00"),
    wallet: "g5bKkR8Tz3nW5eM9xYbAhP4gQ7j5D2t",
    amount: 354.71,
    currency: "BNKR",
    txHash: "x7h8l30kP7nR2T5eA8jY3dXhF6gQ1pLcVuS0K0",
  },
  {
    id: "9",
    type: "Liquidity",
    time: new Date("2026-02-24T04:39:00"),
    wallet: "Mx1QkF9Dz2mN3qR7wYpLcXvT8jqGMh",
    amount: 437.35,
    currency: "USDC",
    txHash: "ya4qpsfnK8mN3qR7wYpLcXvT8jB5sU6nH2E89a",
  },
  {
    id: "10",
    type: "Liquidity",
    time: new Date("2026-02-24T03:42:00"),
    wallet: "JQunkM9Tz5nW3eJ8xYdAhF6gQ4pvZRj",
    amount: 470.91,
    currency: "USDC",
    txHash: "9behykjbW5nR7jT3eA9dYhF6gQ4pLcVuS1K0ib",
  },
  {
    id: "11",
    type: "Buy",
    time: new Date("2026-02-24T01:35:00"),
    wallet: "T7XtnP6Wz8kM2eR5xYdAhF3gQ7pnNp9",
    amount: 264.17,
    currency: "BNKR",
    txHash: "i722chj3R2mT5wA9jY8dXeF6gQ4hLcVuS1K0ib",
  },
  {
    id: "12",
    type: "Register Sell",
    time: new Date("2026-02-23T18:24:00"),
    wallet: "7KeBkR8Tz3nW5eM9xYbAhP4gQ7jkFZb",
    amount: 86.75,
    currency: "BNKR",
    txHash: "ghd41ob4P7nR2T5eA8jY3dXhF6gQ1pLcVuS0K0",
  },
  {
    id: "13",
    type: "Liquidity",
    time: new Date("2026-02-23T17:36:00"),
    wallet: "Ymk2kF9Dz2mN3qR7wYpLcXvT8jBaj9",
    amount: 198.81,
    currency: "USDC",
    txHash: "mh8hg6syK8mN3qR7wYpLcXvT8jB5sU6nH2E89a",
  },
  {
    id: "14",
    type: "Buy",
    time: new Date("2026-02-23T16:27:00"),
    wallet: "9e1BkM9Tz5nW3eJ8xYdAhF6gQ4pSpmo",
    amount: 52.09,
    currency: "BNKR",
    txHash: "sdw5xv08W5nR7jT3eA9dYhF6gQ4pLcVuS1K0ib",
  },
  {
    id: "15",
    type: "Register Sell",
    time: new Date("2026-02-23T15:27:00"),
    wallet: "1sT5nP6Wz8kM2eR5xYdAhF3gQ7pNKMz",
    amount: 208.55,
    currency: "BNKR",
    txHash: "i2rmr7psR2mT5wA9jY8dXeF6gQ4hLcVuS1K0ib",
  },
  {
    id: "16",
    type: "Claim",
    time: new Date("2026-02-23T05:06:00"),
    wallet: "CJSkkR8Tz3nW5eM9xYbAhP4gQ7jXyHW",
    amount: 96.11,
    currency: "BNKR",
    txHash: "gbqqwhwqP7nR2T5eA8jY3dXhF6gQ1pLcVuS0K0",
  },
];

// ── Purchase Limits ──

export const mockPurchaseLimits = {
  currentVolume: 287450,
  maxVolume: 500000,
  utilizationPercent: 57.5,
  isActive: true,
};

// ── Claims & Payouts ──

export type ClaimStatus = "open" | "closed";

export interface PayoutEntry {
  date: Date;
  amountUsdc: number;
  txHash: string;
}

export interface ClaimEntry {
  id: string;
  wallet: string;
  lockedBnkr: number;
  paidUsdc: number;
  remainingUsdc: number;
  status: ClaimStatus;
  progressPercent: number;
  createdAt: Date;
  lastPayoutAt: Date | null;
  payouts: PayoutEntry[];
}

export const mockClaims: ClaimEntry[] = [
  {
    id: "1",
    wallet: "A3xRkF9Dz2mN3qR7wYpLcXvT8jB5s9pQk",
    lockedBnkr: 1500,
    paidUsdc: 900,
    remainingUsdc: 600,
    status: "open",
    progressPercent: 60,
    createdAt: new Date("2026-02-21"),
    lastPayoutAt: new Date("2026-02-23"),
    payouts: [
      {
        date: new Date("2026-02-22T15:04:00"),
        amountUsdc: 500,
        txHash: "tx1abcD9Tz5nW3eJ8xYdAhF6gQ4pLcVuS1K0",
      },
      {
        date: new Date("2026-02-23T15:04:00"),
        amountUsdc: 400,
        txHash: "tx2defR8Tz3nW5eM9xYbAhP4gQ7jLcVuS0K0",
      },
    ],
  },
  {
    id: "2",
    wallet: "Fp7WkM9Tz5nW3eJ8xYdAhF6gQ4pLcmN2s",
    lockedBnkr: 3200,
    paidUsdc: 3200,
    remainingUsdc: 0,
    status: "closed",
    progressPercent: 100,
    createdAt: new Date("2026-02-15"),
    lastPayoutAt: new Date("2026-02-20"),
    payouts: [
      {
        date: new Date("2026-02-17T10:30:00"),
        amountUsdc: 1600,
        txHash: "tx3ghiK8mN3qR7wYpLcXvT8jB5sU6nH2E89a",
      },
      {
        date: new Date("2026-02-20T14:15:00"),
        amountUsdc: 1600,
        txHash: "tx4jklW5nR7jT3eA9dYhF6gQ4pLcVuS1K0ib",
      },
    ],
  },
  {
    id: "3",
    wallet: "Kd9LnP6Wz8kM2eR5xYdAhF3gQ7pLcvX4r",
    lockedBnkr: 800,
    paidUsdc: 200,
    remainingUsdc: 600,
    status: "open",
    progressPercent: 25,
    createdAt: new Date("2026-02-22"),
    lastPayoutAt: new Date("2026-02-23"),
    payouts: [
      {
        date: new Date("2026-02-23T09:45:00"),
        amountUsdc: 200,
        txHash: "tx5mnoR2mT5wA9jY8dXeF6gQ4hLcVuS1K0ib",
      },
    ],
  },
  {
    id: "4",
    wallet: "Qs2MkR8Tz3nW5eM9xYbAhP4gQ7jLcbH8t",
    lockedBnkr: 5000,
    paidUsdc: 0,
    remainingUsdc: 5000,
    status: "open",
    progressPercent: 0,
    createdAt: new Date("2026-02-24"),
    lastPayoutAt: null,
    payouts: [],
  },
];
