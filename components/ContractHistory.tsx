import React from 'react'
import Link from 'next/link'

interface Contract {
    ensName: string
    contractAddress: string
    txHash: string
}

interface ContractHistoryProps {
    contracts: Contract[]
}

export default function ContractHistory({ contracts }: ContractHistoryProps) {
    return (
        <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
            <thead>
                <tr className="bg-gray-200 dark:bg-gray-700">
                    <th className="py-2 px-4 border text-gray-900 dark:text-white">ENS Name</th>
                    <th className="py-2 px-4 border text-gray-900 dark:text-white">Contract Address</th>
                    <th className="py-2 px-4 border text-gray-900 dark:text-white">Transaction Hash</th>
                    <th className="py-2 px-4 border text-gray-900 dark:text-white">View on Apps</th>
                </tr>
            </thead>
            <tbody>
                {contracts.map((contract, index) => (
                    <tr key={index} className="hover:bg-gray-100 dark:hover:bg-gray-900">
                        <td className="py-2 px-4 border break-all text-gray-700 dark:text-gray-300">
                            {contract.ensName}
                        </td>
                        <td className="py-2 px-4 border break-all text-gray-700 dark:text-gray-300">
                            {contract.contractAddress}
                        </td>
                        <td className="py-2 px-4 border break-all text-gray-700 dark:text-gray-300">
                            {contract.txHash}
                        </td>
                        <td className="py-2 px-4 border text-center">
                            <div className="flex gap-2 justify-center">
                                <Link legacyBehavior href={`https://sepolia.etherscan.io/tx/${contract.txHash}`} passHref>
                                    <a target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded">
                                        Etherscan
                                    </a>
                                </Link>
                                <Link legacyBehavior href={`https://app.ens.domains/${contract.ensName}`} passHref>
                                    <a target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded">
                                        ENS App
                                    </a>
                                </Link>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}