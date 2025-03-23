import type { AppProps } from 'next/app'
import { WagmiProvider } from 'wagmi'
import { mainnet, sepolia, linea, lineaSepolia } from 'wagmi/chains'
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css'
import '@/styles/globals.css'

const wagmiClient = getDefaultConfig({
  appName: 'Named',
  projectId: '1106',
  chains: [
    mainnet,
    linea,
    ...(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === 'true' ? [sepolia, lineaSepolia] : []),
  ],
  ssr: true,
});

const queryClient = new QueryClient();

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <WagmiProvider config={wagmiClient}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <Component {...pageProps} />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}