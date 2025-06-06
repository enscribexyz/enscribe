import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { isAddress } from 'viem/utils'
import { createPublicClient, http } from 'viem'
import Layout from '@/components/Layout'
import ENSDetails from '@/components/ENSDetails'
import { CONTRACTS } from '@/utils/constants'
import { useAccount } from 'wagmi'

export default function ExploreAddressPage() {
  const router = useRouter()
  const { address, chainId } = router.query
  const [isValidAddress, setIsValidAddress] = useState(false)
  const [isValidChain, setIsValidChain] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [client, setClient] = useState<any>(null)
  const [isContract, setIsContract] = useState(false)
  const { chain: walletChain } = useAccount()

  // Reset state when URL parameters change
  useEffect(() => {
    if (router.isReady) {
      setIsValidAddress(false)
      setIsContract(false)
      setClient(null)
      setError(null)
      setIsLoading(true)
      console.log('URL parameters changed, resetting state')
    }
  }, [router.isReady, chainId, address])

  // Initialize viem client based on chainId
  useEffect(() => {
    if (!router.isReady || !chainId || typeof chainId !== 'string') return

    const chainIdNumber = parseInt(chainId)
    if (isNaN(chainIdNumber)) {
      setIsValidChain(false)
      setError('Invalid chain ID format')
      setIsLoading(false)
      return
    }

    const config = CONTRACTS[chainIdNumber]
    if (!config) {
      setIsValidChain(false)
      setError(`Chain ID ${chainId} is not supported`)
      setIsLoading(false)
      return
    }

    setIsValidChain(true)

    try {
      // Use the chain-specific RPC endpoint
      let rpcEndpoint = config.RPC_ENDPOINT
      console.log(`Using RPC endpoint for chain ${chainIdNumber}:`, rpcEndpoint)

      // Create a new viem client
      const viemClient = createPublicClient({
        chain: {
          id: chainIdNumber,
          name: config.name,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: {
            default: { http: [rpcEndpoint] },
            public: { http: [rpcEndpoint] },
          },
        },
        transport: http(rpcEndpoint),
      })

      setClient(viemClient)
    } catch (err) {
      console.error('Error initializing viem client:', err)
      setError('Failed to initialize provider for the selected chain')
      setIsLoading(false)
    }
  }, [router.isReady, chainId])

  useEffect(() => {
    const validateAddress = async () => {
      if (!address || typeof address !== 'string' || !client) {
        setIsLoading(false)
        return
      }

      try {
        // Check if it's a valid Ethereum address
        if (isAddress(address)) {
          setIsValidAddress(true)

          try {
            const bytecode = await client.getBytecode({
              address: address as `0x${string}`,
            })
            console.log('Bytecode for address:', address, 'is:', bytecode)
            if (bytecode && bytecode !== '0x') {
              setIsContract(true)
              console.log('Address is a contract')
            } else {
              setIsContract(false)
              console.log('Address is an EOA (Externally Owned Account)')
            }
          } catch (err) {
            console.error('Error getting bytecode:', err)
            setError('Failed to verify if the address is a contract')
            setIsContract(false)
          }
        } else {
          setError('Invalid Ethereum address format')
        }
      } catch (err) {
        console.error('Error validating address:', err)
        setError('An error occurred while validating the address')
      } finally {
        setIsLoading(false)
      }
    }

    if (router.isReady && client) {
      validateAddress()
    }
  }, [router.isReady, address, client])

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex items-center mb-6 w-full max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          {isValidAddress && isValidChain
            ? isContract
              ? 'Contract Details'
              : 'Account Details'
            : 'Invalid Chain ID or Address'}
        </h1>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="text-red-700 dark:text-red-400">{error}</div>
        </div>
      )}

      {/* Display a message if the wallet chain differs from the URL chain */}
      {walletChain &&
        chainId &&
        parseInt(chainId as string) !== walletChain.id && (
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-yellow-700 dark:text-yellow-400">
              Note: You are viewing data for chain ID {chainId}, but your wallet
              is connected to {walletChain.name} (chain ID {walletChain.id}).
            </p>
          </div>
        )}

      {isValidAddress && isValidChain && (
        <ENSDetails
          address={address as string}
          chainId={typeof chainId === 'string' ? parseInt(chainId) : undefined}
          isContract={isContract}
        />
      )}
    </Layout>
  )
}
