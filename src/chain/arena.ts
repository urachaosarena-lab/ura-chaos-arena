import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor'
import idl from './idl/ura_chaos_arena.json'

export const PROGRAM_ID = new PublicKey(import.meta.env.VITE_ARENA_PROGRAM_ID || 'UraChAoSArena111111111111111111111111111111')

const enc = new TextEncoder()
const SEED_MATCH = enc.encode('match')
const SEED_VAULT = enc.encode('vault')
const SEED_ALLOC = enc.encode('alloc')
const SEED_CONFIG = enc.encode('config')
const SEED_STATS = enc.encode('stats')
const SEED_ENTRY = enc.encode('entry')

function dayToLeBytes(dayId: number): Uint8Array {
  const buf = new ArrayBuffer(8)
  const view = new DataView(buf)
  view.setBigInt64(0, BigInt(dayId), true)
  return new Uint8Array(buf)
}

export function getYesterdayUtcDayId(): number {
  const now = new Date()
  const utcTs = Math.floor(now.getTime() / 1000)
  const day = Math.floor(utcTs / 86400)
  return day - 1
}

export function getTodayUtcDayId(): number {
  const now = new Date()
  const utcTs = Math.floor(now.getTime() / 1000)
  return Math.floor(utcTs / 86400)
}

export function deriveConfigPda() {
  return PublicKey.findProgramAddressSync([SEED_CONFIG], PROGRAM_ID)[0]
}
export function deriveStatsPda(configPk: PublicKey) {
  return PublicKey.findProgramAddressSync([SEED_STATS, configPk.toBytes()], PROGRAM_ID)[0]
}
export function deriveMatchPda(dayId: number) {
  return PublicKey.findProgramAddressSync([SEED_MATCH, dayToLeBytes(dayId)], PROGRAM_ID)[0]
}
export function deriveVaultPda(matchPk: PublicKey) {
  return PublicKey.findProgramAddressSync([SEED_VAULT, matchPk.toBytes()], PROGRAM_ID)[0]
}
export function deriveAllocationPda(matchPk: PublicKey, player: PublicKey) {
  return PublicKey.findProgramAddressSync([SEED_ALLOC, matchPk.toBytes(), player.toBytes()], PROGRAM_ID)[0]
}

export async function buildClaimIx(connection: Connection, walletPubkey: PublicKey, dayId: number): Promise<TransactionInstruction> {
  const matchState = deriveMatchPda(dayId)
  const matchVault = deriveVaultPda(matchState)
  const allocation = deriveAllocationPda(matchState, walletPubkey)

  const provider = new AnchorProvider(connection as any, {} as any, {})
  const program = new Program(idl as Idl, PROGRAM_ID, provider)
  const ix = await program.methods
    .claim()
    .accounts({
      winner: walletPubkey,
      matchState,
      matchVault,
      allocation,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
  return ix
}

export async function buildJoinIx(connection: Connection, walletPubkey: PublicKey, lamports: number, pythPriceAccount: PublicKey, dayId: number): Promise<TransactionInstruction> {
  const config = deriveConfigPda()
  const matchState = deriveMatchPda(dayId)
  const matchVault = deriveVaultPda(matchState)
  const entry = PublicKey.findProgramAddressSync([SEED_ENTRY, matchState.toBytes(), walletPubkey.toBytes()], PROGRAM_ID)[0]

  const provider = new AnchorProvider(connection as any, {} as any, {})
  const program = new Program(idl as Idl, PROGRAM_ID, provider)
  const ix = await program.methods
    .join(new BN(lamports))
    .accounts({
      player: walletPubkey,
      config,
      matchState,
      matchVault,
      entry,
      pythPriceAccount,
      systemProgram: SystemProgram.programId,
    })
    .instruction()
  return ix
}

// High Stakes functions (will need smart contract update in Phase 2)
export function deriveHighStakesMatchPda(dayId: number) {
  // For now, use a different seed prefix to distinguish from regular matches
  const SEED_HIGH_STAKES = new TextEncoder().encode('high-stakes')
  return PublicKey.findProgramAddressSync([SEED_HIGH_STAKES, dayToLeBytes(dayId)], PROGRAM_ID)[0]
}

export async function buildJoinHighStakesIx(connection: Connection, walletPubkey: PublicKey, lamports: number, pythPriceAccount: PublicKey, dayId: number): Promise<TransactionInstruction> {
  // This will need to be implemented when the smart contract is updated in Phase 2
  // For now, throw an error to indicate it's not ready
  throw new Error('High Stakes arena is coming in Phase 2!')
}

export async function getUsdToSolRateFromPyth(connection: Connection, pythPriceAccount: PublicKey): Promise<number> {
  // Placeholder function for getting SOL price from Pyth
  // This will be used for both $5 and $50 ticket calculations
  try {
    const info = await connection.getAccountInfo(pythPriceAccount)
    if (!info) throw new Error('Pyth price account not found')
    // For now, return fallback price
    return 150 // USD per SOL fallback
  } catch {
    return 150 // USD per SOL fallback
  }
}

// Minimal parsers
export type MatchStateLite = {
  dayId: bigint
  ticketCount: number
  potLamports: bigint
  status: number
  prizePool: bigint
}

export function parseMatchState(data: Uint8Array): MatchStateLite | null {
  if (!data || data.length < 8 + 54) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let o = 8 // skip discriminator
  const dayId = view.getBigInt64(o, true); o += 8
  const ticketCount = view.getUint32(o, true); o += 4
  const potLamports = view.getBigUint64(o, true); o += 8
  const status = view.getUint8(o); o += 1
  o += 1 // bump
  o += 4 // winners_count
  o += 4 // group2
  o += 4 // group3
  const prizePool = view.getBigUint64(o, true); o += 8
  return { dayId, ticketCount, potLamports, status, prizePool }
}

export type AllocationLite = { amount: bigint, claimed: boolean }
export function parseAllocation(data: Uint8Array): AllocationLite | null {
  if (!data || data.length < 8 + 80) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let o = 8 + 32 + 32 // skip disc + match_key + player
  const amount = view.getBigUint64(o, true); o += 8
  const claimed = view.getUint8(o) === 1
  return { amount, claimed }
}

export async function fetchAllMatches(connection: Connection): Promise<MatchStateLite[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: 8 + 54 }],
  })
  return accounts
    .map(a => parseMatchState(a.account.data)!)
    .filter(Boolean) as MatchStateLite[]
}

