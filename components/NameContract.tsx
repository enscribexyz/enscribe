import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import contractABI from '../contracts/Enscribe'
import ensRegistryABI from '../contracts/ENSRegistry'
import nameWrapperABI from '../contracts/NameWrapper'
import publicResolverABI from '../contracts/PublicResolver'
import reverseRegistrarABI from '@/contracts/ReverseRegistrar'
import { useAccount, useWalletClient, useSwitchChain, useBalance } from 'wagmi'
import {
  optimism,
  optimismSepolia,
  arbitrum,
  arbitrumSepolia,
  scroll,
  scrollSepolia,
  base,
  baseSepolia,
  linea,
  lineaSepolia,
} from 'wagmi/chains'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { CONTRACTS, CHAINS } from '../utils/constants'
import Link from 'next/link'
import Image from 'next/image'
import SetNameStepsModal, { Step } from './SetNameStepsModal'
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { Checkbox } from '@/components/ui/checkbox'
import { v4 as uuid } from 'uuid'
import {
  fetchGeneratedName,
  logMetric,
  checkIfSafe,
} from '@/components/componentUtils'
import {
  getEnsAddress,
  readContract,
  writeContract,
  getBytecode,
} from 'viem/actions'
import { namehash, normalize } from 'viem/ens'
import { isAddress, keccak256, toBytes, toHex, getAddress } from 'viem'
import { createPublicClient, http } from 'viem'
import enscribeContractABI from '../contracts/Enscribe'
import ownableContractABI from '@/contracts/Ownable'

