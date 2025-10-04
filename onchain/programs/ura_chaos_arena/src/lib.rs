use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};
use pyth_sdk_solana::load_price_feed_from_account_info;

declare_id!("UraChAoSArena111111111111111111111111111111");

// Constants to reduce code size
const PCT_5: u128 = 5;
const PCT_15: u128 = 15;
const PCT_33: u128 = 33;
const PCT_35: u128 = 35;
const PCT_50: u128 = 50;
const PCT_85: u128 = 85;
const PCT_100: u128 = 100;
const PYTH_STALENESS: u64 = 120;
const PYTH_CONF_MAX: u128 = 5;

// Daily arena keyed by UTC day (unix_timestamp / 86400). Ticket purchases flow into a per-match
// SOL vault PDA. At finalize, the program splits the pot: 85% prize pool, and 3x 5% buckets
// (URA buyback, URACHAOS buyback, revenue). Winners are provided by an off-chain referee,
// and allocations are recorded on-chain. Winners claim later to reduce finalize compute.
#[program]
pub mod ura_chaos_arena {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        revenue_wallet: Pubkey,
        pyth_price_account: Pubkey,
        min_ticket_lamports: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.revenue_wallet = revenue_wallet;
        config.pyth_price_account = pyth_price_account;
        config.min_ticket_lamports = min_ticket_lamports;
        config.bump = *ctx.bumps.get("config").unwrap();
        config.buyback_ura_bump = *ctx.bumps.get("buyback_ura_vault").unwrap();
        config.buyback_urac_bump = *ctx.bumps.get("buyback_urac_vault").unwrap();

