export const ADMIN_AUTH_SIGNATURE_TTL_MS = 90 * 1000;
export const EMPTY_BODY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export interface AdminAuthRequestChallenge {
  wallet: string;
  domain: string;
  env: string;
  cluster: string;
  programId: string;
  pool: string;
  squadsMultisig: string;
  squadsVault: string;
  method: string;
  route: string;
  bodyHash: string;
  issuedAt: string;
  nonce: string;
}

export function normalizeAdminAuthMethod(method: string): string {
  return method.trim().toUpperCase();
}

export function buildAdminAccessMessage(challenge: AdminAuthRequestChallenge) {
  return [
    "bunkercash-admin:v2",
    `wallet:${challenge.wallet}`,
    `domain:${challenge.domain}`,
    `env:${challenge.env}`,
    `cluster:${challenge.cluster}`,
    `program-id:${challenge.programId}`,
    `pool:${challenge.pool}`,
    `squads-multisig:${challenge.squadsMultisig}`,
    `squads-vault:${challenge.squadsVault}`,
    `method:${normalizeAdminAuthMethod(challenge.method)}`,
    `route:${challenge.route}`,
    `body-sha256:${challenge.bodyHash}`,
    `issued-at:${challenge.issuedAt}`,
    `nonce:${challenge.nonce}`,
  ].join("\n");
}
