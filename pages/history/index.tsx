import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import ContractHistory from '@/components/ContractHistory';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';

export default function HistoryIndexPage() {
    const { isConnected, address, chain } = useAccount();
    const router = useRouter();
    
    // Redirect to home if not connected
    useEffect(() => {
        if (!isConnected && typeof window !== 'undefined') {
            // Add a small delay to prevent immediate redirect during hydration
            const timer = setTimeout(() => {
                router.push('/');
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isConnected, router]);

    if (!isConnected) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center py-12">
                    <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
                        My Contracts
                    </h1>
                    <p className="text-red-500 text-lg mb-6">Please connect your wallet to view your contract history.</p>
                    <Button onClick={() => router.push('/')}>Go to Home</Button>
                </div>
            </Layout>
        );
    }
    
    return (
        <Layout>
            <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
                My Contracts
            </h1>
            <ContractHistory />
        </Layout>
    );
}
