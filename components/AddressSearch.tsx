import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { usePublicClient, useAccount } from 'wagmi'
import { ethers, isAddress } from 'ethers'
import { createPublicClient, http } from 'viem'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search } from 'lucide-react'
import { CHAINS, CONTRACTS } from '@/utils/constants'
import { useAccount as useWagmiAccount } from 'wagmi'

interface AddressSearchProps {
  selectedChain?: number
  setManuallyChanged?: React.Dispatch<React.SetStateAction<boolean>>
}

export default function AddressSearch({
  selectedChain: propSelectedChain,
  setManuallyChanged: propSetManuallyChanged,
}: AddressSearchProps = {}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedChain, setSelectedChain] = useState<number>(
    propSelectedChain || 1,
  )
  const [manuallyChanged, setManuallyChanged] = useState(false)

  const router = useRouter()
  const { chain } = useWagmiAccount()

  // Update local state when prop changes
  useEffect(() => {
    if (propSelectedChain !== undefined) {
      console.log('Using chain from Layout:', propSelectedChain)
      setSelectedChain(propSelectedChain)
    }
  }, [propSelectedChain])

  // Sync with wallet chain if connected and not manually changed
  useEffect(() => {
    if (chain?.id && !manuallyChanged) {
      console.log('Wallet connected to chain:', chain.id, chain.name)
      setSelectedChain(chain.id)
    }
  }, [chain?.id, manuallyChanged])

  const getProvider = (chainId: number) => {
    const config = CONTRACTS[chainId as keyof typeof CONTRACTS]
    if (!config) {
      throw new Error(`Unsupported chain ID: ${chainId}`)
    }

    console.log(`Using RPC endpoint for chain ${chainId}:`, config.RPC_ENDPOINT)

    return new ethers.JsonRpcProvider(config.RPC_ENDPOINT)
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter an address')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // Get the cleaned search query and ensure it's treated as a string
      const cleanedQuery: string = searchQuery.trim()
      const isValidAddress = isAddress(cleanedQuery)
      const containsDot = cleanedQuery.includes('.')

      console.log('Search query:', cleanedQuery)
      console.log('Is valid address:', isValidAddress)
      console.log('Contains dot (possible ENS):', containsDot)
      console.log('Using chain for search:', selectedChain)

      // Make sure Layout knows this chain selection is intentional
      if (propSetManuallyChanged) {
        propSetManuallyChanged(true)
      }
      setManuallyChanged(true)

      if (isValidAddress) {
        // It's a valid Ethereum address, redirect to explore page
        // Always use window.location for a full refresh to ensure contract status is re-checked
        // Add a timestamp parameter to prevent caching issues
        console.log('Using hard redirect to ensure proper contract detection')
        window.location.href = `/explore/${selectedChain}/${cleanedQuery}`
      } else if (containsDot) {
        // Not a valid address but contains a dot - try ENS resolution
        try {
          console.log(
            'Input contains a dot, trying to resolve as ENS name:',
            cleanedQuery,
          )

          // Determine if we're on a testnet
          const isTestnet = [
            CHAINS.SEPOLIA,
            CHAINS.LINEA_SEPOLIA,
            CHAINS.BASE_SEPOLIA,
          ].includes(selectedChain)

          // Use mainnet for mainnets, sepolia for testnets
          const ensChainId = isTestnet ? CHAINS.SEPOLIA : CHAINS.MAINNET

          console.log(
            'Using chain for ENS resolution:',
            ensChainId,
            isTestnet ? '(testnet)' : '(mainnet)',
          )
          const mainnetProvider = getProvider(ensChainId)
          const resolvedAddress =
            await mainnetProvider.resolveName(cleanedQuery)

          if (resolvedAddress) {
            // Always use window.location for a full refresh to ensure contract status is re-checked
            console.log(
              'Using hard redirect for resolved ENS to ensure proper contract detection',
            )
            window.location.href = `/explore/${selectedChain}/${resolvedAddress}`
          } else {
            setError("ENS name doesn't resolve to any address")
          }
        } catch (ensError) {
          console.error('Error resolving ENS name:', ensError)
          setError("ENS name doesn't resolve to any address")
        }
      } else {
        // Not a valid address and doesn't contain a dot
        setError('Invalid Address')
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Enter key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  return (
    <div className="flex w-full items-center space-x-2">
      <div className="flex-1">
        <Input
          type="text"
          placeholder="Search address or ENS name"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`pr-3 ${error ? 'border-red-500' : ''} bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200`}
        />
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1 absolute">
            {error}
          </p>
        )}
      </div>
      <Button
        onClick={handleSearch}
        disabled={isLoading}
        className="ml-2"
        size="icon"
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  )
}
