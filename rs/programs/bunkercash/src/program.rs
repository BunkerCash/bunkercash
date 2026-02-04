use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token as spl_token;
use anchor_spl::token::{Mint as SplMint, Token as SplToken, TokenAccount as SplTokenAccount};
use anchor_spl::token_2022 as token2022;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface as token_interface;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

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
    /// - transfer `usdc_amount` from user -> pool USDC vault (legacy SPL token)
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

        // 1) USDC transfer: user -> pool vault (legacy SPL token program)
        spl_token::transfer(
            CpiContext::new(
                ctx.accounts.usdc_token_program.to_account_info(),
                spl_token::Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.pool_usdc_vault.to_account_info(),
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
        token2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token2022::TransferChecked {
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
        mut,
        constraint = pool_usdc_vault.owner == pool.key() @ ErrorCode::InvalidTokenAccountOwner,
        constraint = pool_usdc_vault.mint == usdc_mint.key() @ ErrorCode::InvalidMint
    )]
    pub pool_usdc_vault: Account<'info, SplTokenAccount>,

    #[account(
        mut,
        constraint = user_bunkercash.owner == user.key() @ ErrorCode::InvalidTokenAccountOwner,
        constraint = user_bunkercash.mint == bunkercash_mint.key() @ ErrorCode::InvalidMint
    )]
    pub user_bunkercash: InterfaceAccount<'info, TokenAccount>,

    pub usdc_token_program: Program<'info, SplToken>,
    /// Token program for Bunker Cash mint (Token-2022).
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RegisterSell<'info> {
    #[account(
        mut,
        seeds = [POOL_SEED],
        bump = pool.bump
    )]
    pub pool: Account<'info, PoolState>,

    /// PDA used to own escrow vault(s).
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
        mut,
        constraint = escrow_bunkercash_vault.owner == pool_signer.key() @ ErrorCode::InvalidTokenAccountOwner,
        constraint = escrow_bunkercash_vault.mint == bunkercash_mint.key() @ ErrorCode::InvalidMint
    )]
    pub escrow_bunkercash_vault: InterfaceAccount<'info, TokenAccount>,

    /// Token-2022 program.
    pub token_program: Program<'info, Token2022>,
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
}