        // Initialize stats (zero-initialization is automatic)
        ctx.accounts.stats.bump = *ctx.bumps.get("stats").unwrap();
        Ok(())
    }

    // Join the current UTC-day match; creates match + vault if needed.
    // Transfers `amount` lamports from player to the match vault.
    pub fn join(ctx: Context<Join>, amount: u64) -> Result<()> {
        require!(amount > 0, ArenaError::InvalidAmount);
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;
        let price_feed = load_price_feed_from_account_info(&ctx.accounts.pyth_price_account)
            .map_err(|_| ArenaError::PythError)?;
        let price = price_feed.get_price_no_older_than(&clock, PYTH_STALENESS).ok_or(ArenaError::PythStale)?;
        let abs_price = (price.price as i128).abs();
        require!((price.conf as i128) * PCT_100 <= abs_price * PYTH_CONF_MAX, ArenaError::PythConfTooWide);
        let min_lamports = lamports_for_usd_ceil(5, price.price, price.expo)?;
        require!(amount >= min_lamports, ArenaError::TicketTooCheap);
        // Optional safety floor
        require!(amount >= config.min_ticket_lamports, ArenaError::TicketTooCheap);

        let current_day = unix_day(clock.unix_timestamp);
        let m = &mut ctx.accounts.match_state;

        // Initialize if needed (most fields auto-zero)
        if m.day_id == 0 {
            m.day_id = current_day;
            m.status = MatchStatus::Open as u8;
            m.bump = *ctx.bumps.get("match_state").unwrap();
        } else {
            require!(m.day_id == current_day, ArenaError::WrongMatchForDay);
            require!(m.status == MatchStatus::Open as u8, ArenaError::MatchClosed);
        }

        // Ensure no duplicate entry
        let entry = &mut ctx.accounts.entry;
        entry.match_key = m.key();
        entry.player = ctx.accounts.player.key();
        entry.paid = amount;
        entry.joined_at = clock.unix_timestamp;
        entry.bump = *ctx.bumps.get("entry").unwrap();

        // Transfer lamports from player to match vault
        let ix = system_instruction::transfer(&ctx.accounts.player.key(), &ctx.accounts.match_vault.key(), amount);
        invoke_signed(
            &ix,
            &[
                ctx.accounts.player.to_account_info(),
                ctx.accounts.match_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;

        m.ticket_count = m.ticket_count.checked_add(1).ok_or(ArenaError::Overflow)?;
        m.pot_lamports = m.pot_lamports.checked_add(amount).ok_or(ArenaError::Overflow)?;
        Ok(())
    }

    // Finalizes the match for a specific UTC day. Splits non-prize buckets immediately and
    // records derived group sizes for later per-winner allocations.
    // A keeper should call this anytime after UTC midnight for the previous day.
    pub fn finalize_match(ctx: Context<FinalizeMatch>, day_id: i64) -> Result<()> {
        let clock = Clock::get()?;
        // You can only finalize a day whose end has passed (>= next midnight).
        let now_day = unix_day(clock.unix_timestamp);
        require!(day_id < now_day, ArenaError::TooEarlyToFinalize);

        let m = &mut ctx.accounts.match_state;
        require!(m.day_id == day_id, ArenaError::WrongMatchForDay);
        require!(m.status == MatchStatus::Open as u8, ArenaError::MatchAlreadyFinalized);

        let pot = m.pot_lamports;
        require!(pot > 0, ArenaError::EmptyPot);

        // Buckets: 85% prize, 5% each for URA, URACHAOS, revenue
        let mut remaining = pot;
        let revenue = (pot as u128 * PCT_5) / PCT_100;
        let ura = (pot as u128 * PCT_5) / PCT_100;
        let urac = (pot as u128 * PCT_5) / PCT_100;
        // Note: To avoid rounding dust staying in vault, we compute prize as the exact remaining
        // after moving out the three 5% buckets.

        let revenue = revenue as u64;
        let ura = ura as u64;
        let urac = urac as u64;

        // Compute lamports to transfer out of the match vault now
        let out_total = revenue.checked_add(ura).and_then(|x| x.checked_add(urac)).ok_or(ArenaError::Overflow)?;
        remaining = remaining.checked_sub(out_total).ok_or(ArenaError::Overflow)?;

        // Transfers from match_vault (PDA) using its signer seeds
        let vault_bump = *ctx.bumps.get("match_vault").unwrap();
        let vault_seeds: &[&[u8]] = &[b"vault", &ctx.accounts.match_state.key().to_bytes(), &[vault_bump]];

        // revenue to provided wallet
        transfer_from_vault(
            &ctx.accounts.match_vault,
            &ctx.accounts.revenue_wallet,
            &ctx.accounts.system_program,
            revenue,
            &[vault_seeds],
        )?;

        // buyback URA to PDA vault (escrow to be swapped/burned off-chain)
        transfer_from_vault(
            &ctx.accounts.match_vault,
            &ctx.accounts.buyback_ura_vault,
            &ctx.accounts.system_program,
            ura,
            &[vault_seeds],
        )?;

        // buyback URACHAOS to its PDA vault
        transfer_from_vault(
            &ctx.accounts.match_vault,
            &ctx.accounts.buyback_urac_vault,
            &ctx.accounts.system_program,
            urac,
            &[vault_seeds],
        )?;

        // Derive winners and group sizes based on ticket_count.
        let total = m.ticket_count.max(1);
        let winners_count = ceil_div(total as u64 * PCT_33, PCT_100) as u32;
        let group2_count = (ceil_div(total as u64 * PCT_15, PCT_100) as i64 - 1).max(0) as u32;
        let group2_count = group2_count.min(winners_count.saturating_sub(1));
        let group3_count = winners_count.saturating_sub(1 + group2_count);

        m.status = MatchStatus::Finalized as u8;
        m.winners_count = winners_count;
        m.group2_count = group2_count;
        m.group3_count = group3_count;
        m.prize_pool = remaining; // exact amount left in vault for winner claims

        // Precompute remainder to be added to rank 1 allocation later (rounding effect)
        m.remainder = compute_remainder_for_top1(remaining, winners_count, group2_count, group3_count);

        // Update global stats
        let stats = &mut ctx.accounts.stats;
        stats.total_matches = stats.total_matches.saturating_add(1);
        stats.total_players = stats.total_players.saturating_add(m.ticket_count as u64);
        stats.total_prize_distributed = stats.total_prize_distributed.saturating_add(remaining as u128);
        stats.total_ura_earmarked_sol = stats.total_ura_earmarked_sol.saturating_add(ura as u128);
        stats.total_urac_earmarked_sol = stats.total_urac_earmarked_sol.saturating_add(urac as u128);

        Ok(())
    }

    // Records a per-winner allocation. Must be called by the authority after finalize.
    // Multiple calls: one per winner with their rank (1-based).
    pub fn record_allocation(ctx: Context<RecordAllocation>, rank: u32) -> Result<()> {
        let m = &mut ctx.accounts.match_state;
        require!(m.status == MatchStatus::Finalized as u8, ArenaError::MatchNotFinalized);
        require!(rank >= 1 && rank <= m.winners_count, ArenaError::InvalidRank);

        let amount = compute_rank_allocation(m.prize_pool, m.winners_count, m.group2_count, m.group3_count, rank, m.remainder)?;
        require!(amount > 0, ArenaError::ZeroAllocation);

        let alloc = &mut ctx.accounts.allocation;
        alloc.match_key = m.key();
        alloc.player = ctx.accounts.winner.key();
        alloc.amount = amount;
        alloc.claimed = false;
        alloc.bump = *ctx.bumps.get("allocation").unwrap();

        // Count recorded allocations to track progress if desired
        m.allocations_recorded = m.allocations_recorded.saturating_add(1);
        Ok(())
    }

    // Winner claims their SOL from the match vault after allocation is recorded.
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let alloc = &mut ctx.accounts.allocation;
        require!(!alloc.claimed, ArenaError::AlreadyClaimed);
        let amount = alloc.amount;
        require!(amount > 0, ArenaError::ZeroAllocation);
        require!(alloc.player == ctx.accounts.winner.key(), ArenaError::InvalidAllocationOwner);

        // Transfer from vault PDA to winner
        let vault_bump = *ctx.bumps.get("match_vault").unwrap();
        let vault_seeds: &[&[u8]] = &[b"vault", &ctx.accounts.match_state.key().to_bytes(), &[vault_bump]];
        transfer_from_vault(
            &ctx.accounts.match_vault,
            &ctx.accounts.winner,
            &ctx.accounts.system_program,
            amount,
            &[vault_seeds],
        )?;

        alloc.claimed = true;
        Ok(())
    }
}

