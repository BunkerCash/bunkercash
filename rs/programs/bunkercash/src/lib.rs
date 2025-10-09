use anchor_lang::prelude::*;

declare_id!("HaPTPu1ZWhMV1t7VtKDmytXpRhwhgxe3tdFMGpPueDsX");

#[program]
pub mod bunkercash {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
