use anchor_lang::prelude::*;

#[error_code]
pub enum VotingError {
    #[msg("The poll has not started yet")]
    PollNotStarted,
    #[msg("The poll has ended")]
    PollEnded,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Number of votes must be greater than zero")]
    ZeroVotes,
    #[msg("Poll start must be before poll end")]
    InvalidPollDuration,
}
