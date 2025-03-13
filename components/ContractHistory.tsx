import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAccount, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface Contract {
    ensName: string;
    contractAddress: string;
    txHash: string;
}

export default function ContractHistory() {
    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const contractAddress = process.env.NEXT_PUBLIC_WEB3_LAB_CONTRACT_ADDRESS || "0xDe3F100397CC5d9eFEc6Ae5c6e8B9adE2d5eaC97";
    const topic0_deployment = process.env.NEXT_PUBLIC_TOPIC0_DEPLOYMENT;
    const topic0_nameChanged = process.env.NEXT_PUBLIC_TOPIC0_NAME_CHANGED;

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
                    contractData.push({
                        ensName: ensName || 'N/A',
                        contractAddress: deployedAddress,
                        txHash: tx.hash
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
                if (log.topics[0] === topic0_deployment) {
                    deployedAddr = ethers.getAddress("0x" + log.data.slice(-40));
                } else if (log.topics[0] === topic0_nameChanged) {
                    const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(["string"], log.data);
                    ensName = decodedData[0];
                }
            }

            return { deployedAddress: deployedAddr, ensName };
        } catch (error) {
            return { deployedAddress: null, ensName: null };
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
                                    </TableCell>
                                    <TableCell>
                                        <Link href={`https://sepolia.etherscan.io/address/${contract.contractAddress}`} target="_blank" className="text-blue-600 hover:underline">
                                            {contract.contractAddress}
                                        </Link>
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