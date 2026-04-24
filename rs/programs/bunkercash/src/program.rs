use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    program::invoke_signed,
    program_pack::Pack,
    system_instruction,
    sysvar,
};
use anchor_spl::associated_token::{
    get_associated_token_address_with_program_id,
    AssociatedToken,
};
use anchor_spl::token_2022::Token2022;
use anchor_spl::token::accessor;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};
use mpl_token_metadata::instructions::{CreateV1CpiBuilder, UpdateMetadataAccountV2CpiBuilder};
use mpl_token_metadata::types::{DataV2, TokenStandard};
use mpl_token_metadata::ID as TOKEN_METADATA_PROGRAM_ID;
use spl_token_2022::state::Mint as Token2022Mint;

mod governance_keys {
    use anchor_lang::prelude::*;

    include!(concat!(env!("OUT_DIR"), "/squads_keys.rs"));
}

use governance_keys::{SQUADS_MEMBER_1, SQUADS_MEMBER_2, SQUADS_MEMBER_3, SQUADS_MEMBER_4};

declare_id!("82dniBUUXSFNEhQ9vpjce1tQXLkX7EyHLL7FEuCGHtH4");

const POOL_SEED: &[u8] = b"pool";
const BUNKERCASH_MINT_SEED: &[u8] = b"bunkercash_mint";
const CLAIM_SEED: &[u8] = b"claim";
const PURCHASE_LIMIT_SEED: &[u8] = b"purchase_limit";
const SUPPORTED_USDC_CONFIG_SEED: &[u8] = b"supported_usdc_config";
const FEE_CONFIG_SEED: &[u8] = b"fee_config";
const TOKEN_DECIMALS: u8 = 6;
const MAX_FEE_BPS: u16 = 1_000;

fn arithmetic_error() -> Error {
    ErrorCode::ArithmeticError.into()
}

fn validate_supported_usdc_mint(
    supported_usdc_config: &SupportedUsdcConfig,
    usdc_mint: &Pubkey,
) -> Result<()> {
    require!(
        *usdc_mint == supported_usdc_config.mint,
        ErrorCode::InvalidUsdcMint
    );
    Ok(())
}

fn validate_non_zero_amount(amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    Ok(())
}

fn validate_fee_bps(fee_bps: u16) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, ErrorCode::InvalidFeeBps);
    Ok(())
}

fn calculate_fee_amount(amount: u64, fee_bps: u16) -> Result<u64> {
    validate_fee_bps(fee_bps)?;
    u64::try_from(
        (amount as u128)
            .checked_mul(fee_bps as u128)
            .ok_or_else(arithmetic_error)?
            .checked_div(10_000)
            .ok_or_else(arithmetic_error)?,
    )
    .map_err(|_| arithmetic_error())
}

fn is_bootstrap_authority(initializer: &Pubkey) -> bool {
    *initializer == SQUADS_MEMBER_1
        || *initializer == SQUADS_MEMBER_2
        || *initializer == SQUADS_MEMBER_3
        || *initializer == SQUADS_MEMBER_4
}

fn validate_initializer(initializer: &Pubkey) -> Result<()> {
    require!(is_bootstrap_authority(initializer), ErrorCode::Unauthorized);
    Ok(())
}

fn calculate_claim_usdc_value(
    bunkercash_amount: u64,
    nav: u64,
    total_bunkercash_supply: u64,
) -> Option<u64> {
    if bunkercash_amount == 0 || nav == 0 || total_bunkercash_supply == 0 {
        return None;
    }

    let usdc_value = (bunkercash_amount as u128)
        .checked_mul(nav as u128)?
        .checked_div(total_bunkercash_supply as u128)? as u64;

    if usdc_value == 0 {
        return None;
    }

    Some(usdc_value)
}

fn canonical_pool_usdc_vault(pool: Pubkey, usdc_mint: Pubkey, token_program: Pubkey) -> Pubkey {
    get_associated_token_address_with_program_id(&pool, &usdc_mint, &token_program)
}

fn canonical_metadata_account(bunkercash_mint: Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[
            b"metadata",
            TOKEN_METADATA_PROGRAM_ID.as_ref(),
            bunkercash_mint.as_ref(),
        ],
        &TOKEN_METADATA_PROGRAM_ID,
    )
    .0
}

fn record_master_withdrawal(
    pool: &mut Pool,
    withdrawal: &mut Withdrawal,
    amount: u64,
    metadata_hash: [u8; 32],
    withdrawal_bump: u8,
    timestamp: i64,
) -> Result<()> {
    pool.withdrawal_counter = pool
        .withdrawal_counter
        .checked_add(1)
        .ok_or_else(arithmetic_error)?;

    withdrawal.id = pool
        .withdrawal_counter
        .checked_sub(1)
        .ok_or_else(arithmetic_error)?;
    withdrawal.amount = amount;
    withdrawal.remaining = amount;
    withdrawal.metadata_hash = metadata_hash;
    withdrawal.timestamp = timestamp;
    withdrawal.bump = withdrawal_bump;
    Ok(())
}

fn apply_master_repayment(pool: &mut Pool, withdrawal: &mut Withdrawal, amount: u64) -> Result<()> {
    let principal_returned = amount.min(withdrawal.remaining);
    let nav_growth = amount
        .checked_sub(principal_returned)
        .ok_or_else(arithmetic_error)?;

    withdrawal.remaining = withdrawal
        .remaining
        .checked_sub(principal_returned)
        .ok_or_else(arithmetic_error)?;
    pool.nav = pool.nav.checked_add(nav_growth).ok_or_else(arithmetic_error)?;
    Ok(())
}

fn apply_master_profit(pool: &mut Pool, withdrawal: &Withdrawal, amount: u64) -> Result<()> {
    validate_open_withdrawal(withdrawal)?;
    // Profit remains attributed to an open withdrawal. It increases NAV but
    // does not settle or reduce the withdrawal receivable.
    pool.nav = pool.nav.checked_add(amount).ok_or_else(arithmetic_error)?;
    Ok(())
}

fn validate_open_withdrawal(withdrawal: &Withdrawal) -> Result<()> {
    require!(
        withdrawal.remaining > 0,
        ErrorCode::WithdrawalAlreadyClosed
    );
    Ok(())
}

fn apply_master_cancellation(
    withdrawal: &mut Withdrawal,
    amount: u64,
) -> Result<()> {
    validate_open_withdrawal(withdrawal)?;
    // Cancellation is a principal return on an open master withdrawal.
    // NAV already includes the outstanding balance because `master_withdraw`
    // records the receivable without reducing NAV, so returning principal here
    // only shrinks the remaining receivable and must not change NAV.
    require!(
        amount <= withdrawal.remaining,
        ErrorCode::RepaymentExceedsWithdrawal
    );
    withdrawal.remaining = withdrawal
        .remaining
        .checked_sub(amount)
        .ok_or_else(arithmetic_error)?;
    Ok(())
}

fn apply_master_close_withdrawal(
    pool: &mut Pool,
    withdrawal: &mut Withdrawal,
    amount: u64,
) -> Result<()> {
    validate_open_withdrawal(withdrawal)?;
    let remaining = withdrawal.remaining;
    if amount >= remaining {
        let nav_growth = amount.checked_sub(remaining).ok_or_else(arithmetic_error)?;
        pool.nav = pool.nav.checked_add(nav_growth).ok_or_else(arithmetic_error)?;
    } else {
        let loss = remaining.checked_sub(amount).ok_or_else(arithmetic_error)?;
        pool.nav = pool.nav.checked_sub(loss).ok_or(ErrorCode::InvalidNAV)?;
    }

    withdrawal.remaining = 0;
    Ok(())
}

fn validate_purchase_limit(
    purchase_limit_config: &PurchaseLimitConfig,
    amount: u64,
) -> Result<()> {
    if purchase_limit_config.purchase_limit_usdc == 0 {
        return Ok(());
    }

    let new_total = purchase_limit_config
        .total_deposited_usdc
        .checked_add(amount)
        .ok_or(ErrorCode::PurchaseLimitExceeded)?;

    require!(
        new_total <= purchase_limit_config.purchase_limit_usdc,
        ErrorCode::PurchaseLimitExceeded
    );

    Ok(())
}

fn validate_supported_usdc_mint_change(
    pool: &Pool,
    current_mint: &Pubkey,
    next_mint: &Pubkey,
    current_vault_balance: u64,
) -> Result<()> {
    // No-op updates are harmless and should not require a full pool shutdown.
    if current_mint == next_mint {
        return Ok(());
    }

    require!(
        pool.total_pending_claims == 0,
        ErrorCode::MintChangeRequiresSettledPool
    );
    require!(
        current_vault_balance == 0,
        ErrorCode::MintChangeRequiresEmptyVault
    );
    // The program does not maintain a global open-withdrawal index, so require
    // a stronger quiescent state before changing the settlement mint.
    require!(
        pool.nav == 0 && pool.total_bunkercash_supply == 0,
        ErrorCode::MintChangeRequiresSettledPool
    );

    Ok(())
}

