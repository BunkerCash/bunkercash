import { atom } from "jotai";
import { Withdrawal, Transaction, Loan } from "@/types";

// Re-export types so they can be imported from atoms
export type { Withdrawal, Transaction, Loan };

export const selectedFundAtom = atom<"bRENT" | "bBUILD" | "bPRIME">("bRENT");
export const withdrawalsAtom = atom<Withdrawal[]>([
  {
    id: "1",
    amount: 1500,
    requestedAt: new Date("2025-10-15"),
    maturityDate: new Date("2025-11-01"),
    status: "pending",
  },
  {
    id: "2",
    amount: 2500,
    requestedAt: new Date("2025-09-25"),
    maturityDate: new Date("2025-10-01"),
    status: "completed",
    filledAmount: 2500,
  },
  {
    id: "3",
    amount: 1000,
    requestedAt: new Date("2025-09-10"),
    maturityDate: new Date("2025-10-01"),
    status: "partial",
    filledAmount: 750,
  },
])
export const currentPriceAtom = atom<number>(1.0)
export const navAtom = atom<number>(20000)
export const issuedAmountAtom = atom<string>('$20,000')
export const reserveRatioAtom = atom<number>(0.25)
export const apyAtom = atom<number>(0.06)

export const loansAtom = atom<Loan[]>([
  {
    id: "1",
    loanId: "LOAN-2025-001",
    property: "Property LLC - 123 Main St",
    address: "123 Main Street, CA 90210",
    amount: "$300,000",
    ltv: "60%",
    outstanding: "$280,000",
  },
  {
    id: "2",
    loanId: "LOAN-2025-002",
    property: "Property LLC - 456 Oak Ave",
    address: "456 Oak Avenue, NY 10001",
    amount: "$450,000",
    ltv: "65%",
    outstanding: "$420,000",
  },
  {
    id: "3",
    loanId: "LOAN-2025-003",
    property: "Property LLC - 789 Elm Blvd",
    address: "789 Elm Boulevard, TX 75001",
    amount: "$600,000",
    ltv: "58%",
    outstanding: "$590,000",
  },
])

