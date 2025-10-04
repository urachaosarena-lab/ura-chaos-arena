/!
// Keeper script outline for finalizing matches and recording allocations.
// Usage:
//   - Set env vars:
//       $env:HELIUS_API_KEY = "{{HELIUS_API_KEY}}"
//       $env:URANUS_PERPS_PROGRAM_ID = "URAa3qGD1qVKKqyQrF8iBVZRTwa4Q8RkMd6Gx7u2KL1"  # verify!
//       $env:ARENA_PROGRAM_ID = "<YOUR_PROGRAM_ID>"
//   - Run with ts-node or compile to JS.

import { Connection, PublicKey } from '@solana/web3.js'
import { AnchorProvider, Program, Idl, BN } from '@coral-xyz/anchor'
import idl from '../src/chain/idl/ura_chaos_arena.json'

const RPC = process.env.RPC_ENDPOINT || 'http://127.0.0.1:8899'
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || ''
const URANUS_PERPS_PROGRAM_ID = process.env.URANUS_PERPS_PROGRAM_ID || ''
const ARENA_PROGRAM_ID = new PublicKey(process.env.ARENA_PROGRAM_ID || 'UraChAoSArena111111111111111111111111111111')

const enc = new TextEncoder()
const SEED_MATCH = enc.encode('match')

function dayToLeBytes(dayId: number): Uint8Array {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setBigInt64(0, BigInt(dayId), true)
  return new Uint8Array(buf)
}

function getYesterdayUtcDayId(): number {
  const now = new Date()
  const utcTs = Math.floor(now.getTime() / 1000)
  const day = Math.floor(utcTs / 86400)
  return day - 1
}

async function main() {
  if (!HELIUS_API_KEY) throw new Error('Missing HELIUS_API_KEY')
  if (!URANUS_PERPS_PROGRAM_ID) console.warn('URANUS_PERPS_PROGRAM_ID not set; PnL computation will be skipped')

  const connection = new Connection(RPC, 'confirmed')
  const provider = new AnchorProvider(connection as any, {} as any, {})
  const program = new Program(idl as Idl, ARENA_PROGRAM_ID, provider)

  const yesterday = getYesterdayUtcDayId()

  // 1) finalize_match(yesterday)
  try {
    // Note: accounts include config, stats, match_state, match_vault, buyback vaults, revenue wallet
    // You must pass the correct PDAs here (omitted for brevity). Use the same derivations as in src/chain/arena.ts
    console.log('Finalize match for day:', yesterday)
    // await program.methods.finalizeMatch(new BN(yesterday)).accounts({...}).rpc()
  } catch (e) {
    console.warn('finalize_match failed or already finalized:', e)
  }

  // 2) Compute PnL rankings from UranusPerps between each entrant's join time and yesterday end.
  //    This placeholder only logs the example tx the user provided.
  console.log('Fetch and compute PnL via Helius for UranusPerps program:', URANUS_PERPS_PROGRAM_ID)
  // Example Helius endpoint (pseudocode):
  // const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  // post JSON-RPC methods like getSignaturesForAddress or getTransactions for UranusPerps events

  // 3) For each winner by rank, call record_allocation(rank) with their pubkey
  // await program.methods.recordAllocation(rank).accounts({...winner pk..., match pk...}).rpc()

  console.log('Keeper finished')
}

main().catch(err => { console.error(err); process.exit(1) })
