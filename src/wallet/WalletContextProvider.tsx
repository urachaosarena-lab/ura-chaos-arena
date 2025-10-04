import React, { useMemo } from 'react'
import {
  ConnectionProvider,
  WalletProvider
} from '@solana/wallet-adapter-react'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter
} from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

// UI styles from wallet adapter
import '@solana/wallet-adapter-react-ui/styles.css'

export const WalletContextProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const network = WalletAdapterNetwork.Mainnet
  const endpoint = import.meta.env.VITE_RPC_ENDPOINT || clusterApiUrl(network)

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter()
    ],
    []
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider 
        wallets={wallets} 
        autoConnect={false}
      >
        {children}
      </WalletProvider>
    </ConnectionProvider>
  )
}