// Accounts
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [b"config"],
        bump,
        space = 8 + ArenaConfig::SIZE,
    )]
    pub config: Account<'info, ArenaConfig>,
    // Stats PDA holding global counters
    #[account(
        init,
        payer = authority,
        seeds = [b"stats", config.key().as_ref()],
        bump,
        space = 8 + Stats::SIZE,
    )]
    pub stats: Account<'info, Stats>,
    // Buyback vault PDAs to accumulate SOL for later off-chain buyback and burn operations
    #[account(
        init,
        payer = authority,
        seeds = [b"buyback_ura", config.key().as_ref()],
        bump,
        space = 0,
    )]
    pub buyback_ura_vault: SystemAccount<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [b"buyback_urac", config.key().as_ref()],
        bump,
        space = 0,
    )]
    pub buyback_urac_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Join<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ArenaConfig>,
    #[account(
        init_if_needed,
        payer = player,
        seeds = [b"match", &current_day_bytes()],
        bump,
        space = 8 + MatchState::SIZE,
    )]
    pub match_state: Account<'info, MatchState>,
    #[account(
        init_if_needed,
        payer = player,
        seeds = [b"vault", match_state.key().as_ref()],
        bump,
        space = 0,
    )]
    pub match_vault: SystemAccount<'info>,
    #[account(
        init,
        payer = player,
        seeds = [b"entry", match_state.key().as_ref(), player.key().as_ref()],
        bump,
        space = 8 + PlayerEntry::SIZE,
    )]
    pub entry: Account<'info, PlayerEntry>,
    /// CHECK: Pyth SOL/USD price account
    #[account(address = config.pyth_price_account)]
    pub pyth_price_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeMatch<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ArenaConfig>,
    #[account(mut, seeds = [b"stats", config.key().as_ref()], bump = stats.bump)]
    pub stats: Account<'info, Stats>,
    #[account(mut, seeds = [b"match", &match_state.day_id.to_le_bytes()], bump = match_state.bump)]
    pub match_state: Account<'info, MatchState>,
    #[account(mut, seeds = [b"vault", match_state.key().as_ref()], bump)]
    pub match_vault: SystemAccount<'info>,
    #[account(mut, seeds = [b"buyback_ura", config.key().as_ref()], bump = config.buyback_ura_bump)]
    pub buyback_ura_vault: SystemAccount<'info>,
    #[account(mut, seeds = [b"buyback_urac", config.key().as_ref()], bump = config.buyback_urac_bump)]
    pub buyback_urac_vault: SystemAccount<'info>,
    /// CHECK: revenue wallet can be any system account
    #[account(mut, address = config.revenue_wallet)]
    pub revenue_wallet: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordAllocation<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ArenaConfig>,
    #[account(mut, seeds = [b"match", &match_state.day_id.to_le_bytes()], bump = match_state.bump)]
    pub match_state: Account<'info, MatchState>,
    /// CHECK: winner pubkey recorded in allocation
    pub winner: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [b"alloc", match_state.key().as_ref(), winner.key().as_ref()],
        bump,
        space = 8 + WinnerAllocation::SIZE,
    )]
    pub allocation: Account<'info, WinnerAllocation>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,
    #[account(mut, seeds = [b"match", &match_state.day_id.to_le_bytes()], bump = match_state.bump)]
    pub match_state: Account<'info, MatchState>,
    #[account(mut, seeds = [b"vault", match_state.key().as_ref()], bump)]
    pub match_vault: SystemAccount<'info>,
    #[account(mut, seeds = [b"alloc", match_state.key().as_ref(), winner.key().as_ref()], bump = allocation.bump)]
    pub allocation: Account<'info, WinnerAllocation>,

    pub system_program: Program<'info, System>,
}

