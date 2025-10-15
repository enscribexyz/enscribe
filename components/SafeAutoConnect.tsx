import { useAutoConnect } from '@/hooks/useSafeDetection'

/**
 * Component that automatically connects to Safe when the app is loaded inside Safe iframe
 */
export function SafeAutoConnect() {
  useAutoConnect()

  return null
}
