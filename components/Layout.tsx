import React from 'react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { PencilSquareIcon, ClockIcon } from '@heroicons/react/24/outline';

interface LayoutProps {
    children: React.ReactNode;
}

const navigation = [
    { name: 'Deploy New Contract', href: '/deploy', icon: PencilSquareIcon },
    { name: 'Contract History', href: '/history', icon: ClockIcon },
];

export default function Layout({ children }: LayoutProps) {
    return (
        <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
            {/* Sidebar */}
            <aside className="w-70 bg-gray-900 text-white shadow-md flex flex-col justify-between">
                <div>
                    <div className="px-6 py-4 flex items-center border-b border-gray-700">
                        <Link href="/" legacyBehavior>
                            <a><h1 className="text-2xl font-bold">Enscribe</h1></a>
                        </Link>
                    </div>
                    <nav className="px-4 py-6">
                        <ul className="space-y-2">
                            {navigation.map((item) => (
                                <li key={item.name}>
                                    <Link href={item.href} legacyBehavior>
                                        <a className="flex items-center p-3 text-gray-300 hover:bg-gray-800 rounded-md">
                                            <item.icon className="w-5 h-5 mr-3 text-gray-400" />
                                            {item.name}
                                        </a>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
                <div className="p-4 border-t border-gray-700 flex justify-center">
                    <ConnectButton accountStatus={{
                        smallScreen: 'avatar',
                        largeScreen: 'full',
                    }} chainStatus="icon" showBalance={false} />
                </div>
            </aside>

            {/* Main content */}
            <div className="flex flex-1 flex-col">
                <main className="flex-1 p-6 bg-white dark:bg-gray-800">
                    {children}
                </main>
            </div>
        </div>
    );
}
