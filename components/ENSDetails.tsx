import React, { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { useAccount, usePublicClient } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, CheckCircle, AlertCircle, XCircle, Clock } from 'lucide-react';
import { CONTRACTS } from '@/utils/constants';
import { CHAINS } from '@/utils/constants';
import reverseRegistrarABI from '@/contracts/ReverseRegistrar';
import publicResolverABI from '@/contracts/PublicResolver';
import Link from 'next/link';
import ensRegistryABI from '@/contracts/ENSRegistry';

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
    const { chain, isConnected } = useAccount();
    const walletPublicClient = usePublicClient();
    const [customProvider, setCustomProvider] = useState<ethers.JsonRpcProvider | null>(null);

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
                                    registration {
                                        expiryDate
                                        registrationDate
                                    }
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
                                    registration {
                                        expiryDate
                                        registrationDate
                                    }
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
                                    registration {
                                        expiryDate
                                        registrationDate
                                    }
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
                domains.forEach((domain: { name: string, registration: { expiryDate: string } | null }) => {
                    if (!domain.name.endsWith('.addr.reverse') && !ownedDomainsMap.has(domain.name)) {
                        ownedDomainsMap.set(domain.name, {
                            name: domain.name,
                            expiryDate: domain.registration?.expiryDate ? Number(domain.registration.expiryDate) : undefined
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

            // Apply chain-specific filtering
            let filteredDomainsArray = domainsArray;

            // Filter based on chain
            if (effectiveChainId === CHAINS.BASE) {
                // For Base chain, only keep .base.eth names
                console.log('[ENSDetails] Filtering owned domains for Base chain - only keeping .base.eth names');
                filteredDomainsArray = domainsArray.filter(domain => domain.name.endsWith('.base.eth'));
            } else if (effectiveChainId === CHAINS.BASE_SEPOLIA) {
                // For Base Sepolia, don't show any names
                console.log('[ENSDetails] Base Sepolia detected - not showing any owned ENS names');
                filteredDomainsArray = [];
            }

            // Organize domains by their properties
            const organizedDomains = filteredDomainsArray.sort((a, b) => {
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
        }
    }, [address, config]);

    // Initialize custom provider when chainId changes
    useEffect(() => {
        if (effectiveChainId && config?.RPC_ENDPOINT) {
            try {
                // Initialize ethers provider
                const provider = new ethers.JsonRpcProvider(config.RPC_ENDPOINT);
                setCustomProvider(provider);
                console.log(`[ENSDetails] Initialized custom provider for chain ${effectiveChainId}`);
            } catch (err) {
                console.error('[ENSDetails] Error initializing provider:', err);
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

    // Function to fetch primary ENS name for an address
    const fetchPrimaryName = useCallback(async () => {
        if (!address || !customProvider) return;

        try {
            console.log(`[ENSDetails] Fetching primary ENS name for ${address}`);
            const primaryENS = await getENS(address, customProvider);

            if (primaryENS) {
                setPrimaryName(primaryENS);
                console.log(`[ENSDetails] Primary ENS name found: ${primaryENS}`);

                // Fetch expiry date for the primary name's 2LD
                await fetchPrimaryNameExpiryDate(primaryENS);
            } else {
                console.log(`[ENSDetails] No primary ENS name found for ${address}`);
                setPrimaryName(null);
                setPrimaryNameExpiryDate(null);
            }
        } catch (error) {
            console.error('[ENSDetails] Error fetching primary ENS name:', error);
            setPrimaryName(null);
        }
    }, [address, customProvider]);

    // Function to fetch expiry date for a primary name's 2LD
    const fetchPrimaryNameExpiryDate = async (primaryENS: string) => {
        if (!config?.SUBGRAPH_API) return;

        try {
            // Extract domain parts from the primary name
            const nameParts = primaryENS.split('.');
            if (nameParts.length < 2) return;

            // Check if we're on Linea, Base, or their testnets
            const isLineaOrBase = effectiveChainId ? [
                CHAINS.LINEA,
                CHAINS.LINEA_SEPOLIA,
                CHAINS.BASE,
                CHAINS.BASE_SEPOLIA
            ].includes(effectiveChainId) : false;

            let domainToQuery;

            if (isLineaOrBase && nameParts.length >= 3) {
                const tld = nameParts[nameParts.length - 1];
                const sld = nameParts[nameParts.length - 2];
                const thirdLevel = nameParts[nameParts.length - 3];
                domainToQuery = `${thirdLevel}.${sld}.${tld}`;
                console.log(`[ENSDetails] Fetching expiry date for 3LD: ${domainToQuery}`);
            } else {
                // For other networks or 2LD names, query the 2LD
                const tld = nameParts[nameParts.length - 1];
                const sld = nameParts[nameParts.length - 2];
                domainToQuery = `${sld}.${tld}`;
                console.log(`[ENSDetails] Fetching expiry date for 2LD: ${domainToQuery}`);
            }

            // Query the subgraph for the domain with its registration data
            const domainResponse = await fetch(config.SUBGRAPH_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
                },
                body: JSON.stringify({
                    query: `
                        query GetDomainWithRegistration($name: String!) {
                            domains(where: { name: $name }) {
                                name
                                registration {
                                    expiryDate
                                    registrationDate
                                }
                            }
                        }
                    `,
                    variables: {
                        name: domainToQuery
                    }
                })
            });

            const domainData = await domainResponse.json();
            console.log(`[ENSDetails] Domain data for ${domainToQuery}:`, domainData);

            const expiryDate = domainData?.data?.domains?.[0]?.registration?.expiryDate;

            if (expiryDate) {
                setPrimaryNameExpiryDate(Number(expiryDate));
                console.log(`[ENSDetails] Expiry date for ${domainToQuery}: ${new Date(Number(expiryDate) * 1000).toLocaleDateString()}`);
            } else {
                console.log(`[ENSDetails] No expiry date found for ${domainToQuery}`);
                setPrimaryNameExpiryDate(null);
            }
        } catch (error) {
            console.error('[ENSDetails] Error fetching primary name expiry date:', error);
            setPrimaryNameExpiryDate(null);
        }
    };

    // Function to fetch all ENS names resolving to this address
    const fetchAssociatedNames = useCallback(async () => {
        if (!address || !config?.SUBGRAPH_API) return;

        try {
            console.log(`[ENSDetails] Fetching associated ENS names for ${address}`);

            // Fetch domains with their registration data in a single query
            const domainsResponse = await fetch(config.SUBGRAPH_API, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''}`
                },
                body: JSON.stringify({
                    query: `
                        query GetENSNamesWithExpiry($address: String!) {
                            domains(where: { resolvedAddress: $address }) { 
                                name
                                registration {
                                    expiryDate
                                    registrationDate
                                }
                            }
                        }
                    `,
                    variables: {
                        address: address.toLowerCase()
                    }
                })
            });

            const domainsData = await domainsResponse.json();
            console.log('[ENSDetails] Associated domains data:', domainsData);

            if (domainsData.data && domainsData.data.domains) {
                // Filter domains based on chain
                let filteredDomains = domainsData.data.domains;

                // Apply chain-specific filtering
                if (effectiveChainId === CHAINS.BASE) {
                    // For Base chain, only keep .base.eth names
                    console.log('[ENSDetails] Filtering for Base chain - only keeping .base.eth names');
                    filteredDomains = filteredDomains.filter((domain: { name: string }) =>
                        domain.name.endsWith('.base.eth'));
                } else if (effectiveChainId === CHAINS.BASE_SEPOLIA) {
                    // For Base Sepolia, don't show any names
                    console.log('[ENSDetails] Base Sepolia detected - not showing any ENS names');
                    filteredDomains = [];
                }

                // Create domains array with expiry dates already included
                const domains = filteredDomains.map((domain: { name: string, registration: { expiryDate: string } | null }) => ({
                    name: domain.name,
                    isPrimary: domain.name === primaryName,
                    expiryDate: domain.registration?.expiryDate ? Number(domain.registration.expiryDate) : undefined
                }));

                // Sort domains: primary first, then by name length
                const sortedDomains = domains.sort((a: { isPrimary: any; name: string | any[]; }, b: { isPrimary: any; name: string | any[]; }) => {
                    if (a.isPrimary) return -1;
                    if (b.isPrimary) return 1;
                    return a.name.length - b.name.length;
                });

                // Set domains with expiry dates already included
                setEnsNames(sortedDomains);
                console.log('[ENSDetails] Set associated ENS names with expiry dates:', sortedDomains);
            }
        } catch (error) {
            console.error('[ENSDetails] Error fetching associated ENS names:', error);
        }
    }, [address, config, effectiveChainId, primaryName]);

    // Function to fetch verification status for a contract
    const fetchVerificationStatus = useCallback(async () => {
        if (!address || !effectiveChainId || !isContract) return;

        try {
            console.log(`[ENSDetails] Fetching verification status for contract ${address}`);
            const status = await getContractStatus(effectiveChainId, address);
            setVerificationStatus(status);
            console.log('[ENSDetails] Verification status:', status);
        } catch (error) {
            console.error('[ENSDetails] Error fetching verification status:', error);
            setVerificationStatus(null);
        }
    }, [address, effectiveChainId, isContract]);

    // Main useEffect to trigger data fetching when dependencies change
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
        if (!customProvider) {
            console.log('[ENSDetails] Waiting for provider to be ready');
            return;
        }

        const fetchAllData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Fetch data in parallel
                await Promise.all([
                    fetchPrimaryName(),
                    fetchAssociatedNames(),
                    isContract ? fetchVerificationStatus() : Promise.resolve(),
                    fetchUserOwnedDomains()
                ]);
            } catch (err) {
                console.error('[ENSDetails] Error fetching data:', err);
                setError('Failed to fetch data');
            } finally {
                setIsLoading(false);
            }
        };

        fetchAllData();
    }, [address, customProvider, config, effectiveChainId, isContract, fetchPrimaryName, fetchAssociatedNames, fetchVerificationStatus, fetchUserOwnedDomains]);



    const getENS = async (addr: string, provider: ethers.JsonRpcProvider): Promise<string> => {
        // Use the effectiveChainId instead of chain?.id to ensure we're using the correct chain
        // for ENS lookups even when the wallet is not connected
        if (effectiveChainId === CHAINS.MAINNET || effectiveChainId === CHAINS.SEPOLIA) {
            try {
                console.log(`[ENSDetails] Looking up ENS name for ${addr} on chain ${effectiveChainId}`);
                return (await provider.lookupAddress(addr)) || ''
            } catch (error) {
                console.error('[ENSDetails] Error looking up ENS name:', error);
                return ''
            }
        } else {
            try {
                console.log(`[ENSDetails] Looking up ENS name for ${addr} on chain ${effectiveChainId} using reverse registrar`);

                // Check if contract addresses are configured
                if (!config?.REVERSE_REGISTRAR || !config?.PUBLIC_RESOLVER) {
                    console.error(`[ENSDetails] Missing contract addresses for chain ${effectiveChainId}`);
                    return '';
                }

                // Get reversed node with error handling
                let reversedNode;
                try {
                    const reverseRegistrarContract = new ethers.Contract(config.REVERSE_REGISTRAR, reverseRegistrarABI, provider);
                    reversedNode = await reverseRegistrarContract.node(addr);
                    console.log(`[ENSDetails] Reversed node for ${addr}: ${reversedNode}`);
                } catch (nodeError) {
                    console.error('[ENSDetails] Error getting reversed node:', nodeError);
                    return '';
                }

                // If we don't have a valid reversed node, return empty
                if (!reversedNode) {
                    console.log('[ENSDetails] No reversed node found, returning empty name');
                    return '';
                }

                const ensRegistryContract = new ethers.Contract(config?.ENS_REGISTRY!, ensRegistryABI, provider)

                let publicResolverAddress = config?.PUBLIC_RESOLVER!
                try {
                    publicResolverAddress = await ensRegistryContract.resolver(reversedNode) || config?.PUBLIC_RESOLVER!
                } catch (err) {
                    console.log("err " + err);
                    setError("Failed to get public resolver");
                }

                // Get name from resolver with error handling
                try {
                    const resolverContract = new ethers.Contract(publicResolverAddress, publicResolverABI, provider);

                    try {
                        const name = await resolverContract.name(reversedNode) || '';
                        console.log(`[ENSDetails] ENS name for ${addr}: ${name}`);
                        return name;
                    } catch (nameError: any) {
                        // Check for specific BAD_DATA error or empty result
                        if (nameError.code === 'BAD_DATA' || nameError.message?.includes('could not decode result data')) {
                            console.log(`[ENSDetails] Resolver doesn't have a valid name record for ${addr}, this is normal for some addresses`);
                            return '';
                        }
                        throw nameError;
                    }
                } catch (resolverError: any) {
                    console.error('[ENSDetails] Error calling resolver contract:', resolverError);
                    return '';
                }
            } catch (error) {
                console.error('[ENSDetails] Error looking up ENS name using reverse registrar:', error);
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
                            {primaryNameExpiryDate && (() => {
                                // Extract domain parts from the primary name
                                const nameParts = primaryName.split('.');
                                const tld = nameParts[nameParts.length - 1];
                                const sld = nameParts[nameParts.length - 2];

                                // Check if we're on Linea, Base, or their testnets
                                const isLineaOrBase = effectiveChainId ? [
                                    CHAINS.LINEA,
                                    CHAINS.LINEA_SEPOLIA,
                                    CHAINS.BASE,
                                    CHAINS.BASE_SEPOLIA
                                ].includes(effectiveChainId) : false;

                                // For Linea and Base networks, use 3LD if available
                                let domainToShow;
                                if (isLineaOrBase && nameParts.length >= 3) {
                                    // Use 3LD (e.g., "mydomain.eth.linea")
                                    const tld3 = nameParts[nameParts.length - 1];
                                    const sld3 = nameParts[nameParts.length - 2];
                                    const thirdLevel = nameParts[nameParts.length - 3];
                                    domainToShow = `${thirdLevel}.${sld3}.${tld3}`;
                                } else {
                                    // Use 2LD for other networks (e.g., "mydomain.eth")
                                    domainToShow = `${sld}.${tld}`;
                                }

                                // Calculate expiry status
                                const now = new Date();
                                const expiryDate = new Date(primaryNameExpiryDate * 1000);
                                const threeMonthsFromNow = new Date();
                                threeMonthsFromNow.setMonth(now.getMonth() + 3);

                                const isExpired = expiryDate < now;
                                const isWithinThreeMonths = !isExpired && expiryDate < threeMonthsFromNow;

                                // Check if in grace period (expired but within 90 days)
                                const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
                                const isInGracePeriod = isExpired && (now.getTime() - expiryDate.getTime()) < ninetyDaysInMs;

                                let statusIcon;
                                let statusText;
                                let bgColorClass = "bg-green-50 dark:bg-green-900/20";
                                let textColorClass = "text-green-600 dark:text-green-400";

                                if (isExpired && isInGracePeriod) {
                                    // Red cross for expired domains in grace period
                                    statusIcon = <XCircle className="inline-block mr-1 text-red-600 dark:text-red-400" size={16} />;
                                    statusText = `expired on ${expiryDate.toLocaleDateString()}`;
                                    bgColorClass = "bg-red-50 dark:bg-red-900/20";
                                    textColorClass = "text-red-600 dark:text-red-400";
                                } else if (isWithinThreeMonths) {
                                    // Yellow exclamation for domains expiring soon
                                    statusIcon = <AlertCircle className="inline-block mr-1 text-yellow-600 dark:text-yellow-400" size={16} />;
                                    statusText = `expires on ${expiryDate.toLocaleDateString()}`;
                                    bgColorClass = "bg-yellow-50 dark:bg-yellow-900/20";
                                    textColorClass = "text-yellow-600 dark:text-yellow-400";
                                } else {
                                    // Green check for valid domains
                                    statusIcon = <CheckCircle className="inline-block mr-1 text-green-600 dark:text-green-400" size={16} />;
                                    statusText = `valid until ${expiryDate.toLocaleDateString()}`;
                                    bgColorClass = "bg-green-50 dark:bg-green-900/20";
                                    textColorClass = "text-green-600 dark:text-green-400";
                                }

                                // Check if domain to show is the same as primary name
                                const showDomainSeparately = domainToShow !== primaryName;

                                return (
                                    <div className="flex items-center justify-end">
                                        {showDomainSeparately && (
                                            <span className="text-gray-800 dark:text-gray-400 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-sm mr-2">
                                                {domainToShow}
                                            </span>
                                        )}
                                        <div className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${bgColorClass} ${textColorClass}`}>
                                            {statusIcon}
                                            <span className="whitespace-nowrap">{statusText}</span>
                                        </div>
                                    </div>
                                );
                            })()}
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
                                                        <span className="text-xs whitespace-nowrap">
                                                            {(() => {
                                                                const now = new Date();
                                                                const expiryDate = new Date(domain.expiryDate * 1000);
                                                                const threeMonthsFromNow = new Date();
                                                                threeMonthsFromNow.setMonth(now.getMonth() + 3);

                                                                const isExpired = expiryDate < now;
                                                                const isWithinThreeMonths = !isExpired && expiryDate < threeMonthsFromNow;
                                                                const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
                                                                const isInGracePeriod = isExpired && (now.getTime() - expiryDate.getTime()) < ninetyDaysInMs;

                                                                let textColorClass = "text-green-600 dark:text-green-400";
                                                                if (isWithinThreeMonths) {
                                                                    textColorClass = "text-yellow-600 dark:text-yellow-400";
                                                                } else if (isExpired && isInGracePeriod) {
                                                                    textColorClass = "text-red-600 dark:text-red-400";
                                                                } else if (isExpired) {
                                                                    textColorClass = "text-red-600 dark:text-red-400";
                                                                }

                                                                return (
                                                                    <span className={textColorClass}>
                                                                        {isExpired ? "Expired" : "Expires"}: {expiryDate.toLocaleDateString()}
                                                                    </span>
                                                                );
                                                            })()}
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
                        {userOwnedDomains.length > 0 ? (
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
                                                                <span className="text-xs whitespace-nowrap">
                                                                    {(() => {
                                                                        const now = new Date();
                                                                        const expiryDate = new Date(domain.expiryDate * 1000);
                                                                        const threeMonthsFromNow = new Date();
                                                                        threeMonthsFromNow.setMonth(now.getMonth() + 3);

                                                                        const isExpired = expiryDate < now;
                                                                        const isWithinThreeMonths = !isExpired && expiryDate < threeMonthsFromNow;
                                                                        const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
                                                                        const isInGracePeriod = isExpired && (now.getTime() - expiryDate.getTime()) < ninetyDaysInMs;

                                                                        let textColorClass = "text-green-600 dark:text-green-400";
                                                                        if (isWithinThreeMonths) {
                                                                            textColorClass = "text-yellow-600 dark:text-yellow-400";
                                                                        } else if (isExpired && isInGracePeriod) {
                                                                            textColorClass = "text-red-600 dark:text-red-400";
                                                                        } else if (isExpired) {
                                                                            textColorClass = "text-red-600 dark:text-red-400";
                                                                        }

                                                                        return (
                                                                            <span className={textColorClass}>
                                                                                {isExpired ? "Expired" : "Expires"}: {expiryDate.toLocaleDateString()}
                                                                            </span>
                                                                        );
                                                                    })()}
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
