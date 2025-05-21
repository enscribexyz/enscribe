import React from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import ContractHistory from '../components/ContractHistory';
import { useAccount } from 'wagmi';
import { isAddress } from 'ethers';

export default function HistoryPage() {
    const { isConnected } = useAccount();
    const router = useRouter();
    const { address } = router.query;
    
    // Validate the address from query params
    const isValidAddress = typeof address === 'string' && isAddress(address);
    const pageTitle = isValidAddress ? 'Contract History' : 'My Contracts';
    const showConnectMessage = !isConnected && !isValidAddress;

    return (
        <Layout>
            <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
                {pageTitle}
            </h1>

            {showConnectMessage ? (
                <p className="text-red-500 text-lg">Please connect your wallet to view contract history.</p>
            ) : (
                <ContractHistory addressToQuery={isValidAddress ? address as string : undefined} />
            )}
        </Layout>
    );
}