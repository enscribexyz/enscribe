import React from 'react'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { WagmiProvider, createConfig, http } from 'wagmi'
import type { Chain } from 'wagmi/chains'
import {
  sepolia,
  lineaSepolia,
  baseSepolia,
  mainnet,
  base,
  linea,
  optimism,
  optimismSepolia,
  arbitrum,
  arbitrumSepolia,
  scroll,
  scrollSepolia,
} from 'wagmi/chains'
// getDefaultConfig is dynamically imported on the client to avoid SSR importing WalletConnect/AppKit
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TransactionProvider } from 'ethereum-identity-kit'
import { ThemeProvider } from '@/hooks/useTheme'
import { ThemeAwareRainbowKit } from '@/components/ThemeAwareRainbowKit'
import { SafeAutoConnect } from '@/components/SafeAutoConnect'
import { WalletReconnect } from '@/components/WalletReconnect'
import '@rainbow-me/rainbowkit/styles.css'
import '@/styles/globals.css'

const queryClient = new QueryClient()

const chains = [
  mainnet,
  linea,
  base,
  optimism,
  arbitrum,
  scroll,
  sepolia,
  lineaSepolia,
  baseSepolia,
  optimismSepolia,
  arbitrumSepolia,
  scrollSepolia,
] as const satisfies readonly [Chain, ...Chain[]]

// SSR-safe wagmi config with only HTTP transports and no connectors
const serverTransports = chains.reduce(
  (acc, chain) => {
    acc[chain.id] = http()
    return acc
  },
  {} as Record<number, ReturnType<typeof http>>,
)

const serverWagmiConfig = createConfig({
  chains,
  transports: serverTransports,
  ssr: true,
})

export default function MyApp({ Component, pageProps }: AppProps) {
  const [clientWagmiConfig, setClientWagmiConfig] = React.useState<ReturnType<
    typeof createConfig
  > | null>(null)

  React.useEffect(() => {
    let isMounted = true
    ;(async () => {
      const rainbowkit = await import('@rainbow-me/rainbowkit')
      const { safe } = await import('@wagmi/connectors')
      const { createConfig, http, createStorage } = await import('wagmi')

      // Create Safe connector
      const safeConnector = safe({
        allowedDomains: [/app.safe.global$/, /safe.global$/],
        debug: false,
        shimDisconnect: true,
      })

      // Get RainbowKit wallets for creating connectors
      const { connectors: rainbowKitConnectors } = rainbowkit.getDefaultWallets(
        {
          appName: 'enscribe',
          projectId: '6dfc28e3bd034be8e0d5ceaf0ee5c224',
        },
      )

      // Create wagmi config with RainbowKit connectors + Safe
      const config = createConfig({
        chains,
        connectors: [...rainbowKitConnectors, safeConnector],
        transports: chains.reduce(
          (acc, chain) => {
            acc[chain.id] = http()
            return acc
          },
          {} as Record<number, ReturnType<typeof http>>,
        ),
        ssr: false,
        storage: createStorage({
          storage: window.localStorage,
        }),
      })

      if (isMounted) {
        setClientWagmiConfig(config)
        if (typeof window !== 'undefined') {
          ;(
            window as typeof window & { __clientWagmiReady?: boolean }
          ).__clientWagmiReady = true
        }
      }
    })()
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <ThemeProvider defaultTheme="system" storageKey="enscribe-theme">
      <Head>
        <title>Give your smart contracts on Ethereum an identity with Enscribe. Powered by ENS.</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider
          key={clientWagmiConfig ? 'client' : 'server'}
          config={clientWagmiConfig ?? serverWagmiConfig}
        >
          <ThemeAwareRainbowKit>
            <SafeAutoConnect />
            <WalletReconnect />
            <TransactionProvider>
              <Component {...pageProps} />
            </TransactionProvider>
          </ThemeAwareRainbowKit>
        </WagmiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
