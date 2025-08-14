import React from 'react'
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from '@rainbow-me/rainbowkit'
import { useTheme } from '@/hooks/useTheme'

interface ThemeAwareRainbowKitProps {
  children: React.ReactNode
}

export function ThemeAwareRainbowKit({ children }: ThemeAwareRainbowKitProps) {
  const { theme } = useTheme()

  // Determine which theme to use
  const getCurrentTheme = () => {
    if (theme === 'dark') {
      return darkTheme()
    } else if (theme === 'light') {
      return lightTheme()
    } else {
      // For 'system' theme, we'll use the current system preference
      if (typeof window !== 'undefined') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
          ? darkTheme()
          : lightTheme()
      }
      // Default to light theme for SSR
      return lightTheme()
    }
  }

  return (
    <RainbowKitProvider modalSize="wide" theme={getCurrentTheme()}>
      {children}
    </RainbowKitProvider>
  )
}
