import React from 'react'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'

interface LayoutProps {
    children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
    return (
        <div className="flex flex-col min-h-screen">
            <nav className="w-full flex justify-between items-center bg-blue-500 dark:bg-gray-800 shadow-md p-4">
                <Link legacyBehavior href="/">
                    <h1 className="text-2xl font-bold text-white hover:underline">Named</h1>
                </Link>
                <ConnectButton />
            </nav>

            <div className="flex flex-1">
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

                <main className="flex-1 p-6 bg-white dark:bg-gray-800">
                    {children}
                </main>
            </div>
        </div>
    )
}