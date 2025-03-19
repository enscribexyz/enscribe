import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Contract {
    ensName: string;
    contractAddress: string;
    txHash: string;
    isPrimary: boolean;
    isOwnable: boolean;
}

export default function ContractHistory() {
    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const contractAddress = process.env.NEXT_PUBLIC_WEB3_LAB_CONTRACT_ADDRESS || "0x77e78294f0b8CB54708393F6d7fa79eF7CFB589C";
    const topic0_setName = process.env.NEXT_PUBLIC_TOPIC0_SET_NAME;

    useEffect(() => {
        if (!isConnected || !address || !walletClient) return;
        fetchTransactions();
    }, [address, isConnected, walletClient]);

    const fetchTransactions = async () => {
        setLoading(true);
        setError(null);

        try {
            const url = process.env.NEXT_PUBLIC_ETHERSCAN_URL + `&address=${address}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== '1' || !data.result) {
                setLoading(false);
                return;
            }

            const filteredTxs = data.result.filter((tx: any) =>
                tx.to.toLowerCase() === contractAddress.toLowerCase()
            );

            const contractData: Contract[] = [];
            for (const tx of filteredTxs) {
                const { deployedAddress, ensName } = await fetchTransactionReceipt(tx.hash);
                if (deployedAddress) {
                    const isPrimary = await checkPrimaryENS(deployedAddress) || false
                    const isOwnable = await checkOwnableContract(deployedAddress) || false

                    contractData.push({
                        ensName: ensName || 'N/A',
                        contractAddress: deployedAddress,
                        txHash: tx.hash,
                        isPrimary,
                        isOwnable
                    });
                }
            }

            setContracts(contractData.reverse());
        } catch (error: any) {
            setError('Failed to fetch contract history');
        } finally {
            setLoading(false);
        }
    };

    const fetchTransactionReceipt = async (txHash: string): Promise<{ deployedAddress: string | null; ensName: string | null }> => {
        try {
            if (!walletClient) return { deployedAddress: null, ensName: null };

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const receipt = await signer.provider.getTransactionReceipt(txHash);

            if (!receipt || !receipt.logs) return { deployedAddress: null, ensName: null };

            let deployedAddr: string | null = null;
            let ensName: string | null = null;

            for (const log of receipt.logs) {
                if (log.topics[0] === topic0_setName) {
                    deployedAddr = ethers.getAddress("0x" + log.topics[1].slice(-40));
                    const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(['string'], log.data);
                    ensName = decodedData[0];
                }
            }

            return { deployedAddress: deployedAddr, ensName };
        } catch (error) {
            return { deployedAddress: null, ensName: null };
        }
    };

    const checkPrimaryENS = async (address: string): Promise<boolean> => {
        const signer = new ethers.BrowserProvider(window.ethereum).getSigner()
        try {
            if (!address || address === 'N/A') return false;
            const ensName = await (await signer)?.provider.lookupAddress(address)
            return ensName !== null;
        } catch (error) {
            return false;
        }
    };

    const checkOwnableContract = async (contractAddress: string): Promise<boolean> => {
        const signer = new ethers.BrowserProvider(window.ethereum).getSigner()
        try {
            const contract = new ethers.Contract(contractAddress, ["function owner() view returns (address)"], (await signer).provider);
            await contract.owner();
            return true;
        } catch (err) {
            return false;
        }
    };

    const truncateText = (text: string) => text.length <= 20 ? text : `${text.slice(0, 40)}...${text.slice(-3)}`;

    const totalPages = Math.ceil(contracts.length / itemsPerPage);
    const paginatedContracts = contracts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="container mx-auto p-6">
            {!isConnected ? (
                <p className="text-red-500 text-lg text-center">Please connect your wallet to view contract history.</p>
            ) : loading ? (
                <Skeleton className="h-10 w-full rounded-lg" />
            ) : error ? (
                <p className="text-red-500">{error}</p>
            ) : contracts.length === 0 ? (
                <p className="text-gray-700 dark:text-gray-300 text-center">No transactions found.</p>
            ) : (
                <Card className="p-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ENS Name</TableHead>
                                <TableHead>Contract Address</TableHead>
                                <TableHead>Transaction Hash</TableHead>
                                <TableHead className="text-center">View on Apps</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedContracts.map((contract, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <Link href={`https://app.ens.domains/${contract.ensName}`} target="_blank" className="text-blue-600 hover:underline">
                                            {contract.ensName}
                                        </Link>
                                        {contract.isPrimary && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <CheckCircleIcon className="w-5 h-5 inline text-green-500 ml-2 cursor-pointer" />
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" align="center">
                                                        <p>Primary Name</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`https://sepolia.etherscan.io/address/${contract.contractAddress}`} target="_blank" className="text-blue-600 hover:underline">
                                            {contract.contractAddress}
                                        </Link>
                                        {contract.isOwnable && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <InformationCircleIcon className="w-5 h-5 inline text-gray-500 ml-2 cursor-pointer" />
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" align="center">
                                                        <p>Extends Ownable</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`https://sepolia.etherscan.io/tx/${contract.txHash}`} target="_blank" className="text-blue-600 hover:underline">
                                            {truncateText(contract.txHash)}
                                        </Link>
                                    </TableCell>
                                    <TableCell className="flex gap-2 justify-center">
                                        <Button asChild variant="outline">
                                            <Link href={`https://sepolia.etherscan.io/tx/${contract.txHash}`} target="_blank">
                                                Etherscan
                                            </Link>
                                        </Button>
                                        <Button asChild variant="outline">
                                            <Link href={`https://eth-sepolia.blockscout.com/tx/${contract.txHash}`} target="_blank">
                                                Blockscout
                                            </Link>
                                        </Button>
                                        <Button asChild variant="outline">
                                            <Link href={`https://app.ens.domains/${contract.ensName}`} target="_blank">
                                                ENS App
                                            </Link>
                                        </Button>
                                    </TableCell>

                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    <div className="flex justify-center mt-4 space-x-4">
                        <Button
                            variant="ghost"
                            onClick={() => setCurrentPage(currentPage - 1)}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </Button>
                        <Badge>{`Page ${currentPage} of ${totalPages}`}</Badge>
                        <Button
                            variant="ghost"
                            onClick={() => setCurrentPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    );
}