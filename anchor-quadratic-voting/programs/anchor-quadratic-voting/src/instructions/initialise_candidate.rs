use anchor_lang::prelude::*;

use crate::{Candidate, Poll};

#[derive(Accounts)]
#[instruction(candidate_name: String, poll_id: u64)]
pub struct InitialiseCandidate<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"poll", poll_id.to_le_bytes().as_ref()],
        bump = poll.bump,
    )]
    pub poll: Account<'info, Poll>,
    #[account(
        init,
        payer = signer,
        seeds = [b"candidate", poll_id.to_le_bytes().as_ref(), candidate_name.as_bytes()],
        space = Candidate::DISCRIMINATOR.len() + Candidate::INIT_SPACE,
        bump
    )]
    pub candidate: Account<'info, Candidate>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitialiseCandidate<'info> {
    pub fn initialise_candidate(
        &mut self,
        candidate_name: String,
        _poll_id: u64,
        bumps: &InitialiseCandidateBumps,
    ) -> Result<()> {
        self.poll.candidates = self.poll.candidates.checked_add(1).ok_or(ProgramError::ArithmeticOverflow)?;
        self.candidate.set_inner(Candidate {
            candidate_name,
            candidate_votes: 0,
            bump: bumps.candidate,
        });
        Ok(())
    }
}