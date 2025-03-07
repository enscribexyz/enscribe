import React, { useState, useEffect } from 'react'
import { ethers, namehash, keccak256 } from 'ethers'
import contractABI from '../contracts/Web3LabsContract'
import ensRegistryABI from '../contracts/ENSRegistry'
import ensBaseRegistrarImplementationABI from '../contracts/ENSBaseRegistrarImplementation'
import { useAccount, useWalletClient } from 'wagmi'

const contractAddress = process.env.NEXT_PUBLIC_WEB3_LAB_CONTRACT_ADDRESS || "0x5CEDDD691070082e7106e8d4ECf0896F9D9930D8"
const ensRegistryContractAddress = process.env.NEXT_PUBLIC_ENS_REGISTRY || "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"
const ensBaseRegistratContractAddress = process.env.NEXT_PUBLIC_ENS_BASE_REGISTRAR_IMPLEMENTATION || "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85"
const topic0 = process.env.NEXT_PUBLIC_TOPIC0_DEPLOYMENT;

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
            setEnsNameTaken(true)
            return
        }
        if (!parentName.trim()) {
            setError("Parent name cannot be empty")
            setEnsNameTaken(true)
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

    const deployContract = async () => {
        if (!label.trim()) {
            setError("Label cannot be empty")
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
            const parentNode = getParentNode(parentName)

            console.log("label - ", label)
            console.log("parentName - ", parentName)
            console.log("parentNode - ", parentNode)


            const txCost = 200000000000000n

            if (parentType === 'web3labs') {
                // const estimatedGas = (await namingContract.setNameAndDeploy.estimateGas(bytecode, label, parentName, parentNode));
                // const gasPrice = (await (await signer).provider.getFeeData()).maxFeePerGas || BigInt(1);

                // // Calculate total cost - 15% buffer
                // const estimatedCost = estimatedGas * gasPrice;
                // const txCost = (estimatedCost * 15n) / 100n;

                // console.log(`Estimated Gas: ${estimatedGas.toString()}`);
                // console.log(`Gas Price: ${gasPrice}`);
                // console.log(`Tx Cost: ${txCost}`)
                // console.log("Web3 labs deployment type")

                let tx = await namingContract.setNameAndDeploy(bytecode, label, parentName, parentNode, { value: txCost })

                const txReceipt = await tx.wait()
                setTxHash(txReceipt.hash)
                const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === topic0);
                const deployedContractAddress = "0x" + matchingLog.data.slice(-40);
                setDeployedAddress(deployedContractAddress)
                setReceipt(txReceipt)
                setShowPopup(true)
            } else {
                console.log("User's parent deployment type")
                const manager = await ensRegistryContract.owner(parentNode);
                console.log(`Current Manager of ${parentName}: ${manager}`);

                if (manager.toLowerCase() !== contractAddress.toLowerCase()) {
                    const numDots = (parentName.match(/\./g) || []).length;

                    if (numDots === 1) {
                        // 2LD (Second-Level Domain) → Call `reclaim()`
                        const labelHash = keccak256(ethers.toUtf8Bytes(parentName.split(".")[0])); // Get label hash
                        const tokenId = BigInt(labelHash).toString();

                        console.log(`2LD detected. Reclaiming manager role on BaseRegistrar for tokenId: ${tokenId}`);

                        const txReclaim = await ensBaseRegistrarContract.reclaim(tokenId, contractAddress);
                        await txReclaim.wait();

                        console.log(`2LD Manager updated: ${txReclaim.hash}`);
                    } else {
                        // 3LD+ (Subdomain) → Call `setOwner()`
                        console.log(`3LD+ detected. Changing ownership via ENS Registry`);

                        const txSetOwner = await ensRegistryContract.setOwner(parentNode, contractAddress);
                        await txSetOwner.wait();

                        console.log(`3LD Manager updated: ${txSetOwner.hash}`);
                    }
                }
                // const estimatedGas = (await namingContract.setNameAndDeploy.estimateGas(bytecode, label, parentName, parentNode));
                // const gasPrice = (await (await signer).provider.getFeeData()).maxFeePerGas || BigInt(1);

                // // Calculate total cost - 15% buffer
                // const estimatedCost = estimatedGas * gasPrice;
                // const txCost = (estimatedCost * 15n) / 100n;

                // console.log(`Estimated Gas: ${estimatedGas.toString()}`);
                // console.log(`Gas Price: ${gasPrice}`);
                // console.log(`Tx Cost: ${txCost}`)

                let tx = await namingContract.setNameAndDeploy(bytecode, label, parentName, parentNode, { value: txCost })
                const txReceipt = await tx.wait()
                setTxHash(txReceipt.hash)
                const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === topic0);
                const deployedContractAddress = "0x" + matchingLog.data.slice(-40);
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
                <input
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
                <input
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
                <select
                    value={parentType}
                    onChange={(e) => {
                        const selected = e.target.value as 'web3labs' | 'own'
                        setParentType(selected)
                        if (selected === 'web3labs') {
                            setParentName('testapp.eth')
                        } else {
                            setParentName('')
                            fetchPrimaryENS()
                        }
                    }}
                    className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                >
                    <option className="text-gray-900" value="web3labs">testapp.eth</option>
                    <option className="text-gray-900" value="own">Your ENS Parent</option>
                </select>
                {parentType === 'own' && (
                    <>
                        <label className="block text-gray-700 dark:text-gray-300">Parent Name</label>
                        {fetchingENS ? (
                            <p className="text-gray-500 dark:text-gray-400">Fetching primary ENS name...</p>
                        ) : (
                            <input
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

            <button
                onClick={deployContract}
                disabled={!isConnected || loading || !isValidBytecode}
                className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg disabled:bg-gray-400 flex items-center justify-center"
            >
                {loading ? (
                    <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                ) : 'Deploy'}
            </button>

            {error && (
                <p className="mt-4 text-red-500 text-lg">Error: {error}</p>
            )}

            {showPopup && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
                    <div className="bg-white dark:bg-gray-700 p-6 rounded-lg shadow-lg max-w-lg w-full">
                        <h3 className="text-xl font-semibold mb-4 text-black text-center">Deployment Successful!</h3>

                        <p className="text-black"><strong>Transaction Hash:</strong></p>
                        <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto text-sm text-black break-words">
                            {txHash}
                        </div>

                        <p className="mt-2 text-black"><strong>Contract Address:</strong></p>
                        <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto text-sm text-black break-words">
                            {deployedAddress}
                        </div>

                        <p className="mt-2 text-black"><strong>ENS name:</strong></p>
                        <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto text-sm text-black break-words">
                            {`${label}.${parentName}`}
                        </div>

                        {/* View on Etherscan */}
                        <a
                            href={`https://sepolia.etherscan.io/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded text-center"
                        >
                            View Transaction on Etherscan
                        </a>

                        {/* View on ENS App */}
                        <a
                            href={`https://app.ens.domains/${label}.${parentName}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 block bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded text-center"
                        >
                            View Name in ENS App
                        </a>

                        <button
                            onClick={() => {
                                setShowPopup(false)
                                // Reset the form fields
                                setBytecode('')
                                setLabel('')
                                setParentType('web3labs')
                                setParentName('named.web3labs2.eth')
                            }
                            }
                            className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )
            }
        </div >
    )
}