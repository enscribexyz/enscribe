import React from 'react'
import type { AppProps } from 'next/app'
import { WagmiProvider, createConfig, http } from 'wagmi'
import type { Chain } from 'wagmi/chains'
import { sepolia, lineaSepolia, baseSepolia, mainnet, base, linea, optimism, optimismSepolia, arbitrum, arbitrumSepolia, scroll, scrollSepolia } from 'wagmi/chains'
// getDefaultConfig is dynamically imported on the client to avoid SSR importing WalletConnect/AppKit
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TransactionProvider } from 'ethereum-identity-kit'
import { ThemeProvider } from '@/hooks/useTheme'
import { ThemeAwareRainbowKit } from '@/components/ThemeAwareRainbowKit'
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

// RainbowKitProvider is safe to render during SSR; we keep connectors client-only

export default function MyApp({ Component, pageProps }: AppProps) {
  const [clientWagmiConfig, setClientWagmiConfig] = React.useState<any>(null)

  React.useEffect(() => {
    let isMounted = true
    ;(async () => {
      const rainbowkit = await import('@rainbow-me/rainbowkit')
      const config = rainbowkit.getDefaultConfig({
        appName: 'enscribe',
        projectId: '6dfc28e3bd034be8e0d5ceaf0ee5c224',
        chains,
        ssr: false,
      })
      if (isMounted) setClientWagmiConfig(config)
    })()
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <ThemeProvider defaultTheme="system" storageKey="enscribe-theme">
      <QueryClientProvider client={queryClient}>
        <WagmiProvider
          key={clientWagmiConfig ? 'client' : 'server'}
          config={clientWagmiConfig ?? serverWagmiConfig}
        >
          <ThemeAwareRainbowKit>
            <TransactionProvider>
              <Component {...pageProps} />
            </TransactionProvider>
          </ThemeAwareRainbowKit>
        </WagmiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
