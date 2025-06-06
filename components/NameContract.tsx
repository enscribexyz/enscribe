import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router';
import { ethers, namehash, keccak256 } from 'ethers'
import contractABI from '../contracts/Enscribe'
import ensRegistryABI from '../contracts/ENSRegistry'
import nameWrapperABI from '../contracts/NameWrapper'
import publicResolverABI from '../contracts/PublicResolver'
import ownableContractABI from '../contracts/Ownable'
import reverseRegistrarABI from '@/contracts/ReverseRegistrar'
import { useAccount, useWalletClient } from 'wagmi'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast"
import { CONTRACTS, CHAINS, METRICS_URL } from '../utils/constants';
import Link from "next/link";
import SetNameStepsModal, { Step } from './SetNameStepsModal';
import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { v4 as uuid } from "uuid";
import { fetchGeneratedName, logMetric } from "@/components/componentUtils";

export default function NameContract() {
    const router = useRouter();
    const { address, isConnected, chain } = useAccount()
    const { data: walletClient } = useWalletClient()
    const signer = walletClient ? new ethers.BrowserProvider(window.ethereum).getSigner() : null

    const config = chain?.id ? CONTRACTS[chain.id] : undefined;
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
    const [isAddressEmpty, setIsAddressEmpty] = useState(true);
    const [isAddressInvalid, setIsAddressInvalid] = useState(true);
    const [isOwnable, setIsOwnable] = useState<boolean | null>(false);
    const [isReverseClaimable, setIsReverseClaimable] = useState<boolean | null>(false);
    const [ensNameTaken, setEnsNameTaken] = useState(false)
    const [isPrimaryNameSet, setIsPrimaryNameSet] = useState(false)
    const [recordExists, setRecordExists] = useState(true);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalSteps, setModalSteps] = useState<Step[]>([]);
    const [modalTitle, setModalTitle] = useState('');
    const [modalSubtitle, setModalSubtitle] = useState('');

    const corelationId = uuid()
    const opType = "nameexisting"

    const getParentNode = (name: string) => {
        try {
            return namehash(name)
        } catch (error) {
            return ""
        }
    }

    useEffect(() => {
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
        populateName()
        setIsOwnable(false)
        setIsReverseClaimable(false)
        setIsAddressEmpty(true);
        setIsAddressInvalid(false);
    }, [chain?.id, isConnected]);

    useEffect(() => {
        const initFromQuery = async () => {
            if (
                router.query.contract &&
                ethers.isAddress(router.query.contract as string) &&
                signer
            ) {
                const addr = router.query.contract as string;
                setExistingContractAddress(addr);
                isAddressValid(addr);
                await checkIfOwnable(addr);
                await checkIfReverseClaimable(addr);
            }
        };

        initFromQuery();
    }, [router.query.contract, signer]);

    useEffect(() => {
        if (parentType === 'web3labs' && config?.ENSCRIBE_DOMAIN) {
            setParentName(config.ENSCRIBE_DOMAIN)
        }
    }, [config, parentType])

    const populateName = async () => {
        const name = await fetchGeneratedName();
        setLabel(name)
    }

    // set label when component mounts
    useEffect(() => {
        populateName()
    }, []);


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

            // Fetch domains where user is the owner
            const [ownerResponse, registrantResponse, wrappedResponse] = await Promise.all([
                fetch(config.SUBGRAPH_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
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
                            address: address.toLowerCase()
                        }
                    })
                }),
                // Fetch domains where user is the registrant
                fetch(config.SUBGRAPH_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
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
                            address: address.toLowerCase()
                        }
                    })
                }),
                // Fetch domains where user is the wrapped
                fetch(config.SUBGRAPH_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
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
                            address: address.toLowerCase()
                        }
                    })
                })
            ]);


            const [ownerData, registrantData, wrappedData] = await Promise.all([
                ownerResponse.json(),
                registrantResponse.json(),
                wrappedResponse.json()
            ]);

            // Combine all sets of domains and remove duplicates
            const ownedDomains = ownerData?.data?.domains?.map((d: { name: string }) => d.name) || [];
            const registrantDomains = registrantData?.data?.domains?.map((d: { name: string }) => d.name) || [];
            const wrappedDomains = wrappedData?.data?.domains?.map((d: { name: string }) => d.name) || [];

            // Combine and deduplicate domains
            const allDomains = [...new Set([...ownedDomains, ...registrantDomains, ...wrappedDomains])];

            if (allDomains.length > 0) {
                // Filter out .addr.reverse names
                const filteredDomains = allDomains.filter((domain: string) => !domain.endsWith('.addr.reverse'));

                // Keep domains as-is, including any labelhashes
                const processedDomains = filteredDomains;

                // First, separate domains with labelhashes from regular domains
                const domainsWithLabelhash = processedDomains.filter(domain => domain.includes('[') && domain.includes(']'));
                const regularDomains = processedDomains.filter(domain => !(domain.includes('[') && domain.includes(']')));

                // Function to get the 2LD for a domain
                const get2LD = (domain: string): string => {
                    const parts = domain.split('.');
                    if (parts.length < 2) return domain;
                    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
                };

                // Group regular domains by their 2LD
                const domainsByParent: { [key: string]: string[] } = {};

                regularDomains.forEach(domain => {
                    const parent2LD = get2LD(domain);
                    if (!domainsByParent[parent2LD]) {
                        domainsByParent[parent2LD] = [];
                    }
                    domainsByParent[parent2LD].push(domain);
                });

                // Sort 2LDs alphabetically
                const sorted2LDs = Object.keys(domainsByParent).sort();

                // For each 2LD, sort its domains by depth
                const sortedDomains: string[] = [];

                sorted2LDs.forEach(parent2LD => {
                    // Sort domains within this 2LD group by depth
                    const sortedGroup = domainsByParent[parent2LD].sort((a, b) => {
                        // Always put the 2LD itself first
                        if (a === parent2LD) return -1;
                        if (b === parent2LD) return 1;

                        // Then sort by depth
                        const aDepth = a.split('.').length;
                        const bDepth = b.split('.').length;
                        if (aDepth !== bDepth) {
                            return aDepth - bDepth;
                        }

                        // If same depth, sort alphabetically
                        return a.localeCompare(b);
                    });

                    // Add all domains from this group to the result
                    sortedDomains.push(...sortedGroup);
                });

                // Finally, add domains with labelhashes at the end
                sortedDomains.push(...domainsWithLabelhash);

                // Apply chain-specific filtering
                let chainFilteredDomains = sortedDomains;

                // Filter based on chain
                if (chain?.id === CHAINS.BASE) {
                    // For Base chain, only keep .base.eth names
                    console.log('[DeployForm] Filtering owned domains for Base chain - only keeping .base.eth names');
                    chainFilteredDomains = sortedDomains.filter(domain => domain.endsWith('.base.eth'));
                } else if (chain?.id === CHAINS.BASE_SEPOLIA) {
                    // For Base Sepolia, don't show any names
                    console.log('[DeployForm] Base Sepolia detected - not showing any owned ENS names');
                    chainFilteredDomains = [];
                }

                setUserOwnedDomains(chainFilteredDomains);
                console.log("Fetched and processed user owned domains:", chainFilteredDomains);
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
        if (isEmpty(label) || !signer) return

        // Validate label and parent name before checking
        // if (!label.trim()) {
        //     setError("Label cannot be empty")
        //     setEnsNameTaken(true)
        //     return
        // }
        if (!parentName.trim()) {
            setError("Parent name cannot be empty")
            setEnsNameTaken(true)
            return
        }
        if (label.includes(".")) {
            setError("Can't include '.' in label name")
            return
        }

        try {
            const provider = (await signer).provider
            const fullEnsName = `${label}.${parentName}`
            const resolvedAddress = await provider.resolveName(fullEnsName)

            if (resolvedAddress) {
                setEnsNameTaken(true)
                setError("ENS name already used, please change label")
            } else {
                setEnsNameTaken(false)
                setError("")
            }
        } catch (err) {
            console.error("Error checking ENS name:", err)
            setEnsNameTaken(false)
        }

    }

    function isEmpty(value: string) {
        return (value == null || value.trim().length === 0);
    }

    const checkIfAddressEmpty = (existingContractAddress: string): boolean => {
        const addrEmpty = isEmpty(existingContractAddress)
        setIsAddressEmpty(addrEmpty)
        return addrEmpty
    }

    const isAddressValid = (existingContractAddress: string): boolean => {
        if (isEmpty(existingContractAddress)) {
            setError("contract address cannot be empty")
            return false
        }

        if (!ethers.isAddress(existingContractAddress)) {
            setError("Invalid contract address");
            setIsOwnable(false);
            setIsAddressInvalid(true);
            return false;
        }
        return true;
    }

    const checkIfOwnable = async (address: string) => {
        if (checkIfAddressEmpty(address) || !isAddressValid(address)) {
            setIsOwnable(false);
            return
        }

        try {
            const contract = new ethers.Contract(address, ["function owner() view returns (address)"], (await signer));

            const ownerAddress = await contract.owner();
            console.log("contract ownable")
            setIsOwnable(true);
            setIsAddressInvalid(false)
            setError("");
        } catch (err) {
            console.log("err " + err);
            setIsAddressEmpty(false)
            setIsAddressInvalid(false)
            setIsOwnable(false);
        }
    };

    const checkIfReverseClaimable = async (address: string) => {
        if (checkIfAddressEmpty(address) || !isAddressValid(address)) {
            setIsOwnable(false);
            setIsReverseClaimable(false);
            return
        }

        try {
            if (!signer) {
                alert('Please connect your wallet first.')
                setLoading(false)
                return
            }
            const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, (await signer))
            const addrLabel = address.slice(2).toLowerCase()
            const reversedNode = namehash(addrLabel + "." + "addr.reverse")
            const resolvedAddr = await ensRegistryContract.owner(reversedNode)
            console.log("resolvedaddr is " + resolvedAddr)

            const sender = (await signer)
            const signerAddress = sender.address;
            if (resolvedAddr === signerAddress) {
                console.log("contract implements reverseclaimable")
                setIsReverseClaimable(true);
            } else {
                console.log("contract DOES NOT implement reverseclaimable")
                setIsReverseClaimable(false);
            }

            setIsAddressInvalid(false)
            setError("");
        } catch (err) {
            console.log("err " + err);
            setIsAddressEmpty(false)
            setIsAddressInvalid(false)
            setIsReverseClaimable(false);
        }
    };

    const recordExist = async (): Promise<boolean> => {
        if (!signer || !getParentNode(parentName)) return false
        try {
            const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, (await signer))
            const parentNode = getParentNode(parentName)

            if (!(await ensRegistryContract.recordExists(parentNode))) return false

            return true
        } catch (err) {
            return false
        }
    }

    const setPrimaryName = async (setPrimary: boolean) => {
        setError("")

        if (!isAddressValid(existingContractAddress)) {
            setIsOwnable(false)
            return
        }

        await checkIfOwnable(existingContractAddress)
        await checkIfReverseClaimable(existingContractAddress)

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

        if (!config) {
            console.error("Unsupported network");
            setError("Unsupported network")
            return
        }

        try {
            setLoading(true)
            setError('')
            setTxHash('')

            if (!signer) {
                alert('Please connect your wallet first.')
                setLoading(false)
                return
            }

            const sender = (await signer)
            const senderAddress = sender.address;
            const name = `${label}.${parentName}`
            const chainId = chain?.id!

            const namingContract = new ethers.Contract(config?.ENSCRIBE_CONTRACT!, contractABI, sender)
            const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, sender)
            let nameWrapperContract: ethers.Contract | null = null;
            if (chain?.id != CHAINS.BASE && chain?.id != CHAINS.BASE_SEPOLIA) {
                nameWrapperContract = new ethers.Contract(config?.NAME_WRAPPER!, nameWrapperABI, sender)
            }
            const reverseRegistrarContract = new ethers.Contract(config?.REVERSE_REGISTRAR!, reverseRegistrarABI, sender)
            const ownableContract = new ethers.Contract(existingContractAddress, ownableContractABI, sender)
            const parentNode = getParentNode(parentName)
            const node = namehash(label + "." + parentName)
            const labelHash = keccak256(ethers.toUtf8Bytes(label))
            const nameExist = await ensRegistryContract.recordExists(node)
            const steps: Step[] = []

            let publicResolverAddress = config?.PUBLIC_RESOLVER!
            try {
                publicResolverAddress = await ensRegistryContract.resolver(parentNode) || config?.PUBLIC_RESOLVER!
            } catch (err) {
                console.log("err " + err);
                setError("Failed to get public resolver");
            }

            const publicResolverContract = new ethers.Contract(publicResolverAddress, publicResolverABI, sender)

            console.log("label - ", label)
            console.log("label hash - ", labelHash)
            console.log("parentName - ", parentName)
            console.log("parentNode - ", parentNode)
            console.log("name node - ", node)

            const txCost = await namingContract.pricing();
            console.log("txCost - ", txCost);

            const titleFirst = parentType === 'web3labs' ? "Set forward resolution" : "Create subname"

            // Step 1: Create Subname
            steps.push({
                title: titleFirst,
                action: async () => {
                    if (parentType === 'web3labs') {
                        const currentAddr = await publicResolverContract.addr(node)
                        if (currentAddr.toLowerCase() !== existingContractAddress.toLowerCase()) {
                            const txn = await namingContract.setName(existingContractAddress, label, parentName, parentNode, { value: txCost })
                            const txReceipt = await txn.wait()
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                existingContractAddress,
                                senderAddress,
                                name,
                                'subname::setName',
                                txReceipt.hash,
                                isOwnable ? 'Ownable' : 'ReverseClaimer',
                                opType);
                            return txn
                        } else {
                            setError("Forward resolution already set")
                            console.log("Forward resolution already set")
                        }
                    } else if (chain?.id == CHAINS.BASE || chain?.id == CHAINS.BASE_SEPOLIA) {
                        if (!nameExist) {
                            const txn = await ensRegistryContract.setSubnodeRecord(parentNode, labelHash, sender.address, publicResolverAddress, 0)
                            const txReceipt = await txn.wait()
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                existingContractAddress,
                                senderAddress,
                                name,
                                'subname::setSubnodeRecord',
                                txReceipt.hash,
                                isOwnable ? 'Ownable' : 'ReverseClaimer',
                                opType);
                            return txn
                        }
                    } else {
                        const isWrapped = await nameWrapperContract?.isWrapped(parentNode)
                        if (!nameExist) {
                            if (isWrapped) {
                                const txn = await nameWrapperContract?.setSubnodeRecord(parentNode, label, sender.address, publicResolverAddress, 0, 0, 0)
                                const txReceipt = await txn.wait()
                                await logMetric(
                                    corelationId,
                                    Date.now(),
                                    chainId,
                                    existingContractAddress,
                                    senderAddress,
                                    name,
                                    'subname::setSubnodeRecord',
                                    txReceipt.hash,
                                    isOwnable ? 'Ownable' : 'ReverseClaimer',
                                    opType);
                                return txn
                            } else {
                                const txn = await ensRegistryContract.setSubnodeRecord(parentNode, labelHash, sender.address, publicResolverAddress, 0)
                                const txReceipt = await txn.wait()
                                await logMetric(
                                    corelationId,
                                    Date.now(),
                                    chainId,
                                    existingContractAddress,
                                    senderAddress,
                                    name,
                                    'subname::setSubnodeRecord',
                                    txReceipt.hash,
                                    isOwnable ? 'Ownable' : 'ReverseClaimer',
                                    opType);
                                return txn
                            }
                        }
                    }
                }
            })

            // Step 2: Set Forward Resolution (if not web3labs)
            if (parentType != 'web3labs') {
                steps.push({
                    title: "Set forward resolution",
                    action: async () => {
                        const currentAddr = await publicResolverContract.addr(node)
                        if (currentAddr.toLowerCase() !== existingContractAddress.toLowerCase()) {
                            const txn = await publicResolverContract.setAddr(node, existingContractAddress)
                            const txReceipt = await txn.wait()
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                existingContractAddress,
                                senderAddress,
                                name,
                                'fwdres::setAddr',
                                txReceipt.hash,
                                isOwnable ? 'Ownable' : 'ReverseClaimer',
                                opType);
                            return txn
                        } else {
                            setError("Forward resolution already set")
                            console.log("Forward resolution already set")
                        }
                    }
                })
            }


            // Step 3: Set Reverse Resolution (if Primary)
            if (setPrimary) {
                if (isReverseClaimable) {
                    setIsPrimaryNameSet(true)
                    const addrLabel = existingContractAddress.slice(2).toLowerCase()
                    const reversedNode = namehash(addrLabel + "." + "addr.reverse")
                    steps.push({
                        title: "Set reverse resolution",
                        action: async () => {
                            const txn = await publicResolverContract.setName(reversedNode, `${label}.${parentName}`)
                            const txReceipt = await txn.wait()
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                existingContractAddress,
                                senderAddress,
                                name,
                                'revres::setName',
                                txReceipt.hash,
                                'ReverseClaimer',
                                opType);
                            return txn
                        }
                    })
                } else {
                    setIsPrimaryNameSet(true)
                    steps.push({
                        title: "Set reverse resolution",
                        action: async () => {
                            const txn = await reverseRegistrarContract.setNameForAddr(existingContractAddress, sender.address, publicResolverAddress, `${label}.${parentName}`)
                            const txReceipt = await txn.wait()
                            await logMetric(
                                corelationId,
                                Date.now(),
                                chainId,
                                existingContractAddress,
                                senderAddress,
                                name,
                                'revres::setNameForAddr',
                                txReceipt.hash,
                                'Ownable',
                                opType);
                            return txn
                        }
                    })
                }

            } else {
                setIsPrimaryNameSet(false)
            }

            setModalTitle(setPrimary ? "Set Primary Name" : "Set Forward Resolution")
            setModalSubtitle("Running each step to finish naming this contract")
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
        <div className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl p-8">
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Name Existing Contract</h2>
            {!isConnected && <p className="text-red-500">Please connect your wallet.</p>}

            <div className="space-y-6 mt-6">
                <label className="block text-gray-700 dark:text-gray-300">Contract Address</label>
                <Input
                    required={true}
                    type="text"
                    value={existingContractAddress}
                    onChange={async (e) => {
                        setExistingContractAddress(e.target.value)
                        await checkIfOwnable(e.target.value)
                        await checkIfReverseClaimable(e.target.value)
                    }}
                    // onBlur={ checkIfOwnable}
                    placeholder="0xa56..."
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200}`}
                />

                {/* Error message for invalid Ownable/ReverseClaimable bytecode */}
                {!isAddressEmpty && !isAddressInvalid && !isOwnable && !isReverseClaimable && (
                    <p className="text-yellow-600">Contract address does not extend <Link
                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                        className="text-blue-600 hover:underline">Ownable</Link> or <Link
                            href="https://eips.ethereum.org/EIPS/eip-173"
                            className="text-blue-600 hover:underline">ERC-173</Link> or <Link
                                href="https://docs.ens.domains/web/naming-contracts#reverseclaimersol"
                                className="text-blue-600 hover:underline">ReverseClaimable</Link>. You can only <Link
                                    href="https://docs.ens.domains/learn/resolution#forward-resolution"
                                    className="text-blue-600 hover:underline">forward resolve</Link> this
                        name. <Link href="https://www.enscribe.xyz/docs/" className="text-blue-600 hover:underline">Why
                            is this?</Link></p>

                )}
                {
                    <>
                        <div className="justify-between">
                            {isOwnable && (<><CheckCircleIcon
                                className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer" /><p
                                    className="text-gray-700 inline">Contract implements <Link
                                        href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                                        className="text-blue-600 hover:underline">Ownable</Link></p></>)}
                            {isReverseClaimable && !isOwnable && (<><CheckCircleIcon
                                className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer" /><p
                                    className="text-gray-700 inline">Contract is <Link
                                        href="https://docs.ens.domains/web/naming-contracts#reverseclaimersol"
                                        className="text-blue-600 hover:underline">ReverseClaimable</Link></p></>)}
                        </div>
                    </>
                }

                <label className="block text-gray-700 dark:text-gray-300">Label Name</label>
                <div className={"flex items-center space-x-2"}>
                    <Input
                        type="text"
                        required
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
                            setShowENSModal(true)
                            fetchUserOwnedDomains()
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
                        {fetchingENS ? (
                            <p className="text-gray-500 dark:text-gray-400">Fetching ENS domains...</p>
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
                                        setParentName('');
                                        setShowENSModal(true)
                                    }
                                    }
                                    className="bg-gray-900 text-white"
                                >
                                    Choose ENS
                                </Button>
                            </div>
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
                            Choose one of your owned ENS domains or enter manually.
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
                                <div className="max-h-[50vh] overflow-y-auto pr-1">
                                    {(() => {
                                        // Function to get the 2LD for a domain
                                        const get2LD = (domain: string): string => {
                                            const parts = domain.split('.');
                                            if (parts.length < 2) return domain;
                                            return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
                                        };

                                        // Separate domains with labelhashes
                                        const domainsWithLabelhash = userOwnedDomains.filter(domain => domain.includes('[') && domain.includes(']'));
                                        const regularDomains = userOwnedDomains.filter(domain => !(domain.includes('[') && domain.includes(']')));

                                        // Group regular domains by 2LD
                                        const domainGroups: { [key: string]: string[] } = {};

                                        regularDomains.forEach(domain => {
                                            const parent2LD = get2LD(domain);
                                            if (!domainGroups[parent2LD]) {
                                                domainGroups[parent2LD] = [];
                                            }
                                            domainGroups[parent2LD].push(domain);
                                        });

                                        // Sort 2LDs alphabetically
                                        const sorted2LDs = Object.keys(domainGroups).sort();

                                        return (
                                            <div className="space-y-4">
                                                {/* Regular domains grouped by 2LD */}
                                                {sorted2LDs.map(parent2LD => (
                                                    <div key={parent2LD} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-0">
                                                        <div className="flex flex-wrap gap-2">
                                                            {domainGroups[parent2LD].map((domain, index) => (
                                                                <div
                                                                    key={domain}
                                                                    className={`px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer transition-colors inline-flex items-center ${index === 0 ? 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800' : 'bg-white dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                                                                    onClick={() => {
                                                                        setParentName(domain);
                                                                        setShowENSModal(false);
                                                                    }}
                                                                >
                                                                    <span className="text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">{domain}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Domains with labelhashes at the end */}
                                                {domainsWithLabelhash.length > 0 && (
                                                    <div className="pt-2">
                                                        <div className="flex flex-wrap gap-2">
                                                            {domainsWithLabelhash.map(domain => (
                                                                <div
                                                                    key={domain}
                                                                    className="px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors inline-flex items-center"
                                                                    onClick={() => {
                                                                        setParentName(domain);
                                                                        setShowENSModal(false);
                                                                    }}
                                                                >
                                                                    <span className="text-gray-800 dark:text-gray-200 font-medium whitespace-nowrap">{domain}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-md">
                                    <p className="text-gray-500 dark:text-gray-400">No ENS domains found for your address.</p>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 mt-6">
                                <Button variant="outline"
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
                    onClick={() => setPrimaryName(true)}
                    disabled={!isConnected || loading || isAddressEmpty || !(isOwnable || isReverseClaimable) || isEmpty(label)}
                    className="w-1/2"
                >
                    {loading ? (
                        <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                    ) : 'Set Primary Name'}
                </Button>

                <Button
                    onClick={() => setPrimaryName(false)}
                    disabled={!isConnected || loading || isAddressEmpty || isAddressInvalid || isEmpty(label)}
                    className="w-1/2"
                >
                    {loading ? (
                        <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                                strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                        </svg>
                    ) : 'Set Forward Resolution'}
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
                    if (result?.startsWith("ERROR")) {
                        setError(result)
                        return
                    }

                    if (result === "INCOMPLETE") {
                        setError("Steps not completed. Please complete all steps before closing.")
                    } else {
                        setDeployedAddress(existingContractAddress)
                        // Reset form after successful naming
                        setExistingContractAddress('');
                        setLabel('');
                        setError('')
                        setParentType('web3labs');
                        setParentName(enscribeDomain);
                        setIsPrimaryNameSet(false);
                        populateName()
                    }
                }}
                title={modalTitle}
                subtitle={modalSubtitle}
                steps={modalSteps}
                contractAddress={existingContractAddress}
                ensName={`${label}.${parentName}`}
                isPrimaryNameSet={isPrimaryNameSet}
            />
        </div >
    )
}