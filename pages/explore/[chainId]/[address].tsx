import { useRouter } from 'next/router'
import { useState, useEffect, useCallback } from 'react'
import { isAddress } from 'viem/utils'
import { createPublicClient, http } from 'viem'
import Layout from '@/components/Layout'
import ENSDetails from '@/components/ENSDetails'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { CHAINS, CONTRACTS, ETHERSCAN_API } from '@/utils/constants'
import { useAccount } from 'wagmi'
import { checkIfProxy } from '@/utils/proxy'
import Link from 'next/link'
import { ethers } from 'ethers'
import reverseRegistrarABI from '@/contracts/ReverseRegistrar'
import ensRegistryABI from '@/contracts/ENSRegistry'
import publicResolverABI from '@/contracts/PublicResolver'

export default function ExploreAddressPage() {
  const router = useRouter()
  const { address, chainId } = router.query
  const [isValidAddress, setIsValidAddress] = useState(false)
  const [isValidChain, setIsValidChain] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [client, setClient] = useState<any>(null)
  const [isContract, setIsContract] = useState(false)
  const [proxyInfo, setProxyInfo] = useState<{
    isProxy: boolean
    implementationAddress?: string
  }>({ isProxy: false })
  const [contractDeployerAddress, setContractDeployerAddress] = useState<string | null>(null)
  const [contractDeployerPrimaryName, setContractDeployerPrimaryName] = useState<string | null>(null)
  const { chain: walletChain } = useAccount()

  const getENS = async (
    addr: string,
    chainId: number,
  ): Promise<string> => {
    const config = CONTRACTS[chainId];
    const provider = new ethers.JsonRpcProvider(config.RPC_ENDPOINT)

    // Use the effectiveChainId instead of chain?.id to ensure we're using the correct chain
    // for ENS lookups even when the wallet is not connected
    if (
      chainId === CHAINS.MAINNET ||
      chainId === CHAINS.SEPOLIA
    ) {
      try {
        console.log(
          `[address] Looking up ENS name for ${addr} on chain ${chainId}`,
        )
        return (await provider.lookupAddress(addr)) || ''
      } catch (error) {
        console.error('[address] Error looking up ENS name:', error)
        return ''
      }
    } else {
      try {
        console.log(
          `[address] Looking up ENS name for ${addr} on chain ${chainId} using reverse registrar`,
        )

        // Check if contract addresses are configured
        if (!config?.REVERSE_REGISTRAR || !config?.PUBLIC_RESOLVER) {
          console.error(
            `[address] Missing contract addresses for chain ${chainId}`,
          )
          return ''
        }

        // Get reversed node with error handling
        let reversedNode
        try {
          const reverseRegistrarContract = new ethers.Contract(
            config.REVERSE_REGISTRAR,
            reverseRegistrarABI,
            provider,
          )
          reversedNode = await reverseRegistrarContract.node(addr)
          console.log(`[address] Reversed node for ${addr}: ${reversedNode}`)
        } catch (nodeError) {
          console.error('[address] Error getting reversed node:', nodeError)
          return ''
        }

        // If we don't have a valid reversed node, return empty
        if (!reversedNode) {
          console.log(
            '[address] No reversed node found, returning empty name',
          )
          return ''
        }

        const ensRegistryContract = new ethers.Contract(
          config?.ENS_REGISTRY!,
          ensRegistryABI,
          provider,
        )

        let publicResolverAddress = config?.PUBLIC_RESOLVER!
        try {
          publicResolverAddress =
            (await ensRegistryContract.resolver(reversedNode)) ||
            config?.PUBLIC_RESOLVER!
        } catch (err) {
          console.log('err ' + err)
          setError('Failed to get public resolver')
        }

        // Get name from resolver with error handling
        try {
          const resolverContract = new ethers.Contract(
            publicResolverAddress,
            publicResolverABI,
            provider,
          )

          try {
            const name = (await resolverContract.name(reversedNode)) || ''
            console.log(`[address] ENS name for ${addr}: ${name}`)
            return name
          } catch (nameError: any) {
            // Check for specific BAD_DATA error or empty result
            if (
              nameError.code === 'BAD_DATA' ||
              nameError.message?.includes('could not decode result data')
            ) {
              console.log(
                `[address] Resolver doesn't have a valid name record for ${addr}, this is normal for some addresses`,
              )
              return ''
            }
            throw nameError
          }
        } catch (resolverError: any) {
          console.error(
            '[address] Error calling resolver contract:',
            resolverError,
          )
          return ''
        }
      } catch (error) {
        console.error(
          '[address] Error looking up ENS name using reverse registrar:',
          error,
        )
        return ''
      }
    }
  }

  const fetchPrimaryNameForContractDeployer = async (contractDeployerAddress: string, chainId: number): Promise<string | null> => {
    try {
      console.log(`[address] Fetching primary ENS name for ${contractDeployerAddress}`)
      const primaryENS = await getENS(contractDeployerAddress, chainId)

      if (primaryENS) {
        console.log(`[address] Primary ENS name found for contract deployer: ${primaryENS}`)
        return primaryENS
      } else {
        console.log(`[address] No primary ENS name found for contract deployer ${contractDeployerAddress}`)
        return null
      }
    } catch (error) {
      console.error('[address] Error fetching primary ENS name for contract deployer:', error)
      return null
    }
  }

  const fetchContractCreator = async(contractAddress: string, chainId: number): Promise<string | null> => {
    const etherscanApi = `${ETHERSCAN_API}&chainid=${chainId}&module=contract&action=getcontractcreation&contractaddresses=${contractAddress}`
    const response = await fetch(etherscanApi)
    const data = await response.json()
    if (data.result !== undefined && data.result.length > 0 ) {
      console.log(`cont creator ${data.result[0].contractCreator}`)
      return data.result[0].contractCreator
    } else {
      return null
    }
  }

  // Reset state when URL parameters change
  useEffect(() => {
    if (router.isReady) {
      setIsValidAddress(false)
      setIsContract(false)
      setProxyInfo({ isProxy: false })
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
    // Exit early if not ready
    if (!router.isReady) {
      console.log('Router not ready yet')
      return
    }

    // Exit early if no client
    if (!client) {
      console.log('No client available yet')
      return
    }

    // Exit early if no address
    if (!address || typeof address !== 'string') {
      console.log('No valid address in URL parameters')
      setIsLoading(false)
      return
    }

    // Set loading state at the beginning of the effect
    setIsLoading(true)
    console.log(
      'Starting address validation for:',
      address,
      'on chain:',
      chainId,
    )

    // Function to validate the address
    const validateAddress = async () => {
      try {
        // Check if it's a valid Ethereum address format
        const addressIsValid = isAddress(address)
        console.log('Address format validation result:', addressIsValid)

        if (!addressIsValid) {
          console.log('Invalid address format:', address)
          setIsValidAddress(false)
          setError('Invalid Ethereum address format')
          return
        }

        // Mark as valid address format
        setIsValidAddress(true)

        try {
          // Get bytecode to determine if it's a contract
          console.log('Getting bytecode for address:', address)
          const bytecode = await client.getBytecode({
            address: address as `0x${string}`,
          })
          const isContractAddress = bytecode && bytecode !== '0x'

          console.log(
            'Bytecode check result:',
            isContractAddress ? 'Is contract' : 'Is EOA',
            bytecode
              ? bytecode === '0x'
                ? '(empty bytecode)'
                : '(has bytecode)'
              : '(no bytecode)',
          )

          // Update contract status
          setIsContract(isContractAddress)

          // If it's a contract, check if it's a proxy
          if (isContractAddress) {
            try {
              console.log('fetching contract deployer details ...')
              const creatorAddress = await fetchContractCreator(address, Number(chainId))
              setContractDeployerAddress(creatorAddress)

              if (creatorAddress !== null) {
                const creatorPrimaryName = await fetchPrimaryNameForContractDeployer(creatorAddress, Number(chainId))
                setContractDeployerPrimaryName(creatorPrimaryName)
              }

              console.log('Checking if contract is a proxy...')
              const proxyData = await checkIfProxy(
                address as string,
                Number(chainId),
              )
              setProxyInfo(proxyData)
              console.log('Proxy check result:', proxyData)
            } catch (proxyError) {
              console.error('Error checking if contract is proxy:', proxyError)
              // Don't set an error, just log it
            }
          }
        } catch (bytecodeError) {
          console.error('Error getting bytecode:', bytecodeError)
          setError('Failed to verify if the address is a contract')
          // Still consider address valid, but not a contract
          setIsContract(false)
        }
      } catch (err) {
        console.error('Error in address validation:', err)
        setIsValidAddress(false)
        setError('An error occurred while validating the address')
      } finally {
        // Always make sure to finish loading
        console.log('Completing address validation')
        setIsLoading(false)
      }
    }

    // Run the validation
    validateAddress()
  }, [router.isReady, chainId, address, client])

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 dark:border-blue-400"></div>
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
          contractDeployerAddress={contractDeployerAddress!}
          contractDeployerName={contractDeployerPrimaryName}
          chainId={typeof chainId === 'string' ? parseInt(chainId) : undefined}
          isContract={isContract}
          proxyInfo={proxyInfo}
        />
      )}
    </Layout>
  )
}
