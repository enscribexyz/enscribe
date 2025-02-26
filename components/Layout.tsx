import React from 'react'
import Link from 'next/link'
import { useWeb3Context } from '../context/Web3Context'

interface LayoutProps {
    children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
    const { isConnected, address, connectWallet, disconnectWallet } = useWeb3Context()

    return (
        <div className="flex flex-col min-h-screen">
            {/* Top NavBar */}
            <nav className="w-full flex justify-between items-center bg-blue-500 dark:bg-gray-800 shadow-md p-4">
                <Link legacyBehavior href="/">
                    <h1 className="text-2xl font-bold text-white hover:underline">Named</h1>
                </Link>

                <div>
                    {!isConnected ? (
                        <button
                            onClick={connectWallet}
                            className="bg-indigo-800 hover:bg-indigo-900 text-white font-bold py-2 px-4 rounded-lg"
                        >
                            Connect Wallet
                        </button>
                    ) : (
                        <div className="flex items-center gap-4">
                            <p className="text-white-700 dark:text-gray-300 hidden md:block">{address}</p>
                            <button
                                onClick={disconnectWallet}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
                            >
                                Disconnect
                            </button>
                        </div>
                    )}
                </div>
            </nav>

            <div className="flex flex-1">
                {/* Sidebar */}
                <aside className="w-64 bg-gray-100 dark:bg-gray-900 p-4">
                    <ul>
                        <li className="mb-4">
                            <Link legacyBehavior href="/deploy">
                                <a className="block p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-900 dark:text-white">
                                    Deploy New Contract
                                </a>
                            </Link>
                        </li>
                        <li>
                            <Link legacyBehavior href="/history">
                                <a className="block p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded text-gray-900 dark:text-white">
                                    Contract History
                                </a>
                            </Link>
                        </li>
                    </ul>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-6 bg-white dark:bg-gray-800">
                    {children}
                </main>
            </div>
        </div>
    )
}