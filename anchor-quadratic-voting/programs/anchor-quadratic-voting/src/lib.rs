use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::*;

declare_id!("7NEz4bq2CiaRCgp3xMaKLPJMpEyzdJ91PdZZ4pZ3qjKq");

#[program]
pub mod anchor_quadratic_voting {
    use super::*;
    
    pub fn initialise_poll(
            ctx: Context<InitialisePoll>,
            poll_id: u64,
            poll_start: u64,
            poll_end: u64,
        ) -> Result<()> {
            ctx.accounts.initialise_poll(poll_id, poll_start, poll_end, &ctx.bumps)
        }
    
        pub fn initialise_candidate(
            ctx: Context<InitialiseCandidate>,
            candidate_name: String,
            poll_id: u64,
        ) -> Result<()> {
            ctx.accounts.initialise_candidate(candidate_name, poll_id, &ctx.bumps)
        }
    
            pub fn vote(
            ctx: Context<Vote>,
            candidate_name: String,
            poll_id: u64,
            num_votes: u64,
        ) -> Result<()> {
            ctx.accounts.vote(candidate_name, poll_id, num_votes)
        }

}    

