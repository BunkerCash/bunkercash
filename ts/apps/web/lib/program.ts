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

export function getPoolSignerPda(poolPda: PublicKey, programId: PublicKey = PROGRAM_ID): PublicKey {
  void programId
  return poolPda
}

export { PROGRAM_ID }

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
