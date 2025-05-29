import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { isAddress, ethers } from 'ethers';
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
    const [provider, setProvider] = useState<ethers.JsonRpcProvider | null>(null);

    // Initialize provider based on chainId
    useEffect(() => {
        if (chainId && typeof chainId === 'string') {
            const chainIdNumber = parseInt(chainId);
            const config = CONTRACTS[chainIdNumber];

            if (config) {
                setIsValidChain(true);

                try {
                    // Get the appropriate Infura RPC endpoint based on the chain
                    let rpcEndpoint = '';

                    // Use the chain-specific RPC endpoint from .env
                    if (chainIdNumber === 1) { // Ethereum Mainnet
                        rpcEndpoint = process.env.NEXT_PUBLIC_RPC || config.RPC_ENDPOINT;
                    } else if (chainIdNumber === 11155111) { // Sepolia
                        rpcEndpoint = process.env.NEXT_PUBLIC_RPC_SEPOLIA || config.RPC_ENDPOINT;
                    } else if (chainIdNumber === 59144) { // Linea Mainnet
                        rpcEndpoint = process.env.NEXT_PUBLIC_RPC_LENIA || config.RPC_ENDPOINT;
                    } else if (chainIdNumber === 59140) { // Linea Sepolia
                        rpcEndpoint = process.env.NEXT_PUBLIC_RPC_LINEA_SEPOLIA || config.RPC_ENDPOINT;
                    } else if (chainIdNumber === 8453) { // Base Mainnet
                        rpcEndpoint = process.env.NEXT_PUBLIC_RPC_BASE || config.RPC_ENDPOINT;
                    } else if (chainIdNumber === 84532) { // Base Sepolia
                        rpcEndpoint = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || config.RPC_ENDPOINT;
                    } else {
                        // Default to the config's RPC endpoint
                        rpcEndpoint = config.RPC_ENDPOINT;
                    }

                    console.log(`Using RPC endpoint for chain ${chainIdNumber}:`, rpcEndpoint);
                    const newProvider = new ethers.JsonRpcProvider(rpcEndpoint);
                    setProvider(newProvider);
                } catch (err) {
                    console.error('Error initializing provider:', err);
                    setError('Failed to initialize provider for the selected chain');
                }
            } else {
                setIsValidChain(false);
                setError(`Chain ID ${chainId} is not supported`);
            }
        }
    }, [chainId]);

    // Validate address and check if it's a contract
    useEffect(() => {
        const validateAddress = async () => {
            if (!address || typeof address !== 'string' || !provider) {
                setIsLoading(false);
                return;
            }

            try {
                // Check if it's a valid Ethereum address
                if (isAddress(address)) {
                    // Check if it's a contract
                    try {
                        const code = await provider.getCode(address);
                        console.log('Code for address:', address, 'is:', code);

                        if (code) {
                            // It's a contract, so set isValidAddress to true and don't redirect
                            setIsValidAddress(true);
                        } else {
                            // It's an EOA, so redirect to history page
                            console.log('Address is an EOA, redirecting to history page');
                            setError('This address is an Externally Owned Account (EOA), not a contract');
                            // Redirect to history page for EOAs
                            if (chainId) {
                                router.push(`/history/${chainId}/${address}`);
                            }
                        }
                    } catch (err) {
                        console.error('Error getting code:', err);
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

        if (router.isReady && provider) {
            validateAddress();
        }
    }, [router.isReady, address, provider, chainId, router]);

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
                <Button variant="ghost" onClick={() => router.back()} className="mr-4">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {isValidAddress ? `Contract Details (Chain ID: ${chainId})` : 'Invalid Address'}
                </h1>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                    <div className="text-red-700 dark:text-red-400">{error}</div>
                </div>
            )}

            {!isValidAddress ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="text-red-700 dark:text-red-400">
                        Invalid Ethereum address format
                    </div>
                </div>
            ) : !isValidChain ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="text-red-700 dark:text-red-400">
                        Invalid or unsupported chain ID
                    </div>
                </div>
            ) : (
                <ContractDetails
                    address={address as string}
                    chainId={typeof chainId === 'string' ? parseInt(chainId) : undefined}
                />
            )}
        </Layout>
    );
}