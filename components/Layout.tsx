import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Toaster } from '@/components/ui/toaster'
import 'ethereum-identity-kit/css'
import {
  PencilSquareIcon,
  ClockIcon,
  Bars3Icon,
  XMarkIcon,
  DocumentTextIcon,
  InformationCircleIcon,
  DocumentIcon,
  MagnifyingGlassIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import AddressSearch from './AddressSearch'
import ChainSelector from './ChainSelector'
import { useAccount } from 'wagmi'
import { useRouter } from 'next/router'

interface LayoutProps {
  children: React.ReactNode
}

const productLink = process.env.NEXT_PUBLIC_DOCS_SITE_URL

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { isConnected, chain, connector, address: walletAddress } = useAccount()
  const [selectedChain, setSelectedChain] = useState<number>(1)
  const [manuallyChanged, setManuallyChanged] = useState(false)
  const [prevConnected, setPrevConnected] = useState(false)
  const [prevChain, setPrevChain] = useState<number | undefined>()
  const router = useRouter()

  const navigation = [
    { name: 'Deploy Contract', href: '/deploy', icon: PencilSquareIcon },
    { name: 'Name Contract', href: '/nameContract', icon: DocumentTextIcon },
    ...(isConnected
      ? [
          {
            name: 'My Account',
            href: `/explore/${chain?.id}/${walletAddress}`,
            icon: UserIcon,
          },
          { name: 'My Contracts', href: '/history', icon: ClockIcon },
        ]
      : []),
  ]

  // Initialize selectedChain from URL on first load only
  useEffect(() => {
    if (
      router.isReady &&
      router.query.chainId &&
      typeof router.query.chainId === 'string' &&
      !manuallyChanged
    ) {
      const chainIdFromUrl = parseInt(router.query.chainId)
      if (!isNaN(chainIdFromUrl)) {
        console.log(`Initial sync with URL chainId: ${chainIdFromUrl}`)
        setSelectedChain(chainIdFromUrl)
      }
    }
  }, [router.isReady, router.query.chainId, manuallyChanged])

  useEffect(() => {
    const isExplorePage = router.pathname.startsWith('/explore')
    if (!isExplorePage) return

    const urlChainId =
      router.query.chainId && typeof router.query.chainId === 'string'
        ? parseInt(router.query.chainId)
        : undefined

    // Handle wallet connection (wallet just connected)
    if (isConnected && !prevConnected && urlChainId && connector?.switchChain) {
      // User just connected wallet on explore page, switch wallet to match URL chain
      console.log(
        `Wallet connected on explore page. Switching wallet to chain ${urlChainId}`,
      )
      connector.switchChain({ chainId: urlChainId }).catch((err) => {
        console.error('Failed to switch chain on wallet connect:', err)
      })
    }

    // Handle wallet disconnection
    if (!isConnected && prevConnected) {
      // User just disconnected wallet on explore page, redirect to root
      console.log('Wallet disconnected on explore page. Redirecting to /')
      router.push('/')
    }

    // Handle wallet chain change (chain changed while connected)
    if (
      isConnected &&
      chain?.id &&
      prevChain !== undefined &&
      chain.id !== prevChain &&
      router.query.address
    ) {
      // User changed wallet chain while on explore page, perform hard refresh
      const address = router.query.address as string
      console.log(
        `Wallet chain changed from ${prevChain} to ${chain.id}. Performing hard refresh.`,
      )
      window.location.href = `/explore/${chain.id}/${address}`
    }

    // Update previous states for next comparison
    setPrevConnected(isConnected)
    setPrevChain(chain?.id)
  }, [
    isConnected,
    chain?.id,
    router.pathname,
    router.query.chainId,
    router.query.address,
    connector,
    prevConnected,
    prevChain,
  ])

  return (
    <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar for Large Screens */}
      <aside className="hidden lg:flex lg:w-66 bg-gray-900 text-white shadow-md flex-col">
        <div>
          <div className="px-6 py-4 flex items-center space-x-2 border-b border-gray-700">
            <Link href="/" legacyBehavior>
              <a className="flex items-center space-x-2">
                {/* Logo */}
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="32" height="32" rx="4" fill="#151A2D" />
                  <path
                    d="M10 12L6 16L10 20"
                    stroke="#4DB8E8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M22 12L26 16L22 20"
                    stroke="#4DB8E8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18 10L14 22"
                    stroke="#4DB8E8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>

                {/* Text */}
                <h2 className="text-2xl font-bold text-white">Enscribe</h2>
              </a>
            </Link>
          </div>
          <nav className="px-4 py-6">
            <ul className="space-y-2">
              {navigation.map((item) => (
                <li key={item.name}>
                  <Link href={item.href} legacyBehavior>
                    <a className="flex items-center p-3 text-gray-300 hover:bg-gray-800 rounded-md">
                      <item.icon className="w-5 h-5 mr-3 text-gray-400" />
                      {item.name}
                    </a>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Push buttons to the bottom */}
        <div className="mt-auto px-4 py-4 flex space-x-4">
          <Link href={productLink || '/'} legacyBehavior>
            <a
              className="flex items-center justify-center w-1/2 text-gray-300 hover:bg-gray-800 p-3 rounded-md"
              target="_blank"
              rel="noopener noreferrer"
            >
              <InformationCircleIcon className="w-5 h-5 mr-3 text-gray-400" />
              About
            </a>
          </Link>
          <Link href={productLink + '/docs'} legacyBehavior>
            <a
              className="flex items-center justify-center w-1/2 text-gray-300 hover:bg-gray-800 p-3 rounded-md"
              target="_blank"
              rel="noopener noreferrer"
            >
              <DocumentIcon className="w-5 h-5 mr-3 text-gray-400" />
              Docs
            </a>
          </Link>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-66 bg-gray-900 text-white transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform lg:hidden flex flex-col h-full`}
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-700">
          <Link href="/" legacyBehavior>
            <a className="flex items-center space-x-2">
              {/* Logo */}
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect width="32" height="32" rx="4" fill="#151A2D" />
                <path
                  d="M10 12L6 16L10 20"
                  stroke="#4DB8E8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22 12L26 16L22 20"
                  stroke="#4DB8E8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M18 10L14 22"
                  stroke="#4DB8E8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Text */}
              <h2 className="text-2xl font-bold text-white">Enscribe</h2>
            </a>
          </Link>
          <button onClick={() => setSidebarOpen(false)}>
            <XMarkIcon className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="px-4 py-6 flex-grow">
          <ul className="space-y-2">
            {navigation.map((item) => (
              <li key={item.name}>
                <Link href={item.href} legacyBehavior>
                  <a className="flex items-center p-3 text-gray-300 hover:bg-gray-800 rounded-md">
                    <item.icon className="w-5 h-5 mr-3 text-gray-400" />
                    {item.name}
                  </a>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Bottom Buttons */}
        <div className="mt-auto px-4 py-4 flex space-x-4">
          <Link href={productLink || '/'} target="_blank" legacyBehavior>
            <a
              className="flex items-center justify-center w-1/2 text-gray-300 hover:bg-gray-800 p-3 rounded-md"
              target="_blank"
              rel="noopener noreferrer"
            >
              <InformationCircleIcon className="w-5 h-5 mr-3 text-gray-400" />
              About
            </a>
          </Link>
          <Link href={`${productLink}/docs`} target="_blank" legacyBehavior>
            <a
              className="flex items-center justify-center w-1/2 text-gray-300 hover:bg-gray-800 p-3 rounded-md"
              target="_blank"
              rel="noopener noreferrer"
            >
              <DocumentIcon className="w-5 h-5 mr-3 text-gray-400" />
              Docs
            </a>
          </Link>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        {/* Top Navbar */}
        <header className="flex items-center p-4 bg-white dark:bg-gray-800 shadow-md">
          {/* Mobile Menu Button */}
          <div className="lg:hidden">
            <button onClick={() => setSidebarOpen(true)}>
              <Bars3Icon className="w-6 h-6 text-gray-900 dark:text-white" />
            </button>
          </div>

          {/* Logo for medium screens */}
          <div className="hidden md:flex lg:hidden items-center ml-2 mr-4">
            <Link href="/" legacyBehavior>
              <a className="flex items-center">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 32 32"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect width="32" height="32" rx="4" fill="#151A2D" />
                  <path
                    d="M10 12L6 16L10 20"
                    stroke="#4DB8E8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M22 12L26 16L22 20"
                    stroke="#4DB8E8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M18 10L14 22"
                    stroke="#4DB8E8"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </Link>
          </div>

          {/* Address Search Component */}
          <div className="flex-1 max-w-md">
            <AddressSearch
              selectedChain={selectedChain}
              setManuallyChanged={setManuallyChanged}
            />
          </div>

          <div className="flex-1"></div>

          {/* Chain Selector - only visible when wallet is not connected */}
          {!isConnected && (
            <div className="mr-2">
              <ChainSelector
                selectedChain={selectedChain}
                onChainChange={(chainId) => {
                  // Mark as manually changed to prevent auto-sync with URL
                  setManuallyChanged(true)
                  setSelectedChain(chainId)

                  // If there's a chainId in the URL, perform a hard refresh to new chain URL
                  if (router.query.chainId && router.query.address) {
                    const address = router.query.address as string
                    console.log(
                      `Hard refreshing to chain ${chainId} for address ${address}`,
                    )
                    window.location.href = `/explore/${chainId}/${address}`
                  }
                }}
              />
            </div>
          )}

          {/* WalletConnect Button */}
          <ConnectButton
            accountStatus={{
              smallScreen: 'avatar',
              largeScreen: 'full',
            }}
            chainStatus={{
              smallScreen: 'icon',
              largeScreen: 'full',
            }}
            showBalance={{
              smallScreen: false,
              largeScreen: true,
            }}
          />
        </header>

        <main className="flex-1 p-6 bg-white dark:bg-gray-800">{children}</main>
        <Toaster />
      </div>
    </div>
  )
}
