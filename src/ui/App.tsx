import React, { useEffect, useMemo, useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import classNames from 'classnames'
import { PROGRAM_ID, buildClaimIx, buildJoinIx, deriveAllocationPda, deriveMatchPda, deriveConfigPda, getYesterdayUtcDayId, getTodayUtcDayId, fetchAllMatches, fetchStats, parseAllocation } from '../chain/arena'

function shortAddress(addr?: string) {
  return addr ? addr.slice(0, 6) : ''
}

function useTheme() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('theme') || 'light')
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('theme', theme)
  }, [theme])
  return { theme, setTheme }
}

async function getUsdToSolRate(): Promise<number> {
  // Placeholder: attempt to fetch from Pyth Hermes; fall back to 150 USD/SOL
  try {
    const res = await fetch('https://hermes.pyth.network/api/latest_price_feeds?ids[]=Crypto.SOL/USD')
    const json = await res.json()
    const price = json?.[0]?.price?.price
    if (typeof price === 'number' && price > 0) return price
  } catch {}
  return 150 // USD per SOL fallback
}

export const App: React.FC = () => {
  const { publicKey, connected, connect, disconnect, signTransaction } = useWallet() as any
  const { connection } = useConnection()
  const [tab, setTab] = useState<'dashboard' | 'profile' | 'hall'>('dashboard')
  const [error, setError] = useState<string>('')
  const [joining, setJoining] = useState(false)
  const { theme, setTheme } = useTheme()

  const vaultAddressStr = import.meta.env.VITE_VAULT_ADDRESS as string | undefined
  const vaultPubkey = vaultAddressStr ? new PublicKey(vaultAddressStr) : undefined

  const onConnectClick = async () => {
    try {
      setError('')
      await connect()
    } catch (e) {
      console.error(e)
      setError('Error connecting wallet, try again...')
    }
  }

  const onJoinArena = async () => {
    if (!connected || !publicKey) {
      setError('Halt! A warrior without a wallet cannot enter the arena.')
      return
    }
    try {
      setJoining(true)
      const usdPerSol = await getUsdToSolRate()
      const solForFiveUsd = 5 / usdPerSol
      // add small 2% buffer to reduce race vs price updates/staleness guards
      const lamports = Math.max(1, Math.floor(solForFiveUsd * 1.02 * LAMPORTS_PER_SOL))
      const pythPkStr = import.meta.env.VITE_PYTH_SOL_USD_PRICE_ACCOUNT as string | undefined
      if (!pythPkStr) throw new Error('Missing VITE_PYTH_SOL_USD_PRICE_ACCOUNT')
      const pythPk = new PublicKey(pythPkStr)
      const dayId = getTodayUtcDayId()
      const ix = await buildJoinIx(connection, publicKey, lamports, pythPk, dayId)
      const tx = new Transaction().add(ix)
      tx.feePayer = publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      const useWindow = (window as any).solana && typeof (window as any).solana.signAndSendTransaction === 'function'
      if (useWindow) {
        const res = await (window as any).solana.signAndSendTransaction(tx)
        console.log('Join sig:', res)
      } else if ((window as any).sendTransaction) {
        const sig = await (window as any).sendTransaction(tx, connection)
        console.log('Join sig:', sig)
      } else if ((window as any).signTransaction) {
        const signed = await (window as any).signTransaction(tx)
        const sig = await connection.sendRawTransaction(signed.serialize())
        console.log('Join sig:', sig)
      } else {
        // Fallback to wallet adapter prop if available
        const { sendTransaction } = await import('@solana/wallet-adapter-react')
        const sig = await (sendTransaction as any)(tx, connection)
        console.log('Join sig:', sig)
      }
    } catch (e) {
      console.error(e)
      setError('Tribute failed. The arena awaits—try again...')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sand-200/50 dark:border-gray-800">
        <div className="font-extrabold text-xl text-sky-500">UraChaos Arena</div>
        <div className="flex items-center gap-3">
          {connected && (
            <div className="text-sm text-gray-700 dark:text-gray-300">{shortAddress(publicKey?.toBase58())}</div>
          )}
          <Settings theme={theme} setTheme={setTheme} />
          {connected ? (
            <button className="px-3 py-2 rounded-md bg-sand-400 text-gray-900 hover:bg-sand-300 active:scale-95 transition" onClick={() => disconnect()}>Retreat</button>
          ) : (
            <button className="px-3 py-2 rounded-md bg-sky-400 text-white hover:bg-sky-300 active:scale-95 transition" onClick={onConnectClick}>Enter the Arena</button>
          )}
        </div>
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 text-red-700 bg-red-50 border-b border-red-200">{error}</div>
      )}

      {/* Tabs */}
      <div className="px-4 py-2 flex gap-2 border-b border-sand-200/50 dark:border-gray-800">
        <TabButton current={tab} setTab={setTab} id="dashboard" label="Dashboard" />
        <TabButton current={tab} setTab={setTab} id="profile" label="Profile" />
        <TabButton current={tab} setTab={setTab} id="hall" label="Hall of Fame" />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4">
        {tab === 'dashboard' && (
          <Dashboard connected={connected} onJoinArena={onJoinArena} joining={joining} />
        )}
        {tab === 'profile' && <Profile />}
        {tab === 'hall' && <HallOfFame />}
      </div>
    </div>
  )
}

