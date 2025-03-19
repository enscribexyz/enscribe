import React, { useState, useEffect } from 'react'
import { ethers, namehash, keccak256 } from 'ethers'
import contractABI from '../contracts/Web3LabsContract'
import ensRegistryABI from '../contracts/ENSRegistry'
import ensBaseRegistrarImplementationABI from '../contracts/ENSBaseRegistrarImplementation'
import nameWrapperABI from '../contracts/NameWrapper'
import { useAccount, useWalletClient } from 'wagmi'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";

const contractAddress = process.env.NEXT_PUBLIC_WEB3_LAB_CONTRACT_ADDRESS || "0x77e78294f0b8CB54708393F6d7fa79eF7CFB589C"
const ensRegistryContractAddress = process.env.NEXT_PUBLIC_ENS_REGISTRY || "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"
const ensBaseRegistratContractAddress = process.env.NEXT_PUBLIC_ENS_BASE_REGISTRAR_IMPLEMENTATION || "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85"
const nameWrapperContractAddress = process.env.NEXT_PUBLIC_NAME_WRAPPER || "0x0635513f179D50A207757E05759CbD106d7dFcE8"
const topic0 = process.env.NEXT_PUBLIC_TOPIC0_SET_NAME;

const OWNABLE_FUNCTION_SELECTORS = [
    "8da5cb5b",  // owner()
    "f2fde38b",  // transferOwnership(address newOwner)
];

const checkIfOwnable = (bytecode: string): boolean => {
    return OWNABLE_FUNCTION_SELECTORS.every(selector => bytecode.includes(selector));
};

