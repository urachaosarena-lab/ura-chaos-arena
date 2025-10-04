import React, { useEffect, useMemo, useState } from 'react'
import {
  ConnectionProvider,
  WalletProvider
} from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  getPhantomWallet,
  getSolflareWallet
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
      getPhantomWallet(),
      getSolflareWallet()
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
      <WalletProvider wallets={wallets} autoConnect={false} onError={onError}>
        {/* Expose error via context-like prop drilling for simplicity */}
        <div data-wallet-error={errorMsg || ''}>{children}</div>
      </WalletProvider>
    </ConnectionProvider>
  )
}
