'use client'

import { useState } from 'react'
import { FileText, AlertCircle, Building2, MapPin } from 'lucide-react'

export function AdminWithdraw() {
  const [amount, setAmount] = useState('')
  const [documentHash, setDocumentHash] = useState('')
  const [propertyAddress, setPropertyAddress] = useState('')
  const [propertyValue, setPropertyValue] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [ltv, setLtv] = useState('')
  const [description, setDescription] = useState('')

  const handleWithdraw = () => {
    console.log('Withdrawing', amount, 'USDC')
    console.log('Document hash:', documentHash)
    console.log('Property:', propertyAddress)
    console.log('Property value:', propertyValue)
    console.log('Loan amount:', loanAmount)
    console.log('LTV:', ltv)
    console.log('Description:', description)

    setAmount('')
    setDocumentHash('')
    setPropertyAddress('')
    setPropertyValue('')
    setLoanAmount('')
    setLtv('')
    setDescription('')
  }

  return (
    <div className="space-y-6">
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-200/80">
            <p className="font-medium text-yellow-300 mb-1">Authorized Withdrawals Only</p>
            <p className="text-xs text-yellow-200/60">
              All withdrawals must be backed by notarized documents proving secured and overcollateralized debt
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
            Document Hash (SHA-256)
          </label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-neutral-500" />
              <input
                type="text"
                value={documentHash}
                onChange={(e) => setDocumentHash(e.target.value)}
                placeholder="Hash of notarized digital document"
                className="bg-transparent text-sm font-mono w-full outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-600 mt-2">
            SHA-256 hash of the notarized document proving loan security and overcollateralization
          </p>
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            Property Address
          </label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-neutral-500" />
              <input
                type="text"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                placeholder="123 Main Street, City, State, ZIP"
                className="bg-transparent text-sm w-full outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Property Value
            </label>
            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
              <input
                type="text"
                value={propertyValue}
                onChange={(e) => setPropertyValue(e.target.value)}
                placeholder="$500,000"
                className="bg-transparent text-sm w-full outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-2">
              Loan Amount
            </label>
            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
              <input
                type="text"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                placeholder="$300,000"
                className="bg-transparent text-sm w-full outline-none"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            Loan-to-Value Ratio (LTV)
          </label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-neutral-500" />
              <input
                type="text"
                value={ltv}
                onChange={(e) => setLtv(e.target.value)}
                placeholder="60%"
                className="bg-transparent text-sm w-full outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-neutral-600 mt-2">
            Must be ≤70% for overcollateralization
          </p>
        </div>

        <div>
          <label className="block text-sm text-neutral-400 mb-2">
            Usage Description
          </label>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Property acquisition - secured loan at 60% LTV for residential rental property"
              rows={4}
              className="bg-transparent text-sm w-full outline-none resize-none"
            />
          </div>
        </div>

        <button
          onClick={handleWithdraw}
          disabled={!amount || !documentHash || !propertyAddress || !propertyValue || !loanAmount || !ltv || !description}
          className="w-full bg-[#00FFB2] hover:bg-[#00FFB2]/90 disabled:bg-neutral-800 disabled:text-neutral-600 text-black font-semibold py-4 rounded-xl transition-all"
        >
          Execute Withdrawal
        </button>
      </div>
    </div>
  )
}
