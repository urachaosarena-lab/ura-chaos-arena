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
  const [tab, setTab] = useState<'chaos' | 'highstakes' | 'profile' | 'hall' | 'roadmap'>('chaos')
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

  // If wallet is not connected, show landing page
  if (!connected) {
    return <LandingPage onConnect={onConnectClick} error={error} theme={theme} setTheme={setTheme} />
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
      } else if (signTransaction) {
        // Fallback to signTransaction prop if available
        const signed = await signTransaction(tx)
        const sig = await connection.sendRawTransaction(signed.serialize())
        console.log('Join sig:', sig)
      } else {
        throw new Error('No wallet signing method available')
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
      <div className="flex flex-col items-center px-4 py-3 border-b border-sand-200/50 dark:border-gray-800">
        <div className="font-extrabold text-4xl text-sky-500 text-center mb-2">⚔️ UraChaos Arena ⚔️</div>
        <div className="text-center mb-2">
          <div className="text-lg font-bold text-orange-600 dark:text-orange-400">Alpha phase 1 stage.</div>
          <div className="text-xs text-gray-600 dark:text-gray-400 max-w-2xl">We are currently testing the dApp, be aware you might find multiple bugs. We would appreciate it if you would report bugs through our official X account via DM</div>
        </div>
        <div className="flex items-center justify-between w-full">
          <div></div>
          <div className="flex items-center gap-3">
            {connected && (
              <div className="text-sm text-gray-700 dark:text-gray-300">{shortAddress(publicKey?.toBase58())}</div>
            )}
            <Settings theme={theme} setTheme={setTheme} />
            <button className="px-3 py-2 rounded-md bg-sand-400 text-gray-900 hover:bg-sand-300 active:scale-95 transition" onClick={() => disconnect()}>Retreat</button>
          </div>
        </div>
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 text-red-700 bg-red-50 border-b border-red-200">{error}</div>
      )}

      {/* Tabs */}
      <div className="px-4 py-2 flex gap-2 border-b border-sand-200/50 dark:border-gray-800 flex-wrap">
        <TabButton current={tab} setTab={setTab} id="chaos" label="⚔️ Chaos" />
        <TabButton current={tab} setTab={setTab} id="highstakes" label="🎰 High Stakes" />
        <TabButton current={tab} setTab={setTab} id="profile" label="👤 Profile" />
        <TabButton current={tab} setTab={setTab} id="hall" label="🏆 Hall of Fame" />
        <TabButton current={tab} setTab={setTab} id="roadmap" label="🚀 Roadmap" />
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4">
        {tab === 'chaos' && (
          <ChaosTab connected={connected} onJoinArena={onJoinArena} joining={joining} />
        )}
        {tab === 'highstakes' && <HighStakesTab />}
        {tab === 'profile' && <Profile />}
        {tab === 'hall' && <HallOfFame />}
        {tab === 'roadmap' && <RoadmapTab />}
      </div>
      
      {/* Financial Disclaimer */}
      <div className="px-4 py-2 text-center text-xs text-gray-500 dark:text-gray-400 border-t border-sand-200/50 dark:border-gray-800">
        This platform is for entertainment purposes only. Trading cryptocurrencies involves substantial risk and may not be suitable for all investors. 
        Past performance does not guarantee future results. You could lose all or part of your investment. 
        Please consider your risk tolerance and consult with a financial advisor. This is not financial advice.
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