fn validate_settlement_pending_claims(
    pool_pending_before: u64,
    actual_total_remaining: u64,
) -> Result<()> {
    require!(
        actual_total_remaining <= pool_pending_before,
        ErrorCode::PendingClaimsOutOfSync
    );
    Ok(())
}

fn validate_unique_settlement_claim_accounts(claim_keys: &[Pubkey]) -> Result<()> {
    let mut seen_claim_keys = Vec::with_capacity(claim_keys.len());

    for claim_key in claim_keys {
        require!(
            !seen_claim_keys.iter().any(|seen| seen == claim_key),
            ErrorCode::DuplicateSettlementClaim
        );
        seen_claim_keys.push(*claim_key);
    }

    Ok(())
}

fn validate_settlement_accounts<'info>(
    program_id: &Pubkey,
    usdc_token_program: &Pubkey,
    usdc_mint: &Pubkey,
    remaining_accounts: &[AccountInfo<'info>],
) -> Result<()> {
    require!(
        remaining_accounts.len() % 2 == 0,
        ErrorCode::InvalidSettlementAccounts
    );

    let claim_keys: Vec<Pubkey> = remaining_accounts
        .chunks_exact(2)
        .map(|account_pair| account_pair[0].key())
        .collect();
    validate_unique_settlement_claim_accounts(&claim_keys)?;

    for account_pair in remaining_accounts.chunks_exact(2) {
        let claim_account_info = &account_pair[0];
        let user_usdc = &account_pair[1];

        require_keys_eq!(
            *claim_account_info.owner,
            *program_id,
            ErrorCode::InvalidClaimAccount
        );
        require_keys_eq!(
            *user_usdc.owner,
            *usdc_token_program,
            ErrorCode::InvalidClaimDestination
        );

        let claim = {
            let claim_data = claim_account_info.try_borrow_data()?;
            Claim::try_deserialize(&mut &claim_data[..])?
        };

        require_keys_eq!(
            accessor::authority(user_usdc)?,
            claim.user,
            ErrorCode::InvalidClaimDestination
        );
        require_keys_eq!(
            accessor::mint(user_usdc)?,
            *usdc_mint,
            ErrorCode::InvalidClaimDestination
        );
    }

    Ok(())
}

