import React, { useEffect, useState } from 'react'
import { ethers, namehash } from 'ethers'
import { wagmiConfig } from "@/pages/_app";
import contractABI from '../contracts/Enscribe'
import ensRegistryABI from '../contracts/ENSRegistry'
import nameWrapperABI from '../contracts/NameWrapper'
import { useAccount, useWalletClient, } from 'wagmi'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast"
import parseJson from 'json-parse-safe'
import { CHAINS, CONTRACTS, NAME_GEN_URL, TOPIC0 } from '../utils/constants';
import SetNameStepsModal, { Step } from './SetNameStepsModal';
import { CheckCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { v4 as uuid } from 'uuid'
import { fetchGeneratedName, logMetric } from "@/components/componentUtils";
import { string } from "postcss-selector-parser";

const OWNABLE_FUNCTION_SELECTORS = [
    "8da5cb5b",  // owner()
    "f2fde38b",  // transferOwnership(address)
];

const ADDR_REVERSE_NODE = "91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2"

const commonTypes = [
    "string",
    "uint8",
    "uint256",
    "address",
    "bool",
    "bytes",
    "bytes32",
    "string[]",
    "uint256[]",
    "tuple(address, uint256)"
]

type ConstructorArg = {
    type: string
    value: string
    isCustom: boolean
    isTuple?: boolean
    label?: string
}

const opType = "deployandname"

const checkIfOwnable = (bytecode: string): boolean => {
    return OWNABLE_FUNCTION_SELECTORS.every(selector => bytecode.includes(selector));
};

const checkIfReverseClaimable = (bytecode: string): boolean => {
    console.log("bytecode is rc? " + bytecode.includes(ADDR_REVERSE_NODE));
    return bytecode.includes(ADDR_REVERSE_NODE)
};

export default function DeployForm() {
    const { address, isConnected, chain } = useAccount()
    const { data: walletClient } = useWalletClient()
    const signer = walletClient ? new ethers.BrowserProvider(window.ethereum).getSigner() : null

    const config = chain?.id ? CONTRACTS[chain.id] : undefined;
    const enscribeDomain = config?.ENSCRIBE_DOMAIN!
    const etherscanUrl = config?.ETHERSCAN_URL!
    const ensAppUrl = config?.ENS_APP_URL!

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
    const [abiText, setAbiText] = useState("")
    const [recordExists, setRecordExists] = useState(true);
    const [accessLoading, setAccessLoading] = useState(false)

    const [modalOpen, setModalOpen] = useState(false);
    const [modalSteps, setModalSteps] = useState<Step[]>([]);
    const [modalTitle, setModalTitle] = useState('');
    const [modalSubtitle, setModalSubtitle] = useState('');

    const [userOwnedDomains, setUserOwnedDomains] = useState<string[]>([]);
    const [showENSModal, setShowENSModal] = useState(false);

    const corelationId = uuid()

    const getParentNode = (name: string) => {
        try {
            return namehash(name)
        } catch (error) {
            return ""
        }
    }

    useEffect(() => {
        if (parentType === 'web3labs' && config?.ENSCRIBE_DOMAIN) {
            setParentName(config.ENSCRIBE_DOMAIN)
        }
    }, [config, parentType])

    useEffect(() => {
        if (bytecode.length > 0) {
            setIsOwnable(checkIfOwnable(bytecode))
            setIsReverseClaimable(checkIfReverseClaimable(bytecode))
            setIsValidBytecode(checkIfOwnable(bytecode) || checkIfReverseClaimable(bytecode))
        }
    }, [bytecode])

    const populateName = async () => {
        const name = await fetchGeneratedName();
        setLabel(name)
    }

    // set label when component mounts
    useEffect(() => {
        populateName()
    }, []);

    const addArg = () =>
        setArgs([...args, { type: "string", value: "", isCustom: false }])

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
        return (value == null || value.trim().length === 0);
    }

    const handleAbiInput = (text: string) => {
        if (text.trim().length === 0) {
            setArgs([])
            setError("")
            return
        }

        try {
            const { value: parsed, error } = parseJson(text)

            if (error || !parsed) {
                console.log("Invalid ABI")
                setArgs([])
                setError("Invalid ABI JSON. Please paste a valid ABI array.")
            } else {
                parseConstructorInputs(parsed)
                setError("")
            }

        } catch (err) {
            console.error("Invalid ABI JSON:", err)
            setArgs([])
            setError("Invalid ABI JSON. Please paste a valid ABI array.")
        }
    }

    const parseConstructorInputs = (abi: any[]) => {
        try {
            const constructor = abi.find((item) => item.type === "constructor")
            if (!constructor || !constructor.inputs) {
                setArgs([])
                return
            }

            const generatedArgs = constructor.inputs.map((input: any) => {
                let type = input.type

                // Handle tuples (structs)
                if (type === "tuple" && input.components) {
                    const componentTypes = input.components.map((c: any) => c.type).join(",")
                    type = `tuple(${componentTypes})`
                }

                // Handle arrays (including tuple arrays)
                if (type.includes("[]")) {
                    if (input.components) {
                        const componentTypes = input.components.map((c: any) => c.type).join(",")
                        type = `tuple(${componentTypes})[]`
                    }
                }

                return {
                    type,
                    value: "",
                    isCustom: !commonTypes.includes(type),
                    isTuple: type.startsWith("tuple"),
                    label: input.name || ""
                }
            })

            setArgs(generatedArgs)
        } catch (err) {

        }
    }


    const encodeConstructorArgs = () => {
        try {
            const types = args.map((arg) => arg.type)
            const values = args.map((arg) => {
                try {
                    if (
                        arg.type.startsWith("tuple") ||
                        arg.type.endsWith("[]") ||
                        arg.type === "bool" ||
                        arg.type.startsWith("uint") ||
                        arg.type === "int" ||
                        arg.type.startsWith("int")
                    ) {
                        return JSON.parse(arg.value)
                    }

                    // For address and string types, return as-is
                    return arg.value
                } catch (parseErr) {
                    console.error(`Failed to parse value for type ${arg.type}:`, arg.value)
                    throw new Error(`Invalid value for argument ${arg.label || arg.type}`)
                }
            })

            const encoded = ethers.AbiCoder.defaultAbiCoder().encode(types, values)
            return ethers.hexlify(ethers.concat([bytecode, encoded]))
        } catch (err) {
            console.error("Error encoding constructor args:", err)
            setError("Error encoding constructor arguments. Please check your inputs.")
            return bytecode
        }
    }

    // const fetchPrimaryENS = async () => {
    //     if (!signer || !address) return

    //     const provider = (await signer).provider
    //     setFetchingENS(true)
    //     if (chain?.id === CHAINS.MAINNET || chain?.id === CHAINS.SEPOLIA) {
    //         try {
    //             const ensName = await provider.lookupAddress(address)
    //             if (ensName) {
    //                 setParentName(ensName)
    //             } else {
    //                 setParentName("")
    //             }
    //         } catch (error) {
    //             console.error("Error fetching ENS name:", error)
    //             setParentName("")
    //         }
    //     } else {
    //         try {
    //             const reverseRegistrarContract = new ethers.Contract(config?.REVERSE_REGISTRAR!, ["function node(address) view returns (bytes32)"], (await signer)?.provider);
    //             const reversedNode = await reverseRegistrarContract.node(address)
    //             const resolverContract = new ethers.Contract(config?.PUBLIC_RESOLVER!, ["function name(bytes32) view returns (string)"], (await signer)?.provider);
    //             const ensName = await resolverContract.name(reversedNode)
    //             if (ensName) {
    //                 setParentName(ensName)
    //             } else {
    //                 setParentName("")
    //             }
    //         } catch (error) {
    //             console.error("Error fetching ENS name:", error)
    //             setParentName("")
    //         }
    //     }

    //     setFetchingENS(false)
    //     const approved = await checkOperatorAccess()
    //     setOperatorAccess(approved)

    // }

    const fetchUserOwnedDomains = async () => {
        if (!address || !config) {
            console.warn('Address or chain configuration is missing');
            return;
        }

        if (!config.SUBGRAPH_API) {
            console.warn('No subgraph API endpoint configured for this chain');
            return;
        }

        try {
            setFetchingENS(true);
            const response = await fetch(config.SUBGRAPH_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
                },
                body: JSON.stringify({
                    query: `query getDomainsForAccount { domains(where: { owner: "${address.toLowerCase()}" }) { name } }`
                })
            });

            const data = await response.json();

            if (data.data && data.data.domains) {
                const domains = data.data.domains.map((domain: { name: string }) => domain.name);

                // Filter out .addr.reverse names
                const filteredDomains = domains.filter(domain => !domain.endsWith('.addr.reverse'));

                // Process domains with labelhashes
                const processedDomains = await Promise.all(filteredDomains.map(async (domain) => {
                    // Check if any part of the domain name contains a labelhash (looks like a hex string)
                    const parts = domain.split('.');
                    const processedParts = await Promise.all(parts.map(async (part) => {
                        // Check if the part looks like a labelhash in square brackets [hexstring]
                        const bracketMatch = part.match(/^\[([0-9a-f]{64})\]$/i);
                        if (bracketMatch) {
                            const labelHash = bracketMatch[1];
                            try {
                                // Call the ENS Rainbow API to heal the labelhash (adding 0x prefix)
                                const healResponse = await fetch(`https://api.ensrainbow.io/v1/heal/0x${labelHash}`);
                                const healData = await healResponse.json();

                                if (healData.status === 'success' && healData.label) {
                                    return healData.label;
                                }
                            } catch (error) {
                                console.error(`Error healing labelhash ${labelHash}:`, error);
                            }
                        }
                        return part;
                    }));
                    return processedParts.join('.');

                }));

                // Sort domains by level depth (2LDs first, then 3LDs, etc.) and put domains with labelhashes at the end
                const sortedDomains = processedDomains.sort((a, b) => {
                    // Check if domain contains a labelhash (unresolved)
                    const aHasLabelhash = a.includes('[') && a.includes(']');
                    const bHasLabelhash = b.includes('[') && b.includes(']');

                    // If one has a labelhash and the other doesn't, the one with labelhash goes last
                    if (aHasLabelhash && !bHasLabelhash) return 1;
                    if (!aHasLabelhash && bHasLabelhash) return -1;

                    // If both have or don't have labelhashes, sort by domain level depth
                    const aDepth = a.split('.').length;
                    const bDepth = b.split('.').length;

                    return aDepth - bDepth; // Sort by ascending depth (2LDs first, then 3LDs, etc.)
                });

                setUserOwnedDomains(sortedDomains);
                console.log("Fetched and processed user owned domains:", sortedDomains);
            }
        } catch (error) {
            console.error("Error fetching user's owned ENS domains:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to fetch your owned ENS domains"
            });
        } finally {
            setFetchingENS(false)
        }
    }

    const checkENSReverseResolution = async () => {
        if (!signer) return


        // Validate label and parent name before checking
        if (!label.trim()) {
            setError("Label cannot be empty")
            setEnsNameTaken(false)
            return
        }
        if (!parentName.trim()) {
            setError("Parent name cannot be empty")
            setEnsNameTaken(false)
            return
        }

        if (label.includes(".")) {
            setError("Can't include '.' in label name")
            return
        }

        let resolvedAddress
        try {
            const provider = (await signer).provider
            const fullEnsName = `${label}.${parentName}`
            resolvedAddress = await provider.resolveName(fullEnsName)
        } catch (err) {
            console.error("Error checking ENS name:", err)
            setError("")
            setEnsNameTaken(false)
        } finally {
            if (resolvedAddress) {
                setEnsNameTaken(true)
                setError("ENS name already used, please change label")
            } else {
                setEnsNameTaken(false)
                setError("")
            }
        }

    }

    const processResult = async (txHash: string) => {
        const txReceipt = await (await signer)!.provider.getTransactionReceipt(txHash)
        setTxHash(txReceipt!.hash)
        if (!isReverseClaimable) {
            const matchingLog = txReceipt!.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
            const deployedContractAddress = ethers.getAddress("0x" + matchingLog!.topics[1].slice(-40))
            setDeployedAddress(deployedContractAddress)
        }
    }

    const recordExist = async (name: string): Promise<boolean> => {
        if (!signer) return false
        try {
            const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, (await signer))
            const parentNode = getParentNode(name)

            if (!(await ensRegistryContract.recordExists(parentNode))) return false

            return true
        } catch (err) {
            return false
        }
    }

    const checkOperatorAccess = async (name: string): Promise<boolean> => {
        if (!signer || !address || !config?.ENS_REGISTRY || !config?.ENSCRIBE_CONTRACT || !name) return false;

        try {
            const ensRegistryContract = new ethers.Contract(config.ENS_REGISTRY, ensRegistryABI, await signer)
            const parentNode = getParentNode(name)
            // First check if the record exists
            if (!(await ensRegistryContract.recordExists(parentNode))) return false;

            var nameWrapperContract: ethers.Contract | null = null;
            if (chain?.id != CHAINS.BASE && chain?.id != CHAINS.BASE_SEPOLIA) {
                nameWrapperContract = new ethers.Contract(config.NAME_WRAPPER!, nameWrapperABI, await signer)
            }

            let approved = false;
            if (chain?.id == CHAINS.BASE || chain?.id == CHAINS.BASE_SEPOLIA) {
                approved = await ensRegistryContract.isApprovedForAll(address, config.ENSCRIBE_CONTRACT);
            } else {
                const isWrapped = await nameWrapperContract?.isWrapped(parentNode);
                if (isWrapped) {
                    // Wrapped Names
                    console.log(`Wrapped detected.`);
                    approved = await nameWrapperContract?.isApprovedForAll(address, config.ENSCRIBE_CONTRACT!);
                } else {
                    //Unwrapped Names
                    console.log(`Unwrapped detected.`);
                    approved = await ensRegistryContract.isApprovedForAll(address, config.ENSCRIBE_CONTRACT!);
                }
            }
            return approved;
        } catch (err) {
            console.error("Approval check failed:", err)
            return false
        }
    }

    const revokeOperatorAccess = async () => {
        if (!signer || !address || !config?.ENS_REGISTRY || !config?.ENSCRIBE_CONTRACT || !getParentNode(parentName)) return;

        setAccessLoading(true)

        try {
            const ensRegistryContract = new ethers.Contract(config.ENS_REGISTRY, ensRegistryABI, await signer)
            const parentNode = getParentNode(parentName)
            if (!(await recordExist(parentName))) return;

            let tx;

            if (chain?.id == CHAINS.BASE || chain?.id == CHAINS.BASE_SEPOLIA) {
                tx = await ensRegistryContract.setApprovalForAll(config.ENSCRIBE_CONTRACT, false);
            } else {
                const nameWrapperContract = new ethers.Contract(config.NAME_WRAPPER, nameWrapperABI, await signer)
                const isWrapped = await nameWrapperContract.isWrapped(parentNode)

                tx = isWrapped
                    ? await nameWrapperContract.setApprovalForAll(config.ENSCRIBE_CONTRACT, false)
                    : await ensRegistryContract.setApprovalForAll(config.ENSCRIBE_CONTRACT, false);
            }

            await tx.wait()
            const txReceipt = await tx.wait()
            let contractType;
            if (isOwnable) {
                contractType = 'Ownable';
            } else if (isReverseClaimable) {
                contractType = 'ReverseClaimer';
            } else {
                contractType = 'ReverseSetter';
            }
            await logMetric(
                corelationId,
                Date.now(),
                chainId,
                '',
                (await signer).address,
                `${label}.${parentName}`,
                'revoke::setApprovalForAll',
                txReceipt.hash,
                contractType,
                opType);

            toast({
                title: "Access Revoked",
                description: `Operator role of ${parentName} revoked from Enscribe Contract`
            })
            setOperatorAccess(false)
        } catch (err: any) {
            toast({ variant: "destructive", title: "Error", description: err?.message || "Revoke access failed" })
        } finally {
            setAccessLoading(false)
        }
    }

    const grantOperatorAccess = async () => {
        if (!signer || !address || !config?.ENS_REGISTRY || !config?.ENSCRIBE_CONTRACT || !getParentNode(parentName)) return;

        setAccessLoading(true)

        try {
            const ensRegistryContract = new ethers.Contract(config.ENS_REGISTRY, ensRegistryABI, await signer)
            const parentNode = getParentNode(parentName)
            if (!(await recordExist(parentName))) return;

            let tx;

            if (chain?.id == CHAINS.BASE || chain?.id == CHAINS.BASE_SEPOLIA) {
                tx = await ensRegistryContract.setApprovalForAll(config.ENSCRIBE_CONTRACT, true);
            } else {
                const nameWrapperContract = new ethers.Contract(config.NAME_WRAPPER, nameWrapperABI, await signer)
                const isWrapped = await nameWrapperContract.isWrapped(parentNode)

                tx = isWrapped
                    ? await nameWrapperContract.setApprovalForAll(config.ENSCRIBE_CONTRACT, true)
                    : await ensRegistryContract.setApprovalForAll(config.ENSCRIBE_CONTRACT, true);
            }

            await tx.wait()
            const txReceipt = await tx.wait()
            let contractType;
            if (isOwnable) {
                contractType = 'Ownable';
            } else if (isReverseClaimable) {
                contractType = 'ReverseClaimer';
            } else {
                contractType = 'ReverseSetter';
            }
            await logMetric(
                corelationId,
                Date.now(),
                chainId,
                '',
                (await signer).address,
                `${label}.${parentName}`,
                'grant::setApprovalForAll',
                txReceipt.hash,
                contractType,
                opType);

            toast({ title: "Access Granted", description: `Operator role of ${parentName} given to Enscribe Contract` })
            setOperatorAccess(true)
        } catch (err: any) {
            toast({ variant: "destructive", title: "Error", description: err?.message || "Grant access failed" })
        } finally {
            setAccessLoading(false)
        }
    }


    const deployContract = async () => {
        if (!label.trim()) {
            setError("Label cannot be empty")
            return
        }
        if (label.includes(".")) {
            setError("Can't include '.' in label name")
            return
        }
        if (!parentName.trim()) {
            setError("Parent name cannot be empty")
            return
        }

        if (isReverseSetter) {
            const argsContainContractNameMatchingLabel = args.length > 0 && args.find((arg) => arg.value == label + "." + parentName) != undefined
            if (!argsContainContractNameMatchingLabel) {
                setError("Contract name argument passed to a ReverseSetter contract should match label combined with parent name.")
                return
            }
        }

        if (ensNameTaken) {
            setError("ENS name already used, please change label")
            return
        }
        if (!isValidBytecode) {
            setError('Invalid contract bytecode. It does not extend Ownable/ReverseClaimable.')
            return
        }

        if (!config) {
            console.error("Unsupported network");
            setError("Unsupported network")
        } else {
            setError("")
            console.log("Using Enscribe contract:", config.ENSCRIBE_CONTRACT);
        }

        let deployedAddr = '';


        try {
            setLoading(true)
            setError('')
            setTxHash('')

            if (!signer) {
                alert('Please connect your wallet first.')
                setLoading(false)
                return
            }

            const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, (await signer))
            const namingContract = new ethers.Contract(config?.ENSCRIBE_CONTRACT!, contractABI, (await signer))
            const parentNode = getParentNode(parentName)
            var nameWrapperContract: ethers.Contract | null = null;
            if (chain?.id != 84532 && chain?.id != 8453) {
                nameWrapperContract = new ethers.Contract(config?.NAME_WRAPPER!, nameWrapperABI, (await signer))
            }

            const finalBytecode = encodeConstructorArgs()
            const steps: Step[] = []

            console.log("label - ", label)
            console.log("parentName - ", parentName)
            console.log("parentNode - ", parentNode)

            const txCost = 100000000000000n
            let senderAddress = (await signer).address
            let name = `${label}.${parentName}`

            if (isOwnable) {
                if (parentType === 'web3labs') {
                    steps.push({
                        title: "Deploy and Set Primary Name",
                        action: async () => {
                            const txn = await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, {
                                value: txCost
                                // gasLimit: 5000000
                            })
                            const txReceipt = await txn.wait()
                            const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
                            const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                deployedContractAddress,
                                senderAddress,
                                name,
                                'setNameAndDeploy',
                                txReceipt.hash,
                                'Ownable',
                                opType);
                            return txn;
                        }
                    })

                } else if (chain?.id == CHAINS.BASE || chain?.id == CHAINS.BASE_SEPOLIA) {

                    const isApprovedForAll = await ensRegistryContract.isApprovedForAll(senderAddress, config?.ENSCRIBE_CONTRACT!);
                    if (!isApprovedForAll) {
                        steps.push({
                            title: "Give operator access",
                            action: async () => {
                                const txn = await ensRegistryContract.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                                const txReceipt = await txn.wait()
                                await logMetric(
                                    corelationId,
                                    Date.now(),
                                    chainId,
                                    '',
                                    senderAddress,
                                    name,
                                    'setApprovalForAll',
                                    txReceipt.hash,
                                    'Ownable',
                                    opType);
                                return txn;
                            }
                        })
                    }

                    steps.push({
                        title: "Deploy and Set primary Name",
                        action: async () => {
                            const txn = await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, { value: txCost })
                            const txReceipt = await txn.wait()
                            const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
                            const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                deployedContractAddress,
                                senderAddress,
                                name,
                                'setNameAndDeploy',
                                txn.hash,
                                'Ownable',
                                opType);
                            return txn;
                        }
                    })

                } else {
                    console.log("User's parent deployment type")
                    const isWrapped = await nameWrapperContract?.isWrapped(parentNode)

                    if (isWrapped) {
                        // Wrapped Names
                        console.log(`Wrapped detected.`);
                        const isApprovedForAll = await nameWrapperContract?.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                        if (!isApprovedForAll) {
                            steps.push({
                                title: "Give operator access",
                                action: async () => {
                                    const txn = await nameWrapperContract?.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                                    const txReceipt = await txn.wait()
                                    await logMetric(
                                        corelationId,
                                        Date.now(),
                                        chainId,
                                        '',
                                        senderAddress,
                                        name,
                                        'setApprovalForAll',
                                        txReceipt.hash,
                                        'Ownable',
                                        opType);
                                    return txn;
                                }
                            })
                        }

                    } else {
                        //Unwrapped Names
                        console.log(`Unwrapped detected.`);
                        const isApprovedForAll = await ensRegistryContract.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                        if (!isApprovedForAll) {
                            steps.push({
                                title: "Give operator access",
                                action: async () => {
                                    const txn = await ensRegistryContract.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                                    const txReceipt = await txn.wait()
                                    await logMetric(
                                        corelationId,
                                        Date.now(),
                                        chainId,
                                        '',
                                        senderAddress,
                                        name,
                                        'setApprovalForAll',
                                        txReceipt.hash,
                                        'Ownable',
                                        opType);
                                    return txn;
                                }
                            })
                        }
                    }

                    steps.push({
                        title: "Deploy and Set primary Name",
                        action: async () => {
                            const txn = await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, { value: txCost })
                            const txReceipt = await txn.wait()
                            const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
                            const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                deployedContractAddress,
                                senderAddress,
                                name,
                                'setNameAndDeploy',
                                txReceipt.hash,
                                'Ownable',
                                opType);
                            return txn;
                        }
                    })
                }

                setModalTitle("Deploy Contract and set Primary Name")
                setModalSubtitle("Running each step to finish naming this contract")
                setModalSteps(steps)
                setModalOpen(true)
            } else if (isReverseClaimable) {
                if (isReverseSetter) {
                    // step 1: Get operator access
                    const isWrapped = await nameWrapperContract?.isWrapped(parentNode)

                    if (isWrapped) {
                        // Wrapped Names
                        console.log(`Wrapped detected.`);
                        const isApprovedForAll = await nameWrapperContract?.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                        if (!isApprovedForAll) {
                            steps.push({
                                title: "Give operator access",
                                action: async () => {
                                    const txn = await nameWrapperContract?.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                                    const txReceipt = await txn.wait()
                                    await logMetric(
                                        corelationId,
                                        Date.now(),
                                        chainId,
                                        '',
                                        senderAddress,
                                        name,
                                        'setApprovalForAll',
                                        txReceipt.hash,
                                        'ReverseSetter',
                                        opType);
                                    return txn;
                                }
                            })
                        }
                    } else {
                        //Unwrapped Names
                        console.log(`Unwrapped detected.`);
                        const isApprovedForAll = await ensRegistryContract.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                        if (!isApprovedForAll) {
                            steps.push({
                                title: "Give operator access",
                                action: async () => {
                                    const txn = await ensRegistryContract.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                                    const txReceipt = await txn.wait()
                                    await logMetric(
                                        corelationId,
                                        Date.now(),
                                        chainId,
                                        '',
                                        senderAddress,
                                        name,
                                        'setApprovalForAll',
                                        txReceipt.hash,
                                        'ReverseSetter',
                                        opType);
                                    return txn;
                                }
                            })
                        }
                    }

                    // step 2: set name & deploy contract via enscribe contract
                    steps.push({
                        title: "Set name & Deploy contract",
                        action: async () => {
                            const tx = await namingContract.setNameAndDeployReverseSetter(finalBytecode, label, parentName, parentNode, { value: txCost })
                            const txReceipt = await tx.wait()
                            setTxHash(txReceipt.hash)
                            const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
                            const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                            setDeployedAddress(deployedContractAddress)
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                deployedContractAddress,
                                senderAddress,
                                name,
                                'setNameAndDeployReverseSetter',
                                txReceipt.hash,
                                'ReverseSetter',
                                opType);
                            return tx
                        }
                    })
                } else { // default ReverseClaimable flow
                    // step 1: Get operator access
                    const isWrapped = await nameWrapperContract?.isWrapped(parentNode)

                    if (isWrapped) {
                        // Wrapped Names
                        console.log(`Wrapped detected.`);
                        const isApprovedForAll = await nameWrapperContract?.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                        if (!isApprovedForAll) {
                            steps.push({
                                title: "Give operator access",
                                action: async () => {
                                    const txn = await nameWrapperContract?.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                                    const txReceipt = await txn.wait()
                                    await logMetric(
                                        corelationId,
                                        Date.now(),
                                        chainId,
                                        '',
                                        senderAddress,
                                        name,
                                        'setApprovalForAll',
                                        txReceipt.hash,
                                        'ReverseClaimer',
                                        opType);
                                    return txn;
                                }
                            })
                        }
                    } else {
                        //Unwrapped Names
                        console.log(`Unwrapped detected.`);
                        const isApprovedForAll = await ensRegistryContract.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                        if (!isApprovedForAll) {
                            steps.push({
                                title: "Give operator access",
                                action: async () => {
                                    const txn = await ensRegistryContract.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                                    const txReceipt = await txn.wait()
                                    await logMetric(
                                        corelationId,
                                        Date.now(),
                                        chainId,
                                        '',
                                        senderAddress,
                                        name,
                                        'setApprovalForAll',
                                        txReceipt.hash,
                                        'ReverseClaimer',
                                        opType);
                                    return txn;
                                }
                            })
                        }
                    }

                    // step 2: set name & deploy contract via enscribe contract
                    steps.push({
                        title: "Set name & Deploy contract",
                        action: async () => {
                            const tx = await namingContract.setNameAndDeployReverseClaimer(finalBytecode, label, parentName, parentNode, { value: txCost })
                            const txReceipt = await tx.wait()
                            setTxHash(txReceipt.hash)
                            const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
                            const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                            setDeployedAddress(deployedContractAddress)
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                deployedContractAddress,
                                senderAddress,
                                name,
                                'setNameAndDeployReverseClaimer',
                                txReceipt.hash,
                                'ReverseClaimer',
                                opType);
                            return tx
                        }
                    })
                }

                setModalTitle("Deploy Contract and set Primary Name")
                setModalSubtitle("Complete each step to finish naming this contract")
                setModalSteps(steps)
                setModalOpen(true)
            }
        } catch (err: any) {
            if (!isEmpty(deployedAddr)) {
                setError("Your contract was deployed but the name wasn\'t set properly. Please use the 'Name Existing Contract' page to set the name of the contract. If you attempt to retry on this page, your contract will get deployed again with a different address.")
            }
            setError(err?.code || 'Error deploying contract')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl p-8">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Deploy New Contract</h2>
            {!isConnected && <p className="text-red-500">Please connect your wallet.</p>}

            <div className="space-y-6 mt-6">
                <label className="block text-gray-700 dark:text-gray-300">Bytecode</label>
                <Input
                    type="text"
                    value={bytecode}
                    onChange={(e) => {
                        setBytecode(e.target.value)
                        setIsOwnable(checkIfOwnable(e.target.value))
                        setIsReverseClaimable(checkIfReverseClaimable(e.target.value))
                    }}
                    onBlur={() => {
                        if (bytecode && !bytecode.startsWith("0x")) {
                            setBytecode("0x" + bytecode);
                        }
                        setIsOwnable(checkIfOwnable(bytecode))
                        setIsReverseClaimable(checkIfReverseClaimable(bytecode))
                    }}
                    placeholder="0x60037..."
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 ${!isValidBytecode ? 'border-red-500' : ''
                        }`}
                />

                {/* Error message for invalid Ownable bytecode */}
                {!isValidBytecode && bytecode.length > 0 && (
                    <p className="text-red-500">Invalid contract bytecode. It does not extend
                        Ownable/ReverseClaimable.</p>
                )}

                {
                    <>
                        <div className="justify-between">
                            {isOwnable && (<><CheckCircleIcon
                                className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer" /><p
                                    className="ml-1 text-gray-700 inline">Contract implements <Link
                                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                                        className="text-blue-600 hover:underline">Ownable</Link></p></>)}
                            {isReverseClaimable && (<><CheckCircleIcon
                                className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer" /><p
                                    className="ml-1 text-gray-700 inline">Contract is either <Link
                                        href="https://docs.ens.domains/web/naming-contracts#reverseclaimersol"
                                        className="text-blue-600 hover:underline">ReverseClaimable</Link> or <Link
                                            href="https://docs.ens.domains/web/naming-contracts/#set-a-name-in-the-constructor"
                                            className="text-blue-600 hover:underline">ReverseSetter</Link></p></>)}
                        </div>
                    </>
                }

                {isReverseClaimable && (
                    <>
                        <div className={"flex"}>
                            <Input type={"checkbox"} className={"w-4 h-4 mt-1"} checked={isReverseSetter}
                                onChange={(e) => {
                                    setIsReverseSetter(!isReverseSetter)
                                }} />
                            <label className="ml-1.5 text-gray-700 dark:text-gray-300">My contract is a <Link
                                href="https://docs.ens.domains/web/naming-contracts/#set-a-name-in-the-constructor"
                                className="text-blue-600 hover:underline">ReverseSetter</Link> (This will deploy & set
                                the name of the contract using different steps than ReverseClaimable)</label>
                        </div>
                    </>
                )
                }

                <label className="block text-gray-700 dark:text-gray-300 mt-6">Paste ABI JSON (Optional)</label>
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
                <label className="block text-gray-700 dark:text-gray-300 mt-6">Constructor Arguments</label>
                {args.map((arg, index) => (
                    <div key={index} className="mb-4">
                        <label
                            className="block text-gray-700 dark:text-gray-300">{arg.label || `Argument ${index + 1}`}</label>
                        <div className="flex flex-col md:flex-row gap-4 items-start">
                            {!arg.isCustom ? (
                                <Select
                                    value={arg.type}
                                    onValueChange={(value) => {
                                        if (value === "custom") {
                                            updateArg(index, { isCustom: true, type: "" })
                                        } else {
                                            updateArg(index, { type: value, isCustom: false })
                                        }
                                    }}
                                >
                                    <SelectTrigger
                                        className="bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
                                        <SelectValue className="text-gray-900" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white text-gray-900 border border-gray-300 rounded-md">
                                        {commonTypes.map((t) => (
                                            <SelectItem key={t} value={t}>{t}</SelectItem>
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
                                    arg.type.includes("tuple") && arg.type.includes("[]")
                                        ? '[["name", 10, "0x..."], ["bob", 20, "0x..."]]'
                                        : arg.type.includes("tuple")
                                            ? '["name", 10, "0x..."]'
                                            : "Enter value"
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

                <label className="block text-gray-700 dark:text-gray-300">Label Name</label>

                <div className={"flex items-center space-x-2"}>
                    <Input
                        type="text"
                        value={label}
                        onChange={(e) => {
                            setLabel(e.target.value)
                            setError("")
                        }}
                        onBlur={checkENSReverseResolution}
                        placeholder="my-label"
                        className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    />
                    <Button
                        onClick={populateName}>
                        <ArrowPathIcon />
                    </Button>
                </div>

                <label className="block text-gray-700 dark:text-gray-300">ENS Parent</label>
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
                    <SelectTrigger
                        className="bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
                        <SelectValue className="text-gray-900" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-gray-900 border border-gray-300 rounded-md">
                        <SelectItem value="web3labs">{enscribeDomain}</SelectItem>
                        <SelectItem value="own">Your ENS Parent</SelectItem>
                    </SelectContent>
                </Select>
                {parentType === 'own' && (
                    <>
                        <label className="block text-gray-700 dark:text-gray-300">Parent Name</label>
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
                                    console.log("Operator check for ", parentName, " is ", approved)
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
                                <Button variant="destructive" disabled={accessLoading}
                                    onClick={revokeOperatorAccess}>
                                    {accessLoading ? "Revoking..." : "Revoke Access"}
                                </Button>
                            )}

                            {!operatorAccess && recordExists && (
                                <Button disabled={accessLoading} onClick={grantOperatorAccess}>
                                    {accessLoading ? "Granting..." : "Grant Access"}
                                </Button>
                            )}
                        </div>

                        {/* Access Info Message */}
                        {((operatorAccess && recordExists) || (!operatorAccess && recordExists)) && !fetchingENS && (
                            <p className="text-sm text-yellow-600 mt-2">
                                {operatorAccess
                                    ? "Note: You can revoke Operator role from Enscribe here."
                                    :
                                    <p className="text-yellow-600">Note: You can grant Operator role to Enscribe through
                                        here, otherwise Enscribe will ask you to grant operator access during
                                        deployment. <Link
                                            href="https://www.enscribe.xyz/docs/getting-started/opearator-role"
                                            className="text-blue-600 hover:underline">Why Operator Access is
                                            needed?</Link></p>}
                            </p>
                        )}
                    </>
                )}
            </div>

            {/* Add ENS Selection Modal */}
            <Dialog open={showENSModal} onOpenChange={setShowENSModal}>
                <DialogContent className="max-w-3xl bg-white dark:bg-gray-900 shadow-lg rounded-lg">
                    <DialogHeader className="mb-4">
                        <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">Choose Your ENS Parent</DialogTitle>
                        <DialogDescription className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            Choose one of your owned ENS domains or select "None" to enter manually.
                        </DialogDescription>
                    </DialogHeader>

                    {fetchingENS ? (
                        <div className="flex justify-center items-center p-6">
                            <svg className="animate-spin h-5 w-5 mr-3 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none"
                                xmlns="http://www.w3.org/2000/svg">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                    strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                            </svg>
                            <p className="text-gray-700 dark:text-gray-300">Fetching your ENS domains...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 px-1">
                            {userOwnedDomains.length > 0 ? (
                                <div className="max-h-60 overflow-y-auto pr-1">
                                    <div className="flex flex-wrap gap-2">
                                        {userOwnedDomains.map((domain) => (
                                            <div
                                                key={domain}
                                                className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors inline-flex items-center"
                                                onClick={async () => {
                                                    setParentName(domain);
                                                    setShowENSModal(false);
                                                    const exist = await recordExist(domain)
                                                    setRecordExists(exist)

                                                    const approved = await checkOperatorAccess(domain)
                                                    console.log("Operator check for ", domain, " is ", approved)
                                                    setOperatorAccess(approved)

                                                }}
                                            >
                                                <span className="text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">{domain}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-md">
                                    <p className="text-gray-500 dark:text-gray-400">No ENS domains found for your address.</p>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2 mt-4">
                                <div
                                    className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors inline-flex items-center"
                                    onClick={() => {
                                        setParentName('');
                                        setShowENSModal(false);
                                    }}
                                >
                                    <span className="text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">None, I will type manually</span>
                                </div>
                            </div>

                            <div className="flex justify-end mt-6">
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
                    <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24" fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                            strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                ) : 'Deploy'}
            </Button>

            {error && (
                <div
                    className="mt-4 bg-red-50 dark:bg-red-900 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm rounded-md p-3 break-words max-w-full overflow-hidden">
                    <strong>Error:</strong> {error}
                </div>
            )}

            <SetNameStepsModal
                open={modalOpen}
                onClose={(result) => {
                    setModalOpen(false)
                    if (result?.startsWith("ERROR")) {
                        setError(result)
                        return
                    }

                    if (result && result !== "INCOMPLETE") {
                        setTxHash(result)
                        processResult(result)
                        // Reset form after successful deployment
                        setBytecode('');
                        setLabel('');
                        setParentType('web3labs');
                        setParentName(enscribeDomain);
                        setArgs([])
                        setAbiText('')
                    } else if (result === "INCOMPLETE") {
                        setError("Steps not completed. Please complete all steps before closing.")
                        return
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
