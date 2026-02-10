use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Candidate {
    #[max_len(64)]
    pub candidate_name: String,
    pub candidate_votes: u64,
    pub bump: u8,
}