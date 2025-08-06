import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import contractABI from '../contracts/Enscribe'
import ensRegistryABI from '../contracts/ENSRegistry'
import nameWrapperABI from '../contracts/NameWrapper'
import publicResolverABI from '../contracts/PublicResolver'
import reverseRegistrarABI from '@/contracts/ReverseRegistrar'
import { useAccount, useWalletClient, useSwitchChain, useBalance } from 'wagmi'
import { optimism, optimismSepolia, arbitrum, arbitrumSepolia, scroll, scrollSepolia, base, linea } from 'wagmi/chains'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { CONTRACTS, CHAINS } from '../utils/constants'
import Link from 'next/link'
import SetNameStepsModal, { Step } from './SetNameStepsModal'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { Checkbox } from '@/components/ui/checkbox'
import { v4 as uuid } from 'uuid'
import { fetchGeneratedName, logMetric } from '@/components/componentUtils'
import { getEnsAddress, readContract, writeContract, getBalance } from 'viem/actions'
import { namehash, normalize } from 'viem/ens'
import { isAddress, keccak256, toBytes } from 'viem'
import enscribeContractABI from '../contracts/Enscribe'
import ownableContractABI from '@/contracts/Ownable'

export default function NameContract() {
  const router = useRouter()
  const { address: walletAddress, isConnected, chain } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { switchChain } = useSwitchChain()

  const config = chain?.id ? CONTRACTS[chain.id] : undefined
  const enscribeDomain = config?.ENSCRIBE_DOMAIN!
  const etherscanUrl = config?.ETHERSCAN_URL!
  const ensAppUrl = config?.ENS_APP_URL!

  const { toast } = useToast()

  const [existingContractAddress, setExistingContractAddress] = useState('')
  const [label, setLabel] = useState('')
  const [parentType, setParentType] = useState<'web3labs' | 'own'>('web3labs')
  const [parentName, setParentName] = useState(enscribeDomain)
  const [fetchingENS, setFetchingENS] = useState(false)
  const [userOwnedDomains, setUserOwnedDomains] = useState<string[]>([])
  const [showENSModal, setShowENSModal] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [deployedAddress, setDeployedAddress] = useState('')
  const [receipt, setReceipt] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const [isAddressEmpty, setIsAddressEmpty] = useState(true)
  const [isAddressInvalid, setIsAddressInvalid] = useState(true)
  const [isOwnable, setIsOwnable] = useState<boolean | null>(false)
  const [isContractOwner, setIsContractOwner] = useState<boolean | null>(false)
  const [isReverseClaimable, setIsReverseClaimable] = useState<boolean | null>(
    false,
  )
  const [ensNameTaken, setEnsNameTaken] = useState(false)
  const [isPrimaryNameSet, setIsPrimaryNameSet] = useState(false)
  const [recordExists, setRecordExists] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalSteps, setModalSteps] = useState<Step[]>([])
  const [modalTitle, setModalTitle] = useState('')
  const [modalSubtitle, setModalSubtitle] = useState('')
  const [enableL2PrimaryName, setEnableL2PrimaryName] = useState(false)
  const [enableArbitrumL2, setEnableArbitrumL2] = useState(false)
  const [enableScrollL2, setEnableScrollL2] = useState(false)
  const [enableBaseL2, setEnableBaseL2] = useState(false)
  const [enableLineaL2, setEnableLineaL2] = useState(false)

  const corelationId = uuid()
  const opType = 'nameexisting'

  const getParentNode = (name: string) => {
    try {
      return namehash(name)
    } catch (error) {
      return ''
    }
  }

  useEffect(() => {
    // Don't reset form if modal is open (to prevent closing during Optimism transaction)
    if (modalOpen) {
      console.log('Modal is open, skipping form reset to prevent interruption')
      return
    }
    
    setLabel('')
    setParentType('web3labs')
    setParentName(enscribeDomain)
    setError('')
    setLoading(false)
    setDeployedAddress('')
    setExistingContractAddress('')
    setTxHash('')
    setModalOpen(false)
    setModalSteps([])
    setModalTitle('')
    setModalSubtitle('')
    setUserOwnedDomains([])
    setShowENSModal(false)
    setIsOwnable(false)
    setIsReverseClaimable(false)
    setIsAddressEmpty(true)
    setIsAddressInvalid(false)
                    setEnableL2PrimaryName(false)
    setEnableArbitrumL2(false)
    setEnableScrollL2(false)
    setEnableBaseL2(false)
    setEnableLineaL2(false)
  }, [chain?.id, isConnected, modalOpen])

  useEffect(() => {
    const initFromQuery = async () => {
      if (
        router.query.contract &&
        isAddress(router.query.contract as string) &&
        walletClient
      ) {
        const addr = router.query.contract as string
        setExistingContractAddress(addr)
        isAddressValid(addr)
        await checkIfOwnable(addr)
        await checkIfReverseClaimable(addr)
      }
    }

    initFromQuery()
  }, [router.query.contract, walletClient])

  useEffect(() => {
    if (parentType === 'web3labs' && config?.ENSCRIBE_DOMAIN) {
      setParentName(config.ENSCRIBE_DOMAIN)
    }
  }, [config, parentType])

  const populateName = async () => {
    const name = await fetchGeneratedName()
    setLabel(name)
  }

  const fetchUserOwnedDomains = async () => {
    if (!walletAddress) {
      console.warn('Address or chain configuration is missing')
      return
    }

    if (!config?.SUBGRAPH_API) {
      console.warn('No subgraph API endpoint configured for this chain')
      return
    }

    try {
      setFetchingENS(true)

      // Fetch domains where user is the owner
      const [ownerResponse, registrantResponse, wrappedResponse] =
        await Promise.all([
          fetch(config.SUBGRAPH_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`,
            },
            body: JSON.stringify({
              query: `
                            query getDomainsForAccount($address: String!) { 
                                domains(where: { owner: $address }) { 
                                    name 
                                } 
                            }
                        `,
              variables: {
                address: walletAddress.toLowerCase(),
              },
            }),
          }),
          // Fetch domains where user is the registrant
          fetch(config.SUBGRAPH_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`,
            },
            body: JSON.stringify({
              query: `
                            query getDomainsForAccount($address: String!) { 
                                domains(where: { registrant: $address }) { 
                                    name 
                                } 
                            }
                        `,
              variables: {
                address: walletAddress.toLowerCase(),
              },
            }),
          }),
          // Fetch domains where user is the wrapped
          fetch(config.SUBGRAPH_API, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`,
            },
            body: JSON.stringify({
              query: `
                            query getDomainsForAccount($address: String!) { 
                                domains(where: { wrappedOwner: $address }) { 
                                    name 
                                } 
                            }
                        `,
              variables: {
                address: walletAddress.toLowerCase(),
              },
            }),
          }),
        ])

      const [ownerData, registrantData, wrappedData] = await Promise.all([
        ownerResponse.json(),
        registrantResponse.json(),
        wrappedResponse.json(),
      ])

      // Combine all sets of domains and remove duplicates
      const ownedDomains =
        ownerData?.data?.domains?.map((d: { name: string }) => d.name) || []
      const registrantDomains =
        registrantData?.data?.domains?.map((d: { name: string }) => d.name) ||
        []
      const wrappedDomains =
        wrappedData?.data?.domains?.map((d: { name: string }) => d.name) || []

      // Combine and deduplicate domains
      const allDomains = [
        ...new Set([...ownedDomains, ...registrantDomains, ...wrappedDomains]),
      ]

      if (allDomains.length > 0) {
        // Filter out .addr.reverse names
        const filteredDomains = allDomains.filter(
          (domain: string) => !domain.endsWith('.addr.reverse'),
        )

        // Keep domains as-is, including any labelhashes
        const processedDomains = filteredDomains

        // First, separate domains with labelhashes from regular domains
        const domainsWithLabelhash = processedDomains.filter(
          (domain) => domain.includes('[') && domain.includes(']'),
        )
        const regularDomains = processedDomains.filter(
          (domain) => !(domain.includes('[') && domain.includes(']')),
        )

        // Function to get the 2LD for a domain
        const get2LD = (domain: string): string => {
          const parts = domain.split('.')
          if (parts.length < 2) return domain
          return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
        }

        // Group regular domains by their 2LD
        const domainsByParent: { [key: string]: string[] } = {}

        regularDomains.forEach((domain) => {
          const parent2LD = get2LD(domain)
          if (!domainsByParent[parent2LD]) {
            domainsByParent[parent2LD] = []
          }
          domainsByParent[parent2LD].push(domain)
        })

        // Sort 2LDs alphabetically
        const sorted2LDs = Object.keys(domainsByParent).sort()

        // For each 2LD, sort its domains by depth
        const sortedDomains: string[] = []

        sorted2LDs.forEach((parent2LD) => {
          // Sort domains within this 2LD group by depth
          const sortedGroup = domainsByParent[parent2LD].sort((a, b) => {
            // Always put the 2LD itself first
            if (a === parent2LD) return -1
            if (b === parent2LD) return 1

            // Then sort by depth
            const aDepth = a.split('.').length
            const bDepth = b.split('.').length
            if (aDepth !== bDepth) {
              return aDepth - bDepth
            }

            // If same depth, sort alphabetically
            return a.localeCompare(b)
          })

          // Add all domains from this group to the result
          sortedDomains.push(...sortedGroup)
        })

        // Finally, add domains with labelhashes at the end
        sortedDomains.push(...domainsWithLabelhash)

        // Apply chain-specific filtering
        let chainFilteredDomains = sortedDomains

        // Filter based on chain
        if (chain?.id === CHAINS.BASE) {
          // For Base chain, only keep .base.eth names
          console.log(
            '[DeployForm] Filtering owned domains for Base chain - only keeping .base.eth names',
          )
          chainFilteredDomains = sortedDomains.filter((domain) =>
            domain.endsWith('.base.eth'),
          )
        } else if (chain?.id === CHAINS.BASE_SEPOLIA) {
          // For Base Sepolia, don't show any names
          console.log(
            '[DeployForm] Base Sepolia detected - not showing any owned ENS names',
          )
          chainFilteredDomains = []
        }

        setUserOwnedDomains(chainFilteredDomains)
        console.log(
          'Fetched and processed user owned domains:',
          chainFilteredDomains,
        )
      }
    } catch (error) {
      console.error("Error fetching user's owned ENS domains:", error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to fetch your owned ENS domains',
      })
    } finally {
      setFetchingENS(false)
    }
  }

  const checkENSReverseResolution = async () => {
    if (isEmpty(label) || !walletClient) return

    // Validate label and parent name before checking
    // if (!label.trim()) {
    //     setError("Label cannot be empty")
    //     setEnsNameTaken(true)
    //     return
    // }
    if (!parentName.trim()) {
      setError('Parent name cannot be empty')
      setEnsNameTaken(true)
      return
    }
    if (label.includes('.')) {
      setError("Can't include '.' in label name")
      return
    }

    try {
      const fullEnsName = `${label}.${parentName}`
      let resolvedAddress = await getEnsAddress(walletClient, {
        name: normalize(fullEnsName),
      })

      if (resolvedAddress) {
        setEnsNameTaken(true)
        setError('ENS name already used, please change label')
      } else {
        setEnsNameTaken(false)
        setError('')
      }
    } catch (err) {
      console.error('Error checking ENS name:', err)
      setEnsNameTaken(false)
    }
  }

  function isEmpty(value: string) {
    return value == null || value.trim().length === 0
  }

  const checkIfAddressEmpty = (existingContractAddress: string): boolean => {
    const addrEmpty = isEmpty(existingContractAddress)
    setIsAddressEmpty(addrEmpty)
    return addrEmpty
  }

  const isAddressValid = (existingContractAddress: string): boolean => {
    if (isEmpty(existingContractAddress)) {
      setError('contract address cannot be empty')
      return false
    }

    if (!isAddress(existingContractAddress)) {
      setError('Invalid contract address')
      setIsOwnable(false)
      setIsAddressInvalid(true)
      return false
    }
    return true
  }

  const checkIfContractOwner = async (address: string) => {
    if (
      checkIfAddressEmpty(address) ||
      !isAddressValid(address) ||
      !walletClient ||
      !config?.ENS_REGISTRY ||
      !walletAddress
    ) {
      setIsOwnable(false)
      setIsContractOwner(false)
      return
    }
    try {
      const ownerAddress = (await readContract(walletClient, {
        address: address as `0x${string}`,
        abi: ownableContractABI,
        functionName: 'owner',
        args: [],
      })) as `0x${string}`
      console.log(
        `ownerAddress: ${ownerAddress.toLowerCase()} signer: ${walletAddress}`,
      )
      setIsContractOwner(
        ownerAddress.toLowerCase() == walletAddress.toLowerCase(),
      )
    } catch (err) {
      console.log('err ' + err)
      const addrLabel = address.slice(2).toLowerCase()
      const reversedNode = namehash(addrLabel + '.' + 'addr.reverse')
      const resolvedAddr = (await readContract(walletClient, {
        address: config.ENS_REGISTRY as `0x${string}`,
        abi: ensRegistryABI,
        functionName: 'owner',
        args: [reversedNode],
      })) as string

      console.log(
        `resolvedAddr: ${resolvedAddr.toLowerCase()} signer: ${walletAddress}`,
      )
      setIsContractOwner(
        resolvedAddr.toLowerCase() == walletAddress.toLowerCase(),
      )
    }
  }

  const checkIfOwnable = async (address: string) => {
    if (
      checkIfAddressEmpty(address) ||
      !isAddressValid(address) ||
      !walletClient
    ) {
      setIsOwnable(false)
      return
    }

    try {
      const ownerAddress = (await readContract(walletClient, {
        address: address as `0x${string}`,
        abi: ownableContractABI,
        functionName: 'owner',
        args: [],
      })) as `0x${string}`

      console.log('contract ownable')
      setIsOwnable(true)
      setIsAddressInvalid(false)
      setError('')
    } catch (err) {
      console.log('err ' + err)
      setIsAddressEmpty(false)
      setIsAddressInvalid(false)
      setIsOwnable(false)
    }
  }

  const checkIfReverseClaimable = async (address: string) => {
    if (checkIfAddressEmpty(address) || !isAddressValid(address)) {
      setIsOwnable(false)
      setIsReverseClaimable(false)
      return
    }

    try {
      if (!walletClient || !walletAddress) {
        alert('Please connect your wallet first.')
        setLoading(false)
        return
      }
      const addrLabel = address.slice(2).toLowerCase()
      const reversedNode = namehash(addrLabel + '.' + 'addr.reverse')
      const resolvedAddr = (await readContract(walletClient, {
        address: config?.ENS_REGISTRY as `0x${string}`,
        abi: ensRegistryABI,
        functionName: 'owner',
        args: [reversedNode],
      })) as `0x${string}`
      console.log('resolvedaddr is ' + resolvedAddr)

      if (resolvedAddr.toLowerCase() === walletAddress.toLowerCase()) {
        console.log('contract implements reverseclaimable')
        setIsReverseClaimable(true)
      } else {
        console.log('contract DOES NOT implement reverseclaimable')
        setIsReverseClaimable(false)
      }

      setIsAddressInvalid(false)
      setError('')
    } catch (err) {
      console.log('err ' + err)
      setIsAddressEmpty(false)
      setIsAddressInvalid(false)
      setIsReverseClaimable(false)
    }
  }

  const recordExist = async (): Promise<boolean> => {
    if (!walletClient || !getParentNode(parentName)) return false
    try {
      const parentNode = getParentNode(parentName)

      return (await readContract(walletClient, {
        address: config?.ENS_REGISTRY as `0x${string}`,
        abi: ensRegistryABI,
        functionName: 'recordExists',
        args: [parentNode],
      })) as boolean
    } catch (err) {
      return false
    }
  }

  const setPrimaryName = async () => {
    setError('')
    if (!walletClient || !walletAddress) return

    if (!isAddressValid(existingContractAddress)) {
      setIsOwnable(false)
      return
    }

    await checkIfOwnable(existingContractAddress)
    await checkIfReverseClaimable(existingContractAddress)

    if (!label.trim()) {
      setError('Label cannot be empty')
      return
    }

    if (label.includes('.')) {
      setError("Can't include '.' in label name")
      return
    }

    if (!parentName.trim()) {
      setError('Parent name cannot be empty')
      return
    }

    if (!config) {
      console.error('Unsupported network')
      setError('Unsupported network')
      return
    }

    try {
      setLoading(true)
      setError('')
      setTxHash('')

      if (!walletClient) {
        alert('Please connect your wallet first.')
        setLoading(false)
        return
      }

      const labelNormalized = normalize(label)
      const parentNameNormalized = normalize(parentName)
      const name = normalize(`${labelNormalized}.${parentNameNormalized}`)
      const chainId = chain?.id!

      const parentNode = getParentNode(parentNameNormalized)
      const node = namehash(labelNormalized + '.' + parentNameNormalized)
      const labelHash = keccak256(toBytes(labelNormalized))

      const nameExist = (await readContract(walletClient, {
        address: config.ENS_REGISTRY as `0x${string}`,
        abi: ensRegistryABI,
        functionName: 'recordExists',
        args: [node],
      })) as boolean

      // Internal balance check for all selected L2 chains before creating any steps
      const l2ChainsForBalanceCheck: Array<{ name: string; chainId: number; chain: any }> = []
      if (enableL2PrimaryName) l2ChainsForBalanceCheck.push({ name: 'Optimism', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.OPTIMISM : CHAINS.OPTIMISM_SEPOLIA, chain: chain?.id === CHAINS.OPTIMISM ? optimism : optimismSepolia })
      if (enableArbitrumL2) l2ChainsForBalanceCheck.push({ name: 'Arbitrum', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.ARBITRUM : CHAINS.ARBITRUM_SEPOLIA, chain: chain?.id === CHAINS.ARBITRUM ? arbitrum : arbitrumSepolia })
      if (enableScrollL2) l2ChainsForBalanceCheck.push({ name: 'Scroll', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.SCROLL : CHAINS.SCROLL_SEPOLIA, chain: chain?.id === CHAINS.SCROLL ? scroll : scrollSepolia })
      if (enableBaseL2) l2ChainsForBalanceCheck.push({ name: 'Base', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.BASE : CHAINS.BASE_SEPOLIA, chain: base })
      if (enableLineaL2) l2ChainsForBalanceCheck.push({ name: 'Linea', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.LINEA : CHAINS.LINEA_SEPOLIA, chain: linea })

      // Check balances on all selected L2 chains using RPC calls
      if (l2ChainsForBalanceCheck.length > 0) {
        console.log('Checking balances on all selected L2 chains...')
        
        const insufficientBalanceChains: Array<{ name: string; balance: bigint }> = []
        
        for (const l2Chain of l2ChainsForBalanceCheck) {
          console.log(`Checking balance on ${l2Chain.name}...`)
          
          // Get the RPC URL for this L2 chain
          const l2Config = CONTRACTS[l2Chain.chainId]
          if (!l2Config?.RPC_ENDPOINT) {
            throw new Error(`No RPC endpoint configured for ${l2Chain.name}`)
          }
          
          // Use eth_getBalance RPC call
          const response = await fetch(l2Config.RPC_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getBalance',
              params: [walletAddress, 'latest'],
              id: 1,
            }),
          })
          
          const data = await response.json()
          
          if (data.error) {
            throw new Error(`Failed to get balance on ${l2Chain.name}: ${data.error.message}`)
          }
          
          const balance = BigInt(data.result)
          console.log(`Balance on ${l2Chain.name}: ${balance} wei`)
          
          if (balance === 0n) {
            insufficientBalanceChains.push({ name: l2Chain.name, balance })
          }
        }
        
        // If any chains have insufficient balance, set error state with all of them
        if (insufficientBalanceChains.length > 0) {
          const chainDetails = insufficientBalanceChains.map(chain => 
            `${chain.name} chain: ${chain.balance} wei`
          ).join(', ')
          setError(`Insufficient balance on L2 chains: ${chainDetails}. Please add tokens to these chains before proceeding.`)
          setLoading(false)
          return
        }
        
        console.log('All L2 chain balances verified successfully!')
      }

      const steps: Step[] = []

      let publicResolverAddress = config.PUBLIC_RESOLVER! as `0x${string}`
      try {
        publicResolverAddress = (await readContract(walletClient, {
          address: config.ENS_REGISTRY as `0x${string}`,
          abi: ensRegistryABI,
          functionName: 'resolver',
          args: [parentNode],
        })) as `0x${string}`
      } catch (err) {
        console.log('err ' + err)
        setError('Failed to get public resolver')
      }

      console.log('label - ', labelNormalized)
      console.log('label hash - ', labelHash)
      console.log('parentName - ', parentNameNormalized)
      console.log('parentNode - ', parentNode)
      console.log('name node - ', node)

      const txCost = (await readContract(walletClient, {
        address: config.ENSCRIBE_CONTRACT as `0x${string}`,
        abi: enscribeContractABI,
        functionName: 'pricing',
        args: [],
      })) as bigint

      console.log('txCost - ', txCost)

      const titleFirst =
        parentType === 'web3labs' ? 'Set forward resolution' : 'Create subname'

      // Step 1: Create Subname
      steps.push({
        title: titleFirst,
        action: async () => {
          if (parentType === 'web3labs') {
            const currentAddr = (await readContract(walletClient, {
              address: publicResolverAddress,
              abi: publicResolverABI,
              functionName: 'addr',
              args: [node],
            })) as `0x${string}`

            if (
              currentAddr.toLowerCase() !==
              existingContractAddress.toLowerCase()
            ) {
              const txn = await writeContract(walletClient, {
                address: config.ENSCRIBE_CONTRACT as `0x${string}`,
                abi: contractABI,
                functionName: 'setName',
                args: [
                  existingContractAddress,
                  labelNormalized,
                  parentNameNormalized,
                  parentNode,
                ],
                value: txCost,
                account: walletAddress,
              })

              await logMetric(
                corelationId,
                Date.now(),
                chainId,
                existingContractAddress,
                walletAddress,
                name,
                'subname::setName',
                txn,
                isOwnable ? 'Ownable' : 'ReverseClaimer',
                opType,
              )
              return txn
            } else {
              setError('Forward resolution already set')
              console.log('Forward resolution already set')
            }
          } else if (
            chain?.id == CHAINS.BASE ||
            chain?.id == CHAINS.BASE_SEPOLIA
          ) {
            if (!nameExist) {
              const txn = await writeContract(walletClient, {
                address: config.ENSCRIBE_CONTRACT as `0x${string}`,
                abi: ensRegistryABI,
                functionName: 'setSubnodeRecord',
                args: [
                  parentNode,
                  labelHash,
                  walletAddress,
                  publicResolverAddress,
                  0,
                ],
                account: walletAddress,
              })
              await logMetric(
                corelationId,
                Date.now(),
                chainId,
                existingContractAddress,
                walletAddress,
                name,
                'subname::setSubnodeRecord',
                txn,
                isOwnable ? 'Ownable' : 'ReverseClaimer',
                opType,
              )
              return txn
            }
          } else {
            const isWrapped = await readContract(walletClient, {
              address: config.NAME_WRAPPER as `0x${string}`,
              abi: nameWrapperABI,
              functionName: 'isWrapped',
              args: [parentNode],
            })
            if (!nameExist) {
              if (isWrapped) {
                const txn = await writeContract(walletClient, {
                  address: config.NAME_WRAPPER as `0x${string}`,
                  abi: nameWrapperABI,
                  functionName: 'setSubnodeRecord',
                  args: [
                    parentNode,
                    labelNormalized,
                    walletAddress,
                    publicResolverAddress,
                    0,
                    0,
                    0,
                  ],
                  account: walletAddress,
                })
                await logMetric(
                  corelationId,
                  Date.now(),
                  chainId,
                  existingContractAddress,
                  walletAddress,
                  name,
                  'subname::setSubnodeRecord',
                  txn,
                  isOwnable ? 'Ownable' : 'ReverseClaimer',
                  opType,
                )
                return txn
              } else {
                const txn = await writeContract(walletClient, {
                  address: config.ENS_REGISTRY as `0x${string}`,
                  abi: ensRegistryABI,
                  functionName: 'setSubnodeRecord',
                  args: [
                    parentNode,
                    labelHash,
                    walletAddress,
                    publicResolverAddress,
                    0,
                  ],
                  account: walletAddress,
                })
                await logMetric(
                  corelationId,
                  Date.now(),
                  chainId,
                  existingContractAddress,
                  walletAddress,
                  name,
                  'subname::setSubnodeRecord',
                  txn,
                  isOwnable ? 'Ownable' : 'ReverseClaimer',
                  opType,
                )
                return txn
              }
            }
          }
        },
      })

      // Step 2: Set Forward Resolution (if not web3labs)
      if (parentType != 'web3labs') {
        steps.push({
          title: 'Set forward resolution',
          action: async () => {
            const currentAddr = (await readContract(walletClient, {
              address: publicResolverAddress,
              abi: publicResolverABI,
              functionName: 'addr',
              args: [node],
            })) as `0x${string}`

            if (
              currentAddr.toLowerCase() !==
              existingContractAddress.toLowerCase()
            ) {
              const txn = await writeContract(walletClient, {
                address: config.PUBLIC_RESOLVER as `0x${string}`,
                abi: publicResolverABI,
                functionName: 'setAddr',
                args: [node, existingContractAddress],
                account: walletAddress,
              })
              await logMetric(
                corelationId,
                Date.now(),
                chainId,
                existingContractAddress,
                walletAddress,
                name,
                'fwdres::setAddr',
                txn,
                isOwnable ? 'Ownable' : 'ReverseClaimer',
                opType,
              )
              return txn
            } else {
              setError('Forward resolution already set')
              console.log('Forward resolution already set')
            }
          },
        })
      }

      // Step 3: Set Reverse Resolution (if Primary)
      if (isReverseClaimable) {
        setIsPrimaryNameSet(true)
        const addrLabel = existingContractAddress.slice(2).toLowerCase()
        const reversedNode = namehash(addrLabel + '.' + 'addr.reverse')
        steps.push({
          title: 'Set reverse resolution',
          action: async () => {
            const txn = await writeContract(walletClient, {
              address: publicResolverAddress,
              abi: publicResolverABI,
              functionName: 'setName',
              args: [
                reversedNode,
                `${labelNormalized}.${parentNameNormalized}`,
              ],
              account: walletAddress,
            })
            await logMetric(
              corelationId,
              Date.now(),
              chainId,
              existingContractAddress,
              walletAddress,
              name,
              'revres::setName',
              txn,
              'ReverseClaimer',
              opType,
            )
            return txn
          },
        })
      } else if (isContractOwner && isOwnable) {
        setIsPrimaryNameSet(true)
        steps.push({
          title: 'Set reverse resolution',
          action: async () => {
            const txn = await writeContract(walletClient, {
              address: config.REVERSE_REGISTRAR as `0x${string}`,
              abi: reverseRegistrarABI,
              functionName: 'setNameForAddr',
              args: [
                existingContractAddress,
                walletAddress,
                publicResolverAddress,
                `${labelNormalized}.${parentNameNormalized}`,
              ],
              account: walletAddress,
            })
            await logMetric(
              corelationId,
              Date.now(),
              chainId,
              existingContractAddress,
              walletAddress,
              name,
              'revres::setNameForAddr',
              txn,
              'Ownable',
              opType,
            )
            return txn
          },
        })
      } else {
        setIsPrimaryNameSet(false)
      }

      // Add L2 primary name steps for all selected chains
      const selectedL2Chains: Array<{ name: string; chainId: number; chain: any }> = []
      if (enableL2PrimaryName) selectedL2Chains.push({ name: 'Optimism', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.OPTIMISM : CHAINS.OPTIMISM_SEPOLIA, chain: chain?.id === CHAINS.OPTIMISM ? optimism : optimismSepolia })
      if (enableArbitrumL2) selectedL2Chains.push({ name: 'Arbitrum', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.ARBITRUM : CHAINS.ARBITRUM_SEPOLIA, chain: chain?.id === CHAINS.ARBITRUM ? arbitrum : arbitrumSepolia })
      if (enableScrollL2) selectedL2Chains.push({ name: 'Scroll', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.SCROLL : CHAINS.SCROLL_SEPOLIA, chain: chain?.id === CHAINS.SCROLL ? scroll : scrollSepolia })
      if (enableBaseL2) selectedL2Chains.push({ name: 'Base', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.BASE : CHAINS.BASE_SEPOLIA, chain: base })
      if (enableLineaL2) selectedL2Chains.push({ name: 'Linea', chainId: chain?.id === CHAINS.MAINNET ? CHAINS.LINEA : CHAINS.LINEA_SEPOLIA, chain: linea })



      // Second: Add all L2 forward resolution steps (on current chain)
      for (const l2Chain of selectedL2Chains) {
        const l2Config = CONTRACTS[l2Chain.chainId]
        
        if (l2Config && l2Config.REVERSE_REGISTRAR) {
          // Add forward resolution step for this L2 chain
          steps.push({
            title: `Set Forward Resolution on ${l2Chain.name}`,
            action: async () => {
              const txn = await writeContract(walletClient, {
                address: config.PUBLIC_RESOLVER as `0x${string}`,
                abi: publicResolverABI,
                functionName: 'setAddr',
                args: [node, 2158639068, existingContractAddress],
                account: walletAddress,
              })
              await logMetric(
                corelationId,
                Date.now(),
                chainId,
                existingContractAddress,
                walletAddress,
                name,
                'fwdres::setAddr',
                txn,
                isOwnable ? 'Ownable' : 'ReverseClaimer',
                opType,
              )
              return txn
            },
          })
        } else {
          console.error(`${l2Chain.name} configuration missing:`, {
            hasConfig: !!l2Config,
            hasReverseRegistrar: !!l2Config?.REVERSE_REGISTRAR,
            config: l2Config
          })
        }
      }

      // Then: Add L2 primary naming steps (switch to each chain, check balance, then proceed)
      for (const l2Chain of selectedL2Chains) {
        const l2Config = CONTRACTS[l2Chain.chainId]
        
        if (l2Config && l2Config.REVERSE_REGISTRAR) {
          // Add reverse resolution step for this L2 chain
          steps.push({
            title: `Switch to ${l2Chain.name} and set L2 primary name`,
            action: async () => {
              console.log(`Starting ${l2Chain.name} L2 primary name step...`)
              
              console.log(`Switching to ${l2Chain.name} (chain ID: ${l2Chain.chainId})...`)
              
              // Switch to L2 chain
              await switchChain({ chainId: l2Chain.chainId })
              
              // Wait a moment for the chain switch to complete
              console.log('Waiting for chain switch to complete...')
              await new Promise(resolve => setTimeout(resolve, 3000))
              
              // Wait for the chain to actually change
              console.log('Waiting for chain to actually change...')
              let attempts = 0
              while (attempts < 10) {
                const currentChain = await walletClient.getChainId()
                console.log(`Current chain ID: ${currentChain}, Target: ${l2Chain.chainId}`)
                if (currentChain === l2Chain.chainId) {
                  console.log('Chain switch confirmed!')
                  break
                }
                await new Promise(resolve => setTimeout(resolve, 1000))
                attempts++
              }
              
              if (attempts >= 10) {
                throw new Error(`Chain switch timeout - chain did not change to ${l2Chain.name}`)
              }
              
              // Now execute the reverse resolution transaction on L2
              console.log(`Executing reverse resolution on ${l2Chain.name}...`)
              console.log('Reverse Registrar:', l2Config.REVERSE_REGISTRAR)
              console.log('Contract Address:', existingContractAddress)
              console.log('ENS Name:', `${labelNormalized}.${parentNameNormalized}`)
              
              // Perform reverse resolution on L2
              const txn = await writeContract(walletClient, {
                address: l2Config.REVERSE_REGISTRAR as `0x${string}`,
                abi: [
                  {
                    inputs: [
                      {
                        internalType: 'address',
                        name: 'addr',
                        type: 'address'
                      },
                      {
                        internalType: 'string',
                        name: 'name',
                        type: 'string'
                      }
                    ],
                    name: 'setNameForAddr',
                    outputs: [],
                    stateMutability: 'nonpayable',
                    type: 'function'
                  }
                ],
                functionName: 'setNameForAddr',
                args: [
                  existingContractAddress as `0x${string}`,
                  `${labelNormalized}.${parentNameNormalized}`,
                ],
                account: walletAddress,
                chain: l2Chain.chain
              })
              
              console.log(`${l2Chain.name} transaction submitted:`, txn)
              
              // Log the L2 transaction
              await logMetric(
                `${l2Chain.name.toLowerCase()}-l2-primary`, // correlationId
                Date.now(),
                l2Chain.chainId,
                existingContractAddress,
                walletAddress,
                `${labelNormalized}.${parentNameNormalized}`,
                'revres::setNameForAddr',
                txn,
                'L2Primary',
                opType
              )
              
              return txn
            },
          })
        } else {
          console.error(`${l2Chain.name} configuration missing:`, {
            hasConfig: !!l2Config,
            hasReverseRegistrar: !!l2Config?.REVERSE_REGISTRAR,
            config: l2Config
          })
        }
      }

      setModalTitle(
        (isContractOwner && isOwnable) || isReverseClaimable
          ? 'Set Primary Name'
          : 'Set Forward Resolution',
      )
      setModalSubtitle('Running each step to finish naming this contract')
      setModalSteps(steps)
      setModalOpen(true)
    } catch (err: any) {
      console.error(err)
      setError(err?.code || 'Error naming exisiting contract')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl p-8 border border-gray-200 dark:border-gray-700">
      <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
        Name Existing Contract
      </h2>
      {!isConnected && (
        <p className="text-red-500">Please connect your wallet.</p>
      )}

      <div className="space-y-6 mt-6">
        <label className="block text-gray-700 dark:text-gray-300">
          Contract Address
        </label>
        <Input
          required={true}
          type="text"
          value={existingContractAddress}
          onChange={async (e) => {
            setExistingContractAddress(e.target.value)
            await checkIfContractOwner(e.target.value)
            await checkIfOwnable(e.target.value)
            await checkIfReverseClaimable(e.target.value)
          }}
          // onBlur={ checkIfOwnable}
          placeholder="0xa56..."
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200}`}
        />

        {/* Error message for invalid Ownable/ReverseClaimable bytecode */}
        {!isAddressEmpty &&
          !isAddressInvalid &&
          !isOwnable &&
          !isReverseClaimable && (
            <p className="text-yellow-600">
              Contract address does not extend{' '}
              <Link
                href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                className="text-blue-600 hover:underline"
              >
                Ownable
              </Link>{' '}
              or{' '}
              <Link
                href="https://eips.ethereum.org/EIPS/eip-173"
                className="text-blue-600 hover:underline"
              >
                ERC-173
              </Link>{' '}
              or{' '}
              <Link
                href="https://docs.ens.domains/web/naming-contracts#reverseclaimersol"
                className="text-blue-600 hover:underline"
              >
                ReverseClaimable
              </Link>
              . You can only{' '}
              <Link
                href="https://docs.ens.domains/learn/resolution#forward-resolution"
                className="text-blue-600 hover:underline"
              >
                forward resolve
              </Link>{' '}
              this name.{' '}
              <Link
                href="https://www.enscribe.xyz/docs/"
                className="text-blue-600 hover:underline"
              >
                Why is this?
              </Link>
            </p>
          )}
        {((!isAddressEmpty && !isContractOwner) ||
          isOwnable ||
          (isReverseClaimable && !isOwnable)) && (
          <div className="flex flex-col space-y-1">
            {!isAddressEmpty && !isContractOwner && isOwnable && (
              <div className="flex items-center">
                <XCircleIcon className="w-5 h-5 inline text-red-500 cursor-pointer" />
                <p className="text-gray-600 inline ml-1">
                  You are not the contract owner and cannot set its primary name
                </p>
              </div>
            )}
            {(isOwnable || (isReverseClaimable && !isOwnable)) && (
              <div className="justify-between">
                {isOwnable && (
                  <>
                    <CheckCircleIcon className="w-5 h-5 inline text-green-500 cursor-pointer" />
                    <p className="text-gray-700 inline ml-1">
                      Contract implements{' '}
                      <Link
                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                        className="text-blue-600 hover:underline"
                      >
                        Ownable
                      </Link>
                    </p>
                  </>
                )}
                {isReverseClaimable && !isOwnable && (
                  <>
                    <CheckCircleIcon className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer" />
                    <p className="text-gray-700 inline">
                      Contract is{' '}
                      <Link
                        href="https://docs.ens.domains/web/naming-contracts#reverseclaimersol"
                        className="text-blue-600 hover:underline"
                      >
                        ReverseClaimable
                      </Link>
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <label className="block text-gray-700 dark:text-gray-300">
          Contract Name
        </label>
        <div className={'flex items-center space-x-2'}>
          <Input
            type="text"
            required
            value={label}
            onChange={(e) => {
              setLabel(e.target.value)
              setError('')
            }}
            onBlur={checkENSReverseResolution}
            placeholder="label"
            className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
          />
          <Button
            onClick={populateName}
            className="relative overflow-hidden bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white hover:shadow-xl hover:shadow-pink-500/50 focus:ring-4 focus:ring-pink-500/50 group transition-all duration-300 hover:-translate-y-1 p-2.5 font-medium"
          >
            <span className="relative z-10 p-2">✨Generate Name</span>
            {/* Glow effect on hover */}
            <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-purple-600/0 via-white/70 to-purple-600/0 opacity-0 group-hover:opacity-100 group-hover:animate-shine pointer-events-none blur-sm"></span>
            {/* Outer glow */}
            <span className="absolute -inset-1 rounded-md bg-gradient-to-r from-purple-600 via-pink-500 to-red-500 opacity-0 group-hover:opacity-70 group-hover:blur-md transition-all duration-300 pointer-events-none"></span>
          </Button>
        </div>

        <label className="block text-gray-700 dark:text-gray-300">
          ENS Parent
        </label>
        <Select
          value={parentType}
          onValueChange={(e) => {
            const selected = e as 'web3labs' | 'own'
            setParentType(selected)
            if (selected === 'web3labs') {
              setParentName(enscribeDomain)
            } else {
              setParentName('')
              setShowENSModal(true)
              fetchUserOwnedDomains()
            }
          }}
        >
          <SelectTrigger className="bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
            <SelectValue className="text-gray-900" />
          </SelectTrigger>
          <SelectContent className="bg-white text-gray-900 border border-gray-300 rounded-md">
            <SelectItem value="web3labs">{enscribeDomain}</SelectItem>
            <SelectItem value="own">Your ENS Parent</SelectItem>
          </SelectContent>
        </Select>
        {parentType === 'own' && (
          <>
            <label className="block text-gray-700 dark:text-gray-300">
              Parent Name
            </label>
            {fetchingENS ? (
              <p className="text-gray-500 dark:text-gray-400">
                Fetching ENS domains...
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={parentName}
                  onChange={(e) => {
                    setParentName(e.target.value)
                    setRecordExists(false)
                  }}
                  onBlur={async () => {
                    const exist = await recordExist()
                    setRecordExists(exist)
                  }}
                  placeholder="mydomain.eth"
                  className="flex-1 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                />
                <Button
                  onClick={() => {
                    setParentName('')
                    setShowENSModal(true)
                  }}
                  className="bg-gray-900 text-white"
                >
                  Choose ENS
                </Button>
              </div>
            )}
          </>
        )}

        {/* Full ENS Name Preview */}
        {!isEmpty(label) && !isEmpty(parentName) && (
          <div className="mt-4 mb-4">
            <label className="block text-gray-700 dark:text-gray-300 mb-5">
              Full ENS Name
            </label>
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-2 flex items-center">
              <div className="flex-1 font-medium text-blue-800 dark:text-blue-300 text-sm break-all">
                {`${label}.${parentName}`}
              </div>
            </div>
          </div>
        )}

        {/* L2 Primary Name Options - Only show on mainnet or sepolia */}
        {(chain?.id === CHAINS.MAINNET || chain?.id === CHAINS.SEPOLIA) && (
          <div className="mt-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Set L2 Primary Names
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Select which L2 chains to set primary names on. This will add additional steps to switch to each selected chain and set the primary name there as well.
            </p>
            
            <div className="space-y-2">
              {/* Optimism */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="optimism-l2"
                  checked={enableL2PrimaryName}
                  onCheckedChange={(checked) => setEnableL2PrimaryName(checked as boolean)}
                  className="border-gray-300 dark:border-gray-600"
                />
                <label
                  htmlFor="optimism-l2"
                  className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  Optimism
                </label>
              </div>

              {/* Arbitrum */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="arbitrum-l2"
                  checked={enableArbitrumL2}
                  onCheckedChange={(checked) => setEnableArbitrumL2(checked as boolean)}
                  className="border-gray-300 dark:border-gray-600"
                />
                <label
                  htmlFor="arbitrum-l2"
                  className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  Arbitrum
                </label>
              </div>

              {/* Scroll */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="scroll-l2"
                  checked={enableScrollL2}
                  onCheckedChange={(checked) => setEnableScrollL2(checked as boolean)}
                  className="border-gray-300 dark:border-gray-600"
                />
                <label
                  htmlFor="scroll-l2"
                  className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  Scroll
                </label>
              </div>

              {/* Base */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="base-l2"
                  checked={enableBaseL2}
                  onCheckedChange={(checked) => setEnableBaseL2(checked as boolean)}
                  className="border-gray-300 dark:border-gray-600"
                />
                <label
                  htmlFor="base-l2"
                  className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  Base
                </label>
              </div>

              {/* Linea */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="linea-l2"
                  checked={enableLineaL2}
                  onCheckedChange={(checked) => setEnableLineaL2(checked as boolean)}
                  className="border-gray-300 dark:border-gray-600"
                />
                <label
                  htmlFor="linea-l2"
                  className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  Linea
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add ENS Selection Modal */}
      <Dialog open={showENSModal} onOpenChange={setShowENSModal}>
        <DialogContent className="max-w-3xl bg-white dark:bg-gray-900 shadow-lg rounded-lg">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
              Choose Your ENS Parent
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Choose one of your owned ENS domains or enter manually.
            </DialogDescription>
          </DialogHeader>

          {fetchingENS ? (
            <div className="flex justify-center items-center p-6">
              <svg
                className="animate-spin h-5 w-5 mr-3 text-indigo-600 dark:text-indigo-400"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                ></path>
              </svg>
              <p className="text-gray-700 dark:text-gray-300">
                Fetching your ENS domains...
              </p>
            </div>
          ) : (
            <div className="space-y-4 px-1">
              {userOwnedDomains.length > 0 ? (
                <div className="max-h-[50vh] overflow-y-auto pr-1">
                  {(() => {
                    // Function to get the 2LD for a domain
                    const get2LD = (domain: string): string => {
                      const parts = domain.split('.')
                      if (parts.length < 2) return domain
                      return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
                    }

                    // Separate domains with labelhashes
                    const domainsWithLabelhash = userOwnedDomains.filter(
                      (domain) => domain.includes('[') && domain.includes(']'),
                    )
                    const regularDomains = userOwnedDomains.filter(
                      (domain) =>
                        !(domain.includes('[') && domain.includes(']')),
                    )

                    // Group regular domains by 2LD
                    const domainGroups: { [key: string]: string[] } = {}

                    regularDomains.forEach((domain) => {
                      const parent2LD = get2LD(domain)
                      if (!domainGroups[parent2LD]) {
                        domainGroups[parent2LD] = []
                      }
                      domainGroups[parent2LD].push(domain)
                    })

                    // Sort 2LDs alphabetically
                    const sorted2LDs = Object.keys(domainGroups).sort()

                    return (
                      <div className="space-y-4">
                        {/* Regular domains grouped by 2LD */}
                        {sorted2LDs.map((parent2LD) => (
                          <div
                            key={parent2LD}
                            className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-0"
                          >
                            <div className="flex flex-wrap gap-2">
                              {domainGroups[parent2LD].map((domain, index) => (
                                <div
                                  key={domain}
                                  className={`px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer transition-colors inline-flex items-center ${index === 0 ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800' : 'bg-white dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                                  onClick={() => {
                                    setParentName(domain)
                                    setShowENSModal(false)
                                  }}
                                >
                                  <span className="text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">
                                    {domain}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* Domains with labelhashes at the end */}
                        {domainsWithLabelhash.length > 0 && (
                          <div className="pt-2">
                            <div className="flex flex-wrap gap-2">
                              {domainsWithLabelhash.map((domain) => (
                                <div
                                  key={domain}
                                  className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors inline-flex items-center"
                                  onClick={() => {
                                    setParentName(domain)
                                    setShowENSModal(false)
                                  }}
                                >
                                  <span className="text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">
                                    {domain}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-md">
                  <p className="text-gray-500 dark:text-gray-400">
                    No ENS domains found for your address.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setParentName('')
                    setShowENSModal(false)
                  }}
                  className="hover:bg-gray-200 text-black"
                >
                  Enter manually
                </Button>
                <Button
                  onClick={() => {
                    setShowENSModal(false)
                  }}
                  className="bg-gray-900 hover:bg-gray-800 text-white"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex gap-4 mt-6">
        <Button
          onClick={() => setPrimaryName()}
          disabled={
            !isConnected ||
            loading ||
            isAddressEmpty ||
            isAddressInvalid ||
            isEmpty(label)
          }
          className="relative overflow-hidden w-full py-6 text-lg font-medium transition-all duration-300 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 focus:ring-4 focus:ring-blue-500/30 group"
          style={{
            backgroundSize: '200% 100%',
          }}
        >
          {/* Background animation elements */}
          <span className="absolute top-0 left-0 w-full h-full bg-white/10 transform -skew-x-12 group-hover:animate-shimmer pointer-events-none"></span>
          <span className="absolute bottom-0 right-0 w-12 h-12 bg-white/20 rounded-full blur-xl group-hover:animate-pulse pointer-events-none"></span>

          {loading ? (
            <div className="flex items-center justify-center relative z-10">
              <svg
                className="animate-spin h-6 w-6 mr-3 text-white"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                ></path>
              </svg>
              <span className="animate-pulse">Processing...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center relative z-10">
              <span className="group-hover:scale-105 transition-transform duration-300 dark:text-white">
                Name Your Contract
              </span>
              <span className="ml-2 inline-block animate-rocket">🚀</span>
            </div>
          )}

          {/* Edge glow effect – only on hover */}
          <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-blue-500/0 via-blue-500/40 to-blue-500/0 opacity-0 group-hover:opacity-100 group-hover:animate-shine pointer-events-none"></span>
        </Button>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 dark:bg-red-900 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm rounded-md p-3 break-words max-w-full overflow-hidden">
          <strong>Error:</strong> {error}
        </div>
      )}

      <SetNameStepsModal
        open={modalOpen}
        onClose={(result) => {
          setModalOpen(false)
          if (result?.startsWith('ERROR')) {
            setError(result)
            return
          }

          if (result === 'INCOMPLETE') {
            setError(
              'Steps not completed. Please complete all steps before closing.',
            )
          } else {
            setDeployedAddress(existingContractAddress)
            // Reset form after successful naming
            setExistingContractAddress('')
            setLabel('')
            setError('')
            setParentType('web3labs')
            setParentName(enscribeDomain)
            setIsPrimaryNameSet(false)
            setEnableL2PrimaryName(false)
          }
        }}
        title={modalTitle}
        subtitle={modalSubtitle}
        steps={modalSteps}
        contractAddress={existingContractAddress}
        ensName={`${label}.${parentName}`}
        isPrimaryNameSet={isPrimaryNameSet}
      />
    </div>
  )
}
