import React, { useState, useEffect } from 'react'
import { ethers, namehash, keccak256 } from 'ethers'
import contractABI from '../contracts/Enscribe'
import ensRegistryABI from '../contracts/ENSRegistry'
import nameWrapperABI from '../contracts/NameWrapper'
import { useAccount, useWalletClient, } from 'wagmi'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import parseJson from 'json-parse-safe'
import { CONTRACTS, TOPIC0 } from '../utils/constants';


const OWNABLE_FUNCTION_SELECTORS = [
    "8da5cb5b",  // owner()
    "f2fde38b",  // transferOwnership(address)
];

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

const checkIfOwnable = (bytecode: string): boolean => {
    return OWNABLE_FUNCTION_SELECTORS.every(selector => bytecode.includes(selector));
};

export default function DeployForm() {
    const { address, isConnected, chain } = useAccount()
    const { data: walletClient } = useWalletClient()
    const signer = walletClient ? new ethers.BrowserProvider(window.ethereum).getSigner() : null

    const config = chain?.id ? CONTRACTS[chain.id] : undefined;
    const enscribeDomain = config?.ENSCRIBE_DOMAIN!
    const etherscanUrl = config?.ETHERSCAN_URL!
    const ensAppUrl = config?.ENS_APP_URL!

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
    const [ensNameTaken, setEnsNameTaken] = useState(false)
    const [args, setArgs] = useState<ConstructorArg[]>([])
    const [abiText, setAbiText] = useState("")

    const getParentNode = (name: string) => {
        return namehash(name)
    }

    useEffect(() => {
        if (parentType === 'web3labs' && config?.ENSCRIBE_DOMAIN) {
            setParentName(config.ENSCRIBE_DOMAIN)
        }
    }, [config, parentType])

    useEffect(() => {
        if (bytecode.length > 0) {
            setIsValidBytecode(checkIfOwnable(bytecode))
        }
    }, [bytecode])

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

        if (!config) {
            console.error("Unsupported network");
            setError("Unsupported network")
        } else {
            setError("")
            console.log("Using Enscribe contract:", config.ENSCRIBE_CONTRACT);
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

            const namingContract = new ethers.Contract(config?.ENSCRIBE_CONTRACT!, contractABI, (await signer))
            const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, (await signer))
            var nameWrapperContract = null
            if (chain?.id != 84532) {
                nameWrapperContract = new ethers.Contract(config?.NAME_WRAPPER!, nameWrapperABI, (await signer))
            }

            const parentNode = getParentNode(parentName)

            const finalBytecode = encodeConstructorArgs()

            console.log("label - ", label)
            console.log("parentName - ", parentName)
            console.log("parentNode - ", parentNode)


            const txCost = 100000000000000n

            if (parentType === 'web3labs') {
                let tx = await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, { value: txCost })

                const txReceipt = await tx.wait()
                setTxHash(txReceipt.hash)
                const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
                const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                setDeployedAddress(deployedContractAddress)
                setShowPopup(true)
            } else if (chain?.id == 84532) {

                const isApprovedForAll = await ensRegistryContract.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                if (!isApprovedForAll) {
                    const txSetApproval = await ensRegistryContract.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                    await txSetApproval.wait();

                    console.log(`Base name approvalStatus changed: ${txSetApproval.hash}`);
                }
                let tx = await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, { value: txCost })
                const txReceipt = await tx.wait()
                setTxHash(txReceipt.hash)
                const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
                const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                setDeployedAddress(deployedContractAddress)
                setShowPopup(true)

            } else {
                console.log("User's parent deployment type")
                const isWrapped = await nameWrapperContract?.isWrapped(parentNode)

                if (isWrapped) {
                    // Wrapped Names
                    console.log(`Wrapped detected.`);
                    const isApprovedForAll = await nameWrapperContract?.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                    if (!isApprovedForAll) {
                        const txSetApproval = await nameWrapperContract?.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                        await txSetApproval.wait();

                        console.log(`Wrapped name approvalStatus changed: ${txSetApproval.hash}`);
                    }

                } else {
                    //Unwrapped Names
                    console.log(`Unwrapped detected.`);
                    const isApprovedForAll = await ensRegistryContract.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                    if (!isApprovedForAll) {
                        const txSetApproval = await ensRegistryContract.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                        await txSetApproval.wait();

                        console.log(`Unwrapped name approvalStatus changed: ${txSetApproval.hash}`);
                    }
                }

                let tx = await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, { value: txCost })
                const txReceipt = await tx.wait()
                setTxHash(txReceipt.hash)
                const matchingLog = txReceipt.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
                const deployedContractAddress = ethers.getAddress("0x" + matchingLog.topics[1].slice(-40));
                setDeployedAddress(deployedContractAddress)
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
                        <label className="block text-gray-700 dark:text-gray-300">{arg.label || `Argument ${index + 1}`}</label>
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
                                    <SelectTrigger className="bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
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
                            setParentName(enscribeDomain)
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
                <div className="mt-4 bg-red-50 dark:bg-red-900 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-sm rounded-md p-3 break-words max-w-full overflow-hidden">
                    <strong>Error:</strong> {error}
                </div>
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
                                setBytecode('');
                                setLabel('');
                                setParentType('web3labs');
                                setParentName(enscribeDomain);
                                setArgs([])
                                setAbiText('')
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