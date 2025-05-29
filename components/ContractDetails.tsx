import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useAccount, usePublicClient } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';
import { CONTRACTS } from '@/utils/constants';
import { CHAINS } from '@/utils/constants';
import reverseRegistrarABI from '@/contracts/ReverseRegistrar';
import publicResolverABI from '@/contracts/PublicResolver';

interface ContractDetailsProps {
    address: string;
    chainId?: number;
}

interface ENSDomain {
    name: string;
    isPrimary?: boolean;
}

export default function ContractDetails({ address, chainId }: ContractDetailsProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ensNames, setEnsNames] = useState<ENSDomain[]>([]);
    const [primaryName, setPrimaryName] = useState<string | null>(null);
    const { chain } = useAccount();
    const publicClient = usePublicClient();
    const [customProvider, setCustomProvider] = useState<ethers.JsonRpcProvider | null>(null);

    // Use provided chainId if available, otherwise use connected wallet's chain
    const effectiveChainId = chainId || chain?.id;
    const config = effectiveChainId ? CONTRACTS[effectiveChainId] : undefined;
    const etherscanUrl = config?.ETHERSCAN_URL || 'https://etherscan.io/';

    // Initialize custom provider when chainId changes
    useEffect(() => {
        if (effectiveChainId && config?.RPC_ENDPOINT) {
            try {
                const provider = new ethers.JsonRpcProvider(config.RPC_ENDPOINT);
                setCustomProvider(provider);
            } catch (err) {
                console.error('Error initializing provider:', err);
                setError('Failed to initialize provider for the selected chain');
            }
        }
    }, [effectiveChainId, config]);

    useEffect(() => {
        const fetchContractDetails = async () => {
            if (!address) return;

            setIsLoading(true);
            setError(null);

            try {
                // 1. Try to get the primary name for this address
                // Create an ethers provider from the publicClient
                const provider = new ethers.JsonRpcProvider(publicClient!.transport.url);
                const primaryENS = await getENS(address, provider)
                if (primaryENS) {
                    setPrimaryName(primaryENS);
                }

                // 2. Fetch all ENS names resolving to this address using subgraph
                const subgraphEndpoint = chain?.id === 11155111
                    ? 'https://api.sepolia.ensnode.io/subgraph'
                    : 'https://gateway.thegraph.com/api/subgraphs/id/DmMXLtMZnGbQXASJ7p1jfzLUbBYnYUD9zNBTxpkjHYXV';

                const response = await fetch(subgraphEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
                    },
                    body: JSON.stringify({
                        query: `query GetENSNames { domains(where: { resolvedAddress: "${address.toLowerCase()}" }) { name } }`
                    })
                });

                const data = await response.json();

                if (data.data && data.data.domains) {
                    const domains = data.data.domains.map((domain: { name: string }) => ({
                        name: domain.name,
                        isPrimary: domain.name === primaryENS
                    }));

                    // Sort domains: primary first, then by length (shorter first)
                    const sortedDomains = domains.sort((a, b) => {
                        if (a.isPrimary) return -1;
                        if (b.isPrimary) return 1;
                        return a.name.length - b.name.length;
                    });

                    setEnsNames(sortedDomains);
                }
            } catch (err) {
                console.error('Error fetching contract details:', err);
                setError('Failed to fetch contract details');
            } finally {
                setIsLoading(false);
            }
        };

        fetchContractDetails();
    }, [address, publicClient, chain?.id]);

    const getENS = async (addr: string, provider: ethers.JsonRpcProvider): Promise<string> => {
        if (chain?.id === CHAINS.MAINNET || chain?.id === CHAINS.SEPOLIA) {
            try {
                return (await provider.lookupAddress(addr)) || ''
            } catch {
                return ''
            }
        } else {
            try {
                const reverseRegistrarContract = new ethers.Contract(config?.REVERSE_REGISTRAR!, reverseRegistrarABI, provider);
                const reversedNode = await reverseRegistrarContract.node(addr)
                const resolverContract = new ethers.Contract(config?.PUBLIC_RESOLVER!, publicResolverABI, provider);
                const name = await resolverContract.name(reversedNode)
                return name || '';
            } catch (error) {
                return ''
            }
        }

    }

    if (isLoading) {
        return (
            <Card className="w-full max-w-5xl bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 mt-6">
                <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                        Contract Details
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-6 w-1/2" />
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="w-full max-w-5xl bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 mt-6">
                <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                        Contract Details
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="text-red-500 dark:text-red-400">{error}</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-5xl bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 mt-6">
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                    Contract Details
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Contract Address</h3>
                        <div className="flex items-center mt-1">
                            <p className="text-gray-900 dark:text-white font-mono text-sm break-all">{address}</p>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="ml-2"
                                asChild
                            >
                                <a href={`${etherscanUrl}address/${address}`} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-4 w-4" />
                                </a>
                            </Button>
                        </div>
                    </div>

                    {primaryName && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Primary ENS Name</h3>
                            <p className="text-gray-900 dark:text-white mt-1">{primaryName}</p>
                        </div>
                    )}

                    {ensNames.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                Associated ENS Names ({ensNames.length})
                            </h3>
                            <div className="mt-2 space-y-2">
                                {ensNames.map((domain, index) => (
                                    <div
                                        key={index}
                                        className={`p-2 rounded-md ${domain.isPrimary
                                            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                                            : 'bg-gray-50 dark:bg-gray-700/30'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-900 dark:text-white">{domain.name}</span>
                                            {domain.isPrimary && (
                                                <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">
                                                    Primary
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {ensNames.length === 0 && (
                        <div className="text-gray-500 dark:text-gray-400 italic">
                            No ENS names found for this contract address
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
