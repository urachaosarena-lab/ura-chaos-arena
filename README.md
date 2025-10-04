# UraChaos Arena

A mobile-friendly Solana dApp where champions buy a ticket to enter a 24-hour trading clash. The leaderboard hails the top 25 by %PNL among warriors trading on @UranusPerps. Each dawn resets the sands; the victors are crowned.

## Tech stack
- React + Vite + TypeScript
- Tailwind CSS (dark-mode via class)
- Solana Wallet Adapter (Phantom, Solflare)
- @solana/web3.js

## Quick start
1) Copy environment example and fill values:

   PowerShell:
   $env:VITE_HELIUS_API_KEY = "{{HELIUS_API_KEY}}"
   $env:VITE_VAULT_ADDRESS = "{{VAULT_PUBKEY}}"
   $env:VITE_RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key={{HELIUS_API_KEY}}"

   Or create a .env.local file at project root with those variables for Vite.

2) Install and run:
   npm install
   npm run dev

3) Open the arena in your browser (printed URL). Connect Phantom/Solflare and enter the sand.

## The Vault (ticket payments)
- The Join the Arena button sends exactly $5 worth of SOL to a vault public key you control (VITE_VAULT_ADDRESS).
- In this scaffold, we compute SOL amount client-side using a placeholder Pyth price fetch with a safe fallback.
- For production, you should:
  - Use a program-owned vault (PDA) on your Anchor/Native program.
  - Move price conversion on-chain or verify off-chain quote server-side.
  - Optionally adopt Solana Pay flows for request encoding and receipts.

### Managing the vault
- If you already have a program: expose an instruction that validates payer, amount (>= $5 in lamports), and records participant and cycle timestamp.
- If you don’t yet have a program: you can temporarily use a standard system account as the vault (env VITE_VAULT_ADDRESS). Replace with a program-derived address (PDA) later.

## Leaderboard data (Helius)
- The Dashboard shows a stubbed leaderboard. Wire it to Helius by querying your protocol’s on-chain data (program ID, accounts, or parsed transactions) and compute 24h %PNL post-ticket.
- Provide VITE_HELIUS_API_KEY and VITE_RPC_ENDPOINT to use Helius RPC.

## Theme & Lore
- Light theme: military sand and light blue, dark font; the sands deepen near the footer.
- Dark theme: dark grey and dark blue, light font.
- Settings are saved to localStorage.

## Disclaimer
This is a scaffold to enter the arena swiftly. Harden program logic, input validation, price sources, and leaderboards before the grand tournament.
