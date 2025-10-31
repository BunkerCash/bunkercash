'use client'

import { useState } from 'react'
import { CreditCard, Building } from 'lucide-react'

interface Loan {
  id: string
  loanId: string
  property: string
  address: string
  amount: string
  ltv: string
  outstanding: string
}

const mockLoans: Loan[] = [
  {
    id: '1',
    loanId: 'LOAN-2025-001',
    property: 'Property LLC - 123 Main St',
    address: '123 Main Street, CA 90210',
    amount: '$300,000',
    ltv: '60%',
    outstanding: '$280,000'
  },
  {
    id: '2',
    loanId: 'LOAN-2025-002',
    property: 'Property LLC - 456 Oak Ave',
    address: '456 Oak Avenue, NY 10001',
    amount: '$450,000',
    ltv: '65%',
    outstanding: '$420,000'
  },
  {
    id: '3',
    loanId: 'LOAN-2025-003',
    property: 'Property LLC - 789 Elm Blvd',
    address: '789 Elm Boulevard, TX 75001',
    amount: '$600,000',
    ltv: '58%',
    outstanding: '$590,000'
  },
]

export function AdminDeposit() {
  const [amount, setAmount] = useState('')
  const [selectedLoan, setSelectedLoan] = useState('')
  const [notes, setNotes] = useState('')

  const handleDeposit = () => {
    const loan = mockLoans.find((l) => l.id === selectedLoan)
    console.log('Depositing', amount, 'USDC')
    console.log('Linked to loan:', loan?.loanId)
    console.log('Notes:', notes)
    setAmount('')
    setSelectedLoan('')
    setNotes('')
  }

  const selectedLoanData = mockLoans.find((l) => l.id === selectedLoan)

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900/50 rounded-xl p-4 border border-neutral-800">
        <div className="flex items-start gap-3">
          <Building className="w-5 h-5 text-[#00FFB2] flex-shrink-0 mt-0.5" />
          <div className="text-sm text-neutral-300">
            <p className="font-medium text-white mb-1">Deposit Funds for Loan Repayment</p>
            <p className="text-xs text-neutral-500">
              Link deposits to existing loans for transparent fund tracking and repayment
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-neutral-400 mb-2">Amount (USDC)</label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="bg-transparent text-2xl font-medium w-full outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            Select Loan for Repayment
          </label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-neutral-500" />
              <select
                value={selectedLoan}
                onChange={(e) => setSelectedLoan(e.target.value)}
                className="bg-transparent text-sm w-full outline-none"
              >
                <option value="">Select loan ID</option>
                {mockLoans.map((loan) => (
                  <option key={loan.id} value={loan.id}>
                    {loan.loanId} - {loan.property}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedLoanData && (
            <div className="mt-3 text-xs bg-neutral-900/50 p-4 rounded-xl border border-neutral-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-neutral-500 mb-1">Property</div>
                  <div className="text-neutral-300">{selectedLoanData.property}</div>
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">Address</div>
                  <div className="text-neutral-300">{selectedLoanData.address}</div>
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">Loan Amount</div>
                  <div className="text-neutral-300">{selectedLoanData.amount}</div>
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">LTV</div>
                  <div className="text-neutral-300">{selectedLoanData.ltv}</div>
                </div>
                <div>
                  <div className="text-neutral-500 mb-1">Outstanding Balance</div>
                  <div className="text-[#00FFB2] font-semibold">{selectedLoanData.outstanding}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            Notes (Optional)
          </label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Monthly rent collection Q1 2025"
              rows={3}
              className="bg-transparent text-sm w-full outline-none resize-none"
            />
          </div>
        </div>

        <button
          onClick={handleDeposit}
          disabled={!amount || !selectedLoan}
          className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-4 rounded-xl transition-all"
        >
          Deposit Funds
        </button>
      </div>
    </div>
  )
}
