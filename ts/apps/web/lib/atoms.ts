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



