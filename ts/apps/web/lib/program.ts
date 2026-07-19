import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor'
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import idlJson from './bunkercash.fixed.idl.json'

type IdlWithAddress = Idl & { address: string }

const idl = idlJson as unknown as Idl
const idlWithAddress = idlJson as unknown as IdlWithAddress
const PROGRAM_ID = new PublicKey(idlWithAddress.address)

export type BunkercashIDL = Idl
type BrowserWallet = ConstructorParameters<typeof AnchorProvider>[1]
export type ProgramWallet = Pick<
  WalletContextState,
  'publicKey' | 'signTransaction' | 'signAllTransactions'
>

export function getProgram(connection: Connection, wallet: ProgramWallet): Program<Idl> | null {
  if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return null
  const anchorWallet: BrowserWallet = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction.bind(wallet),
    signAllTransactions: wallet.signAllTransactions.bind(wallet),
  }
  const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' })
  return new Program(idl, provider)
}

export function getPoolPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool')],
    programId
  )
  return pda
}

export function getBunkercashMintPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bunkercash_mint')],
    programId
  )
  return pda
}

export function getPurchaseLimitConfigPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('purchase_limit')],
    programId
  )
  return pda
}

export function getSupportedUsdcConfigPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('supported_usdc_config')],
    programId
  )
  return pda
}

export function getFeeConfigPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('fee_config')],
    programId
  )
  return pda
}

export function getMinSettlementConfigPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('min_settlement_config')],
    programId
  )
  return pda
}

export function getMinClaimConfigPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('min_claim_config')],
    programId
  )
  return pda
}

export function getSettlementStatePda(poolPda: PublicKey, programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('settlement'), poolPda.toBuffer()],
    programId
  )
  return pda
}

export function getPoolSignerPda(poolPda: PublicKey, programId: PublicKey = PROGRAM_ID): PublicKey {
  void programId
  return poolPda
}

export { PROGRAM_ID }

// Pool fields shared by every deployed layout. `settlement_epoch_seq` (and the
// trailing bump) were appended later, so the deployed program may serve an
// 81-byte account while the bundled IDL describes 89 bytes — Anchor's typed
// fetch throws on the short account. Reads must only depend on this prefix.
export interface RawPoolAccount {
  masterWallet: PublicKey
  nav: bigint
  totalBunkercashSupply: bigint
  totalPendingClaims: bigint
  claimCounter: bigint
  withdrawalCounter: bigint
}

const POOL_STABLE_PREFIX_BYTES = 80 // 8 disc + 32 wallet + 5×u64

// Returns null when the pool account does not exist (pool not initialized).
export async function fetchRawPoolAccount(
  connection: Connection,
  programId: PublicKey = PROGRAM_ID
): Promise<RawPoolAccount | null> {
  const poolPda = getPoolPda(programId)
  const info = await connection.getAccountInfo(poolPda, 'confirmed')
  if (!info) return null
  if (!info.owner.equals(programId)) {
    throw new Error(`Pool account owned by unexpected program ${info.owner.toBase58()}`)
  }
  const data = info.data
  if (data.length < POOL_STABLE_PREFIX_BYTES) {
    throw new Error(`Pool account has unexpected size ${data.length}`)
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return {
    masterWallet: new PublicKey(data.subarray(8, 40)),
    nav: view.getBigUint64(40, true),
    totalBunkercashSupply: view.getBigUint64(48, true),
    totalPendingClaims: view.getBigUint64(56, true),
    claimCounter: view.getBigUint64(64, true),
    withdrawalCounter: view.getBigUint64(72, true),
  }
}

// Client-side wrapper: the public devnet RPC rate-limits browser IPs, so one
// transient 429 must not blank the trade UI. A missing account (null) returns
// immediately — only errors are retried.
export async function fetchRawPoolAccountWithRetry(
  connection: Connection,
  attempts = 3
): Promise<RawPoolAccount | null> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchRawPoolAccount(connection)
    } catch (error) {
      lastError = error
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)))
      }
    }
  }
  throw lastError
}

async function passthroughTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
  return tx
}

async function passthroughTransactions<T extends Transaction | VersionedTransaction>(
  txs: T[]
): Promise<T[]> {
  return txs
}

export function getReadonlyProgram(connection: Connection): Program<Idl> {
  const dummyWallet: BrowserWallet = {
    publicKey: PublicKey.default,
    signTransaction: passthroughTransaction,
    signAllTransactions: passthroughTransactions,
  }
  const provider = new AnchorProvider(connection, dummyWallet, {
    commitment: 'confirmed',
  })
  return new Program(idl, provider)
}

export async function fetchConfiguredUsdcMint(
  connection: Connection
): Promise<PublicKey | null> {
  const program = getReadonlyProgram(connection)
  const supportedUsdcConfigPda = getSupportedUsdcConfigPda(PROGRAM_ID)
  const accountApi = program.account as {
    supportedUsdcConfig?: {
      fetch: (pubkey: PublicKey) => Promise<{ mint: PublicKey }>
    }
  }

  if (!accountApi.supportedUsdcConfig) return null

  try {
    const config = await accountApi.supportedUsdcConfig.fetch(supportedUsdcConfigPda)
    return config.mint
  } catch {
    return null
  }
}

export async function fetchMintTokenProgram(
  connection: Connection,
  mint: PublicKey,
): Promise<PublicKey | null> {
  const mintInfo = await connection.getAccountInfo(mint)
  const owner = mintInfo?.owner ?? null
  if (!owner) return null
  if (owner.equals(TOKEN_PROGRAM_ID) || owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return owner
  }
  return null
}
