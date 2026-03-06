# Testing Squads Transactions One by One

Step-by-step manual testing for each Squads flow: **Deposit (add_liquidity)** and **Process Claim (process_claim)**.

---

## Prerequisites

1. **Pool is governed by Squads**  
   `pool.admin` must equal the Squads vault (`SQUADS_VAULT_PUBKEY` in `lib/constants.ts`).  
   - Either initialize the pool with admin = Squads vault, or  
   - Call `update_admin` to transfer admin to the Squads vault.

2. **Your wallet is a member** of the Squads multisig (`SQUADS_MULTISIG_PUBKEY`).  
   You need at least one member wallet to create and approve proposals.

3. **Devnet**  
   App and constants use devnet (e.g. `https://devnet.squads.so`).

4. **Web app running**  
   ```bash
   cd ts/apps/web && npm run dev
   ```
   Open http://localhost:3000 (or the URL shown).

---

## Test 1: Squads Deposit (add_liquidity)

Tests: **Admin → Deposit** tab → “Propose via Squads” → create proposal → approve in Squads → execute.

1. **Open Admin page**  
   Go to `/admin`. Connect a wallet that is a **Squads multisig member** (not the vault itself).

2. **Confirm “Governed by Squads”**  
   You should see the purple “Governed by Squads” badge and the Squads dashboard link.  
   If you see “Access Denied” and “Only the pool admin…”, the pool is not yet governed by Squads (see Prerequisites).

3. **Deposit tab**  
   - Enter an amount (e.g. `10` USDC).  
   - Select a loan (optional for on-chain; needed for local loan-tracking).  
   - Click **“Propose via Squads”**.

4. **Wait for “Squads proposal created”**  
   A purple box appears with “Squads proposal created — tx #N” and a link **“Open in Squads”**.

5. **Open the proposal link**  
   Click “Open in Squads”. You should land on devnet Squads, e.g.:  
   `https://devnet.squads.so/squads/<MULTISIG>/transactions/<N>`.

6. **Approve in Squads**  
   In the Squads UI, approve the transaction (as many members as your multisig threshold requires).

7. **Execute in Squads**  
   After enough approvals, execute the transaction.  
   On success, the vault has sent USDC to the BunkerCash payout vault (add_liquidity executed).

8. **Verify**  
   Check pool/vault balances (e.g. Pool Status or your own checks) to confirm the deposit.

---

## Test 2: Squads Process Claim (process_claim)

Tests: **Admin → Process Claims** tab → “Propose” on one claim → approve in Squads → execute.

1. **Have at least one open claim**  
   Open claims come from users calling `register_sell`. If you have none, run a buy + register_sell (e.g. via e2e or app) first.

2. **Open Admin → Process Claims**  
   Connect a Squads **member** wallet. You should see the “Governed by Squads” context and the open claims table.

3. **Create a proposal for one claim**  
   - Find one open claim in the table.  
   - Click **“Propose”** (not “Pay”) for that row.  
   - Wait for the purple “Squads proposal created” state.

4. **Open the proposal**  
   Either use the “Open in Squads” link from the Deposit success area (if you just did a deposit) or the **“Approve”** link that appears in the same row after you clicked “Propose”.  
   That link is: `https://devnet.squads.so/squads/<MULTISIG>/transactions/<N>`.

5. **Approve and execute in Squads**  
   In the Squads UI, approve the transaction until the threshold is met, then execute.  
   On success, that claim is paid (process_claim executed) and the row will show as paid after refresh.

6. **Verify**  
   Refresh the Process Claims list; the claim should move to “Claim History” and show as “Paid”.

---

## Testing “one by one” summary

| Step | What you test | Where |
|------|----------------|-------|
| 1 | Create **one** add_liquidity proposal | App: Admin → Deposit → “Propose via Squads” |
| 2 | Approve & execute that proposal | Squads dashboard (link from app) |
| 3 | Create **one** process_claim proposal | App: Admin → Process Claims → “Propose” on one row |
| 4 | Approve & execute that proposal | Squads dashboard (link from “Approve” in that row) |

Do **Test 1** fully (create → approve → execute) before **Test 2**, so you’re sure Deposit works before testing Process Claim.

---

## Troubleshooting

- **“Wallet not connected”** when clicking Propose  
  Connect a wallet that can sign (and is a Squads member).

- **“Access Denied” on /admin**  
  Pool is not governed by Squads yet: set `pool.admin` to `SQUADS_VAULT_PUBKEY` (via `update_admin` or init).

- **Proposal created but execution fails in Squads**  
  Check: vault has enough USDC for the deposit; for process_claim, payout vault has enough USDC and the claim’s user USDC ATA exists (the proposal includes ATA create when needed).

- **Wrong cluster**  
  Squads link is devnet; ensure your RPC and wallet are on devnet (`NEXT_PUBLIC_SOLANA_RPC_URL` and wallet network).
