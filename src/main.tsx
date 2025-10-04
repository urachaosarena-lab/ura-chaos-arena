import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/index.css'
import { WalletContextProvider } from './wallet/WalletContextProvider'
import { App } from './ui/App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletContextProvider>
      <App />
    </WalletContextProvider>
  </React.StrictMode>
)
