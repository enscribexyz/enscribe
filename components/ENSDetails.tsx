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
import { createPublicClient, http } from 'viem';
import Link from 'next/link';

interface ENSDetailsProps {
    address: string;
    chainId?: number;
    isContract: boolean;
}

interface ENSDomain {
    name: string;
    isPrimary?: boolean;
    expiryDate?: number;
}

interface VerificationStatus {
    sourcify_verification: string;
    etherscan_verification: string;
    blockscout_verification: string;
    audit_status: string;
    attestation_tx_hash: string;
    ens_name: string;
}

export default function ENSDetails({ address, chainId, isContract }: ENSDetailsProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ensNames, setEnsNames] = useState<ENSDomain[]>([]);
    const [primaryName, setPrimaryName] = useState<string | null>(null);
    const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
    const { chain, isConnected } = useAccount();
    const walletPublicClient = usePublicClient();
    const [customProvider, setCustomProvider] = useState<ethers.JsonRpcProvider | null>(null);
    const [viemClient, setViemClient] = useState<any>(null);

    // Use provided chainId if available, otherwise use connected wallet's chain
    const effectiveChainId = chainId || chain?.id;
    const config = effectiveChainId ? CONTRACTS[effectiveChainId] : undefined;
    const etherscanUrl = config?.ETHERSCAN_URL || 'https://etherscan.io/';
    const SOURCIFY_URL = 'https://sourcify.dev/#/lookup/';

    // Determine if we should use the wallet client or a custom provider
    const shouldUseWalletClient = isConnected && chainId === chain?.id;

    console.log('[ENSDetails] Wallet connection status:', {
        isConnected,
        walletChainId: chain?.id,
        providedChainId: chainId,
        shouldUseWalletClient
    });

    // Initialize custom provider and viem client when chainId changes
    useEffect(() => {
        if (effectiveChainId && config?.RPC_ENDPOINT) {
            try {
                // Initialize ethers provider
                const provider = new ethers.JsonRpcProvider(config.RPC_ENDPOINT);
                setCustomProvider(provider);

                // Initialize viem client
                const client = createPublicClient({
                    transport: http(config.RPC_ENDPOINT),
                    chain: {
                        id: effectiveChainId,
                        name: config.name || 'Unknown Chain',
                        nativeCurrency: {
                            name: 'Ether',
                            symbol: 'ETH',
                            decimals: 18
                        },
                        rpcUrls: {
                            default: { http: [config.RPC_ENDPOINT] },
                            public: { http: [config.RPC_ENDPOINT] }
                        }
                    }
                });
                setViemClient(client);

                console.log(`[ContractDetails] Initialized custom provider for chain ${effectiveChainId}`);
            } catch (err) {
                console.error('Error initializing provider:', err);
                setError('Failed to initialize provider for the selected chain');
            }
        }
    }, [effectiveChainId, config]);

    // Function to get contract verification status
    const getContractStatus = async (chainId: number | undefined, address: string) => {
        const defaultStatus = {
            sourcify_verification: "unverified",
            etherscan_verification: "unverified",
            audit_status: "unaudited",
            attestation_tx_hash: "0xabc123",
            blockscout_verification: "unverified",
            ens_name: ""
        }

        try {
            if (!chainId) return defaultStatus;

            console.log(`[ENSDetails] Fetching verification status for ${address} on chain ${chainId}`);
            const res = await fetch(`/api/v1/verification/${chainId}/${address.toLowerCase()}`);
            if (!res.ok) return defaultStatus;

            const data = await res.json();
            console.log(`[ENSDetails] Verification status:`, data);

            if (data) return data;
            return defaultStatus;
        } catch (error) {
            console.error('[ENSDetails] Error fetching verification status:', error);
            return defaultStatus;
        }
    }

    useEffect(() => {
        // Always clear error on dependency change
        setError(null);

        // Only fetch when a provider is available
        if (!address) return;
        if (!config) {
            setError('Chain ID is not supported.');
            setIsLoading(false);
            return;
        }
        if (!(shouldUseWalletClient && walletPublicClient) && !customProvider) {
            console.log('[ContractDetails] Waiting for provider to be ready', {
                shouldUseWalletClient,
                walletPublicClient,
                customProvider
            });
            return;
        }
        const fetchContractDetails = async () => {
            if (!address) return;

            setIsLoading(true);
            setError(null);

            try {
                // 1. Try to get the primary name for this address
                let provider;

                if (shouldUseWalletClient && walletPublicClient) {
                    // Use wallet provider if wallet is connected and chain matches
                    console.log('[ContractDetails] Using wallet provider for ENS lookup');
                    provider = new ethers.JsonRpcProvider(walletPublicClient.transport.url);
                } else if (customProvider) {
                    // Use custom provider with Infura/RPC endpoint
                    console.log('[ContractDetails] Using custom provider for ENS lookup');
                    provider = customProvider;
                } else {
                    throw new Error('No provider available');
                }

                const primaryENS = await getENS(address, provider);
                if (primaryENS) {
                    setPrimaryName(primaryENS);
                }

                // 2. Fetch all ENS names resolving to this address using subgraph from config
                if (!config?.SUBGRAPH_API) {
                    console.warn('No subgraph API endpoint configured for this chain');
                    return;
                }

                // First, fetch all domains for the address
                const domainsResponse = await fetch(config.SUBGRAPH_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
                    },
                    body: JSON.stringify({
                        query: `
                            query GetENSNames($address: String!) {
                                domains(where: { resolvedAddress: $address }) { 
                                    name 
                                }
                            }
                        `,
                        variables: {
                            address: address.toLowerCase()
                        }
                    })
                });

                const domainsData = await domainsResponse.json();

                if (domainsData.data && domainsData.data.domains) {
                    // Create initial domains array
                    const domains = domainsData.data.domains.map((domain: { name: string }) => ({
                        name: domain.name,
                        isPrimary: domain.name === primaryENS,
                        expiryDate: undefined // Will be populated later
                    }));

                    // Sort domains: primary first, then by name length
                    const sortedDomains = domains.sort((a, b) => {
                        if (a.isPrimary) return -1;
                        if (b.isPrimary) return 1;
                        return a.name.length - b.name.length;
                    });

                    // Set initial domains (without expiry dates)
                    setEnsNames(sortedDomains);


                    // Now fetch expiry dates for each domain
                    const domainsWithExpiry = await Promise.all(
                        sortedDomains.map(async (domain: ENSDomain) => {
                            try {
                                const expiryResponse = await fetch(config.SUBGRAPH_API, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
                                    },
                                    body: JSON.stringify({
                                        query: `
                                            query GetExpiry($name: String!) {
                                                registrations(
                                                    where: { domain_: { name: $name } },
                                                    orderBy: expiryDate,
                                                    orderDirection: desc,
                                                    first: 1
                                                ) {
                                                    expiryDate
                                                }
                                            }
                                        `,
                                        variables: {
                                            name: domain.name
                                        }
                                    })
                                });

                                const expiryData = await expiryResponse.json();
                                const expiryDate = expiryData?.data?.registrations?.[0]?.expiryDate;
                                
                                return {
                                    ...domain,
                                    expiryDate: expiryDate ? Number(expiryDate) : undefined
                                };
                            } catch (error) {
                                console.error(`Error fetching expiry for ${domain.name}:`, error);
                                return domain; // Return domain without expiry date if there's an error
                            }
                        })
                    );

                    // Update with domains that now have expiry dates
                    setEnsNames(domainsWithExpiry);
                }

                // 3. If this is a contract, fetch verification status
                if (isContract) {
                    const status = await getContractStatus(effectiveChainId, address);
                    setVerificationStatus(status);
                }
            } catch (err) {
                console.error('Error fetching contract details:', err);
                setError('Failed to fetch contract details');
            } finally {
                setIsLoading(false);
            }
        };

        fetchContractDetails();
    }, [address, walletPublicClient, customProvider, chain?.id, shouldUseWalletClient, isContract]);

    const getENS = async (addr: string, provider: ethers.JsonRpcProvider): Promise<string> => {
        // Use the effectiveChainId instead of chain?.id to ensure we're using the correct chain
        // for ENS lookups even when the wallet is not connected
        if (effectiveChainId === CHAINS.MAINNET || effectiveChainId === CHAINS.SEPOLIA) {
            try {
                console.log(`[ContractDetails] Looking up ENS name for ${addr} on chain ${effectiveChainId}`);
                return (await provider.lookupAddress(addr)) || ''
            } catch (error) {
                console.error('[ContractDetails] Error looking up ENS name:', error);
                return ''
            }
        } else {
            try {
                console.log(`[ContractDetails] Looking up ENS name for ${addr} on chain ${effectiveChainId} using reverse registrar`);
                const reverseRegistrarContract = new ethers.Contract(config?.REVERSE_REGISTRAR!, reverseRegistrarABI, provider);
                const reversedNode = await reverseRegistrarContract.node(addr)
                const resolverContract = new ethers.Contract(config?.PUBLIC_RESOLVER!, publicResolverABI, provider);
                const name = await resolverContract.name(reversedNode)
                return name || '';
            } catch (error) {
                console.error('[ContractDetails] Error looking up ENS name using reverse registrar:', error);
                return ''
            }
        }
    }

    if (isLoading) {
        return (
            <Card className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl">
                <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                        ENS Information
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
            <Card className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl">
                <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                        ENS Information
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <div className="text-red-500 dark:text-red-400">{error}</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl">
            <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                    ENS Information
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{isContract ? 'Contract Address' : 'Account Address'}</h3>
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

                    {/* Contract Verification Status */}
                    {isContract && verificationStatus && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Contract Verification</h3>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {(verificationStatus.sourcify_verification === 'exact_match' || verificationStatus.sourcify_verification === 'match') && (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className="border border-green-800 text-green-800 hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                        >
                                            <Link
                                                href={`${SOURCIFY_URL}${effectiveChainId}/${address.toLowerCase()}`}
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
                                {verificationStatus.etherscan_verification === 'verified' && (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className="border border-green-800 text-green-800 hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                        >
                                            <Link
                                                href={`${etherscanUrl}address/${address}#code`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <img src="/etherscan.svg" alt="Etherscan" className="w-4 h-4" />
                                                Verified
                                            </Link>
                                        </Button>
                                    </div>
                                )}
                                {(verificationStatus.blockscout_verification === 'exact_match' || verificationStatus.blockscout_verification === 'match') && (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className="border border-green-800 text-green-800 hover:bg-emerald-100 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                        >
                                            <Link
                                                href={`${config?.BLOCKSCOUT_URL}address/${address.toLowerCase()}?tab=contract`}
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
                                {verificationStatus.sourcify_verification === 'unverified' && (
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
                                {verificationStatus.etherscan_verification === 'unverified' && (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className="hover:bg-gray-200 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                        >
                                            <Link
                                                href={`${etherscanUrl}address/${address}#code`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                <img src="/etherscan.svg" alt="Etherscan" className="w-4 h-4" />
                                                Verify
                                            </Link>
                                        </Button>
                                    </div>
                                )}
                                {(verificationStatus.blockscout_verification === 'unverified') && (
                                    <div className="flex items-center gap-2">
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className="hover:bg-gray-200 text-xs px-2 py-1 h-auto flex items-center gap-1"
                                        >
                                            <Link
                                                href={`${config?.BLOCKSCOUT_URL}address/${address.toLowerCase()}?tab=contract`}
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
                        </div>
                    )}

                    {primaryName && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Primary ENS Name</h3>
                            <div className="flex items-center mt-1">
                                <p className="text-gray-900 dark:text-white">{primaryName}</p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="ml-2"
                                    asChild
                                >
                                    <a href={`${config?.ENS_APP_URL || 'https://app.ens.domains'}${primaryName}`} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                            </div>
                        </div>
                    )}

                    {ensNames.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                Associated ENS Names ({ensNames.length})
                            </h3>
                            <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-2">
                                {ensNames.map((domain, index) => (
                                    <div
                                        key={index}
                                        className={`p-2 rounded-md ${domain.isPrimary
                                            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                                            : 'bg-gray-50 dark:bg-gray-700/30'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-900 dark:text-white">{domain.name}</span>
                                            <div className="flex items-center gap-2">
                                                {domain.expiryDate && (
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        Expires: {new Date(domain.expiryDate * 1000).toLocaleDateString()}
                                                    </span>
                                                )}
                                                {domain.isPrimary && (
                                                    <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full">
                                                        Primary
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {ensNames.length === 0 && (
                        <div className="text-gray-500 dark:text-gray-400 italic">
                            No ENS names found for this address
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
