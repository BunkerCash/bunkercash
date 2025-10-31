# BunkerCash Web Application

Semi-liquid, DeFi-native real-estate yield tokens on Solana.

## Features

### Main Landing Page (`/`)
- Hero section with BunkerCash branding
- Three fund cards:
  - **bRENT** (active) - 6% APY - Real estate rental yield
  - **bBUILD** (coming soon) - Project development
  - **bPRIME** (coming soon) - Diversified basket
- Sticky header with navigation and Solana wallet connect
- Black design with `#00FFB2` (Bunker Green) accents

### bRENT Page (`/brent`)
- **Swap Interface**:
  - Mint bRENT tokens by swapping USDC
  - Live price display (NAV vs current price)
  - Clean input fields with token badges
  - Primary market execution at NAV price

- **Withdrawal Interface**:
  - Schedule new withdrawals
  - View withdrawal history with status tracking (pending/partial/completed)
  - Maturity date display
  - Monthly redemption window information

- **Pool Stats Sidebar**:
  - Net Asset Value (NAV)
  - Projected APY (6%)
  - Reserve ratio (25%)
  - Protocol information

### Admin Page (`/admin`)
- **Withdraw USDC Tab**:
  - Amount input
  - Document hash field (for notarized loan documents)
  - Usage description textarea
  - Security warnings about overcollateralized loans

- **Deposit Funds Tab**:
  - Amount input
  - Entity selector (links to property LLCs)
  - Optional notes field
  - Entity details display

## Tech Stack

- **Next.js 15** with App Router
- **Tailwind CSS 4** for styling
- **Jotai** for state management
- **Solana Wallet Adapter** for wallet connection
- **TypeScript** for type safety
- **Lucide React** for icons

## Color Scheme

- Background: `#000000` (black)
- Text: `#ffffff` (white)
- Accent: `#00FFB2` (Bunker Green)
- Grays: `#1a1a1a`, `#262626`, `#404040`

## State Management (Jotai Atoms)

Located in `lib/atoms.ts`:
- `selectedFundAtom` - Currently selected fund
- `withdrawalsAtom` - User withdrawal history
- `currentPriceAtom` - Current market price
- `navAtom` - Net Asset Value
- `reserveRatioAtom` - Reserve ratio percentage
- `apyAtom` - Annual percentage yield

## Running the App

```bash
bun install
bun run dev
```

Navigate to `http://localhost:3000` (or the port shown in console)

## Todo

- [ ] Add actual BunkerCash logo SVG to Header component
- [ ] Connect to real Solana program for mint/redeem operations
- [ ] Implement actual wallet balance fetching
- [ ] Add Jupiter aggregator integration for DEX swaps
- [ ] Connect admin functions to on-chain operations
- [ ] Add loading states and transaction confirmations
- [ ] Implement proper error handling
- [ ] Add responsive video background for fund cards (bRENT card specifically)

## Architecture Notes

### Primary vs Secondary Markets
- **Primary Market**: Users mint/redeem directly with the protocol at NAV price
- **Secondary Markets**: Users can trade on DEXes (Raydium, Meteora, Orca)
- Price discovery happens on secondary markets with ~20% spread
- Arbitrage opportunities keep pricing efficient

### Overcollateralization
- All fund withdrawals must be backed by notarized loan documents
- Property loans are overcollateralized (typically 60% LTV)
- Monthly redemption windows for liquidity management
- Reserve ratio maintained for available liquidity

## Component Structure

```
app/
├── layout.tsx          # Root layout with Providers
├── page.tsx            # Landing page
├── providers.tsx       # Wallet & Jotai providers
├── brent/
│   └── page.tsx        # bRENT fund page
└── admin/
    └── page.tsx        # Admin panel

components/
├── Header.tsx          # Navigation & wallet connect
├── FundCard.tsx        # Fund display card
├── SwapInterface.tsx   # Mint/swap interface
├── WithdrawInterface.tsx  # Withdrawal scheduling
├── PoolStats.tsx       # Pool statistics sidebar
├── AdminWithdraw.tsx   # Admin withdrawal form
└── AdminDeposit.tsx    # Admin deposit form

lib/
├── atoms.ts            # Jotai state atoms
└── utils.ts            # Utility functions (cn)
```