export default function NameContract() {
  const router = useRouter()
  const { address: walletAddress, isConnected, chain } = useAccount()
  const { connector } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { switchChain } = useSwitchChain()

  const config = chain?.id ? CONTRACTS[chain.id] : undefined
  const enscribeDomain = config?.ENSCRIBE_DOMAIN!

  const { toast } = useToast()

  const [existingContractAddress, setExistingContractAddress] = useState('')
  const [label, setLabel] = useState('')
  const [parentType, setParentType] = useState<'web3labs' | 'own' | 'register'>(
    'web3labs',
  )
  const [showRegisterDialog, setShowRegisterDialog] = useState(false)
  const [parentName, setParentName] = useState(enscribeDomain)
  const [fetchingENS, setFetchingENS] = useState(false)
  const [userOwnedDomains, setUserOwnedDomains] = useState<string[]>([])
  const [showENSModal, setShowENSModal] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isAddressEmpty, setIsAddressEmpty] = useState(true)
  const [isAddressInvalid, setIsAddressInvalid] = useState(true)
  const [isContractExists, setIsContractExists] = useState<boolean | null>(null)
  const [isOwnable, setIsOwnable] = useState<boolean | null>(false)
  const [isContractOwner, setIsContractOwner] = useState<boolean | null>(false)
  const [isReverseClaimable, setIsReverseClaimable] = useState<boolean | null>(
    false,
  )
  const [isPrimaryNameSet, setIsPrimaryNameSet] = useState(false)

  // L2 Ownable state variables
  const [isOwnableOptimism, setIsOwnableOptimism] = useState<boolean | null>(
    null,
  )
  const [isOwnableArbitrum, setIsOwnableArbitrum] = useState<boolean | null>(
    null,
  )
  const [isOwnableScroll, setIsOwnableScroll] = useState<boolean | null>(null)
  const [isOwnableBase, setIsOwnableBase] = useState<boolean | null>(null)
  const [isOwnableLinea, setIsOwnableLinea] = useState<boolean | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalSteps, setModalSteps] = useState<Step[]>([])
  const [modalTitle, setModalTitle] = useState('')
  const [modalSubtitle, setModalSubtitle] = useState('')
  const [selectedL2ChainNames, setSelectedL2ChainNames] = useState<string[]>([])
  const [dropdownValue, setDropdownValue] = useState<string>('')
  const [skipL1Naming, setSkipL1Naming] = useState<boolean>(false)
  const [showL2Modal, setShowL2Modal] = useState<boolean>(false)
  const [isSafeWallet, setIsSafeWallet] = useState(false)
  const [sldAsPrimary, setSldAsPrimary] = useState<boolean>(true)
  const [ensModalFromPicker, setEnsModalFromPicker] = useState<boolean>(false)
  const [ensNameChosen, setEnsNameChosen] = useState<boolean>(false)
  const [selectedAction, setSelectedAction] = useState<
    'subname' | 'pick' | null
  >(null)

  const corelationId = uuid()
  const opType = 'nameexisting'
  const L2_CHAIN_OPTIONS = ['Optimism', 'Arbitrum', 'Scroll', 'Base', 'Linea']

  // Unsupported L2 gating for this page: Optimism/Arbitrum/Scroll L2s should show guidance
  const isUnsupportedL2Chain = [
    CHAINS.OPTIMISM,
    CHAINS.OPTIMISM_SEPOLIA,
    CHAINS.ARBITRUM,
    CHAINS.ARBITRUM_SEPOLIA,
    CHAINS.SCROLL,
    CHAINS.SCROLL_SEPOLIA,
  ].includes((chain?.id as number) || -1)

  const unsupportedL2Name =
    chain?.id === CHAINS.OPTIMISM
      ? 'Optimism'
      : chain?.id === CHAINS.OPTIMISM_SEPOLIA
        ? 'Optimism Sepolia'
        : chain?.id === CHAINS.ARBITRUM
          ? 'Arbitrum'
          : chain?.id === CHAINS.ARBITRUM_SEPOLIA
            ? 'Arbitrum Sepolia'
            : chain?.id === CHAINS.SCROLL
              ? 'Scroll'
              : chain?.id === CHAINS.SCROLL_SEPOLIA
                ? 'Scroll Sepolia'
                : ''

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
    setExistingContractAddress('')
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
    setIsContractExists(null)
    setSelectedL2ChainNames([])
    setDropdownValue('')
    setSkipL1Naming(false)

    // Reset L2 ownable states
    setIsOwnableOptimism(null)
    setIsOwnableArbitrum(null)
    setIsOwnableScroll(null)
    setIsOwnableBase(null)
    setIsOwnableLinea(null)
  }, [chain?.id, isConnected, modalOpen])

  useEffect(() => {
    // If user has selected all L2 chains, clear the dropdown value and effectively hide the dropdown
    const allSelected = L2_CHAIN_OPTIONS.every((c) =>
      selectedL2ChainNames.includes(c),
    )
    if (allSelected && dropdownValue !== '') {
      setDropdownValue('')
    }
    if (selectedL2ChainNames.length === 0 && skipL1Naming) {
      setSkipL1Naming(false)
    }
  }, [selectedL2ChainNames])

  useEffect(() => {
    const initFromQuery = async () => {
      if (
        router.query.contract &&
        isAddress(router.query.contract as string) &&
        walletClient
      ) {
        console.log(`wallet name: ${walletClient.name}`)
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

  const checkIfSafeWallet = async (): Promise<boolean> => {
    return await checkIfSafe(connector)
  }

  // Validate ENS name format (for "Use Existing Name" flow)
  const validateFullENSName = (name: string): string | null => {
    if (!name.includes('.')) {
      return 'Please enter a full ENS name (e.g., "myawesomeapp.mydomain.eth")'
    }
    
    const parts = name.split('.')
    if (parts.length < 2 || parts[parts.length - 1].trim() === '') {
      return 'Invalid ENS name format'
    }
    
    return null
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
    // Only require parentName for "Create New Name" flow
    console.log(
      'checkENSReverseResolution - selectedAction:',
      selectedAction,
      'parentName:',
      parentName,
    )
    
    // In "use existing name" flow, validate that the name contains dots (full ENS name)
    if (selectedAction === 'pick') {
      const validationError = validateFullENSName(label)
      if (validationError) {
        setError(validationError)
        return
      }
    }
    
    if (selectedAction !== 'pick' && !parentName.trim()) {
      setError('Parent name cannot be empty')
      return
    }
    // In "use existing name" flow, allow dots in label (full name is allowed)
    if (selectedAction !== 'pick' && label.includes('.')) {
      setError("Can't include '.' in label name")
      return
    }

    // try {
    //   const fullEnsName = `${label}.${parentName}`
    //   let resolvedAddress = await getEnsAddress(walletClient, {
    //     name: normalize(fullEnsName),
    //   })

    //   if (resolvedAddress) {
    //     setError('ENS name already used, please change label')
    //   } else {
    //     setError('')
    //   }
    // } catch (err) {
    //   console.error('Error checking ENS name:', err)
    // }
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

  const checkIfContractExists = async (address: string) => {
    if (
      checkIfAddressEmpty(address) ||
      !isAddressValid(address) ||
      !walletClient
    ) {
      setIsContractExists(null)
      return
    }

    try {
      // Try to get the contract code to check if it exists
      const code = await getBytecode(walletClient, {
        address: address as `0x${string}`,
      })

      if (code && code !== '0x') {
        console.log('Contract exists on L1')
        setIsContractExists(true)
      } else {
        console.log('Contract does not exist on L1')
        setIsContractExists(false)
      }
    } catch (err) {
      console.log('Error checking contract existence:', err)
      setIsContractExists(false)
    }
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

  const checkIfOwnableOnL2Chains = async (address: string) => {
    if (
      checkIfAddressEmpty(address) ||
      !isAddressValid(address) ||
      !walletClient
    ) {
      // Reset all L2 ownable states
      setIsOwnableOptimism(null)
      setIsOwnableArbitrum(null)
      setIsOwnableScroll(null)
      setIsOwnableBase(null)
      setIsOwnableLinea(null)
      return
    }

    // Only check L2 ownable if we're on L1 chains (mainnet or sepolia)
    if (chain?.id !== CHAINS.MAINNET && chain?.id !== CHAINS.SEPOLIA) {
      console.log('Not on L1 chain, skipping L2 ownable checks')
      // Reset all L2 ownable states
      setIsOwnableOptimism(null)
      setIsOwnableArbitrum(null)
      setIsOwnableScroll(null)
      setIsOwnableBase(null)
      setIsOwnableLinea(null)
      return
    }

    // Determine if we're on L1 mainnet or sepolia to check appropriate L2 networks
    const isL1Mainnet = chain?.id === CHAINS.MAINNET

    // Check ownable on each L2 chain in parallel (mainnet or testnet based on current L1)
    const l2Chains = [
      {
        name: 'Optimism',
        chainId: isL1Mainnet ? CHAINS.OPTIMISM : CHAINS.OPTIMISM_SEPOLIA,
        setter: setIsOwnableOptimism,
      },
      {
        name: 'Arbitrum',
        chainId: isL1Mainnet ? CHAINS.ARBITRUM : CHAINS.ARBITRUM_SEPOLIA,
        setter: setIsOwnableArbitrum,
      },
      {
        name: 'Scroll',
        chainId: isL1Mainnet ? CHAINS.SCROLL : CHAINS.SCROLL_SEPOLIA,
        setter: setIsOwnableScroll,
      },
      {
        name: 'Base',
        chainId: isL1Mainnet ? CHAINS.BASE : CHAINS.BASE_SEPOLIA,
        setter: setIsOwnableBase,
      },
      {
        name: 'Linea',
        chainId: isL1Mainnet ? CHAINS.LINEA : CHAINS.LINEA_SEPOLIA,
        setter: setIsOwnableLinea,
      },
    ]

    console.log(
      `Checking ownable status on all L2 ${isL1Mainnet ? 'mainnet' : 'testnet'} chains in parallel...`,
    )
    console.log(
      'L2 chains to check:',
      l2Chains.map((c) => `${c.name} (${c.chainId})`),
    )

    type OwnableResult = { name: string; isOwnable: boolean; error?: string }

    const results: OwnableResult[] = await Promise.all(
      l2Chains.map(async (l2Chain) => {
        try {
          const l2Config = CONTRACTS[l2Chain.chainId]
          if (!l2Config?.RPC_ENDPOINT) {
            return {
              name: l2Chain.name,
              isOwnable: false,
              error: `No RPC endpoint configured for ${l2Chain.name}`,
            }
          }

          // Create a custom client for this L2 chain
          const l2Client = createPublicClient({
            transport: http(l2Config.RPC_ENDPOINT),
            chain: {
              id: l2Chain.chainId,
              name: l2Chain.name,
              network: l2Chain.name.toLowerCase(),
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: { default: { http: [l2Config.RPC_ENDPOINT] } },
            },
          })

          const ownerAddress = (await readContract(l2Client, {
            address: address as `0x${string}`,
            abi: ownableContractABI,
            functionName: 'owner',
            args: [],
          })) as `0x${string}`

          console.log(`${l2Chain.name} contract ownable`)
          return { name: l2Chain.name, isOwnable: true }
        } catch (err) {
          console.log(`${l2Chain.name} contract not ownable: ${err}`)
          return { name: l2Chain.name, isOwnable: false }
        }
      }),
    )

    // Update state based on results
    results.forEach((result) => {
      const l2Chain = l2Chains.find((chain) => chain.name === result.name)
      if (l2Chain) {
        l2Chain.setter(result.isOwnable)
      }
    })

    console.log('L2 ownable checks completed:', results)
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

    // In "use existing name" flow, validate that the name contains dots (full ENS name)
    if (selectedAction === 'pick') {
      const validationError = validateFullENSName(label)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    // Force clear error for "Use Existing Name" flow
    if (selectedAction === 'pick') {
      console.log(
        'setPrimaryName - Use Existing Name flow detected, clearing any existing errors',
      )
      setError('')
    }

    if (isUnsupportedL2Chain) {
      setError(
        `To name your contract on ${unsupportedL2Name}, change to the ${chain?.id === CHAINS.OPTIMISM || chain?.id === CHAINS.ARBITRUM || chain?.id === CHAINS.SCROLL ? 'Ethereum Mainnet' : 'Sepolia'} network and use the Naming on L2 Chains option.`,
      )
      return
    }

    if (!isAddressValid(existingContractAddress)) {
      setIsOwnable(false)
      return
    }

    await checkIfOwnable(existingContractAddress)
    await checkIfOwnableOnL2Chains(existingContractAddress)
    await checkIfReverseClaimable(existingContractAddress)

    if (!label.trim()) {
      setError('Label cannot be empty')
      return
    }

    // In "use existing name" flow, allow dots in label (full name is allowed)
    if (selectedAction !== 'pick' && label.includes('.')) {
      setError("Can't include '.' in label name")
      return
    }

    // Only require parentName for "Create New Name" flow
    console.log(
      'setPrimaryName - selectedAction:',
      selectedAction,
      'parentName:',
      parentName,
    )
    console.log(
      'setPrimaryName - selectedAction !== "pick":',
      selectedAction !== 'pick',
    )
    console.log('setPrimaryName - !parentName.trim():', !parentName.trim())
    console.log(
      'setPrimaryName - condition result:',
      selectedAction !== 'pick' && !parentName.trim(),
    )
    if (selectedAction !== 'pick' && !parentName.trim()) {
      console.log('setPrimaryName - Setting error: Parent name cannot be empty')
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

      if (!walletClient) {
        alert('Please connect your wallet first.')
        setLoading(false)
        return
      }

      // Compute label/parent from inputs; in SLD mode the label contains the full name
      let labelNormalized: string
      let parentNameNormalized: string
      let name: string

      if (selectedAction === 'pick') {
        // Use Existing Name flow: label contains the full ENS name
        labelNormalized = normalize(label)
        parentNameNormalized = '' // Not used in this flow
        // Remove any trailing dots before normalizing
        const cleanedLabel = label.replace(/\.$/, '')
        name = normalize(cleanedLabel)
        console.log(
          'Use Existing Name flow - label:',
          label,
          'cleanedLabel:',
          cleanedLabel,
          'labelNormalized:',
          labelNormalized,
          'name:',
          name,
        )
      } else {
        // Create New Name flow: construct from label and parent
        labelNormalized = normalize(label)
        parentNameNormalized = normalize(parentName)
        // Remove any trailing dots before constructing the name
        const constructedName =
          `${labelNormalized}.${parentNameNormalized}`.replace(/\.$/, '')
        name = normalize(constructedName)
        console.log(
          'Create New Name flow - label:',
          label,
          'parentName:',
          parentName,
          'labelNormalized:',
          labelNormalized,
          'parentNameNormalized:',
          parentNameNormalized,
          'constructedName:',
          constructedName,
          'name:',
          name,
        )
      }
      const chainId = chain?.id!

      // Skip subname creation only when not in Create New Name flow
      const skipSubnameCreation = selectedAction !== 'subname'

      const parentNode =
        selectedAction === 'pick'
          ? getParentNode(name)
          : getParentNode(parentNameNormalized)
      // When a name is selected from dialog, use the full name directly
      const node = skipSubnameCreation
        ? namehash(label) // Use the full selected name
        : namehash(name) // Use the constructed name
      const labelHash =
        selectedAction === 'pick'
          ? keccak256(toBytes(name.split('.')[0])) // Extract label part from full name
          : keccak256(toBytes(labelNormalized))

      const nameExist = (await readContract(walletClient, {
        address: config.ENS_REGISTRY as `0x${string}`,
        abi: ensRegistryABI,
        functionName: 'recordExists',
        args: [node],
      })) as boolean

      // Internal balance check for all selected L2 chains before creating any steps
      const l2ChainsForBalanceCheck: Array<{
        name: string
        chainId: number
        chain: any
      }> = []

      // Map selected chain names to their configurations
      const isL1Mainnet = chain?.id === CHAINS.MAINNET
      const chainConfigs = {
        Optimism: {
          chainId: isL1Mainnet ? CHAINS.OPTIMISM : CHAINS.OPTIMISM_SEPOLIA,
          chain: isL1Mainnet ? optimism : optimismSepolia,
        },
        Arbitrum: {
          chainId: isL1Mainnet ? CHAINS.ARBITRUM : CHAINS.ARBITRUM_SEPOLIA,
          chain: isL1Mainnet ? arbitrum : arbitrumSepolia,
        },
        Scroll: {
          chainId: isL1Mainnet ? CHAINS.SCROLL : CHAINS.SCROLL_SEPOLIA,
          chain: isL1Mainnet ? scroll : scrollSepolia,
        },
        Base: {
          chainId: isL1Mainnet ? CHAINS.BASE : CHAINS.BASE_SEPOLIA,
          chain: isL1Mainnet ? base : baseSepolia,
        },
        Linea: {
          chainId: isL1Mainnet ? CHAINS.LINEA : CHAINS.LINEA_SEPOLIA,
          chain: isL1Mainnet ? linea : lineaSepolia,
        },
      }

      // Add selected chains to balance check
      for (const selectedChain of selectedL2ChainNames) {
        const config = chainConfigs[selectedChain as keyof typeof chainConfigs]
        if (config) {
          l2ChainsForBalanceCheck.push({
            name: selectedChain,
            chainId: config.chainId,
            chain: config.chain,
          })
        }
      }

      // Check balances on all selected L2 chains using RPC calls (in parallel)
      if (l2ChainsForBalanceCheck.length > 0) {
        console.log('Checking balances on all selected L2 chains...')

        type BalanceResult = { name: string; balance?: bigint; error?: string }

        const results: BalanceResult[] = await Promise.all(
          l2ChainsForBalanceCheck.map(async (l2Chain) => {
            try {
              const l2Config = CONTRACTS[l2Chain.chainId]
              if (!l2Config?.RPC_ENDPOINT) {
                return {
                  name: l2Chain.name,
                  error: `No RPC endpoint configured for ${l2Chain.name}`,
                }
              }

              const response = await fetch(l2Config.RPC_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  method: 'eth_getBalance',
                  params: [walletAddress, 'latest'],
                  id: l2Chain.chainId,
                }),
              })

              const data = await response.json()

              if (data?.error) {
                return {
                  name: l2Chain.name,
                  error: `Failed to get balance on ${l2Chain.name}: ${data.error.message}`,
                }
              }

              const balance = BigInt(data.result)
              console.log(`Balance on ${l2Chain.name}: ${balance} wei`)
              return { name: l2Chain.name, balance }
            } catch (e: any) {
              return {
                name: l2Chain.name,
                error: `Failed to get balance on ${l2Chain.name}: ${e?.message || String(e)}`,
              }
            }
          }),
        )

        const insufficientBalanceChains = results
          .filter((r) => !r.error && r.balance === 0n)
          .map((r) => ({ name: r.name, balance: 0n as bigint }))

        const failures = results.filter((r) => r.error) as Array<{
          name: string
          error: string
        }>

        if (failures.length > 0) {
          const msg = failures.map((f) => `${f.name}: ${f.error}`).join(' | ')
          setError(`Balance check failed for some chains: ${msg}`)
          setLoading(false)
          return
        }

        if (insufficientBalanceChains.length > 0) {
          const chainDetails = insufficientBalanceChains
            .map((chain) => `${chain.name} chain: ${chain.balance} wei`)
            .join(', ')
          setError(
            `Insufficient balance on L2 chains: ${chainDetails}. Please add Eth to these chains before proceeding.`,
          )
          setLoading(false)
          return
        }

        console.log('All L2 chain balances verified successfully!')
      }

      const steps: Step[] = []

      const publicResolverAddress = config.PUBLIC_RESOLVER! as `0x${string}`
      // try {
      //   publicResolverAddress = (await readContract(walletClient, {
      //     address: config.ENS_REGISTRY as `0x${string}`,
      //     abi: ensRegistryABI,
      //     functionName: 'resolver',
      //     args: [parentNode],
      //   })) as `0x${string}`
      // } catch (err) {
      //   console.log('err ' + err)
      //   setError('Failed to get public resolver')
      // }

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
        parentType === 'web3labs'
          ? skipL1Naming
            ? 'Create subname'
            : 'Set forward resolution'
          : 'Create subname'

      // Step 1: Create Subname (skip if using existing name)
      if (!skipSubnameCreation) {
        steps.push({
          title: titleFirst,
          chainId: chainId, // Add chainId for L1 transaction
          action: async () => {
            console.log(`nameExist is ${nameExist} parentType is ${parentType}`)
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
                console.log(
                  'create subname::writeContract calling setName on ENSCRIBE_CONTRACT',
                )
                let txn

                if (isSafeWallet) {
                  writeContract(walletClient, {
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
                  txn = 'safe wallet'
                } else {
                  txn = await writeContract(walletClient, {
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
                }

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
                console.log(
                  'create subname::writeContract calling setSubnodeRecord on ENSCRIBE_CONTRACT',
                )
                let txn

                if (isSafeWallet) {
                  writeContract(walletClient, {
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
                  txn = 'safe wallet'
                } else {
                  txn = await writeContract(walletClient, {
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
                }

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
              console.log(`nameExist is ${nameExist}`)
              if (!nameExist) {
                if (isWrapped) {
                  console.log(
                    'create subname::writeContract calling setSubnodeRecord on NAME_WRAPPER',
                  )
                  let txn

                  if (isSafeWallet) {
                    writeContract(walletClient, {
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
                    txn = 'safe wallet'
                  } else {
                    txn = await writeContract(walletClient, {
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
                  }

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
                  console.log(
                    'create subname::writeContract calling setSubnodeRecord on ENS_REGISTRY',
                  )
                  let txn

                  if (isSafeWallet) {
                    writeContract(walletClient, {
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
                    txn = 'safe wallet'
                  } else {
                    txn = await writeContract(walletClient, {
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
                  }

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
      }

      // Step 2: Set Forward Resolution
      // For existing names, always set forward resolution (even for web3labs), since we skip subname creation.
      // For new names, set forward only if parentType is not 'web3labs'. If skipL1Naming, omit this.
      if (!skipL1Naming && (skipSubnameCreation || parentType != 'web3labs')) {
        steps.push({
          title: 'Set forward resolution',
          chainId: chainId, // Add chainId for L1 transaction
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
              console.log(
                'set fwdres::writeContract calling setAddr on PUBLIC_RESOLVER',
              )
              let txn

              if (isSafeWallet) {
                writeContract(walletClient, {
                  address: publicResolverAddress,
                  abi: publicResolverABI,
                  functionName: 'setAddr',
                  args: [node, existingContractAddress],
                  account: walletAddress,
                })
                txn = 'safe wallet'
              } else {
                txn = await writeContract(walletClient, {
                  address: publicResolverAddress,
                  abi: publicResolverABI,
                  functionName: 'setAddr',
                  args: [node, existingContractAddress],
                  account: walletAddress,
                })
              }

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

      // Step 3: Set Reverse Resolution (if Primary). If skipL1Naming, omit this.
      if (isReverseClaimable && !skipL1Naming) {
        setIsPrimaryNameSet(true)
        const addrLabel = existingContractAddress.slice(2).toLowerCase()
        const reversedNode = namehash(addrLabel + '.' + 'addr.reverse')
        steps.push({
          title: 'Set reverse resolution',
          chainId: chainId, // Add chainId for L1 transaction
          action: async () => {
            console.log(
              'set revres::writeContract calling setName on PUBLIC_RESOLVER',
            )
            let txn

            if (isSafeWallet) {
              writeContract(walletClient, {
                address: publicResolverAddress,
                abi: publicResolverABI,
                functionName: 'setName',
                args: [reversedNode, name],
                account: walletAddress,
              })
              txn = 'safe wallet'
            } else {
              txn = await writeContract(walletClient, {
                address: publicResolverAddress,
                abi: publicResolverABI,
                functionName: 'setName',
                args: [reversedNode, name],
                account: walletAddress,
              })
            }

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
      } else if (isContractOwner && isOwnable && !skipL1Naming) {
        setIsPrimaryNameSet(true)
        steps.push({
          title: 'Set reverse resolution',
          chainId: chainId, // Add chainId for L1 transaction
          action: async () => {
            console.log(
              'set revres::writeContract calling setNameForAddr on REVERSE_REGISTRAR',
            )
            let txn

            if (isSafeWallet) {
              writeContract(walletClient, {
                address: config.REVERSE_REGISTRAR as `0x${string}`,
                abi: reverseRegistrarABI,
                functionName: 'setNameForAddr',
                args: [
                  existingContractAddress,
                  walletAddress,
                  publicResolverAddress,
                  name,
                ],
                account: walletAddress,
              })
              txn = 'safe wallet'
            } else {
              txn = await writeContract(walletClient, {
                address: config.REVERSE_REGISTRAR as `0x${string}`,
                abi: reverseRegistrarABI,
                functionName: 'setNameForAddr',
                args: [
                  existingContractAddress,
                  walletAddress,
                  publicResolverAddress,
                  name,
                ],
                account: walletAddress,
              })
            }

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
      const selectedL2Chains: Array<{
        name: string
        chainId: number
        chain: any
      }> = []

      // Map selected chain names to their configurations for steps
      const stepChainConfigs = {
        Optimism: {
          chainId: isL1Mainnet ? CHAINS.OPTIMISM : CHAINS.OPTIMISM_SEPOLIA,
          chain: isL1Mainnet ? optimism : optimismSepolia,
        },
        Arbitrum: {
          chainId: isL1Mainnet ? CHAINS.ARBITRUM : CHAINS.ARBITRUM_SEPOLIA,
          chain: isL1Mainnet ? arbitrum : arbitrumSepolia,
        },
        Scroll: {
          chainId: isL1Mainnet ? CHAINS.SCROLL : CHAINS.SCROLL_SEPOLIA,
          chain: isL1Mainnet ? scroll : scrollSepolia,
        },
        Base: {
          chainId: isL1Mainnet ? CHAINS.BASE : CHAINS.BASE_SEPOLIA,
          chain: isL1Mainnet ? base : baseSepolia,
        },
        Linea: {
          chainId: isL1Mainnet ? CHAINS.LINEA : CHAINS.LINEA_SEPOLIA,
          chain: isL1Mainnet ? linea : lineaSepolia,
        },
      }

      // Add selected chains to steps
      for (const selectedChain of selectedL2ChainNames) {
        const config =
          stepChainConfigs[selectedChain as keyof typeof stepChainConfigs]
        if (config) {
          selectedL2Chains.push({ name: selectedChain, ...config })
        }
      }

      // Second: Add all L2 forward resolution steps (on current chain)
      for (const l2Chain of selectedL2Chains) {
        const l2Config = CONTRACTS[l2Chain.chainId]
        const coinType = Number(l2Config.COIN_TYPE || '60')

        if (l2Config && coinType) {
          // Add forward resolution step for this L2 chain
          steps.push({
            title: `Set forward resolution for ${l2Chain.name}`,
            chainId: chainId, // Add chainId for L1 transaction (forward resolution happens on L1)
            action: async () => {
              const currentAddr = (await readContract(walletClient, {
                address: publicResolverAddress,
                abi: publicResolverABI,
                functionName: 'addr',
                args: [node, coinType],
              })) as `0x${string}`

              if (
                currentAddr.toLowerCase() !==
                existingContractAddress.toLowerCase()
              ) {
                let txn
                if (isSafeWallet) {
                  writeContract(walletClient, {
                    address: publicResolverAddress,
                    abi: publicResolverABI,
                    functionName: 'setAddr',
                    args: [node, coinType, existingContractAddress],
                    account: walletAddress,
                  })
                  txn = 'safe wallet'
                } else {
                  txn = await writeContract(walletClient, {
                    address: publicResolverAddress,
                    abi: publicResolverABI,
                    functionName: 'setAddr',
                    args: [node, coinType, existingContractAddress],
                    account: walletAddress,
                  })
                }
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
                setError('Forward resolution already set on this chain')
                console.log('Forward resolution already set on this chain')
              }
            },
          })
        } else {
          console.error(`${l2Chain.name} configuration missing:`, {
            hasConfig: !!l2Config,
            config: l2Config,
          })
        }
      }

      // Then: Add L2 primary naming steps (switch to each chain, then proceed)
      for (const l2Chain of selectedL2Chains) {
        const l2Config = CONTRACTS[l2Chain.chainId]

        // Check if contract is ownable on this specific L2 chain
        let isOwnableOnThisL2Chain = false
        switch (l2Chain.name) {
          case 'Optimism':
            isOwnableOnThisL2Chain = isOwnableOptimism === true
            break
          case 'Arbitrum':
            isOwnableOnThisL2Chain = isOwnableArbitrum === true
            break
          case 'Scroll':
            isOwnableOnThisL2Chain = isOwnableScroll === true
            break
          case 'Base':
            isOwnableOnThisL2Chain = isOwnableBase === true
            break
          case 'Linea':
            isOwnableOnThisL2Chain = isOwnableLinea === true
            break
          default:
            isOwnableOnThisL2Chain = false
        }

        // Only add L2 primary name step if contract is ownable on this L2 chain
        if (
          l2Config &&
          l2Config.L2_REVERSE_REGISTRAR &&
          isOwnableOnThisL2Chain
        ) {
          setIsPrimaryNameSet(true)
          // Add reverse resolution step for this L2 chain
          steps.push({
            title: `Switch to ${l2Chain.name} and set L2 primary name`,
            chainId: l2Chain.chainId, // Add chainId for L2 transaction
            action: async () => {
              console.log(`Starting ${l2Chain.name} L2 primary name step...`)

              console.log(
                `Switching to ${l2Chain.name} (chain ID: ${l2Chain.chainId})...`,
              )

              // Switch to L2 chain
              await switchChain({ chainId: l2Chain.chainId })

              // Wait a moment for the chain switch to complete
              console.log('Waiting for chain switch to complete...')
              await new Promise((resolve) => setTimeout(resolve, 3000))

              // Wait for the chain to actually change
              console.log('Waiting for chain to actually change...')
              let attempts = 0
              while (attempts < 10) {
                const currentChain = await walletClient.getChainId()
                console.log(
                  `Current chain ID: ${currentChain}, Target: ${l2Chain.chainId}`,
                )
                if (currentChain === l2Chain.chainId) {
                  console.log('Chain switch confirmed!')
                  break
                }
                await new Promise((resolve) => setTimeout(resolve, 1000))
                attempts++
              }

              if (attempts >= 10) {
                throw new Error(
                  `Chain switch timeout - chain did not change to ${l2Chain.name}`,
                )
              }

              // Now execute the reverse resolution transaction on L2
              console.log(`Executing reverse resolution on ${l2Chain.name}...`)
              console.log(
                'L2 Reverse Registrar:',
                l2Config.L2_REVERSE_REGISTRAR,
              )
              console.log('Contract Address:', existingContractAddress)
              console.log('ENS Name:', skipSubnameCreation ? label : name)

              // Perform reverse resolution on L2
              let txn
              if (isSafeWallet) {
                writeContract(walletClient, {
                  address: l2Config.L2_REVERSE_REGISTRAR as `0x${string}`,
                  abi: [
                    {
                      inputs: [
                        {
                          internalType: 'address',
                          name: 'addr',
                          type: 'address',
                        },
                        {
                          internalType: 'string',
                          name: 'name',
                          type: 'string',
                        },
                      ],
                      name: 'setNameForAddr',
                      outputs: [],
                      stateMutability: 'nonpayable',
                      type: 'function',
                    },
                  ],
                  functionName: 'setNameForAddr',
                  args: [
                    existingContractAddress as `0x${string}`,
                    skipSubnameCreation ? label : name,
                  ],
                  account: walletAddress,
                  chain: l2Chain.chain,
                })
                txn = 'safe wallet'
              } else {
                txn = await writeContract(walletClient, {
                  address: l2Config.L2_REVERSE_REGISTRAR as `0x${string}`,
                  abi: [
                    {
                      inputs: [
                        {
                          internalType: 'address',
                          name: 'addr',
                          type: 'address',
                        },
                        {
                          internalType: 'string',
                          name: 'name',
                          type: 'string',
                        },
                      ],
                      name: 'setNameForAddr',
                      outputs: [],
                      stateMutability: 'nonpayable',
                      type: 'function',
                    },
                  ],
                  functionName: 'setNameForAddr',
                  args: [existingContractAddress as `0x${string}`, name],
                  account: walletAddress,
                  chain: l2Chain.chain,
                })
              }

              console.log(`${l2Chain.name} transaction submitted:`, txn)

              // Log the L2 transaction
              await logMetric(
                `${l2Chain.name.toLowerCase()}-l2-primary`, // correlationId
                Date.now(),
                l2Chain.chainId,
                existingContractAddress,
                walletAddress,
                skipSubnameCreation ? label : name,
                'revres::setNameForAddr',
                txn,
                'L2Primary',
                opType,
              )

              return txn
            },
          })
        } else {
          console.error(
            `${l2Chain.name} configuration missing or contract not ownable:`,
            {
              hasConfig: !!l2Config,
              hasReverseRegistrar: !!l2Config?.L2_REVERSE_REGISTRAR,
              config: l2Config,
            },
          )
        }
      }

      // Check if connected wallet is a Safe wallet
      const safeCheck = await checkIfSafeWallet()
      setIsSafeWallet(safeCheck)

      setModalTitle(
        (isContractOwner && isOwnable) || isReverseClaimable
          ? 'Set Primary Name'
          : 'Set Forward Resolution',
      )
      setModalSubtitle(
        safeCheck
          ? 'Transactions will be executed in your Safe wallet app'
          : 'Running each step to finish naming this contract',
      )
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
        Name Contract
      </h2>
      {(!isConnected || isUnsupportedL2Chain) && (
        <p className="text-red-500">
          {!isConnected
            ? 'Please connect your wallet.'
            : `To name your contract on ${unsupportedL2Name}, change to the ${chain?.id === CHAINS.OPTIMISM || chain?.id === CHAINS.ARBITRUM || chain?.id === CHAINS.SCROLL ? 'Ethereum Mainnet' : 'Sepolia'} network and use the Naming on L2 Chain option.`}
        </p>
      )}

      <div
        className={`space-y-6 mt-6 ${!isConnected || isUnsupportedL2Chain ? 'pointer-events-none opacity-50' : ''}`}
      >
        <label className="block text-gray-700 dark:text-gray-300">
          Contract Address
        </label>
        <Input
          required={true}
          type="text"
          value={existingContractAddress}
          onChange={async (e) => {
            setExistingContractAddress(e.target.value)
            await checkIfContractExists(e.target.value)
            await checkIfContractOwner(e.target.value)
            await checkIfOwnable(e.target.value)
            await checkIfOwnableOnL2Chains(e.target.value)
            await checkIfReverseClaimable(e.target.value)
          }}
          // onBlur={ checkIfOwnable}
          placeholder="0xa56..."
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200}`}
        />

        {/* Contract Status Information */}
        {((!isAddressEmpty && !isContractOwner) ||
          isOwnable ||
          (isReverseClaimable && !isOwnable)) && (
          <div className="flex flex-col space-y-1 mt-4">
            {!isAddressEmpty && !isContractOwner && isOwnable && (
              <div className="flex items-center">
                <XCircleIcon className="w-5 h-5 inline text-red-500 cursor-pointer" />
                <p className="text-gray-600 inline ml-1 dark:text-gray-300">
                  {chain?.name}: You are not the contract owner and cannot set
                  its primary name
                </p>
              </div>
            )}
            {(isOwnable || (isReverseClaimable && !isOwnable)) && (
              <div className="space-y-1">
                {isOwnable && (
                  <div className="flex items-center">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mr-1" />
                    <p className="text-gray-700 dark:text-gray-200">
                      {chain?.name}: Contract implements{' '}
                      <Link
                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                        className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Ownable
                      </Link>
                    </p>
                  </div>
                )}
                {isReverseClaimable && !isOwnable && (
                  <div className="flex items-center">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mr-1" />
                    <p className="text-gray-700 dark:text-gray-200">
                      {chain?.name}: Contract is{' '}
                      <Link
                        href="https://docs.ens.domains/web/naming-contracts#reverseclaimersol"
                        className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        ReverseClaimable
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* L2 Ownable Information */}
            {!isAddressEmpty && (
              <div className="space-y-1">
                {isOwnableOptimism === true && (
                  <div className="flex items-center">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mr-1" />
                    <p className="text-gray-700 dark:text-gray-200">
                      Contract implements{' '}
                      <Link
                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                        className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Ownable
                      </Link>{' '}
                      on Optimism
                    </p>
                  </div>
                )}
                {isOwnableArbitrum === true && (
                  <div className="flex items-center">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mr-1" />
                    <p className="text-gray-700 dark:text-gray-200">
                      Contract implements{' '}
                      <Link
                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                        className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Ownable
                      </Link>{' '}
                      on Arbitrum
                    </p>
                  </div>
                )}
                {isOwnableScroll === true && (
                  <div className="flex items-center">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mr-1" />
                    <p className="text-gray-700 dark:text-gray-200">
                      Contract implements{' '}
                      <Link
                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                        className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Ownable
                      </Link>{' '}
                      on Scroll
                    </p>
                  </div>
                )}
                {isOwnableBase === true && (
                  <div className="flex items-center">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mr-1" />
                    <p className="text-gray-700 dark:text-gray-200">
                      Contract implements{' '}
                      <Link
                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                        className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Ownable
                      </Link>{' '}
                      on Base
                    </p>
                  </div>
                )}
                {isOwnableLinea === true && (
                  <div className="flex items-center">
                    <CheckCircleIcon className="w-5 h-5 text-green-500 mr-1" />
                    <p className="text-gray-700 dark:text-gray-200">
                      Contract implements{' '}
                      <Link
                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                        className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Ownable
                      </Link>{' '}
                      on Linea
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Toggle Buttons */}
        <div className="flex items-center gap-2 mt-4">
          <Button
            type="button"
            className={`${
              selectedAction === 'subname'
                ? 'bg-green-600 text-white ring-2 ring-green-500 ring-offset-2 dark:bg-green-700'
                : 'bg-gray-200 text-gray-700 hover:bg-green-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-green-800'
            }`}
            onClick={() => {
              if (selectedAction === 'subname') {
                setSelectedAction(null)
              } else {
                setSelectedAction('subname')
                // Clear the text field and reset states for subname creation
                setLabel('')
                setParentName(enscribeDomain)
                setEnsNameChosen(false)
                setSldAsPrimary(false) // Reset to subname mode
                setError('') // Clear any existing errors
                // TODO: Implement create subname functionality
                console.log('Create New Name selected')
              }
            }}
          >
            Create New Name
          </Button>
          <Button
            type="button"
            className={`${
              selectedAction === 'pick'
                ? 'bg-blue-600 text-white ring-2 ring-blue-500 ring-offset-2 dark:bg-blue-700'
                : 'bg-gray-200 text-gray-700 hover:bg-blue-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-blue-800'
            }`}
            onClick={() => {
              if (selectedAction === 'pick') {
                setSelectedAction(null)
              } else {
                setSelectedAction('pick')
                setParentName('')
                setLabel('')
                setEnsNameChosen(false)
                setSldAsPrimary(true) // Set to existing name mode
                setError('') // Clear any existing errors
              }
            }}
          >
            Use Existing Name
          </Button>
        </div>

        {/* Error message for invalid Ownable/ReverseClaimable bytecode */}
        {!isAddressEmpty && !isAddressInvalid && isContractExists === false && (
          <p className="text-red-600 dark:text-red-300">
            {chain?.name}: Contract doesn't exist
          </p>
        )}
        {!isAddressEmpty &&
          !isAddressInvalid &&
          isContractExists === true &&
          !isOwnable &&
          !isReverseClaimable && (
            <p className="text-yellow-600 dark:text-yellow-300">
              {chain?.name}: Contract address does not extend{' '}
              <Link
                href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                Ownable
              </Link>{' '}
              or{' '}
              <Link
                href="https://eips.ethereum.org/EIPS/eip-173"
                className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                ERC-173
              </Link>{' '}
              or{' '}
              <Link
                href="https://docs.ens.domains/web/naming-contracts#reverseclaimersol"
                className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                ReverseClaimable
              </Link>
              . You can only{' '}
              <Link
                href="https://docs.ens.domains/learn/resolution#forward-resolution"
                className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                forward resolve
              </Link>{' '}
              this name.{' '}
              <Link
                href="https://www.enscribe.xyz/docs/"
                className="text-blue-600 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
              >
                Why is this?
              </Link>
            </p>
          )}
        {selectedAction && (
          <>
            <label className="block text-gray-700 dark:text-gray-300">
              Contract Name
            </label>
            <div className={'flex items-center space-x-2'}>
              <Input
                type="text"
                required
                value={label}
                onChange={(e) => {
                  const newVal = e.target.value
                  setLabel(newVal)
                  if (ensNameChosen) {
                    setEnsNameChosen(false)
                  }
                  setError('')
                }}
                onBlur={() => {
                  if (selectedAction === 'subname') {
                    void checkENSReverseResolution()
                  }
                }}
                placeholder="myawesomeapp"
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
              />
              {selectedAction === 'subname' ? (
                <Button
                  onClick={populateName}
                  className="relative overflow-hidden bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white hover:shadow-xl hover:shadow-pink-500/50 focus:ring-4 focus:ring-pink-500/50 group transition-all duration-300 hover:-translate-y-1 p-2.5 font-medium"
                >
                  <span className="relative z-10 p-2">✨Generate Name</span>
                  <span className="absolute inset-0 h-full w-full bg-gradient-to-r from-purple-600/0 via-white/70 to-purple-600/0 opacity-0 group-hover:opacity-100 group-hover:animate-shine pointer-events-none blur-sm"></span>
                  <span className="absolute -inset-1 rounded-md bg-gradient-to-r from-purple-600 via-pink-500 to-red-500 opacity-0 group-hover:opacity-70 group-hover:blur-md transition-all duration-300 pointer-events-none"></span>
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    setEnsModalFromPicker(false)
                    setShowENSModal(true)
                    fetchUserOwnedDomains()
                  }}
                  className="bg-blue-600 text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-500/50"
                >
                  Select Name
                </Button>
              )}
            </div>
          </>
        )}

        {selectedAction === 'subname' && (
          <>
            <label className="block text-gray-700 dark:text-gray-300">
              Parent Domain
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
                    setParentType(
                      e.target.value === enscribeDomain ? 'web3labs' : 'own',
                    )
                  }}
                  onBlur={async () => {
                    await recordExist()
                  }}
                  placeholder="mydomain.eth"
                  className="flex-1 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                />
                <Button
                  onClick={() => {
                    setParentName('')
                    setEnsModalFromPicker(true)
                    setShowENSModal(true)
                    fetchUserOwnedDomains()
                  }}
                  className="bg-gray-900 text-white dark:bg-blue-700 dark:hover:bg-gray-800 dark:text-white"
                >
                  Select Domain
                </Button>
              </div>
            )}
          </>
        )}

        {/* Full Contract Name Preview */}
        {((selectedAction === 'subname' &&
          !isEmpty(label) &&
          !isEmpty(parentName)) ||
          (selectedAction === 'pick' && !isEmpty(label))) && (
          <div className="mt-4 mb-4">
            <label className="block text-gray-700 dark:text-gray-300 mb-5">
              Full Contract Name
            </label>
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-2 flex items-center">
              <div className="flex-1 font-medium text-blue-800 dark:text-blue-300 text-sm break-all">
                {selectedAction === 'pick' ? label : `${label}.${parentName}`}
              </div>
            </div>
          </div>
        )}

        {/* L2 Primary Name Options - Only show on mainnet or sepolia */}
        {(chain?.id === CHAINS.MAINNET || chain?.id === CHAINS.SEPOLIA) && (
          <div className="mt-4 mb-4">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2">
                <label className="block text-gray-700 dark:text-gray-300">
                  Naming on L2 Chains
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-400 text-gray-600 dark:text-gray-300 text-xs select-none">
                        i
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        Select which L2 chains to set names on. This will add
                        additional steps to switch to each selected chain and
                        set the primary name there as well.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {selectedL2ChainNames.length > 0 && (
                <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                  <span className="text-gray-700 dark:text-gray-300">
                    Skip L1 Naming
                  </span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-400 text-gray-600 dark:text-gray-300 text-xs select-none">
                          i
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Select this if you want to name only on the selected
                          L2 chains and skip L1 naming (forward and reverse
                          resolution). The subname will still be created on L1
                          if needed.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Checkbox
                    checked={skipL1Naming}
                    onCheckedChange={(val) => setSkipL1Naming(Boolean(val))}
                    aria-label="Skip L1 Naming"
                  />
                </div>
              )}
            </div>

            {/* Selected L2 Chains Display */}
            {selectedL2ChainNames.length > 0 && (
              <div className="mb-4">
                <div className="flex flex-wrap gap-2">
                  {selectedL2ChainNames.map((chainName, index) => {
                    const logoSrc =
                      chainName === 'Optimism'
                        ? '/images/optimism.svg'
                        : chainName === 'Arbitrum'
                          ? '/images/arbitrum.svg'
                          : chainName === 'Scroll'
                            ? '/images/scroll.svg'
                            : chainName === 'Base'
                              ? '/images/base.svg'
                              : '/images/linea.svg'
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full text-sm"
                      >
                        <Image
                          src={logoSrc}
                          alt={`${chainName} logo`}
                          width={14}
                          height={14}
                        />
                        <span>{chainName}</span>
                        <button
                          onClick={() =>
                            setSelectedL2ChainNames((prev) =>
                              prev.filter((name) => name !== chainName),
                            )
                          }
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* L2 Chain chooser button instead of dropdown */}
            <div>
              <Button
                type="button"
                className="bg-gray-900 text-white dark:bg-blue-700 dark:hover:bg-gray-800 dark:text-white"
                onClick={() => setShowL2Modal(true)}
                disabled={
                  L2_CHAIN_OPTIONS.filter(
                    (c) => !selectedL2ChainNames.includes(c),
                  ).length === 0
                }
              >
                Choose L2 Chains
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Add ENS Selection Modal */}
      <Dialog open={showENSModal} onOpenChange={setShowENSModal}>
        <DialogContent className="max-w-3xl bg-white dark:bg-gray-900 shadow-lg rounded-lg">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
              {selectedAction === 'pick'
                ? 'Choose Your ENS Name'
                : 'Choose Domain'}
            </DialogTitle>
          </DialogHeader>

          {selectedAction === 'subname' && (
            <div className="space-y-6 mb-6">
              {/* Choose Your Own Domain */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-3">
                  Your Domains
                </h3>
                {userOwnedDomains.length > 0 ? (
                  <div className="max-h-[30vh] overflow-y-auto pr-1">
                    {(() => {
                      // Function to get the 2LD for a domain
                      const get2LD = (domain: string): string => {
                        const parts = domain.split('.')
                        if (parts.length < 2) return domain
                        return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
                      }

                      // Separate domains with labelhashes
                      const domainsWithLabelhash = userOwnedDomains.filter(
                        (domain) =>
                          domain.includes('[') && domain.includes(']'),
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
                                {domainGroups[parent2LD].map(
                                  (domain, index) => (
                                    <div
                                      key={domain}
                                      className={`px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer transition-colors inline-flex items-center ${index === 0 ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800' : 'bg-white dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                                      onClick={() => {
                                        setParentName(domain)
                                        setParentType(
                                          domain === enscribeDomain
                                            ? 'web3labs'
                                            : 'own',
                                        )
                                        setEnsNameChosen(true)
                                        setShowENSModal(false)
                                      }}
                                    >
                                      <span className="text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">
                                        {domain}
                                      </span>
                                    </div>
                                  ),
                                )}
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
                                      setParentType(
                                        domain === enscribeDomain
                                          ? 'web3labs'
                                          : 'own',
                                      )
                                      setEnsNameChosen(true)
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
                  <div className="text-center py-4 bg-gray-50 dark:bg-gray-800 rounded-md">
                    <p className="text-gray-500 dark:text-gray-400">
                      No ENS domains found for your address.
                    </p>
                  </div>
                )}
              </div>

              {/* Choose Enscribe's Domain */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-3">
                  Other Domains
                </h3>
                <div
                  className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer transition-colors inline-flex items-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                  onClick={() => {
                    setParentName(enscribeDomain)
                    setParentType('web3labs')
                    setEnsNameChosen(true)
                    setShowENSModal(false)
                  }}
                >
                  <span className="text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">
                    {enscribeDomain}
                  </span>
                </div>

                {/* Purchase New Domain button */}
                <div className="pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRegisterDialog(true)
                      setShowENSModal(false)
                    }}
                    className="bg-gray-900 dark:bg-blue-700 text-white rounded-full"
                  >
                    Purchase New Domain
                  </Button>
                </div>
              </div>
            </div>
          )}

          {selectedAction !== 'subname' && (
            <>
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
                          (domain) =>
                            domain.includes('[') && domain.includes(']'),
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
                                  {domainGroups[parent2LD].map(
                                    (domain, index) => (
                                      <div
                                        key={domain}
                                        className={`px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer transition-colors inline-flex items-center ${index === 0 ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800' : 'bg-white dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                                        onClick={() => {
                                          // Auto-detect if selected domain has dots and enable SLD mode
                                          const parts = domain.split('.')
                                          if (ensModalFromPicker) {
                                            // In Create Subname flow, selected domain should be the parent
                                            setParentName(domain)
                                          } else if (
                                            parts.length >= 2 &&
                                            parts[0] &&
                                            parts[parts.length - 1]
                                          ) {
                                            // In Use Existing Name flow, full domain goes to label
                                            setSldAsPrimary(true)
                                            setLabel(domain)
                                          } else if (sldAsPrimary) {
                                            setLabel(domain)
                                          } else {
                                            setParentName(domain)
                                          }
                                          setEnsNameChosen(true)
                                          setShowENSModal(false)
                                        }}
                                      >
                                        <span className="text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">
                                          {domain}
                                        </span>
                                      </div>
                                    ),
                                  )}
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
                                        // Auto-detect if selected domain has dots and enable SLD mode
                                        const parts = domain.split('.')
                                        if (ensModalFromPicker) {
                                          // In Create Subname flow, selected domain should be the parent
                                          setParentName(domain)
                                        } else if (
                                          parts.length >= 2 &&
                                          parts[0] &&
                                          parts[parts.length - 1]
                                        ) {
                                          // In Use Existing Name flow, full domain goes to label
                                          setSldAsPrimary(true)
                                          setLabel(domain)
                                        } else if (sldAsPrimary) {
                                          setLabel(domain)
                                        } else {
                                          setParentName(domain)
                                        }
                                        setEnsNameChosen(true)
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
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* L2 Selection Modal */}
      <Dialog open={showL2Modal} onOpenChange={setShowL2Modal}>
        <DialogContent className="max-w-3xl bg-white dark:bg-gray-900 shadow-lg rounded-lg">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
              Choose L2 Chains
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Select one or more L2 chains.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {L2_CHAIN_OPTIONS.map((chainName) => {
              const isSelected = selectedL2ChainNames.includes(chainName)
              const disabled = false
              const logoSrc =
                chainName === 'Optimism'
                  ? '/images/optimism.svg'
                  : chainName === 'Arbitrum'
                    ? '/images/arbitrum.svg'
                    : chainName === 'Scroll'
                      ? '/images/scroll.svg'
                      : chainName === 'Base'
                        ? '/images/base.svg'
                        : '/images/linea.svg'
              return (
                <button
                  key={chainName}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedL2ChainNames((prev) =>
                        prev.filter((n) => n !== chainName),
                      )
                    } else {
                      setSelectedL2ChainNames((prev) => [...prev, chainName])
                    }
                  }}
                  className={`flex items-center gap-3 p-3 border rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
                  }`}
                >
                  <Image
                    src={logoSrc}
                    alt={`${chainName} logo`}
                    width={24}
                    height={24}
                  />
                  <span className="text-gray-800 dark:text-gray-200">
                    {chainName}
                  </span>
                  {isSelected && (
                    <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white">
                      Selected
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button
              onClick={() => setShowL2Modal(false)}
              className="bg-gray-900 text-white dark:bg-blue-700 dark:hover:bg-gray-800 dark:text-white"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Register New Name Dialog */}
      <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-900 shadow-lg rounded-lg">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
              Register New Domain
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              Visit the ENS app to register a new domain. Once you are done,
              come back to Enscribe to name your contract.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-3 mt-6 text-gray-900 dark:text-gray-300">
            <Button
              variant="outline"
              onClick={() => {
                setShowRegisterDialog(false)
                setParentType('web3labs')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const ensAppUrl =
                  chain?.id === CHAINS.SEPOLIA
                    ? 'https://sepolia.app.ens.domains/'
                    : 'https://app.ens.domains/'
                window.open(ensAppUrl, '_blank')
                setShowRegisterDialog(false)
                setParentType('web3labs')
              }}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              Go to ENS App
            </Button>
          </div>
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
            (isEmpty(label) && !(selectedAction === 'pick' && ensNameChosen)) ||
            isUnsupportedL2Chain ||
            parentType === 'register'
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
          console.log('Modal closed with result:', result)
          setModalOpen(false)
          if (result?.startsWith('ERROR')) {
            // Extract the actual error message (remove 'ERROR: ' prefix)
            const errorMessage = result.replace('ERROR: ', '')
            setError(errorMessage)
            return
          }

          if (result === 'INCOMPLETE') {
            setError(
              'Steps not completed. Please complete all steps before closing.',
            )
          } else {
            console.log('Success - resetting form')
            // setDeployedAddress(existingContractAddress)
            // Reset form after successful naming
            setExistingContractAddress('')
            setLabel('')
            setError('')
            setParentType('web3labs')
            setParentName(enscribeDomain)
            setIsPrimaryNameSet(false)
            setSelectedL2ChainNames([])
            setDropdownValue('')
            setSkipL1Naming(false)
          }
        }}
        title={modalTitle}
        subtitle={modalSubtitle}
        steps={modalSteps}
        contractAddress={existingContractAddress}
        ensName={
          selectedAction === 'pick' 
            ? label 
            : `${label}.${parentName}`
        }
        isPrimaryNameSet={isPrimaryNameSet}
        isSafeWallet={isSafeWallet}
      />
    </div>
  )
}
