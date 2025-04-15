import React, {useEffect, useState} from 'react'
import {ContractFactory, ethers, keccak256, namehash} from 'ethers'
import contractABI from '../contracts/Enscribe'
import ensRegistryABI from '../contracts/ENSRegistry'
import nameWrapperABI from '../contracts/NameWrapper'
import {useAccount, useWalletClient,} from 'wagmi'
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea"
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import parseJson from 'json-parse-safe'
import {CONTRACTS, TOPIC0} from '../utils/constants';
import publicResolverABI from "@/contracts/PublicResolver";
import SetNameStepsModal, {Step} from './SetNameStepsModal';
import {CheckCircleIcon} from "@heroicons/react/24/outline";
import Link from "next/link";
import {CheckboxItem} from "@radix-ui/react-menu";
import {CheckBox} from "@/components/ui/checkbox";

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

const checkIfOwnable = (bytecode: string): boolean => {
    return OWNABLE_FUNCTION_SELECTORS.every(selector => bytecode.includes(selector));
};

const checkIfReverseClaimable = (bytecode: string): boolean => {
    console.log("bytecode is rc? " + bytecode.includes(ADDR_REVERSE_NODE));
    return bytecode.includes(ADDR_REVERSE_NODE)
};

export default function DeployForm() {
    const {address, isConnected, chain} = useAccount()
    const {data: walletClient} = useWalletClient()
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
    const [isOwnable, setIsOwnable] = useState(false)
    const [isReverseClaimable, setIsReverseClaimable] = useState(true)
    const [isReverseSetter, setIsReverseSetter] = useState(false)

    const [ensNameTaken, setEnsNameTaken] = useState(false)
    const [args, setArgs] = useState<ConstructorArg[]>([])
    const [abiText, setAbiText] = useState("")

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

    useEffect(() => {
        if (bytecode.length > 0) {
            setIsOwnable(checkIfOwnable(bytecode))
            setIsReverseClaimable(checkIfReverseClaimable(bytecode))
            setIsValidBytecode(checkIfOwnable(bytecode) || checkIfReverseClaimable(bytecode))
        }
    }, [bytecode])

    const addArg = () =>
        setArgs([...args, {type: "string", value: "", isCustom: false}])

    const updateArg = (index: number, updated: Partial<ConstructorArg>) => {
        const newArgs = [...args]
        newArgs[index] = {...newArgs[index], ...updated}
        setArgs(newArgs)
    }

    const removeArg = (index: number) => {
        const newArgs = [...args]
        newArgs.splice(index, 1)
        setArgs(newArgs)
    }

    function isEmpty(value: string) {
        return (value == null ||  value.trim().length === 0);
    }

    const handleAbiInput = (text: string) => {
        if (text.trim().length === 0) {
            setArgs([])
            setError("")
            return
        }

        try {
            const {value: parsed, error} = parseJson(text)

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

    const processResult = async (txHash: string) => {
        const txReceipt = await (await signer)!.provider.getTransactionReceipt(txHash)
        setTxHash(txReceipt!.hash)
        if (!isReverseClaimable) {
            const matchingLog = txReceipt!.logs.find((log: ethers.Log) => log.topics[0] === TOPIC0);
            const deployedContractAddress = ethers.getAddress("0x" + matchingLog!.topics[1].slice(-40))
            setDeployedAddress(deployedContractAddress)
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

        let deployedAddr ='';

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
            if (chain?.id != 84532) {
                nameWrapperContract = new ethers.Contract(config?.NAME_WRAPPER!, nameWrapperABI, (await signer))
            }

            const finalBytecode = encodeConstructorArgs()
            const steps: Step[] = []

            console.log("label - ", label)
            console.log("parentName - ", parentName)
            console.log("parentNode - ", parentNode)


            if (isOwnable) {
                const txCost = 100000000000000n

                if (parentType === 'web3labs') {
                    steps.push({
                        title: "Deploy and Set Primary Name",
                        action: async () => {
                            return await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, {value: txCost})

                        }
                    })

                } else if (chain?.id == 84532) {

                    const isApprovedForAll = await ensRegistryContract.isApprovedForAll((await signer).address, config?.ENSCRIBE_CONTRACT!);
                    if (!isApprovedForAll) {
                        steps.push({
                            title: "Give operator access",
                            action: async () => {
                                return await ensRegistryContract.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                            }
                        })
                    }

                    steps.push({
                        title: "Deploy and Set primary Name",
                        action: async () => {
                            return await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, {value: txCost})
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
                                    return await nameWrapperContract?.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
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
                                    return await ensRegistryContract.setApprovalForAll(config?.ENSCRIBE_CONTRACT!, true);
                                }
                            })
                        }
                    }

                    steps.push({
                        title: "Give operator access",
                        action: async () => {
                            return await namingContract.setNameAndDeploy(finalBytecode, label, parentName, parentNode, {value: txCost})
                        }
                    })
                }

                setModalTitle("Deploy Contract and set Primary Name")
                setModalSubtitle("Complete each step to finish naming this contract")
                setModalSteps(steps)
                setModalOpen(true)
            } else if (isReverseClaimable) {
                const sender = (await signer)
                const senderAddr = sender.address


                const labelHash = keccak256(ethers.toUtf8Bytes(label))

                const node = namehash(label + "." + parentName)
                const nameExist = await ensRegistryContract.recordExists(node)
                const publicResolverContract = new ethers.Contract(config?.PUBLIC_RESOLVER!, publicResolverABI, sender)

                if (isReverseSetter) {
                    // step 1: create subname
                    steps.push({
                        title: "Create subname",
                        action: async () => {
                            if (parentType === 'web3labs') {
                                return await namingContract.setName(deployedAddr, label, parentName, parentNode, {value: 100000000000000n}) // nonce = 51
                            } else if (chain?.id === 84532) {
                                if (!nameExist) {
                                    return await ensRegistryContract.setSubnodeRecord(parentNode, labelHash, sender.address, config?.PUBLIC_RESOLVER, 0)
                                }
                            } else {
                                const isWrapped = await nameWrapperContract?.isWrapped(parentNode)
                                if (!nameExist) {
                                    if (isWrapped) {
                                        return await nameWrapperContract?.setSubnodeRecord(parentNode, label, sender.address, config?.PUBLIC_RESOLVER, 0, 0, 0)
                                    } else {
                                        return await ensRegistryContract.setSubnodeRecord(parentNode, labelHash, sender.address, config?.PUBLIC_RESOLVER, 0)
                                    }
                                }
                            }
                        }
                    })

                    // step 2: deploy contract
                    steps.push({
                        title: "Deploy contract",
                        action: async () => {
                            const cf = new ContractFactory([], finalBytecode, (await signer));
                            const contract = await cf.deploy()
                            const txDeployReceipt = await contract.waitForDeployment() // get contract address
                            deployedAddr = await txDeployReceipt.getAddress() // actual contract
                            setDeployedAddress(deployedAddr)
                            const txn = await txDeployReceipt.deploymentTransaction()?.getTransaction();
                            if (txn != undefined) {
                                return txn
                            }
                        }
                    })

                    // step 3: forward resolve
                    steps.push({
                        title: "Set forward resolution",
                        action: async () => {
                            if (parentType != 'web3labs') {
                                const currentAddr = await publicResolverContract.addr(node)
                                if (currentAddr.toLowerCase() !== deployedAddr.toLowerCase()) {
                                    await publicResolverContract.setAddr(node, deployedAddr)
                                } else {
                                    console.log("Forward resolution already set")
                                }
                            }
                        }
                    })
                } else { // default ReverseClaimable flow
                    // step 1: deploy contract
                    // if error -> send error with notice, else deploy new
                    steps.push({
                        title: "Deploy contract",
                        action: async () => {
                            const cf = new ContractFactory([], finalBytecode, (await signer));
                            const contract = await cf.deploy()
                            const txDeployReceipt = await contract.waitForDeployment() // get contract address
                            deployedAddr = await txDeployReceipt.getAddress() // actual contract
                            setDeployedAddress(deployedAddr)
                            const txn = await txDeployReceipt.deploymentTransaction()?.getTransaction();
                            if (txn != undefined) {
                                return txn
                            }
                        }
                    })

                    // step 2: create subname
                    steps.push({
                        title: "Create subname",
                        action: async () => {
                            if (parentType === 'web3labs') {
                                return await namingContract.setName(deployedAddr, label, parentName, parentNode, {value: 100000000000000n}) // nonce = 51
                            } else if (chain?.id === 84532) {
                                if (!nameExist) {
                                    return await ensRegistryContract.setSubnodeRecord(parentNode, labelHash, sender.address, config?.PUBLIC_RESOLVER, 0)
                                }
                            } else {
                                const isWrapped = await nameWrapperContract?.isWrapped(parentNode)
                                if (!nameExist) {
                                    if (isWrapped) {
                                        return await nameWrapperContract?.setSubnodeRecord(parentNode, label, sender.address, config?.PUBLIC_RESOLVER, 0, 0, 0)
                                    } else {
                                        return await ensRegistryContract.setSubnodeRecord(parentNode, labelHash, sender.address, config?.PUBLIC_RESOLVER, 0)
                                    }
                                }
                            }
                        }
                    })

                    // Step 3: Set Forward Resolution (if not web3labs)
                    steps.push({
                        title: "Set forward resolution",
                        action: async () => {
                            if (parentType != 'web3labs') {
                                const currentAddr = await publicResolverContract.addr(node)
                                if (currentAddr.toLowerCase() !== deployedAddr.toLowerCase()) {
                                    await publicResolverContract.setAddr(node, deployedAddr)
                                } else {
                                    console.log("Forward resolution already set")
                                }
                            }
                        }
                    })

                    // step 4: Set Reverse Resolution
                    steps.push({
                        title: "Set Reverse Resolution",
                        action: async () => {
                            const addrLabel = deployedAddr.slice(2).toLowerCase()
                            const reversedNode = namehash(addrLabel + "." + "addr.reverse")
                            return await publicResolverContract.setName(reversedNode, `${label}.${parentName}`)
                        }
                    })
                }

                // setTxHash(contract.deploymentTransaction() != null ? contract.deploymentTransaction()!.hash : tx.hash)
                // setDeployedAddress(deployedAddr) //0xD817F6daF4F5088716Ac942181a8Dc7B89FB6Edc
                // setShowPopup(true)
                setModalTitle("Deploy Contract and set Primary Name")
                setModalSubtitle("Complete each step to finish naming this contract")
                setModalSteps(steps)
                setModalOpen(true)
            }
        } catch (err: any) {
            if (!isEmpty(deployedAddr)) {
                setError("Your contract was deployed but the name wasn\'t set properly. Please use the 'Name Existing Contract' page to set the name of the contract. If you attempt to retry on this page, your contract will get deployed again with a different address.")
            }
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
                                className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer"/><p
                                className="text-gray-700 inline">Contract implements <Link
                                href="https://docs.openzeppelin.com/contracts/access-control#ownership-and-ownable"
                                className="text-blue-600 hover:underline">Ownable</Link></p></>)}
                            {isReverseClaimable && (<><CheckCircleIcon
                                className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer"/><p
                                className="text-gray-700 inline">Contract implements <Link
                                href="https://docs.ens.domains/web/naming-contracts#reverseclaimersol"
                                className="text-blue-600 hover:underline">ReverseClaimable</Link></p></>)}
                        </div>
                    </>
                }

                {isReverseClaimable && (
                    <>
                        <div className={"flex"}>
                            <Input type={"checkbox"} className={"w-4 h-4 mt-1"} checked={isReverseSetter} onChange={(e) => {
                                setIsReverseSetter(!isReverseSetter)
                            }}/>
                            <label className="ml-1.5 text-gray-700 dark:text-gray-300">My contract implements ReverseSetter</label>
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
                                            updateArg(index, {isCustom: true, type: ""})
                                        } else {
                                            updateArg(index, {type: value, isCustom: false})
                                        }
                                    }}
                                >
                                    <SelectTrigger
                                        className="bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
                                        <SelectValue className="text-gray-900"/>
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
                                    onChange={(e) => updateArg(index, {type: e.target.value})}
                                    placeholder="Enter custom type (e.g. tuple(string,uint256))"
                                    className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                                />
                            )}

                            <Input
                                type="text"
                                value={arg.value}
                                onChange={(e) => updateArg(index, {value: e.target.value})}
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
                    <SelectTrigger
                        className="bg-white text-gray-900 border border-gray-300 rounded-md p-3 focus:ring-2 focus:ring-indigo-500">
                        <SelectValue className="text-gray-900"/>
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
                            <DialogTitle className="text-gray-900 dark:text-white">Deployment Successful!</DialogTitle>
                            <DialogDescription className="text-gray-600 dark:text-gray-300">
                                Your contract has been successfully deployed.
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
        </div>
    )
}