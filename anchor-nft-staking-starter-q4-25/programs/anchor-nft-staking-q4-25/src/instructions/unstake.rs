use anchor_lang::prelude::*;
use mpl_core::{
    instructions::{RemovePluginV1CpiBuilder, UpdatePluginV1CpiBuilder},
    types::{FreezeDelegate, Plugin, PluginType},
    ID as CORE_PROGRAM_ID,
};

use crate::{
    errors::StakeError,
    state::{StakeAccount, StakeConfig, UserAccount},
};

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        constraint = asset.owner == &CORE_PROGRAM_ID @ StakeError::InvalidAsset,
        constraint = !asset.data_is_empty() @ StakeError::AssetNotInitialized,
    )]
    /// CHECK: Verified by mpl-core
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = collection.owner == &CORE_PROGRAM_ID @ StakeError::InvalidCollection,
        constraint = !collection.data_is_empty() @ StakeError::CollectionNotInitialized,
    )]
    /// CHECK: Verified by mpl-core
    pub collection: UncheckedAccount<'info>,

    #[account(
        seeds = [b"config".as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, StakeConfig>,

    #[account(
        mut,
        seeds = [b"user".as_ref(), user.key().as_ref()],
        bump = user_account.bump,
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(
        mut,
        close = user,
        seeds = [b"stake".as_ref(), config.key().as_ref(), asset.key().as_ref()],
        bump = stake_account.bump,
        constraint = stake_account.owner == user.key() @ StakeError::NotOwner,
        constraint = stake_account.mint == asset.key() @ StakeError::InvalidAsset,
    )]
    pub stake_account: Account<'info, StakeAccount>,

    #[account(address = CORE_PROGRAM_ID)]
    /// CHECK: Verified by address constraint
    pub core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Unstake<'info> {
    pub fn unstake(&mut self) -> Result<()> {
        let current_time = Clock::get()?.unix_timestamp;
        let time_staked = current_time
            .checked_sub(self.stake_account.staked_at)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        // Check if freeze period has passed (freeze_period is in days, convert to seconds)
        let freeze_period_seconds = (self.config.freeze_period as i64)
            .checked_mul(86400)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        require!(
            time_staked >= freeze_period_seconds,
            StakeError::FreezePeriodNotPassed
        );

        // Calculate points earned (points_per_stake * days staked)
        let days_staked = time_staked.checked_div(86400).unwrap_or(0); // 86400 seconds in a day
        let points_earned = (self.config.points_per_stake as i64)
            .checked_mul(days_staked)
            .unwrap_or(i64::MAX) as u32;

        // Add points to user account
        self.user_account.points = self.user_account.points.saturating_add(points_earned);

        // Decrement staked count (safe: stake_account exists means amount >= 1)
        self.user_account.amount_staked = self
            .user_account
            .amount_staked
            .checked_sub(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        // Signer seeds for stake PDA (plugin authority)
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"stake".as_ref(),
            self.config.to_account_info().key.as_ref(),
            self.asset.to_account_info().key.as_ref(),
            &[self.stake_account.bump],
        ]];

        // Unfreeze the NFT by updating the plugin
        // Use stake PDA as authority since it owns the freeze plugin
        UpdatePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .payer(&self.user.to_account_info())
            .authority(Some(&self.stake_account.to_account_info()))
            .system_program(&self.system_program.to_account_info())
            .plugin(Plugin::FreezeDelegate(FreezeDelegate { frozen: false }))
            .invoke_signed(signer_seeds)?;

        // Remove the freeze delegate plugin
        RemovePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .payer(&self.user.to_account_info())
            .authority(Some(&self.stake_account.to_account_info()))
            .system_program(&self.system_program.to_account_info())
            .plugin_type(PluginType::FreezeDelegate)
            .invoke_signed(signer_seeds)?;

        Ok(())
    }
}
