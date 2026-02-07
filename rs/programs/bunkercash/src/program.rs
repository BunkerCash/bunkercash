use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token as spl_token;
use anchor_spl::token::{Mint as SplMint, Token as SplToken, TokenAccount as SplTokenAccount};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface as token_interface;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use mpl_token_metadata::types::TokenStandard;
use std::io::Cursor;

// NOTE: This must match the deployed program id (and `target/deploy/bunkercash-keypair.json`).
declare_id!("66XoVW5tAkopvLUCQ38jbQdysFVFS84VajaNRU7MRNu8");

/// PDA seed for the protocol's single pool state.
pub const POOL_SEED: &[u8] = b"bunkercash_pool";
/// PDA seed for the Bunker Cash mint (Token-2022).
pub const BUNKERCASH_MINT_SEED: &[u8] = b"bunkercash_mint";
/// PDA seed for a pool-controlled signer used to own escrow vaults.
pub const POOL_SIGNER_SEED: &[u8] = b"bunkercash_pool_signer";

/// Token decimals for the Bunker Cash mint.
pub const BUNKERCASH_DECIMALS: u8 = 9;

/// Metaplex Token Metadata program id.
pub const TOKEN_METADATA_PROGRAM_ID: Pubkey =
    pubkey!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

pub const MAX_TOKEN_NAME_LEN: usize = 32;
pub const MAX_TOKEN_SYMBOL_LEN: usize = 10;
pub const MAX_TOKEN_URI_LEN: usize = 200;

fn owed_usdc_base_units(price_usdc_per_token: u64, token_amount_locked: u64) -> Result<u64> {
    // token_amount_locked has BUNKERCASH_DECIMALS decimals.
    // price_usdc_per_token is USDC base units per 1 whole token.
    let token_scale: u128 = 10u128
        .checked_pow(BUNKERCASH_DECIMALS as u32)
        .ok_or(ErrorCode::MathError)?;
    let owed_u128 = (token_amount_locked as u128)
        .checked_mul(price_usdc_per_token as u128)
        .ok_or(ErrorCode::MathError)?
        .checked_div(token_scale)
        .ok_or(ErrorCode::MathError)?;
    require!(owed_u128 <= u64::MAX as u128, ErrorCode::MathError);
    Ok(owed_u128 as u64)
}

#[program]
pub mod bunkercash {
    use super::*;