export type StatsLite = {
  totalMatches: bigint
  totalPlayers: bigint
  totalPrizeDistributedLamports: bigint
  totalUraEarmarkedLamports: bigint
  totalUracEarmarkedLamports: bigint
  totalUraBurnedAtoms: bigint
  totalUracBurnedAtoms: bigint
  totalUraBurnSolLamports: bigint
  totalUracBurnSolLamports: bigint
}

export async function fetchStats(connection: Connection): Promise<StatsLite | null> {
  const config = deriveConfigPda()
  const statsPk = deriveStatsPda(config)
  const info = await connection.getAccountInfo(statsPk)
  if (!info) return null
  const data = info.data
  if (data.length < 8 + (8+8+16*5+8+8+1+7)) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let o = 8 // disc
  const totalMatches = view.getBigUint64(o, true); o += 8
  const totalPlayers = view.getBigUint64(o, true); o += 8
  const totalPrizeDistributedLamports = getBigUint128(view, o); o += 16
  const totalUraEarmarkedLamports = getBigUint128(view, o); o += 16
  const totalUracEarmarkedLamports = getBigUint128(view, o); o += 16
  const totalUraBurnedAtoms = getBigUint128(view, o); o += 16
  const totalUracBurnedAtoms = getBigUint128(view, o); o += 16
  const totalUraBurnSolLamports = view.getBigUint64(o, true); o += 8
  const totalUracBurnSolLamports = view.getBigUint64(o, true); o += 8
  return { totalMatches, totalPlayers, totalPrizeDistributedLamports, totalUraEarmarkedLamports, totalUracEarmarkedLamports, totalUraBurnedAtoms, totalUracBurnedAtoms, totalUraBurnSolLamports, totalUracBurnSolLamports }
}

// Fetch current match participants for leaderboard
export async function fetchCurrentMatchParticipants(connection: Connection): Promise<Array<{address: string, joinedAt: number, paid: number}>> {
  try {
    const dayId = getTodayUtcDayId()
    const matchPda = deriveMatchPda(dayId)
    
    // Get all player entries for this match
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { dataSize: 8 + 88 }, // PlayerEntry size
        {
          memcmp: {
            offset: 8, // Skip discriminator
            bytes: matchPda.toBase58(),
          }
        }
      ]
    })
    
    return accounts.map(account => {
      const data = account.account.data
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
      let o = 8 // skip discriminator
      o += 32 // skip match_key
      
      const playerBytes = new Uint8Array(data.buffer, data.byteOffset + o, 32)
      const player = new PublicKey(playerBytes)
      o += 32
      
      const paid = view.getBigUint64(o, true)
      o += 8
      const joinedAt = view.getBigInt64(o, true)
      
      return {
        address: player.toBase58(),
        joinedAt: Number(joinedAt),
        paid: Number(paid)
      }
    }).sort((a, b) => a.joinedAt - b.joinedAt) // Sort by join time
  } catch (error) {
    console.error('Error fetching participants:', error)
    return []
  }
}

// Get current match state
export async function fetchCurrentMatch(connection: Connection): Promise<MatchStateLite | null> {
  try {
    const dayId = getTodayUtcDayId()
    const matchPda = deriveMatchPda(dayId)
    const info = await connection.getAccountInfo(matchPda)
    if (!info) return null
    return parseMatchState(info.data)
  } catch (error) {
    console.error('Error fetching current match:', error)
    return null
  }
}

function getBigUint128(view: DataView, offset: number): bigint {
  const lo = view.getBigUint64(offset, true)
  const hi = view.getBigUint64(offset + 8, true)
  return (hi << 64n) + lo
}
