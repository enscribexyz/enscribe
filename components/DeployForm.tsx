import React, { useEffect, useState } from 'react'
import { type Address } from 'viem'
import { namehash, normalize } from 'viem/ens'
import ensRegistryABI from '../contracts/ENSRegistry'
import nameWrapperABI from '../contracts/NameWrapper'
import { useAccount, useWalletClient } from 'wagmi'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import parseJson from 'json-parse-safe'
import { CHAINS, CONTRACTS } from '../utils/constants'
import SetNameStepsModal, { Step } from './SetNameStepsModal'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { v4 as uuid } from 'uuid'
import {
  ConstructorArg,
  encodeConstructorArgs,
  fetchGeneratedName,
  getDeployedAddress,
  logMetric,
} from '@/components/componentUtils'
import { string } from 'postcss-selector-parser'
import {
  getEnsAddress,
  readContract,
  waitForTransactionReceipt,
  writeContract,
} from 'viem/actions'
import enscribeContractABI from '../contracts/Enscribe'

const OWNABLE_FUNCTION_SELECTORS = [
  '8da5cb5b', // owner()
  'f2fde38b', // transferOwnership(address)
]

const ADDR_REVERSE_NODE =
  '91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2'

const commonTypes = [
  'string',
  'uint8',
  'uint256',
  'address',
  'bool',
  'bytes',
  'bytes32',
  'string[]',
  'uint256[]',
  'tuple(address, uint256)',
]

const opType = 'deployandname'

const checkIfOwnable = (bytecode: string): boolean => {
  return OWNABLE_FUNCTION_SELECTORS.every((selector) =>
    bytecode.includes(selector),
  )
}

const checkIfReverseClaimable = (bytecode: string): boolean => {
  console.log('bytecode is rc? ' + bytecode.includes(ADDR_REVERSE_NODE))
  return bytecode.includes(ADDR_REVERSE_NODE)
}