    /// Initializes the protocol state and creates the Bunker Cash mint.
    /// All mint/redeem operations use a strict fixed price (`price_usdc_per_token`).
    pub fn initialize(
        ctx: Context<Initialize>,
        admin: Pubkey,
        price_usdc_per_token: u64,
    ) -> Result<()> {
        require!(price_usdc_per_token > 0, ErrorCode::InvalidAmount);

        let pool = &mut ctx.accounts.pool;
        pool.admin = admin;
        pool.price_usdc_per_token = price_usdc_per_token;
        pool.claim_counter = 0;
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    /// Updates the fixed price (USDC base units per 1 whole token).
    pub fn update_price(ctx: Context<UpdatePrice>, new_price_usdc_per_token: u64) -> Result<()> {
        require!(new_price_usdc_per_token > 0, ErrorCode::InvalidAmount);
        require!(
            ctx.accounts.admin.key() == ctx.accounts.pool.admin,
            ErrorCode::Unauthorized
        );
        ctx.accounts.pool.price_usdc_per_token = new_price_usdc_per_token;
        Ok(())
    }

    /// Fixed-price primary buy:
    /// - transfer `usdc_amount` from user -> payout USDC vault (legacy SPL token; owned by Pool Signer PDA)
    /// - mint Bunker Cash tokens to user (Token-2022) at fixed price
    pub fn buy_primary(ctx: Context<BuyPrimary>, usdc_amount: u64) -> Result<()> {
        require!(usdc_amount > 0, ErrorCode::InvalidAmount);

        let price = ctx.accounts.pool.price_usdc_per_token;
        require!(price > 0, ErrorCode::InvalidAmount);
        require!(
            ctx.accounts.bunkercash_mint.decimals == BUNKERCASH_DECIMALS,
            ErrorCode::InvalidMint
        );

        let token_scale: u128 = 10u128
            .checked_pow(BUNKERCASH_DECIMALS as u32)
            .ok_or(ErrorCode::MathError)?;

        let token_amount_u128 = (usdc_amount as u128)
            .checked_mul(token_scale)
            .ok_or(ErrorCode::MathError)?
            .checked_div(price as u128)
            .ok_or(ErrorCode::MathError)?;

        require!(token_amount_u128 > 0, ErrorCode::InvalidAmount);
        require!(token_amount_u128 <= u64::MAX as u128, ErrorCode::MathError);
        let token_amount: u64 = token_amount_u128 as u64;

        // 1) USDC transfer: user -> payout vault (legacy SPL token program)
        spl_token::transfer(
            CpiContext::new(
                ctx.accounts.usdc_token_program.to_account_info(),
                spl_token::Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.payout_usdc_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            usdc_amount,
        )?;

        // 2) Mint Bunker Cash tokens (Token-2022) to user. Mint authority is the pool PDA.
        let seeds: &[&[u8]] = &[POOL_SEED, &[ctx.accounts.pool.bump]];
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_interface::MintTo {
                    mint: ctx.accounts.bunkercash_mint.to_account_info(),
                    to: ctx.accounts.user_bunkercash.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[seeds],
            ),
            token_amount,
        )?;

        Ok(())
    }

    /// Add USDC liquidity to the protocol payout vault.
    ///
    /// - Transfers `usdc_amount` from admin -> payout USDC vault.
    /// - Vault is an ATA owned by the Pool Signer PDA (deterministic + reusable).
    pub fn add_liquidity(ctx: Context<AddLiquidity>, usdc_amount: u64) -> Result<()> {
        require!(usdc_amount > 0, ErrorCode::InvalidAmount);
        require!(
            ctx.accounts.admin.key() == ctx.accounts.pool.admin,
            ErrorCode::Unauthorized
        );

        spl_token::transfer(
            CpiContext::new(
                ctx.accounts.usdc_token_program.to_account_info(),
                spl_token::Transfer {
                    from: ctx.accounts.admin_usdc.to_account_info(),
                    to: ctx.accounts.payout_usdc_vault.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            usdc_amount,
        )?;

        Ok(())
    }

    /// Process a claim payout from the protocol payout vault.
    ///
    /// - Distributes the payout vault's available USDC pro-rata across open claims.
    /// - Only the admin can process payouts.
    /// - Updates `ClaimState.usdc_paid`. Partial payouts are allowed.
    ///
    /// Remaining accounts (passed by the admin) must include:
    /// - all `claim` accounts to be processed (writable ClaimState accounts, owned by this program)
    /// - each unique `user_usdc` token account once (writable SPL token accounts, mint = payout_usdc_vault.mint)
    ///
    /// The program matches each claim to a `user_usdc` account by verifying:
    /// - token_account.owner == claim.user
    /// - token_account.mint == payout_usdc_vault.mint
    ///
    /// Note: To treat *all* open claims equally, the admin should pass *all* open claims
    /// in a single transaction (subject to tx size/compute constraints).
    pub fn process_claims<'info>(
        ctx: Context<'_, '_, 'info, 'info, ProcessClaims<'info>>,
    ) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.pool.admin,
            ErrorCode::Unauthorized
        );

        let remaining_len = ctx.remaining_accounts.len();
        require!(remaining_len > 0, ErrorCode::InvalidRemainingAccounts);

        // Split remaining accounts into:
        // - claim accounts (owned by this program)
        // - user USDC token accounts (owned by the SPL token program)
        let mut claim_idxs: Vec<usize> = Vec::new();
        let mut user_usdc_idxs: Vec<usize> = Vec::new();
        let token_program_id = ctx.accounts.usdc_token_program.key();
        let usdc_mint_key = ctx.accounts.payout_usdc_vault.mint;
        for (idx, ai) in ctx.remaining_accounts.iter().enumerate() {
            if ai.owner == &crate::ID {
                claim_idxs.push(idx);
            } else if ai.owner == &token_program_id {
                user_usdc_idxs.push(idx);
            }
        }
        require!(!claim_idxs.is_empty(), ErrorCode::InvalidRemainingAccounts);
        require!(!user_usdc_idxs.is_empty(), ErrorCode::InvalidRemainingAccounts);

        // Build a mapping: user pubkey -> user_usdc account index.
        // (We only need one USDC token account per user; payouts are aggregated by user.)
        let mut user_usdc_map: Vec<(Pubkey, usize)> = Vec::new();
        for idx in user_usdc_idxs.iter().copied() {
            let ai = &ctx.remaining_accounts[idx];
            require!(ai.is_writable, ErrorCode::UserUsdcNotWritable);
            let ta: Account<SplTokenAccount> = Account::try_from(ai)?;
            require_keys_eq!(ta.mint, usdc_mint_key, ErrorCode::InvalidMint);
            if user_usdc_map.iter().all(|(u, _)| *u != ta.owner) {
                user_usdc_map.push((ta.owner, idx));
            }
        }

        // 1) Read total locked tokens across open claims (first pass).
        let mut total_locked: u128 = 0;
        for idx in claim_idxs.iter().copied() {
            let claim_ai = &ctx.remaining_accounts[idx];
            require_keys_eq!(*claim_ai.owner, crate::ID, ErrorCode::InvalidClaimAccount);
            let claim: ClaimState = ClaimState::try_deserialize(&mut &claim_ai.data.borrow()[..])?;
            if claim.is_closed {
                continue;
            }
            total_locked = total_locked
                .checked_add(claim.token_amount_locked as u128)
                .ok_or(ErrorCode::MathError)?;
        }

        let available_usdc: u64 = ctx.accounts.payout_usdc_vault.amount;
        if total_locked == 0 || available_usdc == 0 {
            return Ok(());
        }

        // 2) Distribute pro-rata: payout_i = floor(available_usdc * locked_i / total_locked)
        // This guarantees total payouts <= available_usdc (any remainder stays in the vault).
        let available_usdc_u128: u128 = available_usdc as u128;

        // Transfer from the program-owned payout vault (authority = pool signer PDA).
        let pool_key = ctx.accounts.pool.key();
        let signer_seeds: &[&[u8]] = &[
            POOL_SIGNER_SEED,
            pool_key.as_ref(),
            &[ctx.bumps.pool_signer],
        ];

        // Aggregate transfers by user to reduce compute:
        // - still updates each claim's `usdc_paid` pro-rata
        // - performs at most 1 SPL transfer per unique user
        let mut recipients: Vec<(Pubkey, u64)> = Vec::new(); // (user, amount)

        for claim_idx in claim_idxs.iter().copied() {
            let claim_ai = &ctx.remaining_accounts[claim_idx];

            require!(claim_ai.is_writable, ErrorCode::InvalidClaimAccount);
            require_keys_eq!(*claim_ai.owner, crate::ID, ErrorCode::InvalidClaimAccount);
            let mut claim: ClaimState =
                ClaimState::try_deserialize(&mut &claim_ai.data.borrow()[..])?;
            if claim.is_closed {
                continue;
            }

            let payout_u128 = available_usdc_u128
                .checked_mul(claim.token_amount_locked as u128)
                .ok_or(ErrorCode::MathError)?
                .checked_div(total_locked)
                .ok_or(ErrorCode::MathError)?;

            if payout_u128 == 0 {
                continue;
            }
            require!(payout_u128 <= u64::MAX as u128, ErrorCode::MathError);
            let payout: u64 = payout_u128 as u64;

            claim.usdc_paid = claim.usdc_paid.checked_add(payout).ok_or(ErrorCode::MathError)?;

            // IMPORTANT: claim accounts are passed via `remaining_accounts`, so Anchor will NOT
            // automatically persist changes. We must write the account data back manually.
            let mut data = claim_ai.try_borrow_mut_data()?;
            let mut cursor = Cursor::new(&mut data[..]);
            claim.try_serialize(&mut cursor)?;

            if payout > 0 {
                if let Some(pos) = recipients.iter().position(|(u, _)| *u == claim.user) {
                    recipients[pos].1 = recipients[pos]
                        .1
                        .checked_add(payout)
                        .ok_or(ErrorCode::MathError)?;
                } else {
                    recipients.push((claim.user, payout));
                }
            }
        }

        let mut total_paid: u64 = 0;
        for (_, amt) in recipients.iter() {
            total_paid = total_paid.checked_add(*amt).ok_or(ErrorCode::MathError)?;
        }
        require!(total_paid <= available_usdc, ErrorCode::InsufficientVaultFunds);

        // Execute transfers (one per user).
        for (user_pk, amt) in recipients.into_iter() {
            if amt == 0 {
                continue;
            }
            let (_, user_usdc_idx) = user_usdc_map
                .iter()
                .find(|(u, _)| *u == user_pk)
                .ok_or(ErrorCode::InvalidClaimUserTokenAccount)?;

            let user_usdc_ai = &ctx.remaining_accounts[*user_usdc_idx];
            let user_usdc: Account<SplTokenAccount> = Account::try_from(user_usdc_ai)?;
            require_keys_eq!(user_usdc.owner, user_pk, ErrorCode::InvalidClaimUserTokenAccount);
            require_keys_eq!(
                user_usdc.mint,
                usdc_mint_key,
                ErrorCode::InvalidMint
            );

            spl_token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.usdc_token_program.to_account_info(),
                    spl_token::Transfer {
                        from: ctx.accounts.payout_usdc_vault.to_account_info(),
                        to: user_usdc.to_account_info(),
                        authority: ctx.accounts.pool_signer.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                amt,
            )?;
        }

        Ok(())
    }

