import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import ContractHistory from '@/components/ContractHistory';
import { isAddress } from 'ethers';
import { CONTRACTS } from '@/utils/constants';

export default function EOAHistoryPage() {
    const router = useRouter();
    const { address, chainId } = router.query;
    const [isValidAddress, setIsValidAddress] = useState(false);
    const [isValidChain, setIsValidChain] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (router.isReady && address && chainId) {
            // Validate the address from path parameter
            const addressIsValid = typeof address === 'string' && isAddress(address);
            setIsValidAddress(addressIsValid);

            // Validate the chainId
            const chainIdNumber = typeof chainId === 'string' ? parseInt(chainId) : 0;
            const chainIsValid = !!CONTRACTS[chainIdNumber];
            setIsValidChain(chainIsValid);

            setIsLoading(false);
        }
    }, [router.isReady, address, chainId]);

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
            <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
                {isValidAddress ? `Address History ${chainId ? `(Chain ID: ${chainId})` : ''}` : 'Invalid Address'}
            </h1>

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
                <ContractHistory
                    addressToQuery={address as string}
                    chainIdToQuery={typeof chainId === 'string' ? parseInt(chainId) : undefined}
                />
            )}
        </Layout>
    );
}