export default function DeployForm() {
  const { address: walletAddress, isConnected, chain } = useAccount()
  const { data: walletClient } = useWalletClient()

  const config = chain?.id ? CONTRACTS[chain.id] : undefined

  const enscribeDomain = config?.ENSCRIBE_DOMAIN!

  const chainId = chain?.id!

  const { toast } = useToast()

  const [bytecode, setBytecode] = useState('')
  const [label, setLabel] = useState('')
  const [parentType, setParentType] = useState<'web3labs' | 'own'>('web3labs')
  const [parentName, setParentName] = useState(enscribeDomain)
  const [fetchingENS, setFetchingENS] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [deployedAddress, setDeployedAddress] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPopup, setShowPopup] = useState(false)
  const [isValidBytecode, setIsValidBytecode] = useState(true)
  const [isOwnable, setIsOwnable] = useState(false)
  const [isReverseClaimable, setIsReverseClaimable] = useState(false)
  const [isReverseSetter, setIsReverseSetter] = useState(false)

  const [operatorAccess, setOperatorAccess] = useState(false)
  const [ensNameTaken, setEnsNameTaken] = useState(false)
  const [args, setArgs] = useState<ConstructorArg[]>([])
  const [abiText, setAbiText] = useState('')
  const [recordExists, setRecordExists] = useState(true)
  const [accessLoading, setAccessLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalSteps, setModalSteps] = useState<Step[]>([])
  const [modalTitle, setModalTitle] = useState('')
  const [modalSubtitle, setModalSubtitle] = useState('')

  const [userOwnedDomains, setUserOwnedDomains] = useState<string[]>([])
  const [showENSModal, setShowENSModal] = useState(false)

  const corelationId = uuid()

  const getParentNode = (name: string) => {
    try {
      return namehash(name)
    } catch (error) {
      return ''
    }
  }

  useEffect(() => {
    if (parentType === 'web3labs' && config?.ENSCRIBE_DOMAIN) {
      setParentName(config?.ENSCRIBE_DOMAIN)
    }
  }, [config, parentType])

  useEffect(() => {
    setBytecode('')
    setLabel('')
    setParentType('web3labs')
    setParentName(enscribeDomain)
    setAbiText('')
    setError('')
    setLoading(false)
    setDeployedAddress('')
    setTxHash('')
    setModalOpen(false)
    setModalSteps([])
    setModalTitle('')
    setModalSubtitle('')
    setUserOwnedDomains([])
    setShowENSModal(false)
    setIsOwnable(false)
    setIsReverseClaimable(false)
    setRecordExists(false)
    setArgs([])
    setOperatorAccess(false)
    setEnsNameTaken(false)
  }, [chain?.id, isConnected])

  useEffect(() => {
    if (bytecode.length > 0) {
      setIsOwnable(checkIfOwnable(bytecode))
      setIsReverseClaimable(checkIfReverseClaimable(bytecode))
      setIsValidBytecode(
        checkIfOwnable(bytecode) || checkIfReverseClaimable(bytecode),
      )
    }
  }, [bytecode])

  const populateName = async () => {
    const name = await fetchGeneratedName()
    setLabel(name)
  }

  const addArg = () =>
    setArgs([...args, { type: 'string', value: '', isCustom: false }])

  const updateArg = (index: number, updated: Partial<ConstructorArg>) => {
    const newArgs = [...args]
    newArgs[index] = { ...newArgs[index], ...updated }
    setArgs(newArgs)
  }

  const removeArg = (index: number) => {
    const newArgs = [...args]
    newArgs.splice(index, 1)
    setArgs(newArgs)
  }

  function isEmpty(value: string) {
    return value == null || value.trim().length === 0
  }

  const handleAbiInput = (text: string) => {
    if (text.trim().length === 0) {
      setArgs([])
      setError('')
      return
    }

    try {
      const { value: parsed, error } = parseJson(text)

      if (error || !parsed) {
        console.log('Invalid ABI')
        setArgs([])
        setError('Invalid ABI JSON. Please paste a valid ABI array.')
      } else {
        parseConstructorInputs(parsed)
        setError('')
      }
    } catch (err) {
      console.error('Invalid ABI JSON:', err)
      setArgs([])
      setError('Invalid ABI JSON. Please paste a valid ABI array.')
    }
  }

  const parseConstructorInputs = (abi: any[]) => {
    try {
      const constructor = abi.find((item) => item.type === 'constructor')
      if (!constructor || !constructor.inputs) {
        setArgs([])
        return
      }

      const generatedArgs = constructor.inputs.map((input: any) => {
        let type = input.type

        // Handle tuples (structs)
        if (type === 'tuple' && input.components) {
          const componentTypes = input.components
            .map((c: any) => c.type)
            .join(',')
          type = `tuple(${componentTypes})`
        }

        // Handle arrays (including tuple arrays)
        if (type.includes('[]')) {
          if (input.components) {
            const componentTypes = input.components
              .map((c: any) => c.type)
              .join(',')
            type = `tuple(${componentTypes})[]`
          }
        }

        return {
          type,
          value: '',
          isCustom: !commonTypes.includes(type),
          isTuple: type.startsWith('tuple'),
          label: input.name || '',
        }
      })

      setArgs(generatedArgs)
    } catch (err) {}
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
    if (!walletClient) return

    // Validate label and parent name before checking
    if (!label.trim()) {
      setError('Label cannot be empty')
      setEnsNameTaken(false)
      return
    }
    if (!parentName.trim()) {
      setError('Parent name cannot be empty')
      setEnsNameTaken(false)
      return
    }

    if (label.includes('.')) {
      setError("Can't include '.' in label name")
      return
    }

    let resolvedAddress
    try {
      const fullEnsName = `${label}.${parentName}`
      resolvedAddress = await getEnsAddress(walletClient, {
        name: normalize(fullEnsName),
      })
    } catch (err) {
      console.error('Error checking ENS name:', err)
      setError('')
      setEnsNameTaken(false)
    } finally {
      if (resolvedAddress) {
        setEnsNameTaken(true)
        setError('ENS name already used, please change label')
      } else {
        setEnsNameTaken(false)
        setError('')
      }
    }
  }

  const recordExist = async (name: string): Promise<boolean> => {
    if (!walletClient || !config?.ENS_REGISTRY) return false
    try {
      const parentNode = getParentNode(name)

      return (await readContract(walletClient, {
        address: config.ENS_REGISTRY as `0x${string}`,
        abi: ensRegistryABI,
        functionName: 'recordExists',
        args: [parentNode],
      })) as boolean
    } catch (err) {
      return false
    }
  }

  const checkOperatorAccess = async (name: string): Promise<boolean> => {
    if (
      !walletClient ||
      !walletAddress ||
      !config?.ENS_REGISTRY ||
      !config?.ENSCRIBE_CONTRACT ||
      !name
    )
      return false

    try {
      // First check if the record exists
      if (!(await recordExist(name))) return false

      const parentNode = getParentNode(name)

      if (chain?.id == CHAINS.BASE || chain?.id == CHAINS.BASE_SEPOLIA) {
        return (await readContract(walletClient, {
          address: config.ENS_REGISTRY as `0x${string}`,
          abi: ensRegistryABI,
          functionName: 'isApprovedForAll',
          args: [walletAddress, config.ENSCRIBE_CONTRACT],
        })) as boolean
      } else {
        const isWrapped = (await readContract(walletClient, {
          address: config.NAME_WRAPPER as `0x${string}`,
          abi: nameWrapperABI,
          functionName: 'isWrapped',
          args: [parentNode],
        })) as boolean
        if (isWrapped) {
          // Wrapped Names
          console.log(`Wrapped detected.`)
          return (await readContract(walletClient, {
            address: config.NAME_WRAPPER as `0x${string}`,
            abi: nameWrapperABI,
            functionName: 'isApprovedForAll',
            args: [walletAddress, config.ENSCRIBE_CONTRACT],
          })) as boolean
        } else {
          //Unwrapped Names
          console.log(`Unwrapped detected.`)
          return (await readContract(walletClient, {
            address: config.ENS_REGISTRY as `0x${string}`,
            abi: ensRegistryABI,
            functionName: 'isApprovedForAll',
            args: [walletAddress, config.ENSCRIBE_CONTRACT],
          })) as boolean
        }
      }
    } catch (err) {
      console.error('Approval check failed:', err)
      return false
    }
  }

  const revokeOperatorAccess = async () => {
    if (
      !walletClient ||
      !walletAddress ||
      !config?.ENS_REGISTRY ||
      !config?.ENSCRIBE_CONTRACT ||
      !getParentNode(parentName)
    )
      return

    setAccessLoading(true)

    try {
      const parentNode = getParentNode(parentName)
      if (!(await recordExist(parentName))) return

      let tx

      if (chain?.id == CHAINS.BASE || chain?.id == CHAINS.BASE_SEPOLIA) {
        tx = await writeContract(walletClient, {
          address: config.ENS_REGISTRY as `0x${string}`,
          abi: ensRegistryABI,
          functionName: 'setApprovalForAll',
          args: [config.ENSCRIBE_CONTRACT, false],
          account: walletAddress,
        })

        const txReceipt = await waitForTransactionReceipt(walletClient, {
          hash: tx,
        })
      } else {
        const isWrapped = await readContract(walletClient, {
          address: config.NAME_WRAPPER as `0x${string}`,
          abi: nameWrapperABI,
          functionName: 'isWrapped',
          args: [parentNode],
        })

        tx = isWrapped
          ? await writeContract(walletClient, {
              address: config.NAME_WRAPPER as `0x${string}`,
              abi: nameWrapperABI,
              functionName: 'setApprovalForAll',
              args: [config.ENSCRIBE_CONTRACT, false],
              account: walletAddress,
            })
          : await writeContract(walletClient, {
              address: config.ENS_REGISTRY as `0x${string}`,
              abi: ensRegistryABI,
              functionName: 'setApprovalForAll',
              args: [config.ENSCRIBE_CONTRACT, false],
              account: walletAddress,
            })
        const txReceipt = await waitForTransactionReceipt(walletClient, {
          hash: tx,
        })
      }

      let contractType
      if (isOwnable) {
        contractType = 'Ownable'
      } else if (isReverseClaimable) {
        contractType = 'ReverseClaimer'
      } else {
        contractType = 'ReverseSetter'
      }
      await logMetric(
        corelationId,
        Date.now(),
        chainId,
        '',
        walletAddress,
        `${label}.${parentName}`,
        'revoke::setApprovalForAll',
        tx,
        contractType,
        opType,
      )

      toast({
        title: 'Access Revoked',
        description: `Operator role of ${parentName} revoked from Enscribe Contract`,
      })
      setOperatorAccess(false)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err?.message || 'Revoke access failed',
      })
    } finally {
      setAccessLoading(false)
    }
  }

  const grantOperatorAccess = async () => {
    if (
      !walletClient ||
      !walletAddress ||
      !config?.ENS_REGISTRY ||
      !config?.ENSCRIBE_CONTRACT ||
      !getParentNode(parentName)
    )
      return

    setAccessLoading(true)

    try {
      const parentNode = getParentNode(parentName)
      if (!(await recordExist(parentName))) return

      let tx

      if (chain?.id == CHAINS.BASE || chain?.id == CHAINS.BASE_SEPOLIA) {
        tx = await writeContract(walletClient, {
          address: config.ENS_REGISTRY as `0x${string}`,
          abi: ensRegistryABI,
          functionName: 'setApprovalForAll',
          args: [config.ENSCRIBE_CONTRACT, true],
          account: walletAddress,
        })
        const txReceipt = await waitForTransactionReceipt(walletClient, {
          hash: tx,
        })
      } else {
        const isWrapped = (await readContract(walletClient, {
          address: config.NAME_WRAPPER as `0x${string}`,
          abi: nameWrapperABI,
          functionName: 'isWrapped',
          args: [parentNode],
        })) as boolean

        tx = isWrapped
          ? await writeContract(walletClient, {
              address: config.NAME_WRAPPER as `0x${string}`,
              abi: nameWrapperABI,
              functionName: 'setApprovalForAll',
              args: [config.ENSCRIBE_CONTRACT, true],
              account: walletAddress,
            })
          : await writeContract(walletClient, {
              address: config.ENS_REGISTRY as `0x${string}`,
              abi: ensRegistryABI,
              functionName: 'setApprovalForAll',
              args: [config.ENSCRIBE_CONTRACT, true],
              account: walletAddress,
            })
        const txReceipt = await waitForTransactionReceipt(walletClient, {
          hash: tx,
        })
      }

      let contractType
      if (isOwnable) {
        contractType = 'Ownable'
      } else if (isReverseClaimable) {
        contractType = 'ReverseClaimer'
      } else {
        contractType = 'ReverseSetter'
      }
      await logMetric(
        corelationId,
        Date.now(),
        chainId,
        '',
        walletAddress,
        `${label}.${parentName}`,
        'grant::setApprovalForAll',
        tx,
        contractType,
        opType,
      )

      toast({
        title: 'Access Granted',
        description: `Operator role of ${parentName} given to Enscribe Contract`,
      })
      setOperatorAccess(true)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err?.message || 'Grant access failed',
      })
    } finally {
      setAccessLoading(false)
    }
  }

  const deployContract = async () => {
    if (!walletClient || !walletAddress) {
      console.log('wallet not connected')
      return
    }
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

    if (isReverseSetter) {
      const argsContainContractNameMatchingLabel =
        args.length > 0 &&
        args.find((arg) => arg.value == label + '.' + parentName) != undefined
      if (!argsContainContractNameMatchingLabel) {
        setError(
          'Contract name argument passed to a ReverseSetter contract should match label combined with parent name.',
        )
        return
      }
    }

    if (ensNameTaken) {
      setError('ENS name already used, please change label')
      return
    }
    if (!isValidBytecode) {
      setError(
        'Invalid contract bytecode. It does not extend Ownable/ReverseClaimable.',
      )
      return
    }

    if (!config) {
      console.error('Unsupported network')
      setError('Unsupported network')
    } else {
      setError('')
      console.log('Using Enscribe contract:', config.ENSCRIBE_CONTRACT)
    }

    let deployedAddr = ''

    try {
      setLoading(true)
      setError('')
      setTxHash('')

      if (!walletClient) {
        alert('Please connect your wallet first.')
        setLoading(false)
        return
      }

      const parentNode = getParentNode(parentName)

      const finalBytecode = encodeConstructorArgs(bytecode, args, setError)
      const steps: Step[] = []

      console.log('label - ', label)
      console.log('parentName - ', parentName)
      console.log('parentNode - ', parentNode)

      const txCost = (await readContract(walletClient, {
        address: config?.ENSCRIBE_CONTRACT as `0x${string}`,
        abi: enscribeContractABI,
        functionName: 'pricing',
        args: [],
      })) as bigint

      console.log('txCost - ', txCost)
      let name = `${label}.${parentName}`

      if (isOwnable) {
        if (parentType === 'web3labs') {
          steps.push({
            title: 'Deploy and Set Primary Name',
            action: async () => {
              // const txn = await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, {
              //     value: txCost
              // })
              const txn = await writeContract(walletClient, {
                address: config?.ENSCRIBE_CONTRACT as `0x${string}`,
                abi: enscribeContractABI,
                functionName: 'setNameAndDeploy',
                args: [finalBytecode, label, parentName, parentNode],
                value: txCost,
                account: walletAddress,
              })

              const txReceipt = await waitForTransactionReceipt(walletClient, {
                hash: txn,
              })
              const deployedContractAddress =
                await getDeployedAddress(txReceipt)
              if (deployedContractAddress) {
                await logMetric(
                  corelationId,
                  Date.now(),
                  chainId,
                  deployedContractAddress,
                  walletAddress,
                  name,
                  'setNameAndDeploy',
                  txn,
                  'Ownable',
                  opType,
                )
              }
              return txn
            },
          })
        } else if (
          chain?.id == CHAINS.BASE ||
          chain?.id == CHAINS.BASE_SEPOLIA
        ) {
          const isApprovedForAll = (await readContract(walletClient, {
            address: config?.ENS_REGISTRY as `0x${string}`,
            abi: ensRegistryABI,
            functionName: 'isApprovedForAll',
            args: [walletAddress, config?.ENSCRIBE_CONTRACT],
          })) as boolean

          if (!isApprovedForAll) {
            steps.push({
              title: 'Give operator access',
              action: async () => {
                const txn = await writeContract(walletClient, {
                  address: config?.ENS_REGISTRY as `0x${string}`,
                  abi: ensRegistryABI,
                  functionName: 'setApprovalForAll',
                  args: [config?.ENSCRIBE_CONTRACT, true],
                  account: walletAddress,
                })
                const txReceipt = await waitForTransactionReceipt(
                  walletClient,
                  {
                    hash: txn,
                  },
                )
                await logMetric(
                  corelationId,
                  Date.now(),
                  chainId,
                  '',
                  walletAddress,
                  name,
                  'setApprovalForAll',
                  txReceipt.transactionHash,
                  'Ownable',
                  opType,
                )
                return txn
              },
            })
          }

          steps.push({
            title: 'Deploy and Set primary Name',
            action: async () => {
              const txn = await writeContract(walletClient, {
                address: config?.ENSCRIBE_CONTRACT as `0x${string}`,
                abi: enscribeContractABI,
                functionName: 'setNameAndDeploy',
                args: [finalBytecode, label, parentName, parentNode],
                value: txCost,
                account: walletAddress,
              })
              const txReceipt = await waitForTransactionReceipt(walletClient, {
                hash: txn,
              })
              const deployedContractAddress =
                await getDeployedAddress(txReceipt)
              if (deployedContractAddress) {
                await logMetric(
                  corelationId,
                  Date.now(),
                  chainId,
                  deployedContractAddress,
                  walletAddress,
                  name,
                  'setNameAndDeploy',
                  txReceipt.transactionHash,
                  'Ownable',
                  opType,
                )
              }
              return txn
            },
          })
        } else {
          console.log("User's parent deployment type")
          const isWrapped = (await readContract(walletClient, {
            address: config?.NAME_WRAPPER as `0x${string}`,
            abi: nameWrapperABI,
            functionName: 'isWrapped',
            args: [parentNode],
          })) as boolean

          if (isWrapped) {
            // Wrapped Names
            console.log(`Wrapped detected.`)
            const isApprovedForAll = (await readContract(walletClient, {
              address: config?.NAME_WRAPPER as `0x${string}`,
              abi: nameWrapperABI,
              functionName: 'isApprovedForAll',
              args: [walletAddress, config?.ENSCRIBE_CONTRACT],
            })) as boolean

            if (!isApprovedForAll) {
              steps.push({
                title: 'Give operator access',
                action: async () => {
                  const txn = await writeContract(walletClient, {
                    address: config?.NAME_WRAPPER as `0x${string}`,
                    abi: nameWrapperABI,
                    functionName: 'setApprovalForAll',
                    args: [config?.ENSCRIBE_CONTRACT, true],
                    account: walletAddress,
                  })
                  const txReceipt = await waitForTransactionReceipt(
                    walletClient,
                    {
                      hash: txn,
                    },
                  )
                  await logMetric(
                    corelationId,
                    Date.now(),
                    chainId,
                    '',
                    walletAddress,
                    name,
                    'setApprovalForAll',
                    txReceipt.transactionHash,
                    'Ownable',
                    opType,
                  )
                  return txn
                },
              })
            }
          } else {
            //Unwrapped Names
            console.log(`Unwrapped detected.`)
            const isApprovedForAll = (await readContract(walletClient, {
              address: config?.ENS_REGISTRY as `0x${string}`,
              abi: ensRegistryABI,
              functionName: 'isApprovedForAll',
              args: [walletAddress, config?.ENSCRIBE_CONTRACT],
            })) as boolean

            if (!isApprovedForAll) {
              steps.push({
                title: 'Give operator access',
                action: async () => {
                  const txn = await writeContract(walletClient, {
                    address: config?.ENS_REGISTRY as `0x${string}`,
                    abi: ensRegistryABI,
                    functionName: 'setApprovalForAll',
                    args: [config?.ENSCRIBE_CONTRACT, true],
                    account: walletAddress,
                  })
                  const txReceipt = await waitForTransactionReceipt(
                    walletClient,
                    {
                      hash: txn,
                    },
                  )
                  await logMetric(
                    corelationId,
                    Date.now(),
                    chainId,
                    '',
                    walletAddress,
                    name,
                    'setApprovalForAll',
                    txReceipt.transactionHash,
                    'Ownable',
                    opType,
                  )
                  return txn
                },
              })
            }
          }

          steps.push({
            title: 'Deploy and Set primary Name',
            action: async () => {
              const txn = await writeContract(walletClient, {
                address: config?.ENSCRIBE_CONTRACT as `0x${string}`,
                abi: enscribeContractABI,
                functionName: 'setNameAndDeploy',
                args: [finalBytecode, label, parentName, parentNode],
                value: txCost,
                account: walletAddress,
              })
              const txReceipt = await waitForTransactionReceipt(walletClient, {
                hash: txn,
              })
              const deployedContractAddress =
                await getDeployedAddress(txReceipt)
              if (deployedContractAddress) {
                await logMetric(
                  corelationId,
                  Date.now(),
                  chainId,
                  deployedContractAddress,
                  walletAddress,
                  name,
                  'setNameAndDeploy',
                  txReceipt.transactionHash,
                  'Ownable',
                  opType,
                )
              }
              return txn
            },
          })
        }

        setModalTitle('Deploy Contract and set Primary Name')
        setModalSubtitle('Running each step to finish naming this contract')
        setModalSteps(steps)
        setModalOpen(true)
      } else if (isReverseClaimable) {
        if (isReverseSetter) {
          // step 1: Get operator access
          const isWrapped = (await readContract(walletClient, {
            address: config?.NAME_WRAPPER as `0x${string}`,
            abi: nameWrapperABI,
            functionName: 'isWrapped',
            args: [parentNode],
          })) as boolean

          if (isWrapped) {
            // Wrapped Names
            console.log(`Wrapped detected.`)
            const isApprovedForAll = (await readContract(walletClient, {
              address: config?.NAME_WRAPPER as `0x${string}`,
              abi: nameWrapperABI,
              functionName: 'isApprovedForAll',
              args: [walletAddress, config?.ENSCRIBE_CONTRACT],
            })) as boolean

            if (!isApprovedForAll) {
              steps.push({
                title: 'Give operator access',
                action: async () => {
                  const txn = await writeContract(walletClient, {
                    address: config?.NAME_WRAPPER as `0x${string}`,
                    abi: nameWrapperABI,
                    functionName: 'setApprovalForAll',
                    args: [config?.ENSCRIBE_CONTRACT, true],
                    account: walletAddress,
                  })
                  const txReceipt = await waitForTransactionReceipt(
                    walletClient,
                    {
                      hash: txn,
                    },
                  )
                  await logMetric(
                    corelationId,
                    Date.now(),
                    chainId,
                    '',
                    walletAddress,
                    name,
                    'setApprovalForAll',
                    txReceipt.transactionHash,
                    'ReverseSetter',
                    opType,
                  )
                  return txn
                },
              })
            }
          } else {
            //Unwrapped Names
            console.log(`Unwrapped detected.`)
            const isApprovedForAll = (await readContract(walletClient, {
              address: config?.ENS_REGISTRY as `0x${string}`,
              abi: ensRegistryABI,
              functionName: 'isApprovedForAll',
              args: [walletAddress, config?.ENSCRIBE_CONTRACT],
            })) as boolean

            if (!isApprovedForAll) {
              steps.push({
                title: 'Give operator access',
                action: async () => {
                  const txn = await writeContract(walletClient, {
                    address: config?.ENS_REGISTRY as `0x${string}`,
                    abi: ensRegistryABI,
                    functionName: 'setApprovalForAll',
                    args: [config?.ENSCRIBE_CONTRACT, true],
                    account: walletAddress,
                  })

                  const txReceipt = await waitForTransactionReceipt(
                    walletClient,
                    {
                      hash: txn,
                    },
                  )
                  await logMetric(
                    corelationId,
                    Date.now(),
                    chainId,
                    '',
                    walletAddress,
                    name,
                    'setApprovalForAll',
                    txReceipt.transactionHash,
                    'ReverseSetter',
                    opType,
                  )
                  return txn
                },
              })
            }
          }

          // step 2: set name & deploy contract via enscribe contract
          steps.push({
            title: 'Set name & Deploy contract',
            action: async () => {
              const txn = await writeContract(walletClient, {
                address: config?.ENSCRIBE_CONTRACT as `0x${string}`,
                abi: enscribeContractABI,
                functionName: 'setNameAndDeployReverseSetter',
                args: [finalBytecode, label, parentName, parentNode],
                value: txCost,
                account: walletAddress,
              })
              setTxHash(txn)

              const txReceipt = await waitForTransactionReceipt(walletClient, {
                hash: txn,
              })
              const deployedContractAddress =
                await getDeployedAddress(txReceipt)
              if (deployedContractAddress) {
                setDeployedAddress(deployedContractAddress)
                await logMetric(
                  corelationId,
                  Date.now(),
                  chainId,
                  deployedContractAddress,
                  walletAddress,
                  name,
                  'setNameAndDeployReverseSetter',
                  txReceipt.transactionHash,
                  'ReverseSetter',
                  opType,
                )
              }
              return txn
            },
          })
        } else {
          // default ReverseClaimable flow
          // step 1: Get operator access
          const isWrapped = (await readContract(walletClient, {
            address: config?.NAME_WRAPPER as `0x${string}`,
            abi: nameWrapperABI,
            functionName: 'isWrapped',
            args: [parentNode],
          })) as boolean

          if (isWrapped) {
            // Wrapped Names
            console.log(`Wrapped detected.`)
            const isApprovedForAll = (await readContract(walletClient, {
              address: config?.NAME_WRAPPER as `0x${string}`,
              abi: nameWrapperABI,
              functionName: 'isApprovedForAll',
              args: [walletAddress, config?.ENSCRIBE_CONTRACT],
            })) as boolean

            if (!isApprovedForAll) {
              steps.push({
                title: 'Give operator access',
                action: async () => {
                  const txn = await writeContract(walletClient, {
                    address: config?.NAME_WRAPPER as `0x${string}`,
                    abi: nameWrapperABI,
                    functionName: 'setApprovalForAll',
                    args: [config?.ENSCRIBE_CONTRACT, true],
                    account: walletAddress,
                  })
                  const txReceipt = await waitForTransactionReceipt(
                    walletClient,
                    {
                      hash: txn,
                    },
                  )
                  await logMetric(
                    corelationId,
                    Date.now(),
                    chainId,
                    '',
                    walletAddress,
                    name,
                    'setApprovalForAll',
                    txReceipt.transactionHash,
                    'ReverseClaimer',
                    opType,
                  )
                  return txn
                },
              })
            }
          } else {
            //Unwrapped Names
            console.log(`Unwrapped detected.`)
            const isApprovedForAll = (await readContract(walletClient, {
              address: config?.ENS_REGISTRY as `0x${string}`,
              abi: ensRegistryABI,
              functionName: 'isApprovedForAll',
              args: [walletAddress, config?.ENSCRIBE_CONTRACT],
            })) as boolean

            if (!isApprovedForAll) {
              steps.push({
                title: 'Give operator access',
                action: async () => {
                  const txn = await writeContract(walletClient, {
                    address: config?.ENS_REGISTRY as `0x${string}`,
                    abi: ensRegistryABI,
                    functionName: 'setApprovalForAll',
                    args: [config?.ENSCRIBE_CONTRACT, true],
                    account: walletAddress,
                  })
                  const txReceipt = await waitForTransactionReceipt(
                    walletClient,
                    {
                      hash: txn,
                    },
                  )

                  await logMetric(
                    corelationId,
                    Date.now(),
                    chainId,
                    '',
                    walletAddress,
                    name,
                    'setApprovalForAll',
                    txReceipt.transactionHash,
                    'ReverseClaimer',
                    opType,
                  )
                  return txn
                },
              })
            }
          }

          // step 2: set name & deploy contract via enscribe contract
          steps.push({
            title: 'Set name & Deploy contract',
            action: async () => {
              const txn = await writeContract(walletClient, {
                address: config?.ENSCRIBE_CONTRACT as `0x${string}`,
                abi: enscribeContractABI,
                functionName: 'setNameAndDeployReverseClaimer',
                args: [finalBytecode, label, parentName, parentNode],
                value: txCost,
                account: walletAddress,
              })
              setTxHash(txn)

              const txReceipt = await waitForTransactionReceipt(walletClient, {
                hash: txn as `0x${string}`,
              })
              const deployedContractAddress =
                await getDeployedAddress(txReceipt)
              if (deployedContractAddress) {
                setDeployedAddress(deployedContractAddress)
                await logMetric(
                  corelationId,
                  Date.now(),
                  chainId,
                  deployedContractAddress,
                  walletAddress,
                  name,
                  'setNameAndDeployReverseClaimer',
                  txReceipt.transactionHash,
                  'ReverseClaimer',
                  opType,
                )
              }
              return txn
            },
          })
        }

        setModalTitle('Deploy Contract and set Primary Name')
        setModalSubtitle('Complete each step to finish naming this contract')
        setModalSteps(steps)
        setModalOpen(true)
      }
    } catch (err: any) {
      if (!isEmpty(deployedAddr)) {
        setError(
          "Your contract was deployed but the name wasn\'t set properly. Please use the 'Name Existing Contract' page to set the name of the contract. If you attempt to retry on this page, your contract will get deployed again with a different address.",
        )
      }
      setError(err?.code || 'Error deploying contract')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl p-8">
      <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">
        Deploy New Contract
      </h2>
      {!isConnected && (
        <p className="text-red-500">Please connect your wallet.</p>
      )}

      <div className="space-y-6 mt-6">
        <label className="block text-gray-700 dark:text-gray-300">
          Bytecode
        </label>
        <Input
          type="text"
          value={bytecode}
          onChange={(e) => {
            setBytecode(e.target.value)
            setIsOwnable(checkIfOwnable(e.target.value))
            setIsReverseClaimable(checkIfReverseClaimable(e.target.value))
          }}
          onBlur={() => {
            if (bytecode && !bytecode.startsWith('0x')) {
              setBytecode('0x' + bytecode)
            }
            setIsOwnable(checkIfOwnable(bytecode))
            setIsReverseClaimable(checkIfReverseClaimable(bytecode))
          }}
          placeholder="0x60037..."
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 ${
            !isValidBytecode ? 'border-red-500' : ''
          }`}
        />

        {/* Error message for invalid Ownable bytecode */}
        {!isValidBytecode && bytecode.length > 0 && (
          <p className="text-red-500">
            Invalid contract bytecode. It does not extend
            Ownable/ReverseClaimable.
          </p>
        )}

        {
          <>
            <div className="justify-between">
              {isOwnable && (
                <>
                  <CheckCircleIcon className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer" />
                  <p className="ml-1 text-gray-700 inline">
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
              {isReverseClaimable && (
                <>
                  <CheckCircleIcon className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer" />
                  <p className="ml-1 text-gray-700 inline">
                    Contract is either{' '}
                    <Link
                      href="https://docs.ens.domains/web/naming-contracts#reverseclaimersol"
                      className="text-blue-600 hover:underline"
                    >
                      ReverseClaimable
                    </Link>{' '}
                    or{' '}
                    <Link
                      href="https://docs.ens.domains/web/naming-contracts/#set-a-name-in-the-constructor"
                      className="text-blue-600 hover:underline"
                    >
                      ReverseSetter
                    </Link>
                  </p>
                </>
              )}
            </div>
          </>
        }

        {isReverseClaimable && (
          <>
            <div className={'flex'}>
              <Input
                type={'checkbox'}
                className={'w-4 h-4 mt-1'}
                checked={isReverseSetter}
                onChange={(e) => {
                  setIsReverseSetter(!isReverseSetter)
                }}
              />
              <label className="ml-1.5 text-gray-700 dark:text-gray-300">
                My contract is a{' '}
                <Link
                  href="https://docs.ens.domains/web/naming-contracts/#set-a-name-in-the-constructor"
                  className="text-blue-600 hover:underline"
                >
                  ReverseSetter
                </Link>{' '}
                (This will deploy & set the name of the contract using different
                steps than ReverseClaimable)
              </label>
            </div>
          </>
        )}

        <label className="block text-gray-700 dark:text-gray-300 mt-6">
          Paste ABI JSON (Optional)
        </label>
        <Textarea
          rows={3}
          className="w-full border rounded-lg p-3 text-sm bg-white dark:bg-gray-700 dark:text-white text-gray-900"
          placeholder="[{'inputs':[{'internalType':'string','name':'greet','type':'string'}],'type':'constructor'}]"
          value={abiText}
          onChange={(e) => {
            const value = e.target.value
            setAbiText(value)
            handleAbiInput(value)
          }}
        />

        {/* Render dynamic constructor args */}
        <label className="block text-gray-700 dark:text-gray-300 mt-6">
          Constructor Arguments
        </label>
        {args.map((arg, index) => (
          <div key={index} className="mb-4">
            <label className="block text-gray-700 dark:text-gray-300">
              {arg.label || `Argument ${index + 1}`}
            </label>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              {!arg.isCustom ? (
                <Select
                  value={arg.type}
                  onValueChange={(value) => {
                    if (value === 'custom') {
                      updateArg(index, { isCustom: true, type: '' })
                    } else {
                      updateArg(index, { type: value, isCustom: false })
                    }
                  }}
                >
                  <SelectTrigger className="bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
                    <SelectValue className="text-gray-900" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-gray-900 border border-gray-300 rounded-md">
                    {commonTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="text"
                  value={arg.type}
                  onChange={(e) => updateArg(index, { type: e.target.value })}
                  placeholder="Enter custom type (e.g. tuple(string,uint256))"
                  className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                />
              )}

              <Input
                type="text"
                value={arg.value}
                onChange={(e) => updateArg(index, { value: e.target.value })}
                placeholder={
                  arg.type.includes('tuple') && arg.type.includes('[]')
                    ? '[["name", 10, "0x..."], ["bob", 20, "0x..."]]'
                    : arg.type.includes('tuple')
                      ? '["name", 10, "0x..."]'
                      : 'Enter value'
                }
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              />
              <Button
                type="button"
                onClick={() => removeArg(index)}
                variant="destructive"
                className="mt-2 md:mt-0"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          onClick={addArg}
          className="bg-gray-900 text-white mt-3"
        >
          + Add Argument
        </Button>

        <label className="block text-gray-700 dark:text-gray-300">
          Contract Name
        </label>

        <div className={'flex items-center space-x-2'}>
          <Input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value)
              setError('')
            }}
            onBlur={checkENSReverseResolution}
            placeholder="my label"
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
              fetchUserOwnedDomains()
              setShowENSModal(true)
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
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={parentName}
                onChange={(e) => {
                  setParentName(e.target.value)
                  setOperatorAccess(false)
                  setRecordExists(false)
                }}
                onBlur={async () => {
                  const exist = await recordExist(parentName)
                  setRecordExists(exist)

                  const approved = await checkOperatorAccess(parentName)
                  console.log(
                    'Operator check for ',
                    parentName,
                    ' is ',
                    approved,
                  )
                  setOperatorAccess(approved)
                }}
                placeholder="mydomain.eth"
                className="flex-1 px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              />
              <Button
                onClick={() => setShowENSModal(true)}
                className="bg-gray-900 text-white"
              >
                Choose ENS
              </Button>

              {operatorAccess && recordExists && (
                <Button
                  variant="destructive"
                  disabled={accessLoading}
                  onClick={revokeOperatorAccess}
                >
                  {accessLoading ? 'Revoking...' : 'Revoke Access'}
                </Button>
              )}

              {!operatorAccess && recordExists && (
                <Button disabled={accessLoading} onClick={grantOperatorAccess}>
                  {accessLoading ? 'Granting...' : 'Grant Access'}
                </Button>
              )}
            </div>

            {/* Access Info Message */}
            {((operatorAccess && recordExists) ||
              (!operatorAccess && recordExists)) &&
              !fetchingENS && (
                <p className="text-sm text-yellow-600 mt-2">
                  {operatorAccess ? (
                    'Note: You can revoke Operator role from Enscribe here.'
                  ) : (
                    <p className="text-yellow-600">
                      Note: You can grant Operator role to Enscribe through
                      here, otherwise Enscribe will ask you to grant operator
                      access during deployment.{' '}
                      <Link
                        href="https://www.enscribe.xyz/docs/getting-started/opearator-role"
                        className="text-blue-600 hover:underline"
                      >
                        Why Operator Access is needed?
                      </Link>
                    </p>
                  )}
                </p>
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

      <Button
        onClick={deployContract}
        disabled={!isConnected || loading || !isValidBytecode}
        className="w-full mt-6"
      >
        {loading ? (
          <svg
            className="animate-spin h-5 w-5 mr-3 text-white"
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
        ) : (
          'Deploy'
        )}
      </Button>

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
            // Reset form after successful deployment
            setBytecode('')
            setLabel('')
            setParentType('web3labs')
            setParentName(enscribeDomain)
            setArgs([])
            setAbiText('')
          }

          setIsReverseClaimable(false)
          setIsReverseSetter(false)
          setIsOwnable(false)
        }}
        title={modalTitle}
        subtitle={modalSubtitle}
        steps={modalSteps}
        contractAddress={deployedAddress}
        ensName={`${label}.${parentName}`}
      />
    </div>
  )
}
