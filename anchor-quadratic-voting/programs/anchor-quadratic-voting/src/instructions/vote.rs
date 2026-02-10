use anchor_lang::prelude::*;

use crate::{errors::VotingError, Candidate, Poll};

#[derive(Accounts)]
#[instruction(candidate_name: String, poll_id: u64)]
pub struct Vote<'info> {
    pub signer: Signer<'info>,
    #[account(
        seeds = [b"poll", poll_id.to_le_bytes().as_ref()],
        bump = poll.bump,
    )]
    pub poll: Account<'info, Poll>,
    #[account(
        mut,
        seeds = [b"candidate", poll_id.to_le_bytes().as_ref(), candidate_name.as_bytes()],
        bump = candidate.bump,
    )]
    pub candidate: Account<'info, Candidate>,
}

impl<'info> Vote<'info> {
    pub fn vote(
        &mut self,
        _candidate_name: String,
        _poll_id: u64,
        num_votes: u64,
    ) -> Result<()> {
        require!(num_votes > 0, VotingError::ZeroVotes);

        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp as u64;

        require!(
            current_time >= self.poll.poll_start,
            VotingError::PollNotStarted
        );
        require!(
            current_time <= self.poll.poll_end,
            VotingError::PollEnded
        );

        // Quadratic voting: cost = num_votes^2
        // The voter pays num_votes^2 credits to cast num_votes votes
        // For this on-chain implementation, we simply add the votes
        // The quadratic cost accounting happens off-chain or via credits
        let cost = num_votes.checked_mul(num_votes).ok_or(VotingError::Overflow)?;

        msg!(
            "Casting {} votes at a quadratic cost of {} credits",
            num_votes,
            cost
        );

        self.candidate.candidate_votes = self
            .candidate
            .candidate_votes
            .checked_add(num_votes)
            .ok_or(VotingError::Overflow)?;

        Ok(())
    }
}
