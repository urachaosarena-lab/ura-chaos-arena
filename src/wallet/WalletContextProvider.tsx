import React, { useEffect, useMemo, useState } from 'react'
import {
  ConnectionProvider,
  WalletProvider
} from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
  TrustWalletAdapter,
  Coin98WalletAdapter
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

// UI styles from wallet adapter
import '@solana/wallet-adapter-react-ui/styles.css'

export const WalletContextProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const network = WalletAdapterNetwork.Mainnet
  const endpoint = import.meta.env.VITE_RPC_ENDPOINT || clusterApiUrl(network)

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new CoinbaseWalletAdapter(),
      new TrustWalletAdapter(),
      new Coin98WalletAdapter()
    ],
    []
  )

  // global error boundary for wallet adapter
  const onError = (error: any) => {
    console.error(error)
    setErrorMsg('Error connecting wallet, try again...')
    setTimeout(() => setErrorMsg(null), 4000)
  }

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={false} 
        onError={onError}
        localStorageKey="solana-wallet"
      >
        {/* Expose error via context-like prop drilling for simplicity */}
        <div data-wallet-error={errorMsg || ''}>
          {errorMsg && (
            <div className="fixed top-4 right-4 z-50 p-3 bg-red-500 text-white rounded-lg shadow-lg max-w-sm">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span className="text-sm">{errorMsg}</span>
              </div>
            </div>
          )}
          {children}
        </div>
      </WalletProvider>
    </ConnectionProvider>
  )
}
