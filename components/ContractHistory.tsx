// ContractHistory.tsx (with incremental loading and improved UX)
import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useWalletClient } from 'wagmi'
import { ethers, namehash } from 'ethers'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CONTRACTS, TOPIC0 } from '../utils/constants'
import ensRegistryABI from '../contracts/ENSRegistry'

interface Contract {
    ensName: string
    contractAddress: string
    txHash: string
    isOwnable: boolean;
}

export default function ContractHistory() {
    const { address, isConnected, chain } = useAccount()
    const { data: walletClient } = useWalletClient()
    const config = chain?.id ? CONTRACTS[chain.id] : undefined
    const signer = walletClient ? new ethers.BrowserProvider(window.ethereum).getSigner() : null

    const [withENS, setWithENS] = useState<Contract[]>([])
    const [withoutENS, setWithoutENS] = useState<Contract[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [processing, setProcessing] = useState(true)

    const [pageWith, setPageWith] = useState(1)
    const [pageWithout, setPageWithout] = useState(1)
    const itemsPerPage = 10

    const etherscanApi = config!.ETHERSCAN_API
    const etherscanUrl = config!.ETHERSCAN_URL
    const blockscoutUrl = config!.BLOCKSCOUT_URL
    const chainlensUrl = config!.CHAINLENS_URL
    const ensAppUrl = config!.ENS_APP_URL
    const topic0 = TOPIC0

    useEffect(() => {
        if (!isConnected || !address || !walletClient) return
        fetchTxs()
    }, [address, isConnected, walletClient])

    const fetchTxs = async () => {
        setLoading(true)
        setError(null)
        setWithENS([])
        setWithoutENS([])

        let isMounted = true

        try {
            const url = `${etherscanApi}&action=txlist&address=${address}`
            const res = await fetch(url)
            const data = await res.json()

            setProcessing(true);

            for (const tx of data.result || []) {
                const txHash = tx.hash
                let isOwnable = false

                if (tx.to === '') {
                    const contractAddr = tx.contractAddress
                    const ensName = await getENS(contractAddr)

                    isOwnable = await checkIfOwnable(contractAddr)
                    if (!isOwnable) {
                        isOwnable = await checkIfReverseClaimable(contractAddr)
                    }
                    const contract: Contract = { ensName, contractAddress: contractAddr, txHash, isOwnable }
                    console.log("contract - ", contract)

                    if (isMounted) {
                        if (ensName) {
                            setWithENS(prev => {
                                const alreadyExists = prev.some(c => c.contractAddress === contract.contractAddress);
                                return alreadyExists ? prev : [contract, ...prev];
                            });
                        } else {
                            setWithoutENS(prev => {
                                const alreadyExists = prev.some(c => c.contractAddress === contract.contractAddress);
                                return alreadyExists ? prev : [contract, ...prev];
                            });
                        }
                    }

                } else if (["0xacd71554", "0x04917062", "0x7ed7e08c", "0x5a0dac49"].includes(tx.methodId)) {
                    const deployed = await extractDeployed(txHash) || ""
                    if (deployed) {
                        const ensName = await getENS(deployed)
                        isOwnable = await checkIfOwnable(deployed)
                        if (!isOwnable) {
                            isOwnable = await checkIfReverseClaimable(deployed)
                        }
                        const contract: Contract = { ensName, contractAddress: deployed, txHash, isOwnable }
                        console.log("contract - ", contract)

                        if (isMounted) {
                            if (ensName) {
                                setWithENS(prev => {
                                    const alreadyExists = prev.some(c => c.contractAddress === contract.contractAddress);
                                    return alreadyExists ? prev : [contract, ...prev];
                                });
                            } else {
                                setWithoutENS(prev => {
                                    const alreadyExists = prev.some(c => c.contractAddress === contract.contractAddress);
                                    return alreadyExists ? prev : [contract, ...prev];
                                });
                            }
                        }
                    }
                }
            }
            setProcessing(false);
        } catch (e) {
            setError('Failed to fetch transactions')
        } finally {
            if (isMounted) setLoading(false)
        }

        return () => { isMounted = false }
    }

    const extractDeployed = async (txHash: string): Promise<string | null> => {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum)
            const receipt = await (await provider.getSigner()).provider.getTransactionReceipt(txHash)
            for (const log of receipt!.logs) {
                if (log.topics[0] === topic0) {
                    return ethers.getAddress('0x' + log.topics[1].slice(-40))
                }
            }
            return null
        } catch {
            return null
        }
    }

    const getENS = async (addr: string): Promise<string> => {
        if (chain?.id == 1 || chain?.id == 11155111) {
            try {
                return (await (await signer)?.provider.lookupAddress(addr)) || ''
            } catch {
                return ''
            }
        } else {
            try {
                const reverseRegistrarContract = new ethers.Contract(config?.REVERSE_REGISTRAR!, ["function node(address) view returns (bytes32)"], (await signer)?.provider);
                const reversedNode = await reverseRegistrarContract.node(addr)
                const resolverContract = new ethers.Contract(config?.PUBLIC_RESOLVER!, ["function name(bytes32) view returns (string)"], (await signer)?.provider);
                const name = await resolverContract.name(reversedNode)
                return name || '';
            } catch (error) {
                return ''
            }
        }

    }

    const checkIfOwnable = async (address: string): Promise<boolean> => {
        try {
            const contract = new ethers.Contract(address, ["function owner() view returns (address)"], (await signer)?.provider);
            await contract.owner();
            return true
        } catch (err) {
            return false
        }
    };

    const checkIfReverseClaimable = async (address: string): Promise<boolean> => {
        try {
            const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, (await signer))
            const addrLabel = address.slice(2).toLowerCase()
            const reversedNode = namehash(addrLabel + "." + "addr.reverse")
            const resolvedAddr = await ensRegistryContract.owner(reversedNode)

            const sender = (await signer)
            const signerAddress = sender?.address;
            if (resolvedAddr === signerAddress) {
                return true
            } else {
                return false
            }
        } catch (err) {
            console.log("err " + err);
            return false
        }
    };


    const truncate = (text: string) =>
        text.length <= 20 ? text : `${text.slice(0, 20)}...${text.slice(-3)}`

    const paginated = (list: Contract[], page: number) =>
        list.slice((page - 1) * itemsPerPage, page * itemsPerPage)

    return (
        <div className="flex flex-col space-y-2 max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
            {!isConnected ? (
                <p className="text-red-500 text-lg text-center">Please connect your wallet</p>
            ) : error ? (
                <p className="text-red-500">{error}</p>
            ) : (
                <Tabs defaultValue="with-ens" >
                    <TabsList className="inline-flex bg-white shadow-sm">
                        <TabsTrigger
                            value="with-ens"
                            className="px-6 py-2 rounded-md text-sm font-medium transition-all bg-white text-black data-[state=active]:bg-black data-[state=active]:text-white">
                            Named Contracts
                        </TabsTrigger>

                        <TabsTrigger
                            value="without-ens"
                            className="px-6 py-2 rounded-md text-sm font-medium transition-all bg-white text-black data-[state=active]:bg-black data-[state=active]:text-white">
                            Unnamed Contracts
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="with-ens">
                        <Card className="p-6">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>ENS Name</TableHead>
                                        <TableHead>Address</TableHead>
                                        <TableHead>Tx Hash</TableHead>
                                        <TableHead className="text-center">View on Apps</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginated(withENS, pageWith).map((c, i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                <Link href={`${ensAppUrl}${c.ensName}`} target="_blank" className="text-blue-600 hover:underline">
                                                    {c.ensName}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <Link href={`${etherscanUrl}address/${c.contractAddress}`} target="_blank" className="text-blue-600 hover:underline">
                                                    {truncate(c.contractAddress)}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <Link href={`${etherscanUrl}tx/${c.txHash}`} target="_blank" className="text-blue-600 hover:underline">
                                                    {truncate(c.txHash)}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="flex gap-2 justify-center">
                                                <Button asChild variant="outline">
                                                    <Link href={`${etherscanUrl}tx/${c.txHash}`} target="_blank">
                                                        Etherscan
                                                    </Link>
                                                </Button>
                                                {chainlensUrl ?
                                                    <Button asChild variant="outline">
                                                        <Link href={`${chainlensUrl}transactions/${c.txHash}`} target="_blank">
                                                            Chainlens
                                                        </Link>
                                                    </Button>
                                                    :
                                                    <Button asChild variant="outline">
                                                        <Link href={`${blockscoutUrl}tx/${c.txHash}`} target="_blank">
                                                            Blockscout
                                                        </Link>
                                                    </Button>
                                                }

                                                <Button asChild variant="outline">
                                                    <Link href={`${ensAppUrl}${c.ensName}`} target="_blank">
                                                        ENS App
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!processing && withENS.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-black-700 py-4">
                                                No Contracts Deployed
                                            </TableCell>
                                        </TableRow>
                                    )}

                                    {processing && (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-4">
                                                <div className="w-6 h-6 mx-auto border-4 border-gray-300 border-t-black rounded-full animate-spin"></div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>

                            </Table>
                            <div className="flex justify-center mt-4 space-x-4">
                                <Button
                                    variant="ghost"
                                    onClick={() => setPageWith(p => p - 1)}
                                    disabled={pageWith === 1}
                                >
                                    Previous
                                </Button>

                                <Badge>
                                    {`Page ${pageWith} of ${Math.max(1, Math.ceil(withENS.length / itemsPerPage))}`}
                                </Badge>

                                <Button
                                    variant="ghost"
                                    onClick={() => setPageWith(p => p + 1)}
                                    disabled={pageWith >= Math.ceil(withENS.length / itemsPerPage)}
                                >
                                    Next
                                </Button>
                            </div>
                        </Card>
                    </TabsContent>

                    <TabsContent value="without-ens">
                        <Card className="p-6">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Address</TableHead>
                                        <TableHead>Tx Hash</TableHead>
                                        <TableHead className="text-center">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginated(withoutENS, pageWithout).map((c, i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                <Link href={`${etherscanUrl}address/${c.contractAddress}`} target="_blank" className="text-blue-600 hover:underline">
                                                    {truncate(c.contractAddress)}
                                                </Link>
                                                {c.isOwnable ?
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <InformationCircleIcon className="w-5 h-5 inline text-green-700 ml-2 cursor-pointer" />
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" align="center">
                                                                <p>You can set Primary Name for this contract</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                    :
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <ExclamationCircleIcon className="w-5 h-5 inline text-amber-500 ml-2 cursor-pointer" />
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" align="center">
                                                                <p>You can only set Forward Resolution for this contract</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                }
                                            </TableCell>
                                            <TableCell>
                                                <Link href={`${etherscanUrl}tx/${c.txHash}`} target="_blank" className="text-blue-600 hover:underline">
                                                    {truncate(c.txHash)}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="flex gap-2 justify-center">
                                                {c.isOwnable ?
                                                    <Button asChild variant="default">
                                                        <Link href={`/nameContract?contract=${c.contractAddress}`} target="_blank">
                                                            Name Contract
                                                        </Link>
                                                    </Button>
                                                    :
                                                    <Button asChild variant="default">
                                                        <Link href={`/nameContract?contract=${c.contractAddress}`} target="_blank">
                                                            Forward Resolve
                                                        </Link>
                                                    </Button>

                                                }
                                                {/* <Button asChild variant="default">
                                                    <Link href={`/nameContract?contract=${c.contractAddress}`} target="_blank">
                                                        Name Contract
                                                    </Link>
                                                </Button> */}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!processing && withoutENS.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-black-700 py-4">
                                                No Contracts Deployed
                                            </TableCell>
                                        </TableRow>
                                    )}

                                    {processing && (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center py-4">
                                                <div className="w-6 h-6 mx-auto border-4 border-gray-300 border-t-black rounded-full animate-spin"></div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>

                            </Table>
                            <div className="flex justify-center mt-4 space-x-4">
                                <Button
                                    variant="ghost"
                                    onClick={() => setPageWithout(p => p - 1)}
                                    disabled={pageWithout === 1}
                                >
                                    Previous
                                </Button>

                                <Badge>
                                    {`Page ${pageWithout} of ${Math.max(1, Math.ceil(withoutENS.length / itemsPerPage))}`}
                                </Badge>

                                <Button
                                    variant="ghost"
                                    onClick={() => setPageWithout(p => p + 1)}
                                    disabled={pageWithout >= Math.ceil(withoutENS.length / itemsPerPage)}
                                >
                                    Next
                                </Button>
                            </div>
                        </Card>
                    </TabsContent>
                </Tabs>
            )}
        </div>
    )
}