function LandingPage({ onConnect, error, theme, setTheme }: { onConnect: () => void, error: string, theme: string, setTheme: (t: string) => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 px-4">
      {/* Settings in top right */}
      <div className="absolute top-4 right-4">
        <Settings theme={theme} setTheme={setTheme} />
      </div>
      
      <div className="max-w-2xl mx-auto text-center">
        {/* Main Title */}
        <h1 className="text-6xl md:text-8xl font-extrabold text-sky-500 mb-8 animate-pulse">
          ⚔️ Welcome to the UraChaos Arena ⚔️
        </h1>
        
        {/* Gladiator Lore */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-6 mb-8 border-2 border-amber-300 dark:border-amber-600">
          <p className="text-lg text-gray-800 dark:text-gray-200 italic leading-relaxed">
            🏛️ Hail, brave soul! Step into the grand colosseum where only the mightiest traders survive. 
            The sands are stained with the tears of the fallen, but for those who dare to enter, 
            marvelous prizes await! ⚡ Fight hard, trade smart, and prove your worth in this arena of chaos. 
            May the gods of profit smile upon you! 🏆
          </p>
        </div>
        
        {/* Connect Button */}
        <button 
          onClick={onConnect}
          className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white text-2xl font-bold py-4 px-8 rounded-xl shadow-2xl transform hover:scale-105 active:scale-95 transition-all duration-200 mb-4"
        >
          🏛️ Connect Solana Wallet 🏛️
        </button>
        
        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        
        {/* Alpha Warning */}
        <div className="mt-8 text-center">
          <div className="text-lg font-bold text-orange-600 dark:text-orange-400 mb-2">⚠️ Alpha phase 1 stage ⚠️</div>
          <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
            We are currently testing the dApp, be aware you might find multiple bugs. We would appreciate it if you would report bugs through our official X account via DM
          </div>
        </div>
      </div>
      
      {/* Financial Disclaimer */}
      <div className="absolute bottom-4 left-4 right-4 text-center text-xs text-gray-500 dark:text-gray-400">
        This platform is for entertainment purposes only. Trading cryptocurrencies involves substantial risk and may not be suitable for all investors. 
        Past performance does not guarantee future results. You could lose all or part of your investment. 
        Please consider your risk tolerance and consult with a financial advisor. This is not financial advice.
      </div>
    </div>
  )
}

function ChaosTab({ connected, onJoinArena, joining }: { connected: boolean, onJoinArena: () => Promise<void>, joining: boolean }) {
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
      {/* Rules and Prize Distribution */}
      <div className="p-4 rounded-lg border border-amber-300 dark:border-amber-600 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
        <h3 className="text-xl font-bold text-amber-800 dark:text-amber-200 mb-3">⚔️ Chaos Arena Rules ⚔️</h3>
        <div className="text-sm text-amber-700 dark:text-amber-300 space-y-2">
          <p><strong>🏛️ Entry Fee:</strong> $5 worth of SOL per gladiator</p>
          <p><strong>⏰ Duration:</strong> 24-hour battles, resetting at UTC dawn</p>
          <p><strong>🏆 Prize Distribution:</strong> Top 33% of warriors by %PNL claim their spoils</p>
          <p><strong>💰 Pool Allocation:</strong> 85% prizes, 5% $URA burn, 5% $URACHAOS burn, 5% arena maintenance</p>
          <p><strong>⚡ Victory Condition:</strong> Highest %PNL when the gong sounds wins the greatest glory!</p>
        </div>
      </div>
      
      <CurrentMatchPanel />
      <Leaderboard />
      <div className="flex flex-col gap-2">
        <button disabled={!connected || joining} onClick={onJoinArena} className={classNames('w-full md:w-auto px-4 py-3 rounded-md text-white transition', connected ? 'bg-sky-500 hover:bg-sky-400 active:scale-95' : 'bg-gray-400 cursor-not-allowed')}>
          {joining ? '⚔️ Summoning the treasurer...' : '⚔️ Join the Chaos Arena - $5 SOL'}
        </button>
        {claimable && (
          <button disabled={claiming} onClick={onClaim} className={classNames('w-full md:w-auto px-4 py-3 rounded-md text-white transition', !claiming ? 'bg-sand-400 text-gray-900 hover:bg-sand-300 active:scale-95' : 'bg-gray-400 cursor-not-allowed')}>
            {claiming ? '💰 Claiming...' : `💰 Claim Winnings (${Number(claimable.amountLamports) / LAMPORTS_PER_SOL} SOL)`}
          </button>
        )}
        {!connected && <p className="text-sm text-gray-600 dark:text-gray-400">Connect your wallet to pay tribute.</p>}
      </div>
    </div>
  )
}

function HighStakesTab() {
  return (
    <div className="grid gap-4">
      {/* Rules and Prize Distribution */}
      <div className="p-4 rounded-lg border border-purple-300 dark:border-purple-600 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
        <h3 className="text-xl font-bold text-purple-800 dark:text-purple-200 mb-3">🎰 High Stakes Arena Rules 🎰</h3>
        <div className="text-sm text-purple-700 dark:text-purple-300 space-y-2">
          <p><strong>💎 Entry Fee:</strong> $50 worth of SOL per elite gladiator</p>
          <p><strong>⏰ Duration:</strong> 24-hour elite battles, synchronized with Chaos Arena</p>
          <p><strong>🏆 Prize Distribution:</strong> Only the top 20% of warriors by %PNL earn rewards</p>
          <p><strong>👑 Elite Rewards:</strong> 1st place: 40% | Top 10%: 40% | Remaining top 20%: 20%</p>
          <p><strong>💰 Pool Allocation:</strong> 85% prizes, 5% $URA burn, 5% $URACHAOS burn, 5% arena maintenance</p>
          <p><strong>⚡ Victory Condition:</strong> For the bravest souls seeking ultimate glory and greater spoils!</p>
        </div>
      </div>
      
      {/* Coming Soon Message */}
      <div className="p-12 rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-center">
        <h2 className="text-3xl font-bold text-gray-600 dark:text-gray-400 mb-4">🚧 Under Construction 🚧</h2>
        <p className="text-xl text-gray-500 dark:text-gray-500">Coming up in phase 2...</p>
        <p className="text-sm text-gray-400 dark:text-gray-600 mt-2">The elite arena is being prepared for the most courageous warriors</p>
      </div>
    </div>
  )
}

