# On-chain Program (Anchor)

This directory contains the Solana program for UraChaos Arena built with Anchor.

Key capabilities
- Vault per daily match (UTC day), holding SOL ticket payments
- Automatic match creation on the first join for a given UTC day
- Finalization after UTC midnight: splits the pot into 85% prize, 5% URA buyback escrow, 5% URACHAOS buyback escrow, 5% revenue
- Payouts to winners via claimable allocations to reduce finalize compute

Important design notes
- “Automatic” match start: there is no on-chain scheduler. The first join for a given UTC day implicitly creates that day’s match. A keeper should call finalize_match shortly after 00:00 UTC.
- $5 ticket: enforced on-chain using the Pyth SOL/USD price feed stored in config. The program computes required lamports at join time using the current price and rejects stale (>120s) or high-uncertainty (>5% conf) quotes.
- Winners: because %PNL comes from @uranusperps activity, a trusted off-chain referee must determine winners and ranks. The program records allocations per winner (record_allocation), which the winners then claim.
- Buy and burn: to keep it simple, SOL for “buy and burn” accumulates in PDA escrow accounts (buyback_ura_vault and buyback_urac_vault). A simple off-chain job can periodically buy URA/URACHAOS on a DEX and burn the tokens.
- Global stats: a Stats PDA tracks totals (matches, players, prize distributed, earmarked SOL, and burned metrics). The keeper can post burn results via record_burned.

Workspace layout
- Anchor.toml
- Cargo.toml (workspace)
- programs/ura_chaos_arena/src/lib.rs (program)
- PDAs: config, stats, match (per UTC day), match vault, entry (per player), allocation (per winner)

Program ID
- A placeholder program ID is used in src/lib.rs and Anchor.toml. Before deploying, generate and set a real ID:
  ```powershell
  # Generate a new keypair and set it for local program
  anchor keys list
  anchor keys set ura_chaos_arena
  # Update Anchor.toml and src/lib.rs declare_id!(...) with the generated pubkey
  ```

Pyth SOL/USD price account
- Mainnet SOL/USD (v1) price account (commonly used):
  - J83wilaeS8kAK4ZDi8z9t1EznYUmkG4bxyMZaNBZrMz
- For devnet/localnet use a local aggregator or pass a devnet price account as available.

Build and test (Localnet)
- Prereqs: Anchor CLI, Rust toolchain, Solana CLI (on Windows, WSL is recommended for smooth Anchor use).
- From this directory:
  ```powershell
  anchor build
  anchor test
  ```

Deploy (Localnet)
```powershell
solana-test-validator -r
anchor deploy
```

Instruction flow
- initialize_config(authority, revenue_wallet, pyth_price_account, min_ticket_lamports)
  - Creates the ArenaConfig PDA, Stats PDA, and the two buyback escrow PDAs.
  - Stores the Pyth SOL/USD price account used to enforce the $5 ticket on-chain.
  - For now, set revenue_wallet to your provided wallet: RACKsrXFihuNz9yGJoSLHZrspaJ5NjKB2NN4wYbakdP
- join(amount)
  - Reads Pyth SOL/USD (must be fresh <=120s, conf <=5%) and enforces amount >= required lamports for $5.
  - Seeds the match for today (UTC) if missing, creates the match vault, records a PlayerEntry, and transfers `amount` lamports from player to vault.
- finalize_match(day_id)
  - After UTC midnight (day_id < current_day), splits the pot into prize and 3x 5% buckets. Derives winners_count (top 33%) and group sizes for distribution tiers.
  - Updates global Stats counters with that day’s totals.
- record_allocation(rank)
  - Authority records an allocation for a given winner and rank (1-based). Uses the tier formula: 50% to rank 1, 35% split among next ~15% (excl. rank 1), 15% split among remaining winners up to 33%.
- claim()
  - Winner withdraws their allocation from the match vault (with owner check).
- record_burned(ura_burned_atoms, urac_burned_atoms, ura_sol_spent, urac_sol_spent)
  - Authority posts off-chain buy+burn results to Stats.

Distribution math
- winners_count = ceil(0.33 × total_players)
- group2_count ≈ ceil(0.15 × total_players) − 1 (capped to winners_count − 1)
- group3_count = winners_count − 1 − group2_count
- Prize pool split (of 85%):
  - Rank 1 gets 50% (+ any rounding remainder)
  - Next group2_count winners split 35% equally
  - Remaining winners (group3_count) split 15% equally

Integration tips
- Frontend: replace the direct SystemProgram.transfer with a CPI into this program’s join instruction, passing the lamports you currently compute for $5. Once a Pyth price account is wired in a future iteration, the program can enforce $5 on-chain.
- Keeper: at 00:00 UTC+ a few seconds, call finalize_match(yesterday_day_id), then submit record_allocation transactions for each winner with their rank and recipient pubkey. Winners can then claim at their leisure.
