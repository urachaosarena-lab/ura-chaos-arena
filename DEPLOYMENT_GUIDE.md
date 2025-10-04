# 🏛️ UraChaos Arena - Smart Contract Deployment Guide

## Prerequisites

1. **Install Solana CLI**: https://docs.solana.com/cli/install-solana-cli-tools
2. **Install Anchor**: https://www.anchor-lang.com/docs/installation
3. **Setup Solana wallet** with sufficient SOL (minimum 5-10 SOL recommended)
4. **Get Pyth SOL/USD price account** address

## Step-by-Step Deployment

### 1. Setup Environment
```bash
# Set to mainnet-beta for production
solana config set --url mainnet-beta

# Or devnet for testing first
solana config set --url devnet

# Check your wallet balance
solana balance

# Generate new program keypair
solana-keygen new --outfile ./target/deploy/ura_chaos_arena-keypair.json
```

### 2. Update Configuration Files

#### Edit `onchain/Anchor.toml`:
```toml
[provider]
cluster = "Mainnet"  # or "Devnet" for testing
wallet = "~/.config/solana/id.json"

[programs.mainnet]
ura_chaos_arena = "YOUR_PROGRAM_ID_HERE"  # Get from keypair
```

#### Get your program ID:
```bash
solana address -k ./target/deploy/ura_chaos_arena-keypair.json
```

### 3. Update Smart Contract Program ID

Edit `onchain/programs/ura_chaos_arena/src/lib.rs` line 6:
```rust
declare_id!("YOUR_ACTUAL_PROGRAM_ID_HERE");
```

### 4. Build and Deploy
```bash
cd onchain

# Build the program
anchor build

# Deploy to blockchain (costs 2-5 SOL)
anchor deploy

# Verify deployment
solana program show YOUR_PROGRAM_ID
```

### 5. Initialize Configuration

Create initialization script or use Anchor client:

```javascript
// Required parameters for initialization:
const REVENUE_WALLET = "YOUR_REVENUE_WALLET_PUBKEY";
const PYTH_SOL_USD = "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG"; // Mainnet SOL/USD
const MIN_TICKET_LAMPORTS = 1000000; // 0.001 SOL minimum safety

await program.methods
  .initializeConfig(
    new PublicKey(REVENUE_WALLET),
    new PublicKey(PYTH_SOL_USD), 
    new anchor.BN(MIN_TICKET_LAMPORTS)
  )
  .accounts({
    authority: wallet.publicKey,
    // ... other accounts derived automatically
  })
  .rpc();
```

## Environment Variables

Add to your frontend `.env`:
```
VITE_ARENA_PROGRAM_ID=YOUR_DEPLOYED_PROGRAM_ID
VITE_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
VITE_PYTH_SOL_USD_PRICE_ACCOUNT=H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG
VITE_VAULT_ADDRESS=YOUR_REVENUE_WALLET
```

## Cost Breakdown

- **Program Deployment**: 2-5 SOL
- **Config + Stats + Buyback Vaults**: ~0.1 SOL  
- **Gas for transactions**: ~0.05 SOL
- **Buffer for operations**: 2-3 SOL
- **Total recommended**: **8-10 SOL** for safe deployment

## Post-Deployment Tasks

1. **Test with small amounts first**
2. **Setup keeper bot** for match finalization
3. **Update frontend environment variables**  
4. **Test full flow**: join → finalize → allocate → claim
5. **Monitor Pyth price feeds** for accuracy

## Mainnet vs Devnet

### Devnet (Testing):
- **Free SOL** from faucet
- **Test everything** first
- **Same contract code** as mainnet
- **Pyth feeds available** for testing

### Mainnet (Production):
- **Real SOL required**
- **Real money at stake**
- **Production Pyth feeds**
- **Final deployment**

## Security Checklist

✅ Program ID properly set  
✅ Revenue wallet controlled by you  
✅ Pyth price account verified  
✅ Minimum ticket amount reasonable  
✅ Authority keypair secure  
✅ All accounts properly derived  
✅ Full testing completed on devnet  

## Emergency Procedures

- **Authority keypair** controls critical functions
- **Revenue wallet** receives operational fees
- **Buyback vaults** accumulate SOL for token burns
- **Monitor daily** for match finalizations
- **Keep authority wallet** extremely secure

Happy deploying, gladiator! ⚔️