import React, { useEffect, useState, useCallback } from 'react';
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
    hasLabelhash?: boolean;
    level?: number;
    parent2LD?: string;
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
    const [primaryNameExpiryDate, setPrimaryNameExpiryDate] = useState<number | null>(null);
    const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
    const [userOwnedDomains, setUserOwnedDomains] = useState<ENSDomain[]>([]);
    const [fetchingENS, setFetchingENS] = useState(false);
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

    const fetchUserOwnedDomains = useCallback(async () => {
        if (!address || !config?.SUBGRAPH_API) {
            console.warn('Address or subgraph API is not configured');
            return;
        }

        try {
            setFetchingENS(true);

            // Fetch domains where user is the owner, registrant, or wrapped owner
            const [ownerResponse, registrantResponse, wrappedResponse] = await Promise.all([
                fetch(config.SUBGRAPH_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
                    },
                    body: JSON.stringify({
                        query: `
                            query getDomainsForAccount($address: String!) { 
                                domains(where: { owner: $address }) { 
                                    name 
                                    expiryDate
                                } 
                            }
                        `,
                        variables: { address: address.toLowerCase() }
                    })
                }),
                fetch(config.SUBGRAPH_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
                    },
                    body: JSON.stringify({
                        query: `
                            query getDomainsForAccount($address: String!) { 
                                domains(where: { registrant: $address }) { 
                                    name 
                                    expiryDate
                                } 
                            }
                        `,
                        variables: { address: address.toLowerCase() }
                    })
                }),
                fetch(config.SUBGRAPH_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
                    },
                    body: JSON.stringify({
                        query: `
                            query getDomainsForAccount($address: String!) { 
                                domains(where: { wrappedOwner: $address }) { 
                                    name 
                                    expiryDate
                                } 
                            }
                        `,
                        variables: { address: address.toLowerCase() }
                    })
                })
            ]);

            const [ownerData, registrantData, wrappedData] = await Promise.all([
                ownerResponse.json(),
                registrantResponse.json(),
                wrappedResponse.json()
            ]);

            // Combine all domains and remove duplicates by name
            const ownedDomainsMap = new Map();

            // Process each set of domains
            [ownerData?.data?.domains || [], registrantData?.data?.domains || [], wrappedData?.data?.domains || []].forEach(domains => {
                domains.forEach((domain: { name: string, expiryDate?: number }) => {
                    if (!domain.name.endsWith('.addr.reverse') && !ownedDomainsMap.has(domain.name)) {
                        ownedDomainsMap.set(domain.name, {
                            name: domain.name,
                            expiryDate: domain.expiryDate ? Number(domain.expiryDate) : undefined
                        });
                    }
                });
            });

            // Convert to array and enhance with additional properties
            const domainsArray = Array.from(ownedDomainsMap.values()).map((domain: ENSDomain) => {
                const nameParts = domain.name.split('.');
                const tld = nameParts[nameParts.length - 1];
                const sld = nameParts[nameParts.length - 2] || '';
                const parent2LD = `${sld}.${tld}`;
                const level = nameParts.length;
                const hasLabelhash = nameParts.some(part => part.startsWith('[') && part.endsWith(']'));

                return {
                    ...domain,
                    parent2LD,
                    level,
                    hasLabelhash
                };
            });

            // Organize domains by their properties
            const organizedDomains = domainsArray.sort((a, b) => {
                // First, separate domains with labelhash (they go at the end)
                if (a.hasLabelhash && !b.hasLabelhash) return 1;
                if (!a.hasLabelhash && b.hasLabelhash) return -1;

                // Then sort by parent 2LD
                if (a.parent2LD !== b.parent2LD) {
                    return a.parent2LD.localeCompare(b.parent2LD);
                }

                // For domains with the same parent 2LD, sort by level (3LD, 4LD, etc.)
                if (a.level !== b.level) {
                    return a.level - b.level;
                }

                // Finally, sort alphabetically for domains with the same level
                return a.name.localeCompare(b.name);
            });

            setUserOwnedDomains(organizedDomains);
            console.log("Fetched and organized user owned domains:", organizedDomains);
        } catch (error) {
            console.error("Error fetching user's owned ENS domains:", error);
        } finally {
            setFetchingENS(false);
        }
    }, [address, config]);

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

        // Fetch owned domains if this is not a contract
        if (!isContract) {
            fetchUserOwnedDomains();
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

                    // Fetch expiry date for the primary name's 2LD
                    try {
                        // Extract the 2LD from the primary name
                        const nameParts = primaryENS.split('.');
                        if (nameParts.length >= 2) {
                            const tld = nameParts[nameParts.length - 1];
                            const sld = nameParts[nameParts.length - 2];
                            const domain2LD = `${sld}.${tld}`;

                            // Query the subgraph for the expiry date
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
                                        name: domain2LD
                                    }
                                })
                            });

                            const expiryData = await expiryResponse.json();
                            const expiryDate = expiryData?.data?.registrations?.[0]?.expiryDate;

                            if (expiryDate) {
                                setPrimaryNameExpiryDate(Number(expiryDate));
                                console.log(`Expiry date for ${domain2LD}: ${new Date(Number(expiryDate) * 1000).toLocaleDateString()}`);
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching primary name expiry date:', error);
                    }
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
    }, [address, walletPublicClient, customProvider, chain?.id, shouldUseWalletClient, isContract, fetchUserOwnedDomains]);



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
                {/* <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                        ENS Information
                    </CardTitle>
                </CardHeader> */}
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
                {/* <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                        ENS Information
                    </CardTitle>
                </CardHeader> */}
                <CardContent className="p-6">
                    <div className="text-red-500 dark:text-red-400">{error}</div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl">
            {/* <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                    ENS Information
                </CardTitle>
            </CardHeader> */}
            <CardContent className="p-6">
                <div className="space-y-4">

                    {primaryName && (
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-s font-medium text-gray-500 dark:text-gray-400">Primary ENS Name</h3>
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
                            {primaryNameExpiryDate && (
                                <div className="text-right">
                                    <span className="text-s text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                        ENS 2LD Expires on: {new Date(primaryNameExpiryDate * 1000).toLocaleDateString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

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


                    <div>
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                            Associated ENS Names ({ensNames.length})
                        </h3>
                        {ensNames.length > 0 ? (
                            <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                                <div className="max-h-60 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                                    <div className="space-y-2">
                                        {ensNames.map((domain, index) => (
                                            <div
                                                key={index}
                                                className={`flex items-center justify-between p-2 rounded ${domain.isPrimary
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                                            >
                                                <span className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">{domain.name}</span>
                                                <div className="flex items-center gap-2">
                                                    {domain.expiryDate && (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                            Expires: {new Date(domain.expiryDate * 1000).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                    {domain.isPrimary && (
                                                        <span className="text-xs bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                                                            Primary
                                                        </span>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="ml-2 h-6 w-6 p-0 flex-shrink-0"
                                                        asChild
                                                    >
                                                        <a
                                                            href={`${config?.ENS_APP_URL || 'https://app.ens.domains'}/${domain.name}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                                                        >
                                                            <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No Associated ENS names found for this address</p>
                        )}
                    </div>

                    {/* Owned ENS Names */}
                    <div>
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Owned ENS Names{userOwnedDomains.length > 0 && ` (${userOwnedDomains.length})`}</h3>
                        {fetchingENS ? (
                            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 py-2">
                                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                                </svg>
                                Loading ENS names...
                            </div>
                        ) : userOwnedDomains.length > 0 ? (
                            <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                                <div className="max-h-60 overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
                                    <div className="space-y-2">
                                        {(() => {
                                            let currentParent2LD = '';
                                            return userOwnedDomains.map((domain, index) => {
                                                // Check if we're starting a new 2LD group
                                                const isNewGroup = domain.parent2LD !== currentParent2LD;
                                                if (isNewGroup && domain.parent2LD) {
                                                    currentParent2LD = domain.parent2LD;
                                                }

                                                // Calculate indentation for subdomains
                                                const indentLevel = domain.level && domain.level > 2 ? (domain.level - 2) : 0;
                                                const indentClass = indentLevel > 0 ? `pl-${indentLevel * 4}` : '';

                                                return (
                                                    <div key={domain.name} className={`flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded ${indentClass}`}>
                                                        <span className="font-mono text-sm text-gray-900 dark:text-gray-100 truncate">{domain.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            {domain.expiryDate && (
                                                                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                                    Expires: {new Date(domain.expiryDate * 1000).toLocaleDateString()}
                                                                </span>
                                                            )}
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="ml-2 h-6 w-6 p-0 flex-shrink-0"
                                                                asChild
                                                            >
                                                                <a
                                                                    href={`${config?.ENS_APP_URL || 'https://app.ens.domains'}/${domain.name}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                                                                >
                                                                    <ExternalLink className="h-3 w-3" />
                                                                </a>
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No Owned ENS names found for this address</p>
                        )}
                    </div>

                </div>
            </CardContent>
        </Card>
    );
}
