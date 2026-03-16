import type { Connection } from "@solana/web3.js";
import { PROGRAM_ID } from "@/lib/program";
import {
  fetchDecodedClaimAccountsForProgram,
  type DecodedClaimAccount,
} from "../../../shared/claim-accounts";

export type { DecodedClaimAccount } from "../../../shared/claim-accounts";

export function fetchDecodedClaimAccounts(connection: Connection): Promise<DecodedClaimAccount[]> {
  return fetchDecodedClaimAccountsForProgram(connection, PROGRAM_ID);
}