    /// Irreversible sell registration:
    /// - transfer `token_amount` of Bunker Cash from the user into a program-owned escrow vault (Token-2022)
    /// - create a ClaimState record
    /// - increment `claim_counter`
    ///
    /// IMPORTANT: No burn is allowed in this flow.
    pub fn register_sell(ctx: Context<RegisterSell>, token_amount: u64) -> Result<()> {
        require!(token_amount > 0, ErrorCode::InvalidAmount);

        require!(
            ctx.accounts.bunkercash_mint.decimals == BUNKERCASH_DECIMALS,
            ErrorCode::InvalidMint
        );

        // 1) Lock user's Bunker Cash tokens into the escrow vault (Token-2022).
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.user_bunkercash.to_account_info(),
                    to: ctx.accounts.escrow_bunkercash_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                    mint: ctx.accounts.bunkercash_mint.to_account_info(),
                },
            ),
            token_amount,
            ctx.accounts.bunkercash_mint.decimals,
        )?;

        // 2) Increment counter and write claim record.
        let pool = &mut ctx.accounts.pool;
        let next_id = pool
            .claim_counter
            .checked_add(1)
            .ok_or(ErrorCode::MathError)?;
        pool.claim_counter = next_id;

        let claim = &mut ctx.accounts.claim;
        claim.id = next_id;
        claim.user = ctx.accounts.user.key();
        claim.token_amount_locked = token_amount;
        claim.usdc_paid = 0;
        claim.is_closed = false;
        claim.created_at = Clock::get()?.unix_timestamp;
        claim.bump = ctx.bumps.claim;

        Ok(())
    }

    /// Creates Metaplex token metadata for the Bunker Cash mint (Token-2022).
    ///
    /// This is required for wallets (e.g. Phantom) to display the token as `bRENT`
    /// instead of "Unknown Token".
    ///
    /// Notes:
    /// - Mint authority is the pool PDA, so we must CPI from this program to sign as the PDA.
    /// - Restricted to the pool admin.
    pub fn init_mint_metadata(
        ctx: Context<InitMintMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        require!(ctx.accounts.admin.key() == ctx.accounts.pool.admin, ErrorCode::Unauthorized);

        require!(
            name.as_bytes().len() <= MAX_TOKEN_NAME_LEN,
            ErrorCode::InvalidMetadata
        );
        require!(
            symbol.as_bytes().len() <= MAX_TOKEN_SYMBOL_LEN,
            ErrorCode::InvalidMetadata
        );
        require!(
            uri.as_bytes().len() <= MAX_TOKEN_URI_LEN,
            ErrorCode::InvalidMetadata
        );

        require_keys_eq!(
            ctx.accounts.token_metadata_program.key(),
            TOKEN_METADATA_PROGRAM_ID,
            ErrorCode::InvalidMetadataProgram
        );

        // Validate the metadata PDA address for this mint.
        let (expected_metadata, _) = mpl_token_metadata::accounts::Metadata::find_pda(
            &ctx.accounts.bunkercash_mint.key(),
        );
        require_keys_eq!(
            ctx.accounts.metadata.key(),
            expected_metadata,
            ErrorCode::InvalidMetadataPda
        );

        let seeds: &[&[u8]] = &[POOL_SEED, &[ctx.accounts.pool.bump]];

        // Create the metadata account using CreateV1 (supports Token-2022 when passing spl_token_program).
        // Update authority is the admin signer so metadata can be updated later.
        let token_metadata_program = ctx.accounts.token_metadata_program.to_account_info();
        let metadata = ctx.accounts.metadata.to_account_info();
        let mint = ctx.accounts.bunkercash_mint.to_account_info();
        let pool = ctx.accounts.pool.to_account_info();
        let admin = ctx.accounts.admin.to_account_info();
        let system_program = ctx.accounts.system_program.to_account_info();
        let sysvar_instructions = ctx.accounts.sysvar_instructions.to_account_info();
        let spl_token_program = ctx.accounts.token_program.to_account_info();

        mpl_token_metadata::instructions::CreateV1CpiBuilder::new(&token_metadata_program)
            .metadata(&metadata)
            .master_edition(None)
            .mint(&mint, false) // existing mint account, not a signer
            .authority(&pool)
            .payer(&admin)
            .update_authority(&admin, true)
            .system_program(&system_program)
            .sysvar_instructions(&sysvar_instructions)
            .spl_token_program(Some(&spl_token_program))
            .name(name)
            .symbol(symbol)
            .uri(uri)
            .seller_fee_basis_points(0)
            .primary_sale_happened(false)
            .is_mutable(true)
            .token_standard(TokenStandard::Fungible)
            .decimals(BUNKERCASH_DECIMALS)
            .invoke_signed(&[seeds])?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + PoolState::INIT_SPACE,
        seeds = [POOL_SEED],
        bump
    )]
    pub pool: Account<'info, PoolState>,

    #[account(
        init,
        payer = payer,
        seeds = [BUNKERCASH_MINT_SEED],
        bump,
        mint::decimals = BUNKERCASH_DECIMALS,
        mint::authority = pool,
        mint::token_program = token_program
    )]
    pub bunkercash_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// Token program for Bunker Cash mint (Token-2022).
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, PoolState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct BuyPrimary<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, PoolState>,

    /// PDA that owns all program vault ATAs (escrow + payout).
    /// CHECK: PDA is derived and used only as a vault owner/authority.
    #[account(
        seeds = [POOL_SIGNER_SEED, pool.key().as_ref()],
        bump
    )]
    pub pool_signer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [BUNKERCASH_MINT_SEED],
        bump,
        constraint = bunkercash_mint.mint_authority == COption::Some(pool.key()) @ ErrorCode::InvalidMintAuthority
    )]
    pub bunkercash_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub usdc_mint: Account<'info, SplMint>,

    #[account(
        mut,
        constraint = user_usdc.owner == user.key() @ ErrorCode::InvalidTokenAccountOwner,
        constraint = user_usdc.mint == usdc_mint.key() @ ErrorCode::InvalidMint
    )]
    pub user_usdc: Account<'info, SplTokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool_signer,
        associated_token::token_program = usdc_token_program
    )]
    pub payout_usdc_vault: Account<'info, SplTokenAccount>,

    #[account(
        mut,
        constraint = user_bunkercash.owner == user.key() @ ErrorCode::InvalidTokenAccountOwner,
        constraint = user_bunkercash.mint == bunkercash_mint.key() @ ErrorCode::InvalidMint
    )]
    pub user_bunkercash: InterfaceAccount<'info, TokenAccount>,

    pub usdc_token_program: Program<'info, SplToken>,
    /// Token program for Bunker Cash mint (Token-2022).
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, PoolState>,

    /// PDA that owns all program vault ATAs (escrow + payout).
    /// CHECK: PDA is derived and used only as a vault owner/authority.
    #[account(
        seeds = [POOL_SIGNER_SEED, pool.key().as_ref()],
        bump
    )]
    pub pool_signer: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, SplMint>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = admin_usdc.owner == admin.key() @ ErrorCode::InvalidTokenAccountOwner,
        constraint = admin_usdc.mint == usdc_mint.key() @ ErrorCode::InvalidMint
    )]
    pub admin_usdc: Account<'info, SplTokenAccount>,

    #[account(
        init_if_needed,
        payer = admin,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool_signer,
        associated_token::token_program = usdc_token_program
    )]
    pub payout_usdc_vault: Account<'info, SplTokenAccount>,

    pub usdc_token_program: Program<'info, SplToken>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProcessClaims<'info> {
    #[account(
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, PoolState>,

    /// PDA that owns all program vault ATAs (escrow + payout).
    /// CHECK: PDA is derived and used only as a vault owner/authority.
    #[account(
        seeds = [POOL_SIGNER_SEED, pool.key().as_ref()],
        bump
    )]
    pub pool_signer: UncheckedAccount<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = payout_usdc_vault.owner == pool_signer.key() @ ErrorCode::InvalidTokenAccountOwner
    )]
    pub payout_usdc_vault: Account<'info, SplTokenAccount>,

    pub usdc_token_program: Program<'info, SplToken>,
}

