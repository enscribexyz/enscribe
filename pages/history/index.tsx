import React, { useEffect } from 'react';
import Layout from '@/components/Layout';
import ContractHistory from '@/components/ContractHistory';

export default function HistoryIndexPage() {
    return (
        <Layout>
            <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
                My Contracts
            </h1>
            <ContractHistory />
        </Layout>
    );
}
