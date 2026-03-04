use anchor_lang::prelude::*;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token::accessor;

declare_id!("HaPTPu1ZWhMV1t7VtKDmytXpRhwhgxe3tdFMGpPueDsX");

const TRANSFER_FEE_BASIS_POINTS: u16 = 25; // 0.25%

#[program]
pub mod bunkercash {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        master_wallet: Pubkey,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.master_wallet = master_wallet;
        pool.nav = 0;
        pool.total_brent_supply = 0;
        pool.total_pending_claims = 0;
        pool.claim_counter = 0;
        pool.withdrawal_counter = 0;
        pool.bump = ctx.bumps.pool;

        msg!("bRENT pool initialized with master wallet: {}", master_wallet);
        Ok(())
    }

    pub fn deposit_usdc(
        ctx: Context<DepositUsdc>,
        usdc_amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        let brent_to_mint = if pool.total_brent_supply == 0 {
            usdc_amount
        } else {
            require!(pool.nav > 0, ErrorCode::InvalidNAV);
            (usdc_amount as u128)
                .checked_mul(pool.total_brent_supply as u128)
                .unwrap()
                .checked_div(pool.nav as u128)
                .unwrap() as u64
        };

        anchor_spl::token_2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::TransferChecked {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.pool_usdc.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                },
            ),
            usdc_amount,
            6,
        )?;

        pool.nav = pool.nav.checked_add(usdc_amount).unwrap();
        pool.total_brent_supply = pool.total_brent_supply.checked_add(brent_to_mint).unwrap();

        let pool_bump = pool.bump;
        let new_nav = pool.nav;

        let seeds = &[
            b"pool".as_ref(),
            &[pool_bump],
        ];
        let signer = &[&seeds[..]];

        anchor_spl::token_2022::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::MintTo {
                    mint: ctx.accounts.brent_mint.to_account_info(),
                    to: ctx.accounts.user_brent.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer,
            ),
            brent_to_mint,
        )?;

        msg!("Deposited {} USDC, minted {} bRENT. New NAV: {}", usdc_amount, brent_to_mint, new_nav);
        Ok(())
    }

    pub fn file_claim(
        ctx: Context<FileClaim>,
        brent_amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let claim = &mut ctx.accounts.claim;

        require!(pool.nav > 0 && pool.total_brent_supply > 0, ErrorCode::InvalidNAV);

        let usdc_value = (brent_amount as u128)
            .checked_mul(pool.nav as u128)
            .unwrap()
            .checked_div(pool.total_brent_supply as u128)
            .unwrap() as u64;

        anchor_spl::token_2022::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::Burn {
                    mint: ctx.accounts.brent_mint.to_account_info(),
                    from: ctx.accounts.user_brent.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            brent_amount,
        )?;

        pool.total_brent_supply = pool.total_brent_supply.checked_sub(brent_amount).unwrap();
        pool.total_pending_claims = pool.total_pending_claims.checked_add(usdc_value).unwrap();
        pool.claim_counter = pool.claim_counter.checked_add(1).unwrap();

        claim.user = ctx.accounts.user.key();
        claim.usdc_amount = usdc_value;
        claim.timestamp = Clock::get()?.unix_timestamp;
        claim.processed = false;
        claim.paid_amount = 0;
        claim.bump = ctx.bumps.claim;

        msg!("Filed claim for {} bRENT ({} USDC value)", brent_amount, usdc_value);
        Ok(())
    }

    pub fn settle_claims<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, SettleClaims<'info>>,
        _claim_indices: Vec<u8>,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        require!(
            ctx.accounts.master_wallet.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        let usdc_balance = accessor::amount(&ctx.accounts.pool_usdc.to_account_info())?;
        let total_claimable = usdc_balance.min(pool.total_pending_claims);

        if total_claimable == 0 {
            return Ok(());
        }

        let payout_ratio = if pool.total_pending_claims > 0 {
            (total_claimable as u128)
                .checked_mul(1_000_000)
                .unwrap()
                .checked_div(pool.total_pending_claims as u128)
                .unwrap() as u64
        } else {
            0
        };

        let pool_bump = pool.bump;
        let seeds = &[
            b"pool".as_ref(),
            &[pool_bump],
        ];
        let signer = &[&seeds[..]];

        for (idx, claim_account_info) in ctx.remaining_accounts.iter().enumerate() {
            if idx % 2 == 0 {
                let mut claim_data = claim_account_info.try_borrow_mut_data()?;
                let claim = Claim::try_deserialize(&mut &claim_data[..])?;

                if !claim.processed {
                    let claim_usdc_amount = claim.usdc_amount;
                    let payout = (claim_usdc_amount as u128)
                        .checked_mul(payout_ratio as u128)
                        .unwrap()
                        .checked_div(1_000_000)
                        .unwrap() as u64;

                    let user_usdc = &ctx.remaining_accounts[idx + 1];

                    anchor_spl::token_2022::transfer_checked(
                        CpiContext::new_with_signer(
                            ctx.accounts.token_program.to_account_info(),
                            anchor_spl::token_2022::TransferChecked {
                                from: ctx.accounts.pool_usdc.to_account_info(),
                                to: user_usdc.to_account_info(),
                                authority: pool.to_account_info(),
                                mint: ctx.accounts.usdc_mint.to_account_info(),
                            },
                            signer,
                        ),
                        payout,
                        6,
                    )?;

                    pool.total_pending_claims = pool.total_pending_claims.checked_sub(claim_usdc_amount).unwrap();
                    pool.nav = pool.nav.checked_sub(payout).unwrap();

                    let mut updated_claim = claim;
                    updated_claim.processed = true;
                    updated_claim.paid_amount = payout;
                    updated_claim.serialize(&mut &mut claim_data[8..])?;

                    msg!("Settled claim {} with payout {}/{} USDC", idx, payout, claim_usdc_amount);
                }
            }
        }

        Ok(())
    }

    pub fn master_withdraw(
        ctx: Context<MasterWithdraw>,
        amount: u64,
        metadata_hash: [u8; 32],
    ) -> Result<()> {
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

        anchor_spl::token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::TransferChecked {
                    from: ctx.accounts.pool_usdc.to_account_info(),
                    to: ctx.accounts.master_usdc.to_account_info(),
                    authority: pool.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                },
                signer,
            ),
            amount,
            6,
        )?;

        pool.withdrawal_counter = pool.withdrawal_counter.checked_add(1).unwrap();

        withdrawal.id = pool.withdrawal_counter - 1;
        withdrawal.amount = amount;
        withdrawal.remaining = amount;
        withdrawal.metadata_hash = metadata_hash;
        withdrawal.timestamp = Clock::get()?.unix_timestamp;
        withdrawal.bump = ctx.bumps.withdrawal;

        emit!(MasterWithdrawalEvent {
            withdrawal_id: withdrawal.id,
            master_wallet: ctx.accounts.master_wallet.key(),
            amount,
            metadata_hash,
            timestamp: withdrawal.timestamp,
        });

        msg!("Master withdrew {} USDC. Withdrawal ID: {}", amount, withdrawal.id);
        Ok(())
    }

    pub fn master_repay(
        ctx: Context<MasterRepay>,
        amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let withdrawal = &mut ctx.accounts.withdrawal;

        require!(
            ctx.accounts.master_wallet.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        require!(withdrawal.remaining >= amount, ErrorCode::RepaymentExceedsWithdrawal);

        anchor_spl::token_2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::TransferChecked {
                    from: ctx.accounts.master_usdc.to_account_info(),
                    to: ctx.accounts.pool_usdc.to_account_info(),
                    authority: ctx.accounts.master_wallet.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                },
            ),
            amount,
            6,
        )?;

        pool.nav = pool.nav.checked_add(amount).unwrap();
        withdrawal.remaining = withdrawal.remaining.checked_sub(amount).unwrap();

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

    pub fn master_cancel_withdrawal(
        ctx: Context<MasterRepay>,
        amount: u64,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let withdrawal = &mut ctx.accounts.withdrawal;

        require!(
            ctx.accounts.master_wallet.key() == pool.master_wallet,
            ErrorCode::Unauthorized
        );

        require!(withdrawal.remaining >= amount, ErrorCode::RepaymentExceedsWithdrawal);

        anchor_spl::token_2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token_2022::TransferChecked {
                    from: ctx.accounts.master_usdc.to_account_info(),
                    to: ctx.accounts.pool_usdc.to_account_info(),
                    authority: ctx.accounts.master_wallet.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                },
            ),
            amount,
            6,
        )?;

        withdrawal.remaining = withdrawal.remaining.checked_sub(amount).unwrap();

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
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool"],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub user_usdc: AccountInfo<'info>,

    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub user_brent: AccountInfo<'info>,

    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub pool_usdc: AccountInfo<'info>,

    /// CHECK: Mint account validated by CPI
    #[account(mut)]
    pub brent_mint: AccountInfo<'info>,

    /// CHECK: Mint account validated by CPI
    pub usdc_mint: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FileClaim<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = user,
        space = 8 + Claim::INIT_SPACE,
        seeds = [b"claim", user.key().as_ref(), &pool.claim_counter.to_le_bytes()],
        bump
    )]
    pub claim: Account<'info, Claim>,

    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub user_brent: AccountInfo<'info>,

    /// CHECK: Mint account validated by CPI
    #[account(mut)]
    pub brent_mint: AccountInfo<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleClaims<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub pool_usdc: AccountInfo<'info>,

    /// CHECK: Mint account validated by CPI
    pub usdc_mint: AccountInfo<'info>,

    pub master_wallet: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct MasterWithdraw<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
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

    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub pool_usdc: AccountInfo<'info>,

    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub master_usdc: AccountInfo<'info>,

    /// CHECK: Mint account validated by CPI
    pub usdc_mint: AccountInfo<'info>,

    #[account(mut)]
    pub master_wallet: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MasterRepay<'info> {
    #[account(
        mut,
        seeds = [b"pool"],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"withdrawal".as_ref(), &withdrawal.id.to_le_bytes()],
        bump = withdrawal.bump
    )]
    pub withdrawal: Account<'info, Withdrawal>,

    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub master_usdc: AccountInfo<'info>,

    /// CHECK: Token account validated by CPI
    #[account(mut)]
    pub pool_usdc: AccountInfo<'info>,

    /// CHECK: Mint account validated by CPI
    pub usdc_mint: AccountInfo<'info>,

    pub master_wallet: Signer<'info>,

    pub token_program: Program<'info, Token2022>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub master_wallet: Pubkey,
    pub nav: u64,
    pub total_brent_supply: u64,
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

#[event]
pub struct MasterWithdrawalEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub metadata_hash: [u8; 32],
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
pub struct MasterCancelWithdrawalEvent {
    pub withdrawal_id: u64,
    pub master_wallet: Pubkey,
    pub amount: u64,
    pub remaining: u64,
    pub nav: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid NAV value")]
    InvalidNAV,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Repayment amount exceeds withdrawal remaining balance")]
    RepaymentExceedsWithdrawal,
}