#[program]
pub mod bunkercash {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        master_wallet: Pubkey,
    ) -> Result<()> {
        validate_initializer(&ctx.accounts.bootstrap_authority.key())?;

        let pool = &mut ctx.accounts.pool;
        let supported_usdc_config = &mut ctx.accounts.supported_usdc_config;
        let purchase_limit_config = &mut ctx.accounts.purchase_limit_config;
        let fee_config = &mut ctx.accounts.fee_config;
        let timestamp = Clock::get()?.unix_timestamp;
        pool.master_wallet = master_wallet;
        pool.nav = 0;
        pool.total_bunkercash_supply = 0;
        pool.total_pending_claims = 0;
        pool.claim_counter = 0;
        pool.withdrawal_counter = 0;
        pool.bump = ctx.bumps.pool;

        let usdc_mint_key = ctx.accounts.usdc_mint.key();
        supported_usdc_config.mint = usdc_mint_key;
        supported_usdc_config.bump = ctx.bumps.supported_usdc_config;
        purchase_limit_config.purchase_limit_usdc = 0;
        purchase_limit_config.total_deposited_usdc = 0;
        purchase_limit_config.bump = ctx.bumps.purchase_limit_config;
        fee_config.purchase_fee_bps = 0;
        fee_config.claim_fee_bps = 0;
        fee_config.bump = ctx.bumps.fee_config;

        emit!(PoolInitializedEvent {
            pool: pool.key(),
            master_wallet,
            usdc_mint: usdc_mint_key,
            timestamp,
        });

        msg!(
            "BunkerCash pool initialized with master wallet {} and USDC mint {}",
            master_wallet,
            usdc_mint_key
        );
        Ok(())
    }

    pub fn deposit_usdc(
        ctx: Context<DepositUsdc>,
        usdc_amount: u64,
    ) -> Result<()> {
        validate_supported_usdc_mint(
            &ctx.accounts.supported_usdc_config,
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_non_zero_amount(usdc_amount)?;

        let pool = &mut ctx.accounts.pool;
        let purchase_limit_config = &mut ctx.accounts.purchase_limit_config;
        let fee_config = &ctx.accounts.fee_config;
        let user = ctx.accounts.user.key();

        validate_purchase_limit(purchase_limit_config, usdc_amount)?;
        let purchase_fee = calculate_fee_amount(usdc_amount, fee_config.purchase_fee_bps)?;
        let net_usdc_amount = usdc_amount
            .checked_sub(purchase_fee)
            .ok_or_else(arithmetic_error)?;

        let available_nav_for_pricing = pool
            .nav
            .checked_sub(pool.total_pending_claims)
            .ok_or(ErrorCode::InvalidNAV)?;

        let bunkercash_to_mint = if pool.total_bunkercash_supply == 0 {
            // Only allow 1:1 minting when no residual NAV exists.
            // Residual NAV (from fees etc.) with zero supply would give
            // the next depositor a windfall at existing holders' expense.
            require!(available_nav_for_pricing == 0, ErrorCode::InvalidNAV);
            net_usdc_amount
        } else {
            require!(available_nav_for_pricing > 0, ErrorCode::InvalidNAV);
            u64::try_from(
                (net_usdc_amount as u128)
                    .checked_mul(pool.total_bunkercash_supply as u128)
                    .ok_or_else(arithmetic_error)?
                    .checked_div(available_nav_for_pricing as u128)
                    .ok_or_else(arithmetic_error)?,
            )
            .map_err(|_| arithmetic_error())?
        };

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.pool_usdc.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                },
            ),
            usdc_amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        pool.nav = pool.nav.checked_add(usdc_amount).ok_or_else(arithmetic_error)?;
        pool.total_bunkercash_supply = pool
            .total_bunkercash_supply
            .checked_add(bunkercash_to_mint)
            .ok_or_else(arithmetic_error)?;
        purchase_limit_config.total_deposited_usdc = purchase_limit_config
            .total_deposited_usdc
            .checked_add(usdc_amount)
            .ok_or_else(arithmetic_error)?;

        let pool_bump = pool.bump;
        let new_nav = pool.nav;
        let new_total_bunkercash_supply = pool.total_bunkercash_supply;
        let timestamp = Clock::get()?.unix_timestamp;

        let seeds = &[
            b"pool".as_ref(),
            &[pool_bump],
        ];
        let signer = &[&seeds[..]];

        anchor_spl::token_2022::mint_to_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::MintToChecked {
                    mint: ctx.accounts.bunkercash_mint.to_account_info(),
                    to: ctx.accounts.user_bunkercash.to_account_info(),
                    authority: pool.to_account_info(),
                },
                signer,
            ),
            bunkercash_to_mint,
            ctx.accounts.bunkercash_mint.decimals,
        )?;

        emit!(UsdcDepositedEvent {
            pool: pool.key(),
            user,
            usdc_amount,
            bunkercash_minted: bunkercash_to_mint,
            new_nav,
            new_total_bunkercash_supply,
            timestamp,
        });

        msg!("Deposited {} USDC, minted {} BunkerCash. New NAV: {}", usdc_amount, bunkercash_to_mint, new_nav);
        Ok(())
    }

    pub fn set_supported_usdc_mint(ctx: Context<SetSupportedUsdcMint>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let supported_usdc_config = &mut ctx.accounts.supported_usdc_config;

        require!(
            ctx.accounts.admin.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        let current_vault_balance = accessor::amount(&ctx.accounts.current_pool_usdc.to_account_info())?;
        validate_supported_usdc_mint_change(
            pool,
            &ctx.accounts.current_supported_usdc_mint.key(),
            &ctx.accounts.usdc_mint.key(),
            current_vault_balance,
        )?;

        supported_usdc_config.mint = ctx.accounts.usdc_mint.key();
        supported_usdc_config.bump = ctx.bumps.supported_usdc_config;

        Ok(())
    }

    pub fn set_purchase_limit(
        ctx: Context<SetPurchaseLimit>,
        purchase_limit_usdc: u64,
    ) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let purchase_limit_config = &mut ctx.accounts.purchase_limit_config;

        require!(
            ctx.accounts.admin.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        purchase_limit_config.purchase_limit_usdc = purchase_limit_usdc;
        if purchase_limit_config.bump == 0 {
            purchase_limit_config.bump = ctx.bumps.purchase_limit_config;
        }

        Ok(())
    }

    pub fn reset_purchase_counter(ctx: Context<SetPurchaseLimit>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let purchase_limit_config = &mut ctx.accounts.purchase_limit_config;

        require!(
            ctx.accounts.admin.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        purchase_limit_config.total_deposited_usdc = 0;

        Ok(())
    }

    pub fn set_fee_config(
        ctx: Context<SetFeeConfig>,
        purchase_fee_bps: u16,
        claim_fee_bps: u16,
    ) -> Result<()> {
        validate_fee_bps(purchase_fee_bps)?;
        validate_fee_bps(claim_fee_bps)?;

        let pool = &ctx.accounts.pool;
        let fee_config = &mut ctx.accounts.fee_config;

        require!(
            ctx.accounts.admin.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        fee_config.purchase_fee_bps = purchase_fee_bps;
        fee_config.claim_fee_bps = claim_fee_bps;
        if fee_config.bump == 0 {
            fee_config.bump = ctx.bumps.fee_config;
        }

        emit!(FeeConfigUpdatedEvent {
            pool: pool.key(),
            admin: ctx.accounts.admin.key(),
            purchase_fee_bps,
            claim_fee_bps,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn create_bunkercash_mint(ctx: Context<CreateBunkercashMint>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(
            ctx.accounts.admin.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );
        require!(
            ctx.accounts.bunkercash_mint.data_is_empty(),
            ErrorCode::MintAlreadyInitialized
        );

        let rent = Rent::get()?;
        let mint_space = Token2022Mint::LEN;
        let mint_lamports = rent.minimum_balance(mint_space);
        let mint_bump = ctx.bumps.bunkercash_mint;
        let mint_seeds = &[b"bunkercash_mint".as_ref(), &[mint_bump]];
        let mint_signer = &[&mint_seeds[..]];

        invoke_signed(
            &system_instruction::create_account(
                &ctx.accounts.admin.key(),
                &ctx.accounts.bunkercash_mint.key(),
                mint_lamports,
                mint_space as u64,
                &ctx.accounts.token_program.key(),
            ),
            &[
                ctx.accounts.admin.to_account_info(),
                ctx.accounts.bunkercash_mint.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            mint_signer,
        )?;

        anchor_spl::token_2022::initialize_mint2(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::InitializeMint2 {
                    mint: ctx.accounts.bunkercash_mint.to_account_info(),
                },
            ),
            6,
            &pool.key(),
            Some(&pool.key()),
        )?;

        emit!(BunkercashMintCreatedEvent {
            pool: pool.key(),
            admin: ctx.accounts.admin.key(),
            mint: ctx.accounts.bunkercash_mint.key(),
            decimals: 6,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "BunkerCash mint created at {} with authority {}",
            ctx.accounts.bunkercash_mint.key(),
            pool.key()
        );
        Ok(())
    }

    // tokenclaims
    //
    // Fee is charged in BunkerCash up front. The fee portion is sent to the
    // admin wallet's BunkerCash ATA. The remaining (net) BunkerCash is locked
    // in a pool-owned escrow ATA instead of being burned. Escrowed BunkerCash
    // is treated as pre-committed to burn for NAV purposes (it is subtracted
    // from `total_bunkercash_supply` at file time). It is burned on settlement
    // proportional to the USDC actually paid out, or returned to the user if
    // the claim is cancelled.
    pub fn file_claim(
        ctx: Context<FileClaim>,
        bunkercash_amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let claim = &mut ctx.accounts.claim;
        let fee_config = &ctx.accounts.fee_config;
        let user = ctx.accounts.user.key();

        validate_non_zero_amount(bunkercash_amount)?;
        require!(pool.nav > 0 && pool.total_bunkercash_supply > 0, ErrorCode::InvalidNAV);
        require!(
            ctx.accounts.master_wallet.key() == pool.master_wallet,
            ErrorCode::InvalidMasterWallet
        );

        let available_nav = pool
            .nav
            .checked_sub(pool.total_pending_claims)
            .ok_or(ErrorCode::InvalidNAV)?;
        require!(available_nav > 0, ErrorCode::InvalidNAV);

        let fee_bunkercash = calculate_fee_amount(bunkercash_amount, fee_config.claim_fee_bps)?;
        let net_bunkercash = bunkercash_amount
            .checked_sub(fee_bunkercash)
            .ok_or_else(arithmetic_error)?;
        require!(net_bunkercash > 0, ErrorCode::ClaimAmountTooSmall);

        // Pricing uses the net BunkerCash — the fee portion never becomes a
        // USDC claim and so does not dilute the remaining holders.
        let usdc_value = calculate_claim_usdc_value(
            net_bunkercash,
            available_nav,
            pool.total_bunkercash_supply,
        )
        .ok_or(ErrorCode::ClaimAmountTooSmall)?;

        // Send the fee portion to the admin wallet's BunkerCash ATA.
        if fee_bunkercash > 0 {
            anchor_spl::token_2022::transfer_checked(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token_2022::TransferChecked {
                        from: ctx.accounts.user_bunkercash.to_account_info(),
                        to: ctx.accounts.master_bunkercash.to_account_info(),
                        authority: ctx.accounts.user.to_account_info(),
                        mint: ctx.accounts.bunkercash_mint.to_account_info(),
                    },
                ),
                fee_bunkercash,
                ctx.accounts.bunkercash_mint.decimals,
            )?;
        }

        // Lock the net BunkerCash in the pool-owned escrow ATA.
        anchor_spl::token_2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::TransferChecked {
                    from: ctx.accounts.user_bunkercash.to_account_info(),
                    to: ctx.accounts.pool_bunkercash_escrow.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                    mint: ctx.accounts.bunkercash_mint.to_account_info(),
                },
            ),
            net_bunkercash,
            ctx.accounts.bunkercash_mint.decimals,
        )?;

        // Escrowed BunkerCash is treated as pre-burned for supply accounting
        // so NAV/per-token pricing stays consistent with the original burn-on-
        // file semantics. The fee portion is not burned and stays in supply.
        pool.total_bunkercash_supply = pool
            .total_bunkercash_supply
            .checked_sub(net_bunkercash)
            .ok_or_else(arithmetic_error)?;
        pool.total_pending_claims = pool
            .total_pending_claims
            .checked_add(usdc_value)
            .ok_or_else(arithmetic_error)?;
        pool.claim_counter = pool.claim_counter.checked_add(1).ok_or_else(arithmetic_error)?;

        let claim_id = pool.claim_counter.checked_sub(1).ok_or_else(arithmetic_error)?;
        let timestamp = Clock::get()?.unix_timestamp;

        claim.user = user;
        claim.usdc_amount = usdc_value;
        claim.timestamp = timestamp;
        claim.processed = false;
        claim.paid_amount = 0;
        claim.bunkercash_escrow = net_bunkercash;
        claim.bunkercash_remaining = net_bunkercash;
        claim.cancelled = false;
        claim.bump = ctx.bumps.claim;

        emit!(ClaimFiledEvent {
            pool: pool.key(),
            claim: claim.key(),
            claim_id,
            user,
            bunkercash_amount,
            fee_bunkercash,
            net_bunkercash,
            usdc_amount: usdc_value,
            total_pending_claims: pool.total_pending_claims,
            remaining_bunkercash_supply: pool.total_bunkercash_supply,
            timestamp,
        });

        msg!(
            "Filed claim: {} BunkerCash total, {} fee to admin, {} escrowed for {} USDC",
            bunkercash_amount,
            fee_bunkercash,
            net_bunkercash,
            usdc_value
        );
        Ok(())
    }

    pub fn settle_claims<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, SettleClaims<'info>>,
        _claim_indices: Vec<u8>,
    ) -> Result<()> {
        validate_supported_usdc_mint(
            &ctx.accounts.supported_usdc_config,
            &ctx.accounts.usdc_mint.key(),
        )?;

        let pool = &mut ctx.accounts.pool;
        let master_wallet = ctx.accounts.master_wallet.key();

        require!(
            master_wallet == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        validate_settlement_accounts(
            ctx.program_id,
            &ctx.accounts.usdc_token_program.key(),
            &ctx.accounts.usdc_mint.key(),
            ctx.remaining_accounts,
        )?;

        // Compute the remaining amount across the claims included in this run.
        // Cancelled claims must be skipped — their BunkerCash escrow has already
        // been returned to the user and their USDC-remaining has already been
        // subtracted from `total_pending_claims`.
        let mut actual_total_remaining = 0u64;
        for (idx, claim_account_info) in ctx.remaining_accounts.iter().enumerate() {
            if idx % 2 == 0 {
                let claim_data = claim_account_info.try_borrow_data()?;
                let claim = Claim::try_deserialize(&mut &claim_data[..])?;
                if !claim.cancelled && claim.paid_amount < claim.usdc_amount {
                    actual_total_remaining = actual_total_remaining
                        .checked_add(claim.usdc_amount.saturating_sub(claim.paid_amount))
                        .ok_or_else(arithmetic_error)?;
                }
            }
        }

        let pool_pending_before = pool.total_pending_claims;
        validate_settlement_pending_claims(pool_pending_before, actual_total_remaining)?;
        let usdc_balance = accessor::amount(&ctx.accounts.pool_usdc.to_account_info())?;
        require!(
            !(usdc_balance < pool_pending_before && actual_total_remaining < pool_pending_before),
            ErrorCode::IncompleteSettlementSet
        );

        let total_claimable = usdc_balance.min(actual_total_remaining);
        let payout_ratio = if actual_total_remaining > 0 {
            u64::try_from(
                (total_claimable as u128)
                    .checked_mul(1_000_000)
                    .ok_or_else(arithmetic_error)?
                    .checked_div(actual_total_remaining as u128)
                    .ok_or_else(arithmetic_error)?,
            )
            .map_err(|_| arithmetic_error())?
        } else {
            0
        };
        let timestamp = Clock::get()?.unix_timestamp;

        if total_claimable == 0 {
            emit!(ClaimsSettledEvent {
                pool: pool.key(),
                master_wallet,
                total_claimable,
                payout_ratio_ppm: payout_ratio,
                claims_settled: 0,
                total_paid: 0,
                new_nav: pool.nav,
                remaining_pending_claims: pool.total_pending_claims,
                timestamp,
            });
            return Ok(());
        }

        let pool_bump = pool.bump;
        let seeds = &[
            b"pool".as_ref(),
            &[pool_bump],
        ];
        let signer = &[&seeds[..]];
        let mut claims_settled = 0u64;
        let mut total_paid = 0u64;

        for (idx, claim_account_info) in ctx.remaining_accounts.iter().enumerate() {
            if idx % 2 == 0 {
                let mut claim_data = claim_account_info.try_borrow_mut_data()?;
                let claim = Claim::try_deserialize(&mut &claim_data[..])?;

                if !claim.cancelled && claim.paid_amount < claim.usdc_amount {
                    let claim_usdc_amount = claim.usdc_amount;
                    let claim_paid_amount = claim.paid_amount;
                    let claim_remaining_amount = claim_usdc_amount.saturating_sub(claim.paid_amount);
                    let payout = u64::try_from(
                        (claim_remaining_amount as u128)
                            .checked_mul(payout_ratio as u128)
                            .ok_or_else(arithmetic_error)?
                            .checked_div(1_000_000)
                            .ok_or_else(arithmetic_error)?,
                    )
                    .map_err(|_| arithmetic_error())?;

                    if payout == 0 {
                        continue;
                    }

                    let user_usdc = &ctx.remaining_accounts[idx + 1];

                    token_interface::transfer_checked(
                        CpiContext::new_with_signer(
                            ctx.accounts.usdc_token_program.to_account_info(),
                            token_interface::TransferChecked {
                                from: ctx.accounts.pool_usdc.to_account_info(),
                                to: user_usdc.to_account_info(),
                                authority: pool.to_account_info(),
                                mint: ctx.accounts.usdc_mint.to_account_info(),
                            },
                            signer,
                        ),
                        payout,
                        ctx.accounts.usdc_mint.decimals,
                    )?;

                    let remaining_after_payout = claim_remaining_amount.saturating_sub(payout);

                    // Burn the proportional slice of escrowed BunkerCash. We
                    // use original escrow / original usdc amounts so cumulative
                    // integer-division truncations never allow the sum of
                    // burned BunkerCash to exceed the original escrow. When the
                    // claim is fully paid off we drain the remainder exactly so
                    // no dust stays stranded in the pool escrow.
                    let bunkercash_to_burn = if remaining_after_payout == 0 {
                        claim.bunkercash_remaining
                    } else if claim.usdc_amount == 0 {
                        0
                    } else {
                        u64::try_from(
                            (payout as u128)
                                .checked_mul(claim.bunkercash_escrow as u128)
                                .ok_or_else(arithmetic_error)?
                                .checked_div(claim.usdc_amount as u128)
                                .ok_or_else(arithmetic_error)?,
                        )
                        .map_err(|_| arithmetic_error())?
                    };

                    if bunkercash_to_burn > 0 {
                        require!(
                            bunkercash_to_burn <= claim.bunkercash_remaining,
                            ErrorCode::ArithmeticError
                        );

                        anchor_spl::token_2022::burn_checked(
                            CpiContext::new_with_signer(
                                ctx.accounts.token_program.to_account_info(),
                                anchor_spl::token_2022::BurnChecked {
                                    mint: ctx.accounts.bunkercash_mint.to_account_info(),
                                    from: ctx.accounts.pool_bunkercash_escrow.to_account_info(),
                                    authority: pool.to_account_info(),
                                },
                                signer,
                            ),
                            bunkercash_to_burn,
                            ctx.accounts.bunkercash_mint.decimals,
                        )?;
                    }

                    pool.nav = pool.nav.checked_sub(payout).ok_or_else(arithmetic_error)?;
                    claims_settled = claims_settled.checked_add(1).ok_or_else(arithmetic_error)?;
                    total_paid = total_paid.checked_add(payout).ok_or_else(arithmetic_error)?;

                    let mut updated_claim = claim;
                    updated_claim.processed = remaining_after_payout == 0;
                    updated_claim.paid_amount = claim_paid_amount
                        .checked_add(payout)
                        .ok_or_else(arithmetic_error)?;
                    updated_claim.bunkercash_remaining = updated_claim
                        .bunkercash_remaining
                        .checked_sub(bunkercash_to_burn)
                        .ok_or_else(arithmetic_error)?;
                    updated_claim.serialize(&mut &mut claim_data[8..])?;

                    emit!(ClaimSettledEvent {
                        pool: pool.key(),
                        claim: claim_account_info.key(),
                        user: updated_claim.user,
                        original_usdc_amount: claim_usdc_amount,
                        paid_amount: payout,
                        bunkercash_burned: bunkercash_to_burn,
                        payout_ratio_ppm: payout_ratio,
                        timestamp,
                    });

                    msg!(
                        "Settled claim {} paid {}/{} USDC, burned {} BunkerCash",
                        idx,
                        payout,
                        claim_usdc_amount,
                        bunkercash_to_burn
                    );
                }
            }
        }

        pool.total_pending_claims = pool_pending_before.checked_sub(total_paid).ok_or_else(arithmetic_error)?;

        emit!(ClaimsSettledEvent {
            pool: pool.key(),
            master_wallet,
            total_claimable,
            payout_ratio_ppm: payout_ratio,
            claims_settled,
            total_paid,
            new_nav: pool.nav,
            remaining_pending_claims: pool.total_pending_claims,
            timestamp,
        });

        Ok(())
    }

    // Cancel an open (or partially paid) claim. The remaining BunkerCash in the
    // pool escrow is returned to the user. The remaining (unpaid) USDC is
    // released back to the pool's available NAV by decrementing
    // `total_pending_claims`, and the refunded BunkerCash is restored to
    // `total_bunkercash_supply` so new deposits price correctly.
    pub fn cancel_claim(ctx: Context<CancelClaim>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let claim = &mut ctx.accounts.claim;

        require!(
            claim.user == ctx.accounts.user.key(),
            ErrorCode::InvalidClaimOwner
        );
        require!(!claim.cancelled, ErrorCode::ClaimAlreadyCancelled);
        require!(!claim.processed, ErrorCode::ClaimAlreadyProcessed);

        let refunded_bunkercash = claim.bunkercash_remaining;
        let released_usdc = claim
            .usdc_amount
            .checked_sub(claim.paid_amount)
            .ok_or_else(arithmetic_error)?;

        let pool_bump = [pool.bump];
        let seeds: &[&[u8]] = &[POOL_SEED, &pool_bump];
        let signer = &[seeds];

        if refunded_bunkercash > 0 {
            anchor_spl::token_2022::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token_2022::TransferChecked {
                        from: ctx.accounts.pool_bunkercash_escrow.to_account_info(),
                        to: ctx.accounts.user_bunkercash.to_account_info(),
                        authority: pool.to_account_info(),
                        mint: ctx.accounts.bunkercash_mint.to_account_info(),
                    },
                    signer,
                ),
                refunded_bunkercash,
                ctx.accounts.bunkercash_mint.decimals,
            )?;
        }

        pool.total_pending_claims = pool
            .total_pending_claims
            .checked_sub(released_usdc)
            .ok_or_else(arithmetic_error)?;
        pool.total_bunkercash_supply = pool
            .total_bunkercash_supply
            .checked_add(refunded_bunkercash)
            .ok_or_else(arithmetic_error)?;

        claim.cancelled = true;
        claim.bunkercash_remaining = 0;

        let timestamp = Clock::get()?.unix_timestamp;
        emit!(ClaimCancelledEvent {
            pool: pool.key(),
            claim: claim.key(),
            user: claim.user,
            refunded_bunkercash,
            released_usdc,
            timestamp,
        });

        msg!(
            "Cancelled claim {}: refunded {} BunkerCash, released {} USDC from pending",
            claim.key(),
            refunded_bunkercash,
            released_usdc
        );
        Ok(())
    }

    pub fn master_withdraw(
        ctx: Context<MasterWithdraw>,
        amount: u64,
        metadata_hash: [u8; 32],
    ) -> Result<()> {
        validate_supported_usdc_mint(
            &ctx.accounts.supported_usdc_config,
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_non_zero_amount(amount)?;

        let pool = &mut ctx.accounts.pool;
        let withdrawal = &mut ctx.accounts.withdrawal;

        require!(
            ctx.accounts.master_wallet.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        let seeds = &[
            b"pool".as_ref(),
            &[pool.bump],
        ];
        let signer = &[&seeds[..]];

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.usdc_token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.pool_usdc.to_account_info(),
                    to: ctx.accounts.master_usdc.to_account_info(),
                    authority: pool.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                },
                signer,
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        // Master withdrawals are tracked as outstanding balances without
        // touching NAV, so price remains NAV-derived instead of vault-balance-derived.
        let timestamp = Clock::get()?.unix_timestamp;
        record_master_withdrawal(
            pool,
            withdrawal,
            amount,
            metadata_hash,
            ctx.bumps.withdrawal,
            timestamp,
        )?;

        emit!(MasterWithdrawalEvent {
            withdrawal_id: withdrawal.id,
            master_wallet: ctx.accounts.master_wallet.key(),
            amount,
            metadata_hash,
            timestamp,
        });

        msg!("Master withdrew {} USDC. Withdrawal ID: {}", amount, withdrawal.id);
        Ok(())
    }   

    pub fn master_repay(
        ctx: Context<MasterRepay>,
        amount: u64,
    ) -> Result<()> {
        validate_supported_usdc_mint(
            &ctx.accounts.supported_usdc_config,
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_non_zero_amount(amount)?;

        let pool = &mut ctx.accounts.pool;
        let withdrawal = &mut ctx.accounts.withdrawal;

        require!(
            ctx.accounts.master_wallet.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.master_usdc.to_account_info(),
                    to: ctx.accounts.pool_usdc.to_account_info(),
                    authority: ctx.accounts.master_wallet.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        apply_master_repayment(pool, withdrawal, amount)?;

        emit!(MasterRepaymentEvent {
            withdrawal_id: withdrawal.id,
            master_wallet: ctx.accounts.master_wallet.key(),
            amount,
            remaining: withdrawal.remaining,
            new_nav: pool.nav,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Master repaid {} USDC to withdrawal #{}. Remaining: {}, New NAV: {}",
            amount, withdrawal.id, withdrawal.remaining, pool.nav);
        Ok(())
    }

    pub fn master_profit(
        ctx: Context<MasterRepay>,
        amount: u64,
    ) -> Result<()> {
        validate_supported_usdc_mint(
            &ctx.accounts.supported_usdc_config,
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_non_zero_amount(amount)?;

        let pool = &mut ctx.accounts.pool;
        let withdrawal = &mut ctx.accounts.withdrawal;

        require!(
            ctx.accounts.master_wallet.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.master_usdc.to_account_info(),
                    to: ctx.accounts.pool_usdc.to_account_info(),
                    authority: ctx.accounts.master_wallet.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        apply_master_profit(pool, withdrawal, amount)?;

        emit!(MasterProfitEvent {
            withdrawal_id: withdrawal.id,
            master_wallet: ctx.accounts.master_wallet.key(),
            amount,
            remaining: withdrawal.remaining,
            new_nav: pool.nav,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Master booked {} USDC profit against withdrawal #{}. Remaining: {}, New NAV: {}",
            amount, withdrawal.id, withdrawal.remaining, pool.nav);
        Ok(())
    }

    pub fn master_cancel_withdrawal(
        ctx: Context<MasterRepay>,
        amount: u64,
    ) -> Result<()> {
        validate_supported_usdc_mint(
            &ctx.accounts.supported_usdc_config,
            &ctx.accounts.usdc_mint.key(),
        )?;
        validate_non_zero_amount(amount)?;

        let pool = &mut ctx.accounts.pool;
        let withdrawal = &mut ctx.accounts.withdrawal;

        require!(
            ctx.accounts.master_wallet.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );
        validate_open_withdrawal(withdrawal)?;

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.master_usdc.to_account_info(),
                    to: ctx.accounts.pool_usdc.to_account_info(),
                    authority: ctx.accounts.master_wallet.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        apply_master_cancellation(withdrawal, amount)?;

        emit!(MasterCancelWithdrawalEvent {
            withdrawal_id: withdrawal.id,
            master_wallet: ctx.accounts.master_wallet.key(),
            amount,
            remaining: withdrawal.remaining,
            nav: pool.nav,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Master cancelled {} USDC from withdrawal #{}. Remaining: {}, NAV unchanged: {}",
            amount, withdrawal.id, withdrawal.remaining, pool.nav);
        Ok(())
    }

    pub fn master_close_withdrawal(
        ctx: Context<MasterRepay>,
        amount: u64,
    ) -> Result<()> {
        validate_supported_usdc_mint(
            &ctx.accounts.supported_usdc_config,
            &ctx.accounts.usdc_mint.key(),
        )?;

        let pool = &mut ctx.accounts.pool;
        let withdrawal = &mut ctx.accounts.withdrawal;

        require!(
            ctx.accounts.master_wallet.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );
        validate_open_withdrawal(withdrawal)?;

        if amount > 0 {
            token_interface::transfer_checked(
                CpiContext::new(
                    ctx.accounts.usdc_token_program.to_account_info(),
                    token_interface::TransferChecked {
                        from: ctx.accounts.master_usdc.to_account_info(),
                        to: ctx.accounts.pool_usdc.to_account_info(),
                        authority: ctx.accounts.master_wallet.to_account_info(),
                        mint: ctx.accounts.usdc_mint.to_account_info(),
                    },
                ),
                amount,
                ctx.accounts.usdc_mint.decimals,
            )?;
        }

        apply_master_close_withdrawal(pool, withdrawal, amount)?;

        emit!(MasterCloseWithdrawalEvent {
            withdrawal_id: withdrawal.id,
            master_wallet: ctx.accounts.master_wallet.key(),
            amount,
            remaining: withdrawal.remaining,
            new_nav: pool.nav,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!("Master closed withdrawal #{} with {} USDC returned. Remaining: {}, New NAV: {}",
            withdrawal.id, amount, withdrawal.remaining, pool.nav);
        Ok(())
    }

    pub fn init_mint_metadata(
        ctx: Context<InitMintMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(
            ctx.accounts.admin.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        let pool_bump = [pool.bump];
        let mint_bump = [ctx.bumps.bunkercash_mint];
        let pool_signer_seeds: &[&[u8]] = &[POOL_SEED, &pool_bump];
        let mint_signer_seeds: &[&[u8]] = &[BUNKERCASH_MINT_SEED, &mint_bump];
        let signer_seeds: &[&[&[u8]]] = &[pool_signer_seeds, mint_signer_seeds];

        CreateV1CpiBuilder::new(&ctx.accounts.token_metadata_program.to_account_info())
            .metadata(&ctx.accounts.metadata.to_account_info())
            .master_edition(None)
            .mint(&ctx.accounts.bunkercash_mint.to_account_info(), true)
            .authority(&ctx.accounts.pool.to_account_info())
            .payer(&ctx.accounts.admin.to_account_info())
            .update_authority(&ctx.accounts.pool.to_account_info(), true)
            .system_program(&ctx.accounts.system_program.to_account_info())
            .sysvar_instructions(&ctx.accounts.sysvar_instructions.to_account_info())
            .spl_token_program(Some(&ctx.accounts.token_program.to_account_info()))
            .name(name.clone())
            .symbol(symbol.clone())
            .uri(uri.clone())
            .seller_fee_basis_points(0)
            .primary_sale_happened(false)
            .is_mutable(true)
            .token_standard(TokenStandard::Fungible)
            .decimals(TOKEN_DECIMALS)
            .invoke_signed(signer_seeds)?;

        msg!("Token metadata set: name={} symbol={} uri={}", name, symbol, uri);

        emit!(MintMetadataInitializedEvent {
            pool: pool.key(),
            admin: ctx.accounts.admin.key(),
            mint: ctx.accounts.bunkercash_mint.key(),
            metadata: ctx.accounts.metadata.key(),
            name,
            symbol,
            uri,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn update_mint_metadata(
        ctx: Context<UpdateMintMetadata>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        let pool = &ctx.accounts.pool;
        require!(
            ctx.accounts.admin.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        let seeds = &[b"pool".as_ref(), &[pool.bump]];
        let signer = &[&seeds[..]];

        let data = DataV2 {
            name: name.clone(),
            symbol: symbol.clone(),
            uri: uri.clone(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        };

        UpdateMetadataAccountV2CpiBuilder::new(&ctx.accounts.token_metadata_program.to_account_info())
            .metadata(&ctx.accounts.metadata.to_account_info())
            .update_authority(&ctx.accounts.pool.to_account_info())
            .data(data)
            .is_mutable(true)
            .invoke_signed(signer)?;

        emit!(MintMetadataUpdatedEvent {
            pool: pool.key(),
            admin: ctx.accounts.admin.key(),
            mint: ctx.accounts.bunkercash_mint.key(),
            metadata: ctx.accounts.metadata.key(),
            name,
            symbol,
            uri,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Pool::INIT_SPACE,
        seeds = [POOL_SEED],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = usdc_token_program
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = usdc_mint,
        associated_token::authority = pool,
        associated_token::token_program = usdc_token_program
    )]
    pub pool_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        space = 8 + SupportedUsdcConfig::INIT_SPACE,
        seeds = [SUPPORTED_USDC_CONFIG_SEED],
        bump
    )]
    pub supported_usdc_config: Account<'info, SupportedUsdcConfig>,

    #[account(
        init,
        payer = payer,
        space = 8 + PurchaseLimitConfig::INIT_SPACE,
        seeds = [PURCHASE_LIMIT_SEED],
        bump
    )]
    pub purchase_limit_config: Account<'info, PurchaseLimitConfig>,

    #[account(
        init,
        payer = payer,
        space = 8 + FeeConfig::INIT_SPACE,
        seeds = [FEE_CONFIG_SEED],
        bump
    )]
    pub fee_config: Account<'info, FeeConfig>,

    pub bootstrap_authority: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = user,
        token::token_program = usdc_token_program
    )]
    pub user_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = bunkercash_mint,
        token::authority = user,
        token::token_program = token_program
    )]
    pub user_bunkercash: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = pool,
        token::token_program = usdc_token_program,
        address = canonical_pool_usdc_vault(pool.key(), usdc_mint.key(), usdc_token_program.key()) @ ErrorCode::InvalidPoolUsdcVault
    )]
    pub pool_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BUNKERCASH_MINT_SEED],
        bump,
        mint::authority = pool,
        mint::freeze_authority = pool,
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = token_program
    )]
    pub bunkercash_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [SUPPORTED_USDC_CONFIG_SEED],
        bump = supported_usdc_config.bump
    )]
    pub supported_usdc_config: Account<'info, SupportedUsdcConfig>,

    #[account(
        mut,
        seeds = [PURCHASE_LIMIT_SEED],
        bump = purchase_limit_config.bump
    )]
    pub purchase_limit_config: Account<'info, PurchaseLimitConfig>,

    #[account(
        seeds = [FEE_CONFIG_SEED],
        bump = fee_config.bump
    )]
    pub fee_config: Account<'info, FeeConfig>,

    #[account(
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = usdc_token_program
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPurchaseLimit<'info> {
    #[account(
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + PurchaseLimitConfig::INIT_SPACE,
        seeds = [PURCHASE_LIMIT_SEED],
        bump
    )]
    pub purchase_limit_config: Account<'info, PurchaseLimitConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetFeeConfig<'info> {
    #[account(
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + FeeConfig::INIT_SPACE,
        seeds = [FEE_CONFIG_SEED],
        bump
    )]
    pub fee_config: Account<'info, FeeConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetSupportedUsdcMint<'info> {
    #[account(
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + SupportedUsdcConfig::INIT_SPACE,
        seeds = [SUPPORTED_USDC_CONFIG_SEED],
        bump
    )]
    pub supported_usdc_config: Account<'info, SupportedUsdcConfig>,

    #[account(
        address = supported_usdc_config.mint @ ErrorCode::InvalidUsdcMint,
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = current_usdc_token_program
    )]
    pub current_supported_usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::mint = current_supported_usdc_mint,
        token::authority = pool,
        token::token_program = current_usdc_token_program,
        address = canonical_pool_usdc_vault(
            pool.key(),
            current_supported_usdc_mint.key(),
            current_usdc_token_program.key()
        ) @ ErrorCode::InvalidPoolUsdcVault
    )]
    pub current_pool_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = usdc_token_program
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::mint = usdc_mint,
        token::authority = pool,
        token::token_program = usdc_token_program,
        address = canonical_pool_usdc_vault(
            pool.key(),
            usdc_mint.key(),
            usdc_token_program.key()
        ) @ ErrorCode::InvalidPoolUsdcVault
    )]
    pub next_pool_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub current_usdc_token_program: Interface<'info, TokenInterface>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FileClaim<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = user,
        space = 8 + Claim::INIT_SPACE,
        seeds = [CLAIM_SEED, user.key().as_ref(), &pool.claim_counter.to_le_bytes()],
        bump
    )]
    pub claim: Account<'info, Claim>,

    #[account(
        mut,
        token::mint = bunkercash_mint,
        token::authority = user,
        token::token_program = token_program
    )]
    pub user_bunkercash: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = bunkercash_mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program
    )]
    pub pool_bunkercash_escrow: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Validated against `pool.master_wallet` inside the instruction.
    #[account(address = pool.master_wallet @ ErrorCode::InvalidMasterWallet)]
    pub master_wallet: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = bunkercash_mint,
        associated_token::authority = master_wallet,
        associated_token::token_program = token_program
    )]
    pub master_bunkercash: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BUNKERCASH_MINT_SEED],
        bump,
        mint::authority = pool,
        mint::freeze_authority = pool,
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = token_program
    )]
    pub bunkercash_mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [FEE_CONFIG_SEED],
        bump = fee_config.bump
    )]
    pub fee_config: Account<'info, FeeConfig>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateBunkercashMint<'info> {
    #[account(
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: Mint PDA created and initialized in this instruction
    #[account(
        mut,
        seeds = [BUNKERCASH_MINT_SEED],
        bump
    )]
    pub bunkercash_mint: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleClaims<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = pool,
        token::token_program = usdc_token_program,
        address = canonical_pool_usdc_vault(pool.key(), usdc_mint.key(), usdc_token_program.key()) @ ErrorCode::InvalidPoolUsdcVault
    )]
    pub pool_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BUNKERCASH_MINT_SEED],
        bump,
        mint::authority = pool,
        mint::freeze_authority = pool,
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = token_program
    )]
    pub bunkercash_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = bunkercash_mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program
    )]
    pub pool_bunkercash_escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [SUPPORTED_USDC_CONFIG_SEED],
        bump = supported_usdc_config.bump
    )]
    pub supported_usdc_config: Account<'info, SupportedUsdcConfig>,

    #[account(
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = usdc_token_program
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub master_wallet: Signer<'info>,

    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct CancelClaim<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        has_one = user @ ErrorCode::InvalidClaimOwner
    )]
    pub claim: Account<'info, Claim>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        token::mint = bunkercash_mint,
        token::authority = user,
        token::token_program = token_program
    )]
    pub user_bunkercash: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = bunkercash_mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program
    )]
    pub pool_bunkercash_escrow: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [BUNKERCASH_MINT_SEED],
        bump,
        mint::authority = pool,
        mint::freeze_authority = pool,
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = token_program
    )]
    pub bunkercash_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MasterWithdraw<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = master_wallet,
        space = 8 + Withdrawal::INIT_SPACE,
        seeds = [b"withdrawal".as_ref(), &pool.withdrawal_counter.to_le_bytes()],
        bump
    )]
    pub withdrawal: Account<'info, Withdrawal>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = pool,
        token::token_program = usdc_token_program,
        address = canonical_pool_usdc_vault(pool.key(), usdc_mint.key(), usdc_token_program.key()) @ ErrorCode::InvalidPoolUsdcVault
    )]
    pub pool_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = master_wallet,
        token::token_program = usdc_token_program
    )]
    pub master_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [SUPPORTED_USDC_CONFIG_SEED],
        bump = supported_usdc_config.bump
    )]
    pub supported_usdc_config: Account<'info, SupportedUsdcConfig>,

    #[account(
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = usdc_token_program
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub master_wallet: Signer<'info>,

    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MasterRepay<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"withdrawal".as_ref(), &withdrawal.id.to_le_bytes()],
        bump = withdrawal.bump
    )]
    pub withdrawal: Account<'info, Withdrawal>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = master_wallet,
        token::token_program = usdc_token_program
    )]
    pub master_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = pool,
        token::token_program = usdc_token_program,
        address = canonical_pool_usdc_vault(pool.key(), usdc_mint.key(), usdc_token_program.key()) @ ErrorCode::InvalidPoolUsdcVault
    )]
    pub pool_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [SUPPORTED_USDC_CONFIG_SEED],
        bump = supported_usdc_config.bump
    )]
    pub supported_usdc_config: Account<'info, SupportedUsdcConfig>,

    #[account(
        mint::decimals = TOKEN_DECIMALS,
        mint::token_program = usdc_token_program
    )]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    pub master_wallet: Signer<'info>,

    pub usdc_token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct InitMintMetadata<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: Mint PDA validated by seeds constraint
    #[account(
        mut,
        seeds = [BUNKERCASH_MINT_SEED],
        bump
    )]
    pub bunkercash_mint: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Metaplex metadata PDA derived from the BunkerCash mint
    #[account(
        mut,
        address = canonical_metadata_account(bunkercash_mint.key()) @ ErrorCode::InvalidMetadataAccount
    )]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: Validated by address constraint
    #[account(address = TOKEN_METADATA_PROGRAM_ID)]
    pub token_metadata_program: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,

    /// CHECK: Validated by address constraint
    #[account(address = sysvar::instructions::id())]
    pub sysvar_instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct UpdateMintMetadata<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: Mint PDA validated by seeds constraint
    #[account(
        seeds = [BUNKERCASH_MINT_SEED],
        bump
    )]
    pub bunkercash_mint: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Metaplex metadata PDA derived from the BunkerCash mint
    #[account(
        mut,
        address = canonical_metadata_account(bunkercash_mint.key()) @ ErrorCode::InvalidMetadataAccount
    )]
    pub metadata: UncheckedAccount<'info>,

    /// CHECK: Validated by address constraint
    #[account(address = TOKEN_METADATA_PROGRAM_ID)]
    pub token_metadata_program: UncheckedAccount<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub master_wallet: Pubkey,
    pub nav: u64,
    pub total_bunkercash_supply: u64,
    pub total_pending_claims: u64,
    pub claim_counter: u64,
    pub withdrawal_counter: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub user: Pubkey,
    pub usdc_amount: u64,
    pub timestamp: i64,
    pub processed: bool,
    pub paid_amount: u64,
    // Original BunkerCash locked in the pool escrow at file time (immutable).
    pub bunkercash_escrow: u64,
    // BunkerCash still held in the pool escrow for this claim.
    pub bunkercash_remaining: u64,
    pub cancelled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Withdrawal {
    pub id: u64,
    pub amount: u64,
    pub remaining: u64,
    pub metadata_hash: [u8; 32],
    pub timestamp: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PurchaseLimitConfig {
    pub purchase_limit_usdc: u64,
    /// Monotonic field tracking total USDC deposited; reset only via `reset_purchase_counter`
    pub total_deposited_usdc: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct SupportedUsdcConfig {
    pub mint: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct FeeConfig {
    pub purchase_fee_bps: u16,
    pub claim_fee_bps: u16,
    pub bump: u8,
}

#[event]
pub struct MasterWithdrawalEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub metadata_hash: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct PoolInitializedEvent {
    pub pool: Pubkey,
    pub master_wallet: Pubkey,
    pub usdc_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct UsdcDepositedEvent {
    pub pool: Pubkey,
    pub user: Pubkey,
    pub usdc_amount: u64,
    pub bunkercash_minted: u64,
    pub new_nav: u64,
    pub new_total_bunkercash_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct BunkercashMintCreatedEvent {
    pub pool: Pubkey,
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub decimals: u8,
    pub timestamp: i64,
}

#[event]
pub struct ClaimFiledEvent {
    pub pool: Pubkey,
    pub claim: Pubkey,
    pub claim_id: u64,
    pub user: Pubkey,
    pub bunkercash_amount: u64,
    pub fee_bunkercash: u64,
    pub net_bunkercash: u64,
    pub usdc_amount: u64,
    pub total_pending_claims: u64,
    pub remaining_bunkercash_supply: u64,
    pub timestamp: i64,
}

#[event]
pub struct ClaimSettledEvent {
    pub pool: Pubkey,
    pub claim: Pubkey,
    pub user: Pubkey,
    pub original_usdc_amount: u64,
    pub paid_amount: u64,
    pub bunkercash_burned: u64,
    pub payout_ratio_ppm: u64,
    pub timestamp: i64,
}

#[event]
pub struct ClaimCancelledEvent {
    pub pool: Pubkey,
    pub claim: Pubkey,
    pub user: Pubkey,
    pub refunded_bunkercash: u64,
    pub released_usdc: u64,
    pub timestamp: i64,
}

#[event]
pub struct ClaimsSettledEvent {
    pub pool: Pubkey,
    pub master_wallet: Pubkey,
    pub total_claimable: u64,
    pub payout_ratio_ppm: u64,
    pub claims_settled: u64,
    pub total_paid: u64,
    pub new_nav: u64,
    pub remaining_pending_claims: u64,
    pub timestamp: i64,
}

#[event]
pub struct MasterRepaymentEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub remaining: u64,
    pub new_nav: u64,
    pub timestamp: i64,
}

#[event]
pub struct MasterProfitEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub remaining: u64,
    pub new_nav: u64,
    pub timestamp: i64,
}

#[event]
pub struct MasterCancelWithdrawalEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub remaining: u64,
    pub nav: u64,
    pub timestamp: i64,
}

#[event]
pub struct MasterCloseWithdrawalEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub remaining: u64,
    pub new_nav: u64,
    pub timestamp: i64,
}

#[event]
pub struct MintMetadataInitializedEvent {
    pub pool: Pubkey,
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub metadata: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub timestamp: i64,
}

#[event]
pub struct MintMetadataUpdatedEvent {
    pub pool: Pubkey,
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub metadata: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub timestamp: i64,
}

#[event]
pub struct FeeConfigUpdatedEvent {
    pub pool: Pubkey,
    pub admin: Pubkey,
    pub purchase_fee_bps: u16,
    pub claim_fee_bps: u16,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid NAV value")]
    InvalidNAV,
    #[msg("Invalid USDC mint for this pool")]
    InvalidUsdcMint,
    #[msg("Invalid pool USDC vault for this pool")]
    InvalidPoolUsdcVault,
    #[msg("Invalid settlement account pair")]
    InvalidSettlementAccounts,
    #[msg("Invalid claim account provided for settlement")]
    InvalidClaimAccount,
    #[msg("Invalid USDC destination account for settlement")]
    InvalidClaimDestination,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Repayment amount exceeds withdrawal remaining balance")]
    RepaymentExceedsWithdrawal,
    #[msg("Settlement must include the full open-claim set when the pool vault cannot cover all claims")]
    IncompleteSettlementSet,
    #[msg("On-chain pending claims are lower than the submitted claim set; sync pending claims before settling")]
    PendingClaimsOutOfSync,
    #[msg("BunkerCash mint PDA is already initialized")]
    MintAlreadyInitialized,
    #[msg("Claim amount must escrow a non-zero amount of BunkerCash for a non-zero USDC value after fees")]
    ClaimAmountTooSmall,
    #[msg("Global purchase limit exceeded")]
    PurchaseLimitExceeded,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Withdrawal is already closed")]
    WithdrawalAlreadyClosed,
    #[msg("Supported USDC mint changes require an empty vault for the current configured mint")]
    MintChangeRequiresEmptyVault,
    #[msg("Supported USDC mint changes require a fully settled pool with no live exposure")]
    MintChangeRequiresSettledPool,
    #[msg("Duplicate claim account provided for settlement")]
    DuplicateSettlementClaim,
    #[msg("Arithmetic operation failed")]
    ArithmeticError,
    #[msg("Invalid metadata account for the BunkerCash mint")]
    InvalidMetadataAccount,
    #[msg("Fee must be between 0 and 10 percent")]
    InvalidFeeBps,
    #[msg("Claim has already been cancelled")]
    ClaimAlreadyCancelled,
    #[msg("Claim has already been fully processed")]
    ClaimAlreadyProcessed,
    #[msg("Only the claim owner can cancel this claim")]
    InvalidClaimOwner,
    #[msg("Master wallet does not match the pool's master wallet")]
    InvalidMasterWallet,
}

#[cfg(test)]
mod tests {
    use super::{
        apply_master_cancellation, apply_master_close_withdrawal, apply_master_profit,
        apply_master_repayment, calculate_claim_usdc_value, calculate_fee_amount,
        record_master_withdrawal, validate_fee_bps, validate_initializer,
        validate_open_withdrawal, validate_purchase_limit,
        validate_settlement_pending_claims, validate_supported_usdc_mint,
        validate_supported_usdc_mint_change, validate_unique_settlement_claim_accounts,
        ErrorCode, Pool, PurchaseLimitConfig, SupportedUsdcConfig, Withdrawal, SQUADS_MEMBER_1,
    };
    use anchor_lang::prelude::Pubkey;

    #[test]
    fn claim_value_rejects_zero_burn_amount() {
        assert_eq!(calculate_claim_usdc_value(0, 1_000_000, 1_000_000), None);
    }

    #[test]
    fn claim_value_rejects_truncation_to_zero() {
        assert_eq!(calculate_claim_usdc_value(1, 1, 2), None);
    }

    #[test]
    fn claim_value_accepts_non_zero_payouts() {
        assert_eq!(
            calculate_claim_usdc_value(250_000, 1_000_000, 1_000_000),
            Some(250_000)
        );
    }

    #[test]
    fn fee_bps_rejects_values_above_cap() {
        let err = validate_fee_bps(1_001).unwrap_err();
        assert_eq!(err, ErrorCode::InvalidFeeBps.into());
    }

    #[test]
    fn fee_amount_rounds_down_in_basis_points() {
        assert_eq!(calculate_fee_amount(1_234_567, 125).unwrap(), 15_432);
    }

    #[test]
    fn master_withdrawal_records_outstanding_balance_without_touching_nav() {
        let mut pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 3,
            bump: 255,
        };
        let original_nav = pool.nav;
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 0,
            remaining: 0,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        record_master_withdrawal(&mut pool, &mut withdrawal, 1_250_000, [9; 32], 17, 1234)
            .unwrap();

        assert_eq!(pool.nav, original_nav);
        assert_eq!(pool.withdrawal_counter, 4);
        assert_eq!(withdrawal.id, 3);
        assert_eq!(withdrawal.amount, 1_250_000);
        assert_eq!(withdrawal.remaining, 1_250_000);
        assert_eq!(withdrawal.metadata_hash, [9; 32]);
        assert_eq!(withdrawal.timestamp, 1234);
        assert_eq!(withdrawal.bump, 17);
    }

    #[test]
    fn master_repayment_only_adds_excess_to_nav() {
        let mut pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 400_000,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        apply_master_repayment(&mut pool, &mut withdrawal, 900_000).unwrap();

        assert_eq!(pool.nav, 8_000_000);
        assert_eq!(withdrawal.remaining, 0);
    }

    #[test]
    fn master_repayment_of_outstanding_principal_does_not_change_nav() {
        let mut pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let original_nav = pool.nav;
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 400_000,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        apply_master_repayment(&mut pool, &mut withdrawal, 400_000).unwrap();

        assert_eq!(pool.nav, original_nav);
        assert_eq!(withdrawal.remaining, 0);
    }

    #[test]
    fn master_profit_increases_nav_without_touching_remaining() {
        let mut pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 400_000,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        apply_master_profit(&mut pool, &withdrawal, 225_000).unwrap();

        assert_eq!(pool.nav, 7_725_000);
        assert_eq!(withdrawal.remaining, 400_000);
    }

    #[test]
    fn cancellation_reduces_remaining_without_changing_nav() {
        let pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 1_250_000,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        apply_master_cancellation(&mut withdrawal, 1_250_000).unwrap();

        assert_eq!(pool.nav, 7_500_000);
        assert_eq!(withdrawal.remaining, 0);
    }

    #[test]
    fn cancellation_rejects_amounts_above_remaining() {
        let pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 1_250_000,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        let err = apply_master_cancellation(&mut withdrawal, 1_400_000).unwrap_err();

        assert_eq!(err, ErrorCode::RepaymentExceedsWithdrawal.into());
        assert_eq!(pool.nav, 7_500_000);
        assert_eq!(withdrawal.remaining, 1_250_000);
    }

    #[test]
    fn cancellation_rejects_already_closed_withdrawals() {
        let pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 0,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        let err = apply_master_cancellation(&mut withdrawal, 400_000).unwrap_err();

        assert_eq!(err, ErrorCode::WithdrawalAlreadyClosed.into());
        assert_eq!(pool.nav, 7_500_000);
        assert_eq!(withdrawal.remaining, 0);
    }

    #[test]
    fn validate_open_withdrawal_rejects_closed_withdrawals() {
        let withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 0,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        let err = validate_open_withdrawal(&withdrawal).unwrap_err();

        assert_eq!(err, ErrorCode::WithdrawalAlreadyClosed.into());
    }

    #[test]
    fn close_withdrawal_with_profit_zeroes_remaining_and_increases_nav() {
        let mut pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 400_000,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        apply_master_close_withdrawal(&mut pool, &mut withdrawal, 525_000).unwrap();

        assert_eq!(pool.nav, 7_625_000);
        assert_eq!(withdrawal.remaining, 0);
    }

    #[test]
    fn close_withdrawal_with_loss_zeroes_remaining_and_reduces_nav() {
        let mut pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 400_000,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        apply_master_close_withdrawal(&mut pool, &mut withdrawal, 250_000).unwrap();

        assert_eq!(pool.nav, 7_350_000);
        assert_eq!(withdrawal.remaining, 0);
    }

    #[test]
    fn close_withdrawal_at_full_loss_allows_zero_return() {
        let mut pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 400_000,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        apply_master_close_withdrawal(&mut pool, &mut withdrawal, 0).unwrap();

        assert_eq!(pool.nav, 7_100_000);
        assert_eq!(withdrawal.remaining, 0);
    }

    #[test]
    fn cancellation_then_close_only_realizes_pnl_on_still_outstanding_balance() {
        let mut pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 1_250_000,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        apply_master_cancellation(&mut withdrawal, 400_000).unwrap();

        assert_eq!(pool.nav, 7_500_000);
        assert_eq!(withdrawal.remaining, 850_000);

        apply_master_close_withdrawal(&mut pool, &mut withdrawal, 700_000).unwrap();

        // Total returned capital is 1,100,000 (400,000 cancelled + 700,000 on close),
        // so the final realized loss against the original 1,250,000 withdrawal is 150,000.
        assert_eq!(pool.nav, 7_350_000);
        assert_eq!(withdrawal.remaining, 0);
    }

    #[test]
    fn close_withdrawal_rejects_already_closed_withdrawals() {
        let mut pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 7_500_000,
            total_bunkercash_supply: 7_500_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 1,
            bump: 255,
        };
        let mut withdrawal = Withdrawal {
            id: 0,
            amount: 1_250_000,
            remaining: 0,
            metadata_hash: [0; 32],
            timestamp: 0,
            bump: 0,
        };

        let err = apply_master_close_withdrawal(&mut pool, &mut withdrawal, 525_000).unwrap_err();

        assert_eq!(err, ErrorCode::WithdrawalAlreadyClosed.into());
        assert_eq!(pool.nav, 7_500_000);
        assert_eq!(withdrawal.remaining, 0);
    }

    #[test]
    fn zero_purchase_limit_means_unlimited() {
        let purchase_limit_config = PurchaseLimitConfig {
            purchase_limit_usdc: 0,
            total_deposited_usdc: 50_000_000,
            bump: 255,
        };

        assert!(validate_purchase_limit(&purchase_limit_config, 75_000_000).is_ok());
    }

    #[test]
    fn purchase_limit_rejects_deposits_above_cap() {
        let purchase_limit_config = PurchaseLimitConfig {
            purchase_limit_usdc: 100_000_000,
            total_deposited_usdc: 80_000_000,
            bump: 255,
        };

        let err = validate_purchase_limit(&purchase_limit_config, 25_000_000).unwrap_err();
        assert_eq!(err, ErrorCode::PurchaseLimitExceeded.into());
    }

    #[test]
    fn supported_usdc_validation_accepts_configured_mint() {
        let mint = Pubkey::new_unique();
        let supported_usdc_config = SupportedUsdcConfig { mint, bump: 255 };

        assert!(validate_supported_usdc_mint(&supported_usdc_config, &mint).is_ok());
    }

    #[test]
    fn supported_usdc_validation_rejects_other_mints() {
        let supported_usdc_config = SupportedUsdcConfig {
            mint: Pubkey::new_unique(),
            bump: 255,
        };

        let err = validate_supported_usdc_mint(&supported_usdc_config, &Pubkey::new_unique())
            .unwrap_err();
        assert_eq!(err, ErrorCode::InvalidUsdcMint.into());
    }

    #[test]
    fn initializer_validation_accepts_bootstrap_authority() {
        assert!(validate_initializer(&SQUADS_MEMBER_1).is_ok());
    }

    #[test]
    fn initializer_validation_rejects_other_signers() {
        let err = validate_initializer(&Pubkey::new_unique()).unwrap_err();
        assert_eq!(err, ErrorCode::Unauthorized.into());
    }

    #[test]
    fn supported_usdc_mint_change_allows_noop_update() {
        let pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 5_000_000,
            total_bunkercash_supply: 5_000_000,
            total_pending_claims: 1_000_000,
            claim_counter: 0,
            withdrawal_counter: 0,
            bump: 255,
        };
        let mint = Pubkey::new_unique();

        assert!(validate_supported_usdc_mint_change(&pool, &mint, &mint, 7_500_000).is_ok());
    }

    #[test]
    fn supported_usdc_mint_change_rejects_non_empty_vault() {
        let pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 0,
            total_bunkercash_supply: 0,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 0,
            bump: 255,
        };

        let err = validate_supported_usdc_mint_change(
            &pool,
            &Pubkey::new_unique(),
            &Pubkey::new_unique(),
            1,
        )
        .unwrap_err();
        assert_eq!(err, ErrorCode::MintChangeRequiresEmptyVault.into());
    }

    #[test]
    fn supported_usdc_mint_change_rejects_live_pool_state() {
        let pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 5_000_000,
            total_bunkercash_supply: 5_000_000,
            total_pending_claims: 0,
            claim_counter: 0,
            withdrawal_counter: 0,
            bump: 255,
        };

        let err = validate_supported_usdc_mint_change(
            &pool,
            &Pubkey::new_unique(),
            &Pubkey::new_unique(),
            0,
        )
        .unwrap_err();
        assert_eq!(err, ErrorCode::MintChangeRequiresSettledPool.into());
    }

    #[test]
    fn supported_usdc_mint_change_rejects_pending_claims() {
        let pool = Pool {
            master_wallet: Pubkey::new_unique(),
            nav: 0,
            total_bunkercash_supply: 0,
            total_pending_claims: 5_000,
            claim_counter: 0,
            withdrawal_counter: 0,
            bump: 255,
        };

        let err = validate_supported_usdc_mint_change(
            &pool,
            &Pubkey::new_unique(),
            &Pubkey::new_unique(),
            0,
        )
        .unwrap_err();
        assert_eq!(err, ErrorCode::MintChangeRequiresSettledPool.into());
    }

    #[test]
    fn settlement_claim_set_allows_unique_claim_accounts() {
        let claim_keys = vec![Pubkey::new_unique(), Pubkey::new_unique()];

        assert!(validate_unique_settlement_claim_accounts(&claim_keys).is_ok());
    }

    #[test]
    fn settlement_claim_set_rejects_duplicate_claim_accounts() {
        let duplicate = Pubkey::new_unique();
        let claim_keys = vec![duplicate, duplicate];

        let err = validate_unique_settlement_claim_accounts(&claim_keys).unwrap_err();
        assert_eq!(err, ErrorCode::DuplicateSettlementClaim.into());
    }

    #[test]
    fn settlement_rejects_claim_sets_larger_than_tracked_pending_total() {
        let err = validate_settlement_pending_claims(500_000, 700_000).unwrap_err();
        assert_eq!(err, ErrorCode::PendingClaimsOutOfSync.into());
    }
}
