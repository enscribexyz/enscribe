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
      const cleanedQuery = searchQuery.trim()
      const isValidAddress = isAddress(cleanedQuery)
      console.log('Search query:', cleanedQuery)
      console.log('Is valid address:', isValidAddress)
      console.log('Using chain for search:', selectedChain)

      // Make sure Layout knows this chain selection is intentional
      if (propSetManuallyChanged) {
        propSetManuallyChanged(true)
      }
      setManuallyChanged(true)

      if (isValidAddress) {
        // It's a valid Ethereum address, redirect to explore page
        // Use window.location for a full refresh if we're already on an explore page
        const currentPath = router.asPath
        if (currentPath.startsWith('/explore/')) {
          console.log('Already on explore page, using hard redirect')
          window.location.href = `/explore/${selectedChain}/${cleanedQuery}`
        } else {
          router.push(`/explore/${selectedChain}/${cleanedQuery}`)
        }
      } else {
        try {
          console.log(
            'Not a valid address, trying to resolve as ENS name:',
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
            // Use window.location for a full refresh if we're already on an explore page
            const currentPath = router.asPath
            if (currentPath.startsWith('/explore/')) {
              console.log(
                'Already on explore page, using hard redirect for resolved ENS',
              )
              window.location.href = `/explore/${selectedChain}/${resolvedAddress}`
            } else {
              router.push(`/explore/${selectedChain}/${resolvedAddress}`)
            }
          } else {
            setError('Invalid address or ENS name')
          }
        } catch (ensError) {
          console.error('Error resolving ENS name:', ensError)
          setError('Invalid address or ENS name')
        }
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
          placeholder="Search address"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`pr-3 text-black ${error ? 'border-red-500' : ''}`}
        />
        {error && <p className="text-xs text-red-500 mt-1 absolute">{error}</p>}
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
