import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { isAddress } from 'viem/utils';
import { createPublicClient, http } from 'viem';
import Layout from '@/components/Layout';
import ContractDetails from '@/components/ContractDetails';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { CONTRACTS } from '@/utils/constants';

export default function ContractDetailsPage() {
    const router = useRouter();
    const { address, chainId } = router.query;
    const [isValidAddress, setIsValidAddress] = useState(false);
    const [isValidChain, setIsValidChain] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [client, setClient] = useState<any>(null);

    // Initialize viem client based on chainId
    useEffect(() => {
        if (chainId && typeof chainId === 'string') {
            const chainIdNumber = parseInt(chainId);
            const config = CONTRACTS[chainIdNumber];

            if (config) {
                setIsValidChain(true);
                try {
                    // Use the chain-specific RPC endpoint from .env/config
                    let rpcEndpoint = config.RPC_ENDPOINT;
                    // (You can add additional logic for custom endpoints if needed)
                    console.log(`Using RPC endpoint for chain ${chainIdNumber}:`, rpcEndpoint);
                    const viemClient = createPublicClient({
                        chain: {
                            id: chainIdNumber,
                            name: config.name,
                            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                            rpcUrls: { default: { http: [rpcEndpoint] }, public: { http: [rpcEndpoint] } },
                        },
                        transport: http(rpcEndpoint)
                    });
                    setClient(viemClient);
                } catch (err) {
                    console.error('Error initializing viem client:', err);
                    setError('Failed to initialize provider for the selected chain');
                }
            } else {
                setIsValidChain(false);
                setError(`Chain ID ${chainId} is not supported`);
                setIsLoading(false);
            }
        }
    }, [chainId]);

    // Validate address and check if it's a contract using viem
    useEffect(() => {
        const validateAddress = async () => {
            if (!address || typeof address !== 'string' || !client) {
                setIsLoading(false);
                return;
            }

            try {
                // Check if it's a valid Ethereum address
                if (isAddress(address)) {
                    // Check if it's a contract using viem
                    try {
                        const bytecode = await client.getBytecode({ address: address as `0x${string}` });
                        console.log('Bytecode for address:', address, 'is:', bytecode);
                        if (bytecode && bytecode !== '0x') {
                            setIsValidAddress(true);
                        } else {
                            setError('This address is an Externally Owned Account (EOA), not a contract');
                            if (chainId) {
                                router.push(`/history/${chainId}/${address}`);
                            }
                        }
                    } catch (err) {
                        console.error('Error getting bytecode:', err);
                        setError('Failed to verify if the address is a contract');
                    }
                } else {
                    setError('Invalid Ethereum address format');
                }
            } catch (err) {
                console.error('Error validating address:', err);
                setError('An error occurred while validating the address');
            } finally {
                setIsLoading(false);
            }
        };

        if (router.isReady && client) {
            validateAddress();
        }
    }, [router.isReady, address, client, chainId, router]);

    if (isLoading) {
        return (
            <Layout>
                <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="flex items-center mb-6">
                {/* <Button variant="ghost" onClick={() => router.back()} className="mr-4">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button> */}
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {isValidAddress && isValidChain ? `Contract Details (Chain ID: ${chainId})` : 'Invalid Chain ID or Address'}
                </h1>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                    <div className="text-red-700 dark:text-red-400">{error}</div>
                </div>
            )}

            {isValidAddress && isValidChain && (
                <ContractDetails
                    address={address as string}
                    chainId={typeof chainId === 'string' ? parseInt(chainId) : undefined}
                />
            )}

        </Layout>
    );
}