import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount, useWalletClient } from 'wagmi'
import { ethers } from 'ethers'

interface Contract {
    ensName: string
    contractAddress: string
    txHash: string
}

export default function ContractHistory() {
    const { address, isConnected } = useAccount()
    const { data: walletClient } = useWalletClient()

    const [contracts, setContracts] = useState<Contract[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 10

    const contractAddress = process.env.NEXT_PUBLIC_WEB3_LAB_CONTRACT_ADDRESS || "0x5CEDDD691070082e7106e8d4ECf0896F9D9930D8"
    const topic0_deployment = process.env.NEXT_PUBLIC_TOPIC0_DEPLOYMENT // Deployment event topic
    const topic0_nameChanged = process.env.NEXT_PUBLIC_TOPIC0_NAME_CHANGED // NameChanged event topic

    const etherscanApiKey = process.env.NEXT_PUBLIC_ETHERSCAN_API

    useEffect(() => {
        if (!isConnected || !address || !walletClient) return
        fetchTransactions()
    }, [address, isConnected, walletClient])

    const fetchTransactions = async () => {
        setLoading(true)
        setError(null)

        try {
            const url = process.env.NEXT_PUBLIC_ETHERSCAN_URL + `&address=${address}`
            const response = await fetch(url)
            const data = await response.json()

            console.log("address - ", address)
            console.log("api - ", data)

            if (data.status !== '1' || !data.result) {
                console.log("No transactions found")
            }

            const filteredTxs = data.result.filter((tx: any) =>
                tx.to.toLowerCase() === contractAddress.toLowerCase()
            )

            const contractData: Contract[] = []
            for (const tx of filteredTxs) {
                const { deployedAddress, ensName } = await fetchTransactionReceipt(tx.hash)
                if (deployedAddress) {
                    contractData.push({
                        ensName: ensName || 'N/A',
                        contractAddress: deployedAddress,
                        txHash: tx.hash
                    })
                }
            }

            setContracts(contractData.reverse())
        } catch (error: any) {
            console.error('Error fetching contract history:', error)
            setError('Failed to fetch contract history')
        } finally {
            setLoading(false)
        }
    }

    const fetchTransactionReceipt = async (txHash: string): Promise<{ deployedAddress: string | null; ensName: string | null }> => {
        try {
            if (!walletClient) return { deployedAddress: null, ensName: null }

            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()

            const receipt = await signer.provider.getTransactionReceipt(txHash)
            if (!receipt || !receipt.logs) return { deployedAddress: null, ensName: null }

            let deployedAddr: string | null = null
            let ensName: string | null = null

            for (const log of receipt.logs) {
                if (log.topics[0] === topic0_deployment) {
                    deployedAddr = ethers.getAddress("0x" + log.data.slice(-40))
                } else if (log.topics[0] === topic0_nameChanged) {
                    const decodedData = ethers.AbiCoder.defaultAbiCoder().decode(["string"], log.data)
                    ensName = decodedData[0]
                }
            }

            return { deployedAddress: deployedAddr, ensName }
        } catch (error) {
            console.error("Error fetching transaction receipt:", error)
            return { deployedAddress: null, ensName: null }
        }
    }

    const truncateText = (text: string) => {
        if (text.length <= 20) return text
        return text.slice(0, 40) + "..." + text.slice(-3)
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
    }

    const totalPages = Math.ceil(contracts.length / itemsPerPage)
    const paginatedContracts = contracts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

    return (
        <div>
            {!isConnected ? (
                <p className="text-red-500 text-lg">Please connect your wallet to view contract history.</p>
            ) : loading ? (
                <p className="text-gray-700 dark:text-gray-300">Loading contract history...</p>
            ) : error ? (
                <p className="text-red-500">{error}</p>
            ) : contracts.length === 0 ? (
                <p className="text-gray-700 dark:text-gray-300">No transactions found.</p>
            ) : (
                <>
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
                            {paginatedContracts.map((contract, index) => (
                                <tr key={index} className="hover:bg-gray-100 dark:hover:bg-gray-900">
                                    {/* ENS Name Column */}
                                    <td className="py-2 px-4 border break-all text-gray-700 dark:text-gray-300">
                                        <Link href={`https://app.ens.domains/${contract.ensName}`} legacyBehavior passHref>
                                            <a target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                                {contract.ensName}
                                            </a>
                                        </Link>
                                    </td>
                                    {/* Contract Address Column */}
                                    <td className="py-2 px-4 border break-all text-gray-700 dark:text-gray-300">
                                        <Link href={`https://sepolia.etherscan.io/address/${contract.contractAddress}`} legacyBehavior passHref>
                                            <a target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                                {contract.contractAddress}
                                            </a>
                                        </Link>
                                    </td>
                                    {/* Transaction Hash Column */}
                                    <td className="py-2 px-4 border break-all text-gray-700 dark:text-gray-300">
                                        <Link href={`https://sepolia.etherscan.io/tx/${contract.txHash}`} legacyBehavior passHref>
                                            <a target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                                {truncateText(contract.txHash)}
                                            </a>
                                        </Link>
                                    </td>
                                    {/* View on Apps Column */}
                                    <td className="py-2 px-4 border text-center">
                                        <div className="flex flex-col items-center gap-2 w-full">
                                            {/* First Row - Etherscan & Blockscout */}
                                            <div className="flex gap-2 w-full">
                                                <Link href={`https://sepolia.etherscan.io/tx/${contract.txHash}`} legacyBehavior passHref>
                                                    <a target="_blank" rel="noopener noreferrer" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex-1 text-center">
                                                        Etherscan
                                                    </a>
                                                </Link>
                                                <Link href={`https://eth-sepolia.blockscout.com/tx/${contract.txHash}`} legacyBehavior passHref>
                                                    <a target="_blank" rel="noopener noreferrer" className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded flex-1 text-center">
                                                        Blockscout
                                                    </a>
                                                </Link>
                                            </div>

                                            {/* Second Row - Full-Width ENS App */}
                                            <div className="w-full">
                                                <Link href={`https://app.ens.domains/${contract.ensName}`} legacyBehavior passHref>
                                                    <a target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded block w-full text-center">
                                                        ENS App
                                                    </a>
                                                </Link>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination Controls */}
                    <div className="flex justify-center mt-4">
                        <button
                            onClick={() => setCurrentPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="mx-2 bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="text-gray-900 dark:text-white px-4 py-2">{`Page ${currentPage} of ${totalPages}`}</span>
                        <button
                            onClick={() => setCurrentPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="mx-2 bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}