function RoadmapTab() {
  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-8 text-sky-600 dark:text-sky-400">🚀 UraChaos Arena Roadmap 🚀</h2>
      
      <div className="space-y-8">
        {/* Phase 1 */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">✓</div>
          <div className="flex-grow">
            <h3 className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">CURRENT - Phase 1: Testing Alpha</h3>
            <p className="text-gray-700 dark:text-gray-300">Chaos mode, leaderboard, rules, profile, light/dark mode, hall of fame</p>
          </div>
        </div>
        
        {/* Arrow */}
        <div className="flex justify-center">
          <div className="text-4xl text-sky-500">⬇️</div>
        </div>
        
        {/* Phase 2 */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">2</div>
          <div className="flex-grow">
            <h3 className="text-xl font-bold text-orange-600 dark:text-orange-400 mb-2">Phase 2: Beta Launch</h3>
            <p className="text-gray-700 dark:text-gray-300">Initial bugs fixed, High Stakes arena unlocked, enhanced stability</p>
          </div>
        </div>
        
        {/* Arrow */}
        <div className="flex justify-center">
          <div className="text-4xl text-sky-500">⬇️</div>
        </div>
        
        {/* Phase 3 */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">3</div>
          <div className="flex-grow">
            <h3 className="text-xl font-bold text-purple-600 dark:text-purple-400 mb-2">Phase 3: Full Release v1.0</h3>
            <p className="text-gray-700 dark:text-gray-300">Extra features TBD, cosmetics, enhanced $URA & $URACHAOS flywheel mechanics</p>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="mt-12 p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <p className="text-center text-gray-600 dark:text-gray-400 italic">
          🏛️ "The greatest arena is built one stone at a time, one battle at a time, one victory at a time." 🏛️
        </p>
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
      <div className="text-lg font-semibold mb-1">🏛️ Current Match — the sands reset in {t}</div>
      <div className="text-sm text-gray-600 dark:text-gray-400">🔔 The gong will sound at UTC dawn; champions are tallied by %PNL. May the bravest prevail! ⚔️</div>
    </div>
  )
}

function Leaderboard() {
  // Stubbed data with proper sorting; replace with Helius-powered on-chain fetch in phase 2
  const unsortedData = Array.from({ length: 25 }).map((_, i) => ({ 
    trader: `0x${(Math.random().toString(16).slice(2)).slice(0, 6)}`, 
    pnl: (Math.random() * 100 - 20).toFixed(2) // Random between -20% and 80%
  }))
  
  // Sort by PNL descending (highest first)
  const rows = unsortedData
    .sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl))
    .map((item, index) => ({ ...item, rank: index + 1 }))
    
  return (
    <div className="p-4 rounded-lg border border-sand-200/50 dark:border-gray-800 bg-white/70 dark:bg-white/5 backdrop-blur">
      <div className="font-semibold mb-3">🎺 Top 25 Gladiators — Trumpets for Today's Titans 🎺</div>
      <div className="grid grid-cols-3 text-sm font-mono">
        <div className="font-bold flex items-center gap-1">🏆 Rank</div>
        <div className="font-bold flex items-center gap-1">⚔️ Gladiator</div>
        <div className="font-bold flex items-center gap-1">💹 % PNL</div>
        {rows.map(r => {
          const pnlNum = parseFloat(r.pnl)
          const pnlColor = pnlNum >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          return (
            <React.Fragment key={r.rank}>
              <div className="flex items-center gap-1">
                {r.rank === 1 && '🥇'}
                {r.rank === 2 && '🥈'} 
                {r.rank === 3 && '🥉'}
                {r.rank > 3 && `${r.rank}.`}
              </div>
              <div>{r.trader}</div>
              <div className={pnlColor}>{pnlNum >= 0 ? '+' : ''}{r.pnl}%</div>
            </React.Fragment>
          )
        })}
      </div>
      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">🏛️ Wire this to Helius RPC to honor real champions in the arena.</div>
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
      <div className="text-lg font-semibold">🎭 Your Gladiator's Sigil 🎭</div>
      <div className="flex items-center gap-2">
        <div className="font-mono text-sm">{publicKey ? publicKey.toBase58() : '—'}</div>
        <button className="px-2 py-1 text-xs rounded bg-sand-400 text-gray-900 hover:bg-sand-300" onClick={onCopy}>📋 Copy</button>
      </div>
      <div className="text-sm text-gray-700 dark:text-gray-300">💰 SOL treasury: {balance || '—'} SOL</div>
      <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
        <p className="text-sm text-amber-700 dark:text-amber-300 italic">
          "🏆 A true gladiator's strength is measured not by the gold in their purse, but by their courage in the arena!"
        </p>
      </div>
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
