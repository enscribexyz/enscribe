import React from 'react'
import Layout from '../components/Layout'
import ContractHistory from '../components/ContractHistory'

const contractsHistory = [
    {
        ensName: "example1.eth",
        contractAddress: "0xAbcdefabcdefabcdefabcdefabcdefabcdefabcd",
        txHash: "0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef",
    },
    {
        ensName: "example2.eth",
        contractAddress: "0x1234512345123451234512345123451234512345",
        txHash: "0x987654321fedcba987654321fedcba987654321fedcba987654321fedcba",
    },
]

export default function HistoryPage() {
    return (
        <Layout>
            <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
                Contract History
            </h1>
            <ContractHistory contracts={contractsHistory} />
        </Layout>
    )
}