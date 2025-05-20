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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CONTRACTS, TOPIC0, CHAINS, SOURCIFY_URL, ETHERSCAN_API } from '../utils/constants'
import ensRegistryABI from '../contracts/ENSRegistry'
import reverseRegistrarABI from '@/contracts/ReverseRegistrar'
import publicResolverABI from '../contracts/PublicResolver'
import { BadgeCheckIcon, CheckCircle2Icon, CircleAlert, Info, ShieldAlertIcon, ShieldCheck, XCircle } from 'lucide-react'


interface Contract {
    ensName: string
    contractAddress: string
    txHash: string
    contractCreated: string
    isOwnable: boolean;
    sourcifyVerification?: 'exact_match' | 'match' | 'unverified';
    etherscanVerification?: 'verified' | 'unverified';
    blockscoutVerification?: 'exact_match' | 'match' | 'unverified';
    attestation?: 'audited' | 'unaudited';
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

    const etherscanApi = `${ETHERSCAN_API}&chainid=${chain?.id}&module=account&action=txlist&address=${address}&startblock=0&endblock=999999999999&sort=asc`
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
            // const url = `${etherscanApi}&action=txlist&address=${address}`

            console.log("etherscan api - ", etherscanApi)
            const res = await fetch(etherscanApi)
            const data = await res.json()

            setProcessing(true);

