use anchor_lang::prelude::*;

use crate::{errors::AmmError, state::Config};

#[derive(Accounts)]
pub struct Update<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,
}

impl<'info> Update<'info> {
    pub fn update(&mut self, locked: bool) -> Result<()> {
        require!(
            self.config.authority.is_some(),
            AmmError::NoAuthoritySet
        );
        require!(
            self.config.authority.unwrap() == self.authority.key(),
            AmmError::InvalidAuthority
        );

        self.config.locked = locked;

        Ok(())
    }
}
