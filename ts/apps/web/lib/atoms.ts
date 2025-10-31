import { atom } from 'jotai'

export interface Withdrawal {
  id: string
  amount: number
  requestedAt: Date
  maturityDate: Date
  status: 'pending' | 'partial' | 'completed'
  filledAmount?: number
}

export interface Transaction {
  id: string
  type: 'deposit' | 'withdrawal' | 'investment' | 'flowback'
  amount: number
  project: string
  timestamp: Date
  metadata?: {
    hash: string
    purchasePrice: string
    description: string
    collateralRatio: string
    propertyAddress?: string
  }
}

export const selectedFundAtom = atom<'bRENT' | 'bBUILD' | 'bPRIME'>('bRENT')
export const withdrawalsAtom = atom<Withdrawal[]>([
  {
    id: '1',
    amount: 1500,
    requestedAt: new Date('2025-10-15'),
    maturityDate: new Date('2025-11-01'),
    status: 'pending',
  },
  {
    id: '2',
    amount: 2500,
    requestedAt: new Date('2025-09-25'),
    maturityDate: new Date('2025-10-01'),
    status: 'completed',
    filledAmount: 2500,
  },
  {
    id: '3',
    amount: 1000,
    requestedAt: new Date('2025-09-10'),
    maturityDate: new Date('2025-10-01'),
    status: 'partial',
    filledAmount: 750,
  },
])
export const currentPriceAtom = atom<number>(1.0)
export const navAtom = atom<number>(20000)
export const issuedAmountAtom = atom<string>('$20,000')
export const reserveRatioAtom = atom<number>(0.25)
export const apyAtom = atom<number>(0.06)

export const transactionsAtom = atom<Transaction[]>([
  {
    id: '1',
    type: 'investment',
    amount: 15000,
    project: 'Downtown Austin Apartment Complex',
    timestamp: new Date('2025-10-20'),
    metadata: {
      hash: '7f4d8b3a9e2c1f6d5a8b4e3c2d1a9f8e7c6b5a4d3e2f1a9b8c7d6e5f4a3b2c1',
      purchasePrice: '$450,000',
      description: 'BunkerCash purchased 24-unit apartment complex via overcollateralized acquisition. Purchase price: $450k. Current market value: $680k (150% collateral ratio). Expected rental yield: 7.5% annually.',
      collateralRatio: '150%',
      propertyAddress: '1234 Congress Ave, Austin, TX 78701',
    },
  },
  {
    id: '2',
    type: 'deposit',
    amount: 5000,
    project: 'bRENT Pool',
    timestamp: new Date('2025-10-18'),
  },
  {
    id: '3',
    type: 'flowback',
    amount: 1200,
    project: 'Miami Beach Rental Property',
    timestamp: new Date('2025-10-15'),
    metadata: {
      hash: 'a3f2e1d9c8b7a6f5e4d3c2b1a9f8e7d6c5b4a3f2e1d9c8b7a6f5e4d3c2b1a9f8',
      purchasePrice: '$280,000',
      description: 'Monthly rental income from BunkerCash-owned beachfront condo. Purchased for $280k, current value: $405k (145% collateral). Current occupancy: 100%. Monthly rent collected: $3,800.',
      collateralRatio: '145%',
      propertyAddress: '5678 Ocean Dr, Miami Beach, FL 33139',
    },
  },
  {
    id: '4',
    type: 'withdrawal',
    amount: 2500,
    project: 'bRENT Pool',
    timestamp: new Date('2025-10-01'),
  },
  {
    id: '5',
    type: 'investment',
    amount: 8500,
    project: 'Seattle Multi-Family Duplex',
    timestamp: new Date('2025-09-25'),
    metadata: {
      hash: 'b9c8d7e6f5a4b3c2d1e9f8a7b6c5d4e3f2a1b9c8d7e6f5a4b3c2d1e9f8a7b6',
      purchasePrice: '$320,000',
      description: 'BunkerCash acquired duplex property with cash purchase. Acquisition cost: $320k. Post-renovation market value projection: $512k (160% collateral ratio). Expected completion: Q1 2026.',
      collateralRatio: '160%',
      propertyAddress: '9012 Pike St, Seattle, WA 98101',
    },
  },
])
