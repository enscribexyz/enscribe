import type { AppProps } from 'next/app'
import { WagmiProvider } from 'wagmi'
import {
  sepolia,
  lineaSepolia,
  baseSepolia,
  mainnet,
  base,
  linea,
} from 'wagmi/chains'
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TransactionProvider } from 'ethereum-identity-kit'
import '@rainbow-me/rainbowkit/styles.css'
import '@/styles/globals.css'

export const wagmiConfig = getDefaultConfig({
  appName: 'enscribe',
  projectId: '6dfc28e3bd034be8e0d5ceaf0ee5c224',
  chains: [mainnet, linea, base, sepolia, lineaSepolia, baseSepolia],
  ssr: true,
})

const queryClient = new QueryClient()

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <TransactionProvider>
            <Component {...pageProps} />
          </TransactionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
