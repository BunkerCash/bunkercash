import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import idlJson from './bunkercash.fixed.idl.json'

const idl = idlJson as unknown as Idl
const PROGRAM_ID = new PublicKey((idlJson as any).address)

export type BunkercashIDL = Idl

export function getProgram(connection: Connection, wallet: WalletContextState): Program<Idl> | null {
  if (!wallet.publicKey) return null
  const anchorWallet = {
    publicKey: wallet.publicKey,
    signTransaction: wallet.signTransaction!.bind(wallet),
    signAllTransactions: wallet.signAllTransactions!.bind(wallet),
  }
  const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' })
  return new Program(idl, provider)
}

export function getPoolPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bunkercash_pool')],
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

export function getPoolSignerPda(poolPda: PublicKey, programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bunkercash_pool_signer'), poolPda.toBuffer()],
    programId
  )
  return pda
}

export { PROGRAM_ID }
