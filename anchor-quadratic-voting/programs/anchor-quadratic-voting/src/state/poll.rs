use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Poll {
    pub poll_id: u64,
    pub poll_start: u64,
    pub poll_end: u64,
    pub candidates: u64,
    pub bump: u8,
}