// State
#[account]
#[derive(Default)]
pub struct ArenaConfig {
    pub authority: Pubkey,
    pub revenue_wallet: Pubkey,
    pub pyth_price_account: Pubkey,
    pub min_ticket_lamports: u64,
    pub bump: u8,
    pub buyback_ura_bump: u8,
    pub buyback_urac_bump: u8,
}
impl ArenaConfig { pub const SIZE: usize = 32 + 32 + 32 + 8 + 3; }

#[account]
pub struct MatchState {
    pub day_id: i64,
    pub ticket_count: u32,
    pub pot_lamports: u64,
    pub status: u8, // 0 = Open, 1 = Finalized
    pub bump: u8,
    // Finalization data
    pub winners_count: u32,
    pub group2_count: u32,
    pub group3_count: u32,
    pub prize_pool: u64,
    pub allocations_recorded: u32,
    pub remainder: u64, // carry rounding remainder to rank 1
}
impl MatchState {
    pub const SIZE: usize = 8 + 4 + 8 + 1 + 1 + 4 + 4 + 4 + 8 + 4 + 8;
}

#[account]
#[derive(Default)]
pub struct PlayerEntry {
    pub match_key: Pubkey,
    pub player: Pubkey,
    pub paid: u64,
    pub joined_at: i64,
    pub bump: u8,
}
impl PlayerEntry { pub const SIZE: usize = 32 + 32 + 8 + 8 + 1; }

#[account]
#[derive(Default)]
pub struct WinnerAllocation {
    pub match_key: Pubkey,
    pub player: Pubkey,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}
impl WinnerAllocation { pub const SIZE: usize = 32 + 32 + 8 + 2; }

#[repr(u8)]
pub enum MatchStatus { Open = 0, Finalized = 1 }

#[account]
#[derive(Default)]
pub struct Stats {
    pub total_matches: u64,
    pub total_players: u64,
    pub total_prize_distributed: u128,
    pub total_ura_earmarked_sol: u128,
    pub total_urac_earmarked_sol: u128,
    pub total_ura_burned_atoms: u128,
    pub total_urac_burned_atoms: u128,
    pub total_ura_burn_sol: u64,
    pub total_urac_burn_sol: u64,
    pub bump: u8,
}
impl Stats { pub const SIZE: usize = 8 + 8 + 16*5 + 8 + 8 + 1; }

// Utils
fn unix_day(ts: i64) -> i64 { ts.div_euclid(86_400) }

fn current_day_bytes() -> [u8; 8] {
    let ts = Clock::get().unwrap().unix_timestamp; // only called in account seeds context during join
    unix_day(ts).to_le_bytes()
}

fn ceil_div(numer: u64, denom: u64) -> u64 { (numer + denom - 1) / denom }

fn compute_remainder_for_top1(prize: u64, winners: u32, group2: u32, group3: u32) -> u64 {
    if winners == 0 { return 0; }
    let top1 = (prize as u128 * 50) / 100;
    let g2_total = (prize as u128 * 35) / 100;
    let g3_total = (prize as u128 * 15) / 100;

    let g2_each = if group2 > 0 { g2_total / group2 as u128 } else { 0 };
    let g3_each = if group3 > 0 { g3_total / group3 as u128 } else { 0 };

    // Sum of floors
    let sum = top1 + g2_each * group2 as u128 + g3_each * group3 as u128;
    let prize_u128 = prize as u128;
    let rem = prize_u128.saturating_sub(sum);
    rem as u64
}

fn compute_rank_allocation(
    prize: u64,
    winners: u32,
    group2: u32,
    group3: u32,
    rank: u32,
    remainder_for_top1: u64,
) -> Result<u64> {
    require!(rank >= 1 && rank <= winners, ArenaError::InvalidRank);
    let p = prize as u128;
    if rank == 1 {
        let base = (p * 50) / 100;
        let amt = base as u64 + remainder_for_top1; // carry rounding remainder to top1
        return Ok(amt);
    }
    if rank <= 1 + group2 && group2 > 0 {
        let g2_total = (p * 35) / 100;
        let each = (g2_total / group2 as u128) as u64;
        return Ok(each);
    }
    if group3 > 0 {
        let g3_total = (p * 15) / 100;
        let each = (g3_total / group3 as u128) as u64;
        return Ok(each);
    }
    Ok(0)
}

const LAMPORTS_PER_SOL_CONST: i128 = 1_000_000_000;

fn lamports_for_usd_ceil(usd_whole: u64, price: i64, expo: i32) -> Result<u64> {
    require!(price > 0, ArenaError::PythError);
    let price_i = price as i128;
    let usd_i = usd_whole as i128;

    let res_i: i128 = if expo < 0 {
        let scale = ten_pow_i128((-expo) as u32)?;
        let numer = usd_i
            .checked_mul(LAMPORTS_PER_SOL_CONST).ok_or(ArenaError::Overflow)?
            .checked_mul(scale).ok_or(ArenaError::Overflow)?;
        ceil_div_i128(numer, price_i)?
    } else if expo > 0 {
        let scale = ten_pow_i128(expo as u32)?;
        let denom = price_i.checked_mul(scale).ok_or(ArenaError::Overflow)?;
        let numer = usd_i
            .checked_mul(LAMPORTS_PER_SOL_CONST).ok_or(ArenaError::Overflow)?;
        ceil_div_i128(numer, denom)?
    } else {
        let numer = usd_i
            .checked_mul(LAMPORTS_PER_SOL_CONST).ok_or(ArenaError::Overflow)?;
        ceil_div_i128(numer, price_i)?
    };

    u64::try_from(res_i).map_err(|_| error!(ArenaError::Overflow))
}

fn ten_pow_i128(exp: u32) -> Result<i128> {
    let mut r: i128 = 1;
    for _ in 0..exp {
        r = r.checked_mul(10).ok_or(ArenaError::Overflow)?;
    }
    Ok(r)
}

fn ceil_div_i128(numer: i128, denom: i128) -> Result<i128> {
    require!(denom > 0, ArenaError::Overflow);
    Ok((numer + denom - 1) / denom)
}

// Authority posts buy+burn results to stats
#[derive(Accounts)]
pub struct RecordBurned<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ArenaConfig>,
    #[account(mut, seeds = [b"stats", config.key().as_ref()], bump = stats.bump)]
    pub stats: Account<'info, Stats>,
}
    }

    pub fn record_burned(ctx: Context<RecordBurned>, ura_burned_atoms: u128, urac_burned_atoms: u128, ura_sol_spent: u64, urac_sol_spent: u64) -> Result<()> {
        let stats = &mut ctx.accounts.stats;
        stats.total_ura_burned_atoms = stats.total_ura_burned_atoms.saturating_add(ura_burned_atoms);
        stats.total_urac_burned_atoms = stats.total_urac_burned_atoms.saturating_add(urac_burned_atoms);
        stats.total_ura_burn_sol = stats.total_ura_burn_sol.saturating_add(ura_sol_spent);
        stats.total_urac_burn_sol = stats.total_urac_burn_sol.saturating_add(urac_sol_spent);
        Ok(())
    }
}

fn transfer_from_vault(
    from: &SystemAccount,
    to: &impl ToAccountInfo,
    system_program: &Program<System>,
    lamports: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if lamports == 0 { return Ok(()); }
    let ix = system_instruction::transfer(&from.key(), &to.to_account_info().key(), lamports);
    invoke_signed(
        &ix,
        &[
            from.to_account_info(),
            to.to_account_info(),
            system_program.to_account_info(),
        ],
        signer_seeds,
    )?;
    Ok(())
}

#[error_code]
pub enum ArenaError {
    #[msg("invalid amount")] InvalidAmount,
    #[msg("ticket amount below minimum")] TicketTooCheap,
    #[msg("wrong match account for current day")] WrongMatchForDay,
    #[msg("match already closed or not open")] MatchClosed,
    #[msg("too early to finalize")] TooEarlyToFinalize,
    #[msg("match already finalized")] MatchAlreadyFinalized,
    #[msg("pot is empty")] EmptyPot,
    #[msg("overflow")] Overflow,
    #[msg("invalid rank")] InvalidRank,
    #[msg("zero allocation")] ZeroAllocation,
    #[msg("already claimed")] AlreadyClaimed,
    #[msg("match not finalized")] MatchNotFinalized,
    #[msg("pyth price error")] PythError,
    #[msg("pyth price stale")] PythStale,
    #[msg("pyth confidence too wide")] PythConfTooWide,
    #[msg("allocation not owned by winner")] InvalidAllocationOwner,
}