#[derive(Accounts)]
pub struct RegisterSell<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, PoolState>,

    /// PDA that owns all program vault ATAs (escrow + payout).
    /// CHECK: PDA is derived and used only as a vault owner.
    #[account(
        seeds = [POOL_SIGNER_SEED, pool.key().as_ref()],
        bump
    )]
    pub pool_signer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [BUNKERCASH_MINT_SEED],
        bump,
        constraint = bunkercash_mint.mint_authority == COption::Some(pool.key()) @ ErrorCode::InvalidMintAuthority
    )]
    pub bunkercash_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = user,
        space = 8 + ClaimState::INIT_SPACE,
        seeds = [b"claim", pool.key().as_ref(), &(pool.claim_counter + 1).to_le_bytes()],
        bump
    )]
    pub claim: Account<'info, ClaimState>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = user_bunkercash.owner == user.key() @ ErrorCode::InvalidTokenAccountOwner,
        constraint = user_bunkercash.mint == bunkercash_mint.key() @ ErrorCode::InvalidMint
    )]
    pub user_bunkercash: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = bunkercash_mint,
        associated_token::authority = pool_signer,
        associated_token::token_program = token_program
    )]
    pub escrow_bunkercash_vault: InterfaceAccount<'info, TokenAccount>,

    /// Token program for the Bunker Cash mint (Token-2022).
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitMintMetadata<'info> {
    #[account(
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, PoolState>,

    #[account(
        mut,
        seeds = [BUNKERCASH_MINT_SEED],
        bump,
        constraint = bunkercash_mint.mint_authority == COption::Some(pool.key()) @ ErrorCode::InvalidMintAuthority
    )]
    pub bunkercash_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// Metaplex metadata PDA for the mint.
    /// CHECK: Address is validated in the instruction.
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,

    /// Metaplex Token Metadata program.
    /// CHECK: Address is validated in the instruction.
    pub token_metadata_program: UncheckedAccount<'info>,

    /// Token-2022 program (passed to Metaplex as `spl_token_program`).
    pub token_program: Program<'info, Token2022>,

    /// Instructions sysvar required by Metaplex CreateV1.
    /// CHECK: sysvar account.
    pub sysvar_instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct PoolState {
    pub admin: Pubkey,
    /// USDC base units per 1 whole token.
    pub price_usdc_per_token: u64,
    pub claim_counter: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ClaimState {
    pub id: u64,
    pub user: Pubkey,
    pub token_amount_locked: u64,
    pub usdc_paid: u64,
    pub is_closed: bool,
    pub created_at: i64,
    pub bump: u8,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Math error")]
    MathError,
    #[msg("Insufficient USDC in vault")]
    InsufficientVaultFunds,
    #[msg("Invalid token account owner")]
    InvalidTokenAccountOwner,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid mint authority")]
    InvalidMintAuthority,
    #[msg("Invalid token metadata")]
    InvalidMetadata,
    #[msg("Invalid token metadata program")]
    InvalidMetadataProgram,
    #[msg("Invalid token metadata PDA")]
    InvalidMetadataPda,
    #[msg("Claim is already closed")]
    ClaimClosed,
    #[msg("Claim user does not match provided user")]
    InvalidClaimUser,
    #[msg("Invalid remaining accounts for pro-rata payouts")]
    InvalidRemainingAccounts,
    #[msg("Provided user USDC account does not belong to claim user")]
    InvalidClaimUserTokenAccount,
    #[msg("Invalid claim account")]
    InvalidClaimAccount,
    #[msg("User USDC token account must be writable")]
    UserUsdcNotWritable,
}

