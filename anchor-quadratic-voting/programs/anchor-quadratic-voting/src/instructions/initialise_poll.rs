use anchor_lang::prelude::*;

use crate::{errors::VotingError, Poll};

#[derive(Accounts)]
#[instruction(poll_id: u64)]
pub struct InitialisePoll<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        payer = signer,
        seeds = [b"poll", poll_id.to_le_bytes().as_ref()],
        space = Poll::DISCRIMINATOR.len() + Poll::INIT_SPACE,
        bump
    )]
    pub poll: Account<'info, Poll>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitialisePoll<'info> {
    pub fn initialise_poll(
        &mut self,
        poll_id: u64,
        poll_start: u64,
        poll_end: u64,
        bumps: &InitialisePollBumps,
    ) -> Result<()> {
        require!(poll_start < poll_end, VotingError::InvalidPollDuration);

        self.poll.set_inner(Poll {
            poll_id,
            poll_start,
            poll_end,
            candidates: 0,
            bump: bumps.poll,
        });
        Ok(())
    }
}