            for (const tx of data.result || []) {
                const txHash = tx.hash
                let isOwnable = false

                const contractCreated = new Date(parseInt(tx.timeStamp) * 1000).toLocaleString()
                // const contractCreated = `${date.getDate().toString().padStart(2, '0')}/${date.toLocaleString('default', { month: 'long' })}/${date.getFullYear()}`;

                if (tx.to === '') {
                    const contractAddr = tx.contractAddress

                    isOwnable = await checkIfOwnable(contractAddr)
                    if (!isOwnable) {
                        isOwnable = await checkIfReverseClaimable(contractAddr)
                    }

                    const result = await getContractStatus(chain?.id, contractAddr)
                    const sourcifyVerification = result.sourcify_verification
                    const etherscanVerification = result.etherscan_verification
                    const blockscoutVerification = result.blockscout_verification
                    const attestation = result.audit_status
                    // const ensName = result.ens_name
                    const ensName = await getENS(contractAddr)

                    const contract: Contract = { ensName, contractAddress: contractAddr, txHash, contractCreated, isOwnable, sourcifyVerification, etherscanVerification, blockscoutVerification, attestation }
                    // const contract: Contract = { ensName, contractAddress: contractAddr, txHash, isOwnable }
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
                        isOwnable = await checkIfOwnable(deployed)
                        if (!isOwnable) {
                            isOwnable = await checkIfReverseClaimable(deployed)
                        }

                        const result = await getContractStatus(chain?.id, deployed)
                        const sourcifyVerification = result.sourcify_verification
                        const etherscanVerification = result.etherscan_verification
                        const blockscoutVerification = result.blockscout_verification
                        const attestation = result.audit_status
                        // const ensName = result.ens_name
                        const ensName = await getENS(deployed)

                        const contract: Contract = { ensName, contractAddress: deployed, txHash, contractCreated, isOwnable, sourcifyVerification, etherscanVerification, blockscoutVerification, attestation }

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
        if (chain?.id === CHAINS.MAINNET || chain?.id === CHAINS.SEPOLIA) {
            try {
                return (await (await signer)?.provider.lookupAddress(addr)) || ''
            } catch {
                return ''
            }
        } else {
            try {
                const reverseRegistrarContract = new ethers.Contract(config?.REVERSE_REGISTRAR!, reverseRegistrarABI, (await signer)?.provider);
                const reversedNode = await reverseRegistrarContract.node(addr)
                const resolverContract = new ethers.Contract(config?.PUBLIC_RESOLVER!, publicResolverABI, (await signer)?.provider);
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

    const getContractStatus = async (chainId: number | undefined, address: string,) => {
        const defaultStatus = {
            sourcify_verification: "unverified",
            etherscan_verification: "unverified",
            audit_status: "unaudited",
            attestation_tx_hash: "0xabc123",
            blockscout_verification: "unverified",
            ens_name: ""
        }

        try {
            const res = await fetch(`/api/v1/verification/${chainId}/${address.toLowerCase()}`);
            if (!res.ok) return defaultStatus

            const data = await res.json();

            if (data) return data;
            return defaultStatus;
        } catch {
            return defaultStatus;
        }
    }

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
                                        <TableHead>Date Created</TableHead>
                                        <TableHead className="text-center">View on Apps</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginated(withENS, pageWith).map((c, i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Link href={`${ensAppUrl}${c.ensName}`} target="_blank" className="text-blue-600 hover:underline">
                                                        {c.ensName}
                                                    </Link>
                                                    <TooltipProvider>
                                                        {(c.sourcifyVerification === 'exact_match')
                                                            && c.attestation === 'audited' && (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <ShieldCheck className="w-5 h-5 text-green-500 cursor-pointer" />
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>Trusted - Named and Verified Contract</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        {c.sourcifyVerification === 'match'
                                                            && c.attestation === 'audited' && (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <ShieldCheck className="w-5 h-5 text-amber-500 cursor-pointer" />
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>Trusted - Named and Verified Contract</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            )}
                                                        {c.sourcifyVerification === 'unverified' && (
                                                            <div className="flex items-center gap-2">
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <ShieldAlertIcon className="w-5 h-5 text-red-500 cursor-pointer" />
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>Trusted - Named and Verified Contract</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                                <Button
                                                                    asChild
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="border border-green-800 text-black hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                                >
                                                                    <Link
                                                                        href={`/requestAudit?contract=${c.contractAddress}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="cursor-pointer"
                                                                    >
                                                                        Request Audit
                                                                    </Link>
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </TooltipProvider>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Link
                                                        href={`${etherscanUrl}address/${c.contractAddress}`}
                                                        // href={`${SOURCIFY_URL}${chain?.id}/${c.contractAddress.toLowerCase()}`}
                                                        target="_blank"
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {truncate(c.contractAddress)}
                                                    </Link>

                                                    {(c.sourcifyVerification === 'exact_match' || c.sourcifyVerification === 'match') && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="border border-green-800 text-green-800 hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${SOURCIFY_URL}${chain?.id}/${c.contractAddress.toLowerCase()}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="cursor-pointer"
                                                                >
                                                                    <img src="/sourcify.svg" alt="Sourcify" className="w-4 h-4" />
                                                                    Verified
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {c.etherscanVerification === 'verified' && (
                                                        <div className="flex items-center gap-2">

                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="border border-green-800 text-green-800 hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${etherscanUrl}address/${c.contractAddress}#code`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    <img src="/etherscan.svg" alt="Etherscan" className="w-4 h-4" />
                                                                    Verifed
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {(c.blockscoutVerification === 'exact_match' || c.blockscoutVerification === 'match') && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="border border-green-800 text-green-800 hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${config?.BLOCKSCOUT_URL}address/${c.contractAddress.toLowerCase()}?tab=contract`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="cursor-pointer"
                                                                >
                                                                    <img src="/blockscout.svg" alt="Blockscout" className="w-4 h-4" />
                                                                    Verified
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {c.sourcifyVerification === 'unverified' && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="hover:bg-gray-200 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`https://sourcify.dev/#/verifier`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    <img src="/sourcify.svg" alt="Sourcify" className="w-4 h-4" />
                                                                    Verify
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {c.etherscanVerification === 'unverified' && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="hover:bg-gray-200 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${etherscanUrl}address/${c.contractAddress}#code`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    <img src="/etherscan.svg" alt="Etherscan" className="w-4 h-4" />
                                                                    Verify
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {(c.blockscoutVerification === 'unverified') && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="hover:bg-gray-200 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${config?.BLOCKSCOUT_URL}address/${c.contractAddress.toLowerCase()}?tab=contract`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="cursor-pointer"
                                                                >
                                                                    <img src="/blockscout.svg" alt="Blockscout" className="w-4 h-4" />
                                                                    Verify
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {c.contractCreated}
                                            </TableCell>
                                            <TableCell className="flex gap-2 justify-center">
                                                <Button asChild variant="outline" className="hover:bg-gray-200">
                                                    <Link href={`${etherscanUrl}tx/${c.txHash}`} target="_blank">
                                                        <img src="/etherscan.svg" alt="Etherscan" className="w-5 h-5" />
                                                        Etherscan
                                                    </Link>
                                                </Button>
                                                {chainlensUrl ?
                                                    <Button asChild variant="outline" className="hover:bg-gray-200">
                                                        <Link href={`${chainlensUrl}transactions/${c.txHash}`} target="_blank">
                                                            <img src="/chainlens.png" alt="Chainlens" className="w-5 h-5" />
                                                            Chainlens
                                                        </Link>
                                                    </Button>
                                                    :
                                                    <Button asChild variant="outline" className="hover:bg-gray-200">
                                                        <Link href={`${blockscoutUrl}tx/${c.txHash}`} target="_blank">
                                                            <img src="/blockscout.svg" alt="Blockscout" className="w-5 h-5" />
                                                            Blockscout
                                                        </Link>
                                                    </Button>
                                                }

                                                <Button asChild variant="outline" className="hover:bg-gray-200">
                                                    <Link href={`${ensAppUrl}${c.ensName}`} target="_blank">
                                                        <img src="/ens.svg" alt="ENS" className="w-5 h-5" />
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
                                        <TableHead>Date Created</TableHead>
                                        <TableHead className="text-center">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginated(withoutENS, pageWithout).map((c, i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Link href={`${etherscanUrl}address/${c.contractAddress}`} target="_blank" className="text-blue-600 hover:underline">
                                                        {truncate(c.contractAddress)}
                                                    </Link>
                                                    {c.isOwnable ?
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Info className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer" />
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
                                                                    <CircleAlert className="w-5 h-5 inline text-amber-500 ml-2 cursor-pointer" />
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top" align="center">
                                                                    <p>You can only set Forward Resolution for this contract</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    }

                                                    {(c.sourcifyVerification === 'exact_match' || c.sourcifyVerification === 'match') && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="border border-green-800 text-green-800 hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${SOURCIFY_URL}${chain?.id}/${c.contractAddress.toLowerCase()}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="cursor-pointer"
                                                                >
                                                                    <img src="/sourcify.svg" alt="Sourcify" className="w-4 h-4" />
                                                                    Verified
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {c.etherscanVerification === 'verified' && (
                                                        <div className="flex items-center gap-2">

                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="border border-green-800 text-green-800 hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${etherscanUrl}address/${c.contractAddress}#code`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    <img src="/etherscan.svg" alt="Etherscan" className="w-4 h-4" />
                                                                    Verifed
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {(c.blockscoutVerification === 'exact_match' || c.blockscoutVerification === 'match') && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="border border-green-800 text-green-800 hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${config?.BLOCKSCOUT_URL}address/${c.contractAddress.toLowerCase()}?tab=contract`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="cursor-pointer"
                                                                >
                                                                    <img src="/blockscout.svg" alt="Blockscout" className="w-4 h-4" />
                                                                    Verified
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {c.sourcifyVerification === 'unverified' && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="hover:bg-gray-200 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`https://sourcify.dev/#/verifier`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    <img src="/sourcify.svg" alt="Sourcify" className="w-4 h-4" />
                                                                    Verify
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {c.etherscanVerification === 'unverified' && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="hover:bg-gray-200 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${etherscanUrl}address/${c.contractAddress}#code`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    <img src="/etherscan.svg" alt="Etherscan" className="w-4 h-4" />
                                                                    Verify
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {(c.blockscoutVerification === 'unverified') && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                asChild
                                                                size="sm"
                                                                variant="outline"
                                                                className="hover:bg-gray-200 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                                            >
                                                                <Link
                                                                    href={`${config?.BLOCKSCOUT_URL}address/${c.contractAddress.toLowerCase()}?tab=contract`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="cursor-pointer"
                                                                >
                                                                    <img src="/blockscout.svg" alt="Blockscout" className="w-4 h-4" />
                                                                    Verify
                                                                </Link>
                                                            </Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Link href={`${etherscanUrl}tx/${c.txHash}`} target="_blank" className="text-blue-600 hover:underline">
                                                    {truncate(c.txHash)}
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                {c.contractCreated}
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
