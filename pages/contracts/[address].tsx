import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { isAddress } from 'ethers';
import { usePublicClient } from 'wagmi';
import Layout from '@/components/Layout';
import ContractDetails from '@/components/ContractDetails';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function ContractDetailsPage() {
    const router = useRouter();
    const { address } = router.query;
    const [isValidAddress, setIsValidAddress] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const publicClient = usePublicClient();

    useEffect(() => {
        const validateAddress = async () => {
            if (!address || typeof address !== 'string') {
                setIsLoading(false);
                setError('Invalid address parameter');
                return;
            }

            try {
                // Check if it's a valid Ethereum address
                if (isAddress(address)) {
                    // Check if it's a contract
                    const code = await publicClient!.getBytecode({ address });
                    if (code !== '0x') {
                        setIsValidAddress(true);
                    } else {
                        setError('This address is an Externally Owned Account (EOA), not a contract');
                        // Redirect to history page for EOAs
                        router.push(`/history?address=${address}`);
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

        if (router.isReady) {
            validateAddress();
        }
    }, [address, publicClient, router]);

    return (
        <Layout>
            <div className="w-full max-w-5xl container mx-auto px-4 py-8">
                <div className="flex items-center mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mr-2"
                        onClick={() => router.push('/contracts')}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Search
                    </Button>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Contract Details
                    </h1>
                </div>

                {isLoading && (
                    <div className="flex justify-center items-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    </div>
                )}

                {error && !isLoading && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                        <div className="text-red-700 dark:text-red-400">
                            {error}
                        </div>
                    </div>
                )}

                {isValidAddress && !isLoading && !error && address && typeof address === 'string' && (
                    <ContractDetails address={address} />
                )}
            </div>
        </Layout>
    );
}
