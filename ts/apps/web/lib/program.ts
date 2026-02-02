import { Program, AnchorProvider, type Idl } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import idlJson from './bunkercash.idl.json'

const idl = idlJson as Idl
const PROGRAM_ID = new PublicKey((idlJson as { address: string }).address)

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

export function getPrimaryPoolPda(programId: PublicKey = PROGRAM_ID): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('primary_pool')],
    programId
  )
  return pda
}

export { PROGRAM_ID }