function TabButton({ current, setTab, id, label }: { current: string, setTab: (t: any) => void, id: any, label: string }) {
  const active = current === id
  return (
    <button onClick={() => setTab(id)} className={classNames(
      'px-3 py-2 rounded-md transition',
      active ? 'bg-sky-400 text-white shadow-sm' : 'hover:bg-sand-100 dark:hover:bg-gray-800'
    )}>{label}</button>
  )
}

function Settings({ theme, setTheme }: { theme: string, setTheme: (t: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="p-2 rounded-md hover:bg-sand-100 dark:hover:bg-gray-800 transition" aria-label="Settings">⚙️</button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-md border border-sand-200/50 dark:border-gray-700 bg-white dark:bg-arena-darkBg shadow-lg p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">Theme</div>
            <button className="px-2 py-1 rounded bg-sand-400 text-gray-900 hover:bg-sand-300 transition" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? 'Switch to Dark' : 'Switch to Light'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Dashboard({ connected, onJoinArena, joining }: { connected: boolean, onJoinArena: () => Promise<void>, joining: boolean }) {
  const { connection } = useConnection()
  const { publicKey, signTransaction, sendTransaction } = useWallet() as any
  const [claimable, setClaimable] = useState<{ dayId: number, amountLamports: bigint } | null>(null)
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    (async () => {
      if (!publicKey) { setClaimable(null); return }
      const dayId = getYesterdayUtcDayId()
      const matchPda = deriveMatchPda(dayId)
      const allocPda = deriveAllocationPda(matchPda, publicKey)
      const info = await connection.getAccountInfo(allocPda)
      if (!info) { setClaimable(null); return }
      const parsed = parseAllocation(info.data)
      if (parsed && !parsed.claimed && parsed.amount > 0n) {
        setClaimable({ dayId, amountLamports: parsed.amount })
      } else {
        setClaimable(null)
      }
    })()
  }, [publicKey, connection])

  const onClaim = async () => {
    if (!publicKey || !claimable) return
    try {
      setClaiming(true)
      const ix = await buildClaimIx(connection, publicKey, claimable.dayId)
      const tx = new Transaction().add(ix)
      tx.feePayer = publicKey
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash
      const useWindow = (window as any).solana && typeof (window as any).solana.signAndSendTransaction === 'function'
      if (useWindow) {
        const res = await (window as any).solana.signAndSendTransaction(tx)
        console.log('Claim sig:', res)
      } else if (sendTransaction) {
        const sig = await sendTransaction(tx, connection)
        console.log('Claim sig:', sig)
      } else if (signTransaction) {
        const signed = await signTransaction(tx)
        const sig = await connection.sendRawTransaction(signed.serialize())
        console.log('Claim sig:', sig)
      } else {
        throw new Error('No wallet available to sign')
      }
    } catch (e) {
      console.error(e)
      alert('Claim failed. Try again in a moment.')
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="grid gap-4">
      <CurrentMatchPanel />
      <Leaderboard />
      <div className="flex flex-col gap-2">
        <button disabled={!connected || joining} onClick={onJoinArena} className={classNames('w-full md:w-auto px-4 py-3 rounded-md text-white transition', connected ? 'bg-sky-500 hover:bg-sky-400 active:scale-95' : 'bg-gray-400 cursor-not-allowed')}>
          {joining ? 'Summoning the treasurer...' : 'Join the Arena - $5 SOL'}
        </button>
        {claimable && (
          <button disabled={claiming} onClick={onClaim} className={classNames('w-full md:w-auto px-4 py-3 rounded-md text-white transition', !claiming ? 'bg-sand-400 text-gray-900 hover:bg-sand-300 active:scale-95' : 'bg-gray-400 cursor-not-allowed')}>
            {claiming ? 'Claiming...' : `Claim Winnings (${Number(claimable.amountLamports) / LAMPORTS_PER_SOL} SOL)`}
          </button>
        )}
        {!connected && <p className="text-sm text-gray-600 dark:text-gray-400">Connect your wallet to pay tribute.</p>}
      </div>
    </div>
  )
}

function timeToNextUtcDay(): string {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0))
  const diff = +next - +now
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m`
}

function CurrentMatchPanel() {
  const [t, setT] = useState(timeToNextUtcDay())
  useEffect(() => {
    const id = setInterval(() => setT(timeToNextUtcDay()), 15000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="p-4 rounded-lg border border-sand-200/50 dark:border-gray-800 bg-white/70 dark:bg-white/5 backdrop-blur">
      <div className="text-lg font-semibold mb-1">Current Match — the sands reset in {t}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400">The gong will sound at UTC dawn; champions are tallied by %PNL.</div>
    </div>
  )
}

function Leaderboard() {
  // Stubbed data; replace with Helius-powered on-chain fetch in phase 2
  const rows = Array.from({ length: 25 }).map((_, i) => ({ rank: i + 1, trader: `0x${(Math.random().toString(16).slice(2)).slice(0, 6)}`, pnl: (Math.random() * 50).toFixed(2) }))
  return (
    <div className="p-4 rounded-lg border border-sand-200/50 dark:border-gray-800 bg-white/70 dark:bg-white/5 backdrop-blur">
      <div className="font-semibold mb-3">Top 25 — Trumpets for Today’s Titans</div>
      <div className="grid grid-cols-3 text-sm font-mono">
        <div className="font-bold">Rank</div>
        <div className="font-bold">Trader</div>
        <div className="font-bold">% PNL</div>
        {rows.map(r => (
          <React.Fragment key={r.rank}>
            <div>{r.rank}</div>
            <div>{r.trader}</div>
            <div className="text-sky-600 dark:text-sky-400">{r.pnl}%</div>
          </React.Fragment>
        ))}
      </div>
      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">Wire this to Helius RPC to honor real champions.</div>
    </div>
  )
}

function Profile() {
  const { publicKey } = useWallet()
  const { connection } = useConnection()
  const [balance, setBalance] = useState<string>('')

  useEffect(() => {
    (async () => {
      if (!publicKey) return setBalance('')
      const lamports = await connection.getBalance(publicKey)
      setBalance((lamports / LAMPORTS_PER_SOL).toFixed(4))
    })()
  }, [publicKey, connection])

  const onCopy = async () => {
    if (!publicKey) return
    await navigator.clipboard.writeText(publicKey.toBase58())
  }

  return (
    <div className="grid gap-3 p-4 rounded-lg border border-sand-200/50 dark:border-gray-800 bg-white/70 dark:bg-white/5 backdrop-blur">
      <div className="text-lg font-semibold">Your Champion’s Sigil</div>
      <div className="flex items-center gap-2">
        <div className="font-mono text-sm">{publicKey ? publicKey.toBase58() : '—'}</div>
        <button className="px-2 py-1 text-xs rounded bg-sand-400 text-gray-900 hover:bg-sand-300" onClick={onCopy}>Copy</button>
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300">SOL balance: {balance || '—'} SOL</div>
    </div>
  )
}

function HallOfFame() {
  const { connection } = useConnection()
  const [loading, setLoading] = useState(true)
  const [totals, setTotals] = useState<{ matches: number, players: number, prizeSol: number, uraEarmarkedSol: number, uracEarmarkedSol: number, uraBurned: number, uracBurned: number }>({ matches: 0, players: 0, prizeSol: 0, uraEarmarkedSol: 0, uracEarmarkedSol: 0, uraBurned: 0, uracBurned: 0 })

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        const ms = await fetchAllMatches(connection)
        const finalized = ms.filter(m => m.status === 1)
        const matches = finalized.length
        const players = ms.reduce((acc, m) => acc + m.ticketCount, 0)
        const prizeLamports = finalized.reduce((acc, m) => acc + Number(m.prizePool), 0)
        const uraLamports = finalized.reduce((acc, m) => acc + Math.floor(Number(m.potLamports) * 0.05), 0)
        const uracLamports = uraLamports // same 5%
        const stats = await fetchStats(connection)
        setTotals({
          matches,
          players,
          prizeSol: prizeLamports / LAMPORTS_PER_SOL,
          uraEarmarkedSol: uraLamports / LAMPORTS_PER_SOL,
          uracEarmarkedSol: uracLamports / LAMPORTS_PER_SOL,
          uraBurned: stats ? Number(stats.totalUraBurnedAtoms) : 0,
          uracBurned: stats ? Number(stats.totalUracBurnedAtoms) : 0,
        })
      } finally { setLoading(false) }
    })()
  }, [connection])

  return (
    <div className="p-4 rounded-lg border border-sand-200/50 dark:border-gray-800 bg-white/70 dark:bg-white/5 backdrop-blur">
      <div className="text-lg font-semibold mb-3">Hall of Fame</div>
      {loading ? (
        <div className="text-sm text-gray-600 dark:text-gray-400">Loading stats…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <Stat label="Total Matches" value={totals.matches.toString()} />
          <Stat label="Total Players" value={totals.players.toString()} />
          <Stat label="Total Prize Pools (SOL)" value={totals.prizeSol.toFixed(4)} />
          <Stat label="Earmarked Buy+Burn $URA (SOL)" value={totals.uraEarmarkedSol.toFixed(4)} />
          <Stat label="Earmarked Buy+Burn $URACHAOS (SOL)" value={totals.uracEarmarkedSol.toFixed(4)} />
          <Stat label="$URA Burned (atoms)" value={totals.uraBurned ? totals.uraBurned.toString() : '—'} />
          <Stat label="$URACHAOS Burned (atoms)" value={totals.uracBurned ? totals.uracBurned.toString() : '—'} />
        </div>
      )}
      <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">Earmarked values derive from finalized match pots; burn execution will be reflected once the burner bot posts updates.</div>
    </div>
  )
}

function Stat({ label, value }: { label: string, value: string }) {
  return (
    <div className="p-3 rounded-md border border-sand-200/50 dark:border-gray-800 bg-white/60 dark:bg-white/5">
      <div className="text-xs text-gray-600 dark:text-gray-400">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  )
}
