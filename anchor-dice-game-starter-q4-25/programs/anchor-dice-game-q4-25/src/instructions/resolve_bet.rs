use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};
use solana_program::{
    ed25519_program,
    sysvar::instructions::load_instruction_at_checked,
};
use solana_program::hash;
use crate::{errors::DiceError, state::Bet};

#[derive(Accounts)]
pub struct ResolveBet<'info> {
    #[account(mut)]
    pub house: Signer<'info>,
    #[account(mut, address = bet.player)]
    pub player: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"vault", house.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        mut,
        close = house,
        seeds = [b"bet", vault.key().as_ref(), bet.seed.to_le_bytes().as_ref()],
        bump = bet.bump
    )]
    pub bet: Account<'info, Bet>,
    /// CHECK: Validated by address constraint
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub instruction_sysvar: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> ResolveBet<'info> {
    pub fn verify_ed25519_signature(&self, sig: &[u8]) -> Result<()> {
        let ix = load_instruction_at_checked(0, &self.instruction_sysvar.to_account_info())
            .map_err(|_| DiceError::Ed25519Program)?;

        // Must be the Ed25519 precompile
        require_keys_eq!(ix.program_id, ed25519_program::ID, DiceError::Ed25519Program);

        // Ed25519 precompile takes no accounts
        require!(ix.accounts.is_empty(), DiceError::Ed25519Accounts);

        // Minimum data: 2 header + 14 offsets + 64 sig + 32 pubkey + message
        require!(ix.data.len() > 112, DiceError::Ed25519DataLength);

        let data = &ix.data;

        // Exactly one signature
        require!(data[0] == 1, DiceError::Ed25519Header);

        // Parse offsets from the instruction data
        let sig_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
        let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
        let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
        let msg_size = u16::from_le_bytes([data[12], data[13]]) as usize;

        // Verify signature matches what was passed in
        require!(
            &data[sig_offset..sig_offset + 64] == sig,
            DiceError::Ed25519Signature
        );

        // Verify the signer is the house
        require!(
            &data[pubkey_offset..pubkey_offset + 32] == self.house.key().to_bytes(),
            DiceError::Ed25519Pubkey
        );

        // Verify the signed message is this bet's data
        require!(
            &data[msg_offset..msg_offset + msg_size] == self.bet.to_slice().as_slice(),
            DiceError::Ed25519Message
        );

        Ok(())
    }

    pub fn resolve_bet(&mut self, sig: &[u8], bumps: &ResolveBetBumps) -> Result<()> {
        // Derive a random roll from the signature hash
        let hash = hash::hash(sig);
        let hash_bytes = hash.to_bytes();

        let mut buf: [u8; 16] = [0; 16];
        buf.copy_from_slice(&hash_bytes[0..16]);
        let lower = u128::from_le_bytes(buf);
        buf.copy_from_slice(&hash_bytes[16..32]);
        let upper = u128::from_le_bytes(buf);

        let result = lower.wrapping_add(upper) % 100;

        // Player wins if the result is below their chosen roll
        if (result as u8) < self.bet.roll {
            let payout = (self.bet.amount as u128)
                .checked_mul(100)
                .ok_or(DiceError::Overflow)?
                .checked_div(self.bet.roll as u128)
                .ok_or(DiceError::Overflow)? as u64;

            let accounts = Transfer {
                from: self.vault.to_account_info(),
                to: self.player.to_account_info(),
            };

            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault",
                &self.house.key().to_bytes(),
                &[bumps.vault],
            ]];

            let ctx = CpiContext::new_with_signer(
                self.system_program.to_account_info(),
                accounts,
                signer_seeds,
            );

            transfer(ctx, payout)?;
        }

        Ok(())
    }
}