export default function DeployForm() {
    const { address, isConnected } = useAccount()
    const { data: walletClient } = useWalletClient()
    const signer = walletClient ? new ethers.BrowserProvider(window.ethereum).getSigner() : null


    const [bytecode, setBytecode] = useState('')
    const [label, setLabel] = useState('')
    const [parentType, setParentType] = useState<'web3labs' | 'own'>('web3labs')
    const [parentName, setParentName] = useState('testapp.eth')
    const [fetchingENS, setFetchingENS] = useState(false)
    const [txHash, setTxHash] = useState('')
    const [deployedAddress, setDeployedAddress] = useState('')
    const [receipt, setReceipt] = useState<any>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showPopup, setShowPopup] = useState(false)
    const [isValidBytecode, setIsValidBytecode] = useState(true)
    const [ensNameTaken, setEnsNameTaken] = useState(false)

    const getParentNode = (name: string) => {
        return namehash(name)
    }

    useEffect(() => {
        if (bytecode.length > 0) {
            setIsValidBytecode(checkIfOwnable(bytecode))
        }
    }, [bytecode])

    const fetchPrimaryENS = async () => {
        if (!signer || !address) return

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
            setError("")
            setEnsNameTaken(false)
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
        if (ensNameTaken) {
            setError("ENS name already used, please change label")
            return
        }
        if (!isValidBytecode) {
            setError('Invalid contract bytecode. It does not extend Ownable.')
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

            const namingContract = new ethers.Contract(contractAddress, contractABI, (await signer))
            const ensRegistryContract = new ethers.Contract(ensRegistryContractAddress, ensRegistryABI, (await signer))
            const ensBaseRegistrarContract = new ethers.Contract(ensBaseRegistratContractAddress, ensBaseRegistrarImplementationABI, (await signer))
            const nameWrapperContract = new ethers.Contract(nameWrapperContractAddress, nameWrapperABI, (await signer))
            const parentNode = getParentNode(parentName)

            console.log("label - ", label)
            console.log("parentName - ", parentName)
            console.log("parentNode - ", parentNode)


            const txCost = 100000000000000n

            if (parentType === 'web3labs') {
                let tx = await namingContract.setNameAndDeploy(bytecode, label, parentName, parentNode, { value: txCost })

                const txReceipt = await tx.wait()
                setTxHash(txReceipt.hash)
                const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === topic0);
                const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                setDeployedAddress(deployedContractAddress)
                setReceipt(txReceipt)
                setShowPopup(true)
            } else {
                console.log("User's parent deployment type")
                const isWrapped = await nameWrapperContract.isWrapped(parentNode)

                if (isWrapped) {
                    // Wrapped Names
                    const isApprovedForAll = await nameWrapperContract.isApprovedForAll((await signer).address, contractAddress);
                    if (!isApprovedForAll) {
                        const txSetApproval = await nameWrapperContract.setApprovalForAll(contractAddress, true);
                        await txSetApproval.wait();

                        console.log(`Wrapped 2LD and 3LD+ approvalStatus changed: ${txSetApproval.hash}`);
                    }

                } else {
                    //Unwrapped Names

                    const numDots = (parentName.match(/\./g) || []).length;

                    if (numDots === 1) {
                        const manager = await ensRegistryContract.owner(parentNode);
                        console.log(`Current Manager of ${parentName}: ${manager}`);
                        if (manager.toLowerCase() !== contractAddress.toLowerCase()) {
                            // 2LD (Second-Level Domain) → Call `reclaim()`
                            const labelHash = keccak256(ethers.toUtf8Bytes(parentName.split(".")[0])); // Get label hash
                            const tokenId = BigInt(labelHash).toString();

                            console.log(`2LD detected. Reclaiming manager role on BaseRegistrar for tokenId: ${tokenId}`);

                            const txReclaim = await ensBaseRegistrarContract.reclaim(tokenId, contractAddress);
                            await txReclaim.wait();

                            console.log(`2LD Manager updated: ${txReclaim.hash}`);
                        }

                    } else {
                        // 3LD+ (Subdomain) → Call `setOwner()`
                        console.log(`3LD+ detected. Changing ownership via ENS Registry`);
                        const isApprovedForAll = await ensRegistryContract.isApprovedForAll((await signer).address, contractAddress);
                        if (!isApprovedForAll) {
                            const txSetApproval = await ensRegistryContract.setApprovalForAll(contractAddress, true);
                            await txSetApproval.wait();

                            console.log(`Unwrapped 3LD approvalStatus changed: ${txSetApproval.hash}`);
                        }
                    }
                }

                let tx = await namingContract.setNameAndDeploy(bytecode, label, parentName, parentNode, { value: txCost })
                const txReceipt = await tx.wait()
                setTxHash(txReceipt.hash)
                const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === topic0);
                const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                setDeployedAddress(deployedContractAddress)
                setReceipt(txReceipt)
                setShowPopup(true)
            }

        } catch (err: any) {
            console.error(err)
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
                    onChange={(e) => setBytecode(e.target.value)}
                    onBlur={() => {
                        if (bytecode && !bytecode.startsWith("0x")) {
                            setBytecode("0x" + bytecode);
                        }
                    }}
                    placeholder="0x60037..."
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 ${!isValidBytecode ? 'border-red-500' : ''
                        }`}
                />

                {/* Error message for invalid Ownable bytecode */}
                {!isValidBytecode && bytecode.length > 0 && (
                    <p className="text-red-500">Invalid contract bytecode. It does not extend Ownable.</p>
                )}

                <label className="block text-gray-700 dark:text-gray-300">Label Name</label>
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

                <label className="block text-gray-700 dark:text-gray-300">ENS Parent</label>
                <Select
                    value={parentType}
                    onValueChange={(e) => {
                        const selected = e as 'web3labs' | 'own'
                        setParentType(selected)
                        if (selected === 'web3labs') {
                            setParentName('testapp.eth')
                        } else {
                            setParentName('')
                            fetchPrimaryENS()
                        }
                    }}
                >
                    <SelectTrigger className="bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
                        <SelectValue className="text-gray-900" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-gray-900 border border-gray-300 rounded-md">
                        <SelectItem value="web3labs">testapp.eth</SelectItem>
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

            <Button
                onClick={deployContract}
                disabled={!isConnected || loading || !isValidBytecode}
                className="w-full mt-6"
            >
                {loading ? (
                    <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                ) : 'Deploy'}
            </Button>

            {error && (
                <p className="mt-4 text-red-500 text-lg">Error: {error}</p>
            )}

            {showPopup && (
                <Dialog open={showPopup} onOpenChange={setShowPopup}>
                    <DialogContent className="max-w-lg bg-white dark:bg-gray-900 shadow-lg rounded-lg">
                        <DialogHeader>
                            <DialogTitle className="text-gray-900 dark:text-white">Deployment Successful!</DialogTitle>
                            <DialogDescription className="text-gray-600 dark:text-gray-300">
                                Your contract has been successfully deployed.
                            </DialogDescription>
                        </DialogHeader>

                        {/* Transaction Hash */}
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Transaction Hash:</p>
                            <div className="bg-gray-200 dark:bg-gray-800 p-2 rounded-md text-xs text-gray-900 dark:text-gray-300 break-words">
                                {txHash}
                            </div>
                        </div>

                        {/* Contract Address */}
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Contract Address:</p>
                            <div className="bg-gray-200 dark:bg-gray-800 p-2 rounded-md text-xs text-gray-900 dark:text-gray-300 break-words">
                                {deployedAddress}
                            </div>
                        </div>

                        {/* ENS Name */}
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">ENS Name:</p>
                            <div className="bg-gray-200 dark:bg-gray-800 p-2 rounded-md text-xs text-gray-900 dark:text-gray-300 break-words">
                                {`${label}.${parentName}`}
                            </div>
                        </div>

                        {/* View on Etherscan */}
                        <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                            <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
                                View Transaction on Etherscan
                            </a>
                        </Button>

                        {/* View on ENS App */}
                        <Button asChild className="w-full bg-green-600 hover:bg-green-700 text-white">
                            <a href={`https://app.ens.domains/${label}.${parentName}`} target="_blank" rel="noopener noreferrer">
                                View Name in ENS App
                            </a>
                        </Button>

                        {/* Close Button */}
                        <Button
                            onClick={() => {
                                setShowPopup(false);
                                setBytecode('');
                                setLabel('');
                                setParentType('web3labs');
                                setParentName('named.web3labs2.eth');
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