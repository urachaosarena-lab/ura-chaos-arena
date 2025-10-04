# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project summary
- Single-page app built with React 18 + Vite + TypeScript, styled with Tailwind CSS.
- Integrates Solana Wallet Adapter (Phantom, Solflare) for wallet connection and sends a $5 SOL tribute to a configured vault address.
- Leaderboard UI is stubbed; README outlines how to wire it to Helius RPC.

Commands
- Install dependencies (uses npm due to package-lock.json)
  ```powershell path=null start=null
  npm install
  ```
- Start dev server (Vite; opens on http://localhost:5173 by default)
  ```powershell path=null start=null
  npm run dev
  ```
- Build production bundle (outputs to dist/)
  ```powershell path=null start=null
  npm run build
  ```
- Preview the production build locally
  ```powershell path=null start=null
  npm run preview -- --port 5173
  ```
- Type-check TypeScript only (no ESLint configured)
  ```powershell path=null start=null
  npm run typecheck
  ```
- Tests
  - No test runner is configured; there is no test script in package.json.

Environment and configuration
- Vite env vars (prefixed with VITE_) are used for Solana and Helius:
  - VITE_HELIUS_API_KEY
  - VITE_VAULT_ADDRESS (SOL address for the vault)
  - VITE_RPC_ENDPOINT (e.g., https://mainnet.helius-rpc.com/?api-key={{HELIUS_API_KEY}})
- Example (PowerShell) for a local dev session:
  ```powershell path=null start=null
  $env:VITE_HELIUS_API_KEY = "{{HELIUS_API_KEY}}"
  $env:VITE_VAULT_ADDRESS = "{{VAULT_PUBKEY}}"
  $env:VITE_RPC_ENDPOINT = "https://mainnet.helius-rpc.com/?api-key={{HELIUS_API_KEY}}"
  npm run dev
  ```
- Alternatively, create an .env.local file in the project root (Vite auto-loads it):
  ```bash path=null start=null
  VITE_HELIUS_API_KEY={{HELIUS_API_KEY}}
  VITE_VAULT_ADDRESS={{VAULT_PUBKEY}}
  VITE_RPC_ENDPOINT=https://mainnet.helius-rpc.com/?api-key={{HELIUS_API_KEY}}
  ```
- Reference: .env.example lists these variables.

Architecture overview
- Entry points
  - index.html boots the app; src/main.tsx mounts React and wraps the tree with WalletContextProvider.
- Wallet integration (src/wallet/WalletContextProvider.tsx)
  - Provides Solana ConnectionProvider and WalletProvider (Phantom, Solflare) with an endpoint from VITE_RPC_ENDPOINT (defaults to clusterApiUrl(Mainnet)).
  - Centralizes wallet errors (logged and bubbled via a lightweight data attribute on the wrapper div).
- UI composition (src/ui/App.tsx)
  - Top bar handles theme toggle and wallet connect/disconnect.
  - Three-tab layout: Dashboard (join action + leaderboard), Profile (address/balance), Hall of Fame (placeholder).
  - “Join the Arena” constructs a SystemProgram.transfer transaction from the connected wallet to VITE_VAULT_ADDRESS. Amount equals roughly $5 in SOL using a best-effort price from Pyth Hermes, with a safe fallback.
- Styling (Tailwind)
  - Tailwind configured with darkMode: 'class' and custom color tokens (sand, sky, arena) in tailwind.config.ts; utilities consumed in src/styles/index.css.
- Build tooling
  - Vite configured via vite.config.ts with @vitejs/plugin-react.
  - tsconfig.json targets ES2020 with strict type-checking and no emit.

Notes from README
- Quick start calls out required env vars and using Helius RPC for leaderboard data.
- Vault handling is intentionally simple in the scaffold; production guidance is provided in README.

Repository layout (key paths)
- public/ (static assets)
- src/
  - styles/ (global Tailwind CSS entry)
  - wallet/ (Solana wallet context provider)
  - ui/ (top-level App UI)
  - main.tsx (app bootstrap)
