import React, { useState, useEffect } from 'react'
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
import { CONTRACTS, TOPIC0 } from '../utils/constants';
import Link from "next/link";
import SetNameStepsModal, { Step } from './SetNameStepsModal';
import {Hex, labelhash} from "viem";

export default function NameContract() {
    const { address, isConnected, chain } = useAccount()
    const { data: walletClient } = useWalletClient()
    const signer = walletClient ? new ethers.BrowserProvider(window.ethereum).getSigner() : null

    const config = chain?.id ? CONTRACTS[chain.id] : undefined;
    const enscribeDomain = config?.ENSCRIBE_DOMAIN!
    const etherscanUrl = config?.ETHERSCAN_URL!
    const ensAppUrl = config?.ENS_APP_URL!

    const [existingContractAddress, setExistingContractAddress] = useState('')

    const [label, setLabel] = useState('')
    const [parentType, setParentType] = useState<'web3labs' | 'own'>('web3labs')
    const [parentName, setParentName] = useState(enscribeDomain)
    const [fetchingENS, setFetchingENS] = useState(false)
    const [txHash, setTxHash] = useState('')
    const [deployedAddress, setDeployedAddress] = useState('')
    const [receipt, setReceipt] = useState<any>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showPopup, setShowPopup] = useState(false)
    const [isAddressEmpty, setIsAddressEmpty] = useState(true);
    const [isAddressInvalid, setIsAddressInvalid] = useState(true);
    const [isOwnable, setIsOwnable] = useState<boolean | null>(true);
    const [isReverseClaimable, setIsReverseClaimable] = useState<boolean | null>(false);
    const [ensNameTaken, setEnsNameTaken] = useState(false)
    const [isPrimaryNameSet, setIsPrimaryNameSet] = useState(false)

    const [modalOpen, setModalOpen] = useState(false);
    const [modalSteps, setModalSteps] = useState<Step[]>([]);
    const [modalTitle, setModalTitle] = useState('');
    const [modalSubtitle, setModalSubtitle] = useState('');

    const getParentNode = (name: string) => {
        return namehash(name)
    }

    useEffect(() => {
        if (parentType === 'web3labs' && config?.ENSCRIBE_DOMAIN) {
            setParentName(config.ENSCRIBE_DOMAIN)
        }
    }, [config, parentType])

    const fetchPrimaryENS = async () => {
        if (!signer || !address || chain?.id == 59141 || chain?.id == 84532) return

        setFetchingENS(true)
        try {
            const provider = (await signer).provider
            const ensName = await provider.lookupAddress(address)

            if (ensName) {
                setParentName(ensName)
            } else {
                setParentName("")
            }
        } catch (error) {
            console.error("Error fetching ENS name:", error)
            setParentName("")
        }
        setFetchingENS(false)
    }

    const checkENSReverseResolution = async () => {
        if (!signer || chain?.id == 59141 || chain?.id == 84532) return

        // Validate label and parent name before checking
        if (!label.trim()) {
            setError("Label cannot be empty")
            setEnsNameTaken(true)
            return
        }
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

    const checkIfAddressEmpty = (existingContractAddress: string): boolean => {
        console.log("checkIfAddressEmpty: " + existingContractAddress)
        setIsAddressEmpty(existingContractAddress.trim().length == 0)
        return existingContractAddress.trim().length == 0
    }

    const isAddressValid = (existingContractAddress: string): boolean => {
        if (!existingContractAddress.trim()) {
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
            return
        }

        try {
            if (!signer) {
                alert('Please connect your wallet first.')
                setLoading(false)
                return
            }
            const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, (await signer))
            const labelHash = labelhash(address.slice(2).toLowerCase())
            const nameHash = namehash( "addr.reverse")
            const reversedNode = keccak256((nameHash + labelHash.split('0x')[1]) as Hex)
            const resolvedAddr = await ensRegistryContract.owner(reversedNode)
            console.log("resolvedaddr is " + resolvedAddr)

            const sender = (await signer)
            const signerAddress = sender.address;
            if(resolvedAddr == signerAddress) {
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
            const signerAddress = sender.address;

            const namingContract = new ethers.Contract(config?.ENSCRIBE_CONTRACT!, contractABI, sender)
            const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, sender)
            let nameWrapperContract: ethers.Contract | null = null;
            if (chain?.id != 84532) {
                nameWrapperContract = new ethers.Contract(config?.NAME_WRAPPER!, nameWrapperABI, sender)
            }
            const reverseRegistrarContract = new ethers.Contract(config?.REVERSE_REGISTRAR!, reverseRegistrarABI, sender)
            const publicResolverContract = new ethers.Contract(config?.PUBLIC_RESOLVER!, publicResolverABI, sender)
            const ownableContract = new ethers.Contract(existingContractAddress, ownableContractABI, sender)
            const parentNode = getParentNode(parentName)
            const node = namehash(label + "." + parentName)
            const labelHash = keccak256(ethers.toUtf8Bytes(label))
            const nameExist = await ensRegistryContract.recordExists(node)
            const steps: Step[] = []

            console.log("label - ", label)
            console.log("label hash - ", labelHash)
            console.log("parentName - ", parentName)
            console.log("parentNode - ", parentNode)
            console.log("name node - ", node)

            const txCost = 100000000000000n

            const titleFirst = parentType === 'web3labs' ? "Set forward resolution" : "Create subname"

            // Step 1: Create Subname
            steps.push({
                title: titleFirst,
                action: async () => {
                    if (parentType === 'web3labs') {
                        const currentAddr = await publicResolverContract.addr(node)
                        if (currentAddr.toLowerCase() !== existingContractAddress.toLowerCase()) {
                            const tx = await namingContract.setName(existingContractAddress, label, parentName, parentNode, { value: 100000000000000n })
                            return tx
                        } else {
                            setError("Forward resolution already set")
                            console.log("Forward resolution already set")
                        }
                    } else if (chain?.id === 84532) {
                        if (!nameExist) {
                            const tx = await ensRegistryContract.setSubnodeRecord(parentNode, labelHash, sender.address, config.PUBLIC_RESOLVER, 0)
                            return tx
                        }
                    } else {
                        const isWrapped = await nameWrapperContract?.isWrapped(parentNode)
                        if (!nameExist) {
                            if (isWrapped) {
                                const tx = await nameWrapperContract?.setSubnodeRecord(parentNode, label, sender.address, config.PUBLIC_RESOLVER, 0, 0, 0)
                                return tx
                            } else {
                                const tx = await ensRegistryContract.setSubnodeRecord(parentNode, labelHash, sender.address, config.PUBLIC_RESOLVER, 0)
                                return tx
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
                            const tx = await publicResolverContract.setAddr(node, existingContractAddress)
                            return tx
                        } else {
                            setError("Forward resolution already set")
                            console.log("Forward resolution already set")
                        }
                    }
                })
            }


            // Step 3: Set Reverse Resolution (if Primary)
            if (setPrimary) {
                setIsPrimaryNameSet(true)
                steps.push({
                    title: "Set reverse resolution",
                    action: async () => {
                        const tx = await reverseRegistrarContract.setNameForAddr(existingContractAddress, sender.address, config.PUBLIC_RESOLVER, `${label}.${parentName}`)
                        return tx
                    }
                })
            } else {
                setIsPrimaryNameSet(false)
            }

            setModalTitle(setPrimary ? "Set Primary Name" : "Set Forward Resolution")
            setModalSubtitle("Complete each step to finish naming this contract")
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
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 ${!isOwnable ? 'border-red-500' : ''
                        }`}
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
                                href="https://docs.ens.domains/learn/resolution#forward-resolution" className="text-blue-600 hover:underline">forward resolve</Link> this
                        name. <Link href="https://www.enscribe.xyz/docs/" className="text-blue-600 hover:underline">Why is this?</Link></p>

                )}

                <label className="block text-gray-700 dark:text-gray-300">Label Name</label>
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
                            fetchPrimaryENS()
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
                            <p className="text-gray-500 dark:text-gray-400">Fetching primary ENS name...</p>
                        ) : (
                            <Input
                                type="text"
                                value={parentName}
                                onChange={(e) => {
                                    setParentName(e.target.value)
                                }}
                                placeholder="mydomain.eth"
                                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                            />
                        )}
                    </>
                )}
            </div>

            <div className="flex gap-4 mt-6">
                <Button
                    onClick={() => setPrimaryName(true)}
                    disabled={!isConnected || loading || isAddressEmpty || !(isOwnable || isReverseClaimable)}
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
                    disabled={!isConnected || loading || isAddressEmpty || isAddressInvalid}
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

                    if (result && result !== "INCOMPLETE") {
                        setTxHash(result)
                        setDeployedAddress(existingContractAddress)
                        setShowPopup(true)
                    } else if (result === "INCOMPLETE") {
                        setError("Steps not completed. Please complete all steps before closing.")
                    }
                }}
                title={modalTitle}
                subtitle={modalSubtitle}
                steps={modalSteps}
            />


            {showPopup && (
                <Dialog open={showPopup} onOpenChange={setShowPopup}>
                    <DialogContent className="max-w-lg bg-white dark:bg-gray-900 shadow-lg rounded-lg">
                        <DialogHeader>
                            <DialogTitle className="text-gray-900 dark:text-white">Naming Contract
                                Successful!</DialogTitle>
                            <DialogDescription className="text-gray-600 dark:text-gray-300">
                                Your contract has been named successfully.
                            </DialogDescription>
                        </DialogHeader>

                        {/* Transaction Hash */}
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Transaction Hash:</p>
                            <div
                                className="bg-gray-200 dark:bg-gray-800 p-2 rounded-md text-xs text-gray-900 dark:text-gray-300 break-words">
                                {txHash}
                            </div>
                        </div>

                        {/* Contract Address */}
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Contract Address:</p>
                            <div
                                className="bg-gray-200 dark:bg-gray-800 p-2 rounded-md text-xs text-gray-900 dark:text-gray-300 break-words">
                                {deployedAddress}
                            </div>
                        </div>

                        {/* ENS Name */}
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">ENS Name:</p>
                            <div
                                className="bg-gray-200 dark:bg-gray-800 p-2 rounded-md text-xs text-gray-900 dark:text-gray-300 break-words">
                                {`${label}.${parentName}`}
                            </div>
                        </div>

                        {/* ENS Resolution Message */}
                        <div className="text-red-500 dark:text-white font-semibold text-sm mt-4">
                            {isPrimaryNameSet
                                ? "Primary ENS Name set for the contract Address"
                                : "Only Forward Resolution of ENS name set for the contract address"}
                        </div>

                        {/* View on Etherscan */}
                        <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                            <a href={`${etherscanUrl}tx/${txHash}`} target="_blank" rel="noopener noreferrer">
                                View Transaction on Etherscan
                            </a>
                        </Button>

                        {/* View on ENS App */}
                        {ensAppUrl && <Button asChild className="w-full bg-green-600 hover:bg-green-700 text-white">
                            <a href={`${ensAppUrl}${label}.${parentName}`} target="_blank" rel="noopener noreferrer">
                                View Name in ENS App
                            </a>
                        </Button>}

                        {/* Close Button */}
                        <Button
                            onClick={() => {
                                setShowPopup(false);
                                setExistingContractAddress('');
                                setLabel('');
                                setError('')
                                setParentType('web3labs');
                                setParentName(enscribeDomain);
                                setIsPrimaryNameSet(false);
                            }}
                            className="w-full bg-gray-900 hover:bg-gray-800 text-white"
                        >
                            Close
                        </Button>
                    </DialogContent>
                </Dialog>
            )
            }
        </div >
    )
}