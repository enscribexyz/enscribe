import { useEffect } from 'react'
import { useAccount, useReconnect } from 'wagmi'

/**
 * Component that handles automatic wallet reconnection on page load
 * This works alongside SafeAutoConnect for regular (non-Safe) wallets
 */
export function WalletReconnect() {
  const { isConnected } = useAccount()
  const { reconnect } = useReconnect()

  useEffect(() => {
    // Only attempt reconnection if:
    // 1. Not already connected (prevents interference with Safe auto-connect)
    // 2. Client-side only
    // 3. wagmi config is ready
    if (!isConnected && typeof window !== 'undefined') {
      const checkAndReconnect = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        
        // Check if there's a previous connection in storage
        const wagmiStore = window.localStorage.getItem('wagmi.store')
        if (wagmiStore) {
          try {
            const store = JSON.parse(wagmiStore)
            // If there's connection state, attempt reconnection
            if (store?.state?.connections || store?.state?.current) {
              reconnect()
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
      
      checkAndReconnect()
    }
  }, [isConnected, reconnect])

  return null
}

