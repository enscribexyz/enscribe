// pages/_app.tsx
import type { AppProps } from 'next/app'
import { Web3Provider } from '../context/Web3Context'
import '@/styles/globals.css' // optional if using CSS

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Web3Provider>
      <Component {...pageProps} />
    </Web3Provider>
  )
}