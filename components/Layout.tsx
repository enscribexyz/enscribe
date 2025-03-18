import React, { useState } from 'react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { PencilSquareIcon, ClockIcon, Bars3Icon, XMarkIcon, DocumentTextIcon, InformationCircleIcon, DocumentIcon } from '@heroicons/react/24/outline';

interface LayoutProps {
    children: React.ReactNode;
}

const navigation = [
    { name: 'Deploy New Contract', href: '/deploy', icon: PencilSquareIcon },
    { name: 'Name Contract', href: '/nameContract', icon: DocumentTextIcon },
    { name: 'Contract History', href: '/history', icon: ClockIcon }
];

const productLink = process.env.NEXT_PUBLIC_PRODUCT_LINK;

export default function Layout({ children }: LayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-gray-100 dark:bg-gray-900">
            {/* Sidebar for Large Screens */}
            <aside className="hidden lg:flex lg:w-64 bg-gray-900 text-white shadow-md flex-col">
                <div>
                    <div className="px-6 py-4 flex items-center space-x-2 border-b border-gray-700">
                        <Link href="/" legacyBehavior>
                            <a className="flex items-center space-x-2">
                                {/* Logo */}
                                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect width="32" height="32" rx="4" fill="#151A2D" />
                                    <path d="M10 12L6 16L10 20" stroke="#4DB8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M22 12L26 16L22 20" stroke="#4DB8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M18 10L14 22" stroke="#4DB8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>

                                {/* Text */}
                                <h2 className="text-2xl font-bold text-white">Enscribe</h2>
                            </a>
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

                {/* Push buttons to the bottom */}
                <div className="mt-auto px-4 py-4 flex space-x-4">
                    <Link href={productLink} legacyBehavior>
                        <a className="flex items-center justify-center w-1/2 text-gray-300 hover:bg-gray-800 p-3 rounded-md"
                            target="_blank"
                            rel="noopener noreferrer">
                            <InformationCircleIcon className="w-5 h-5 mr-3 text-gray-400" />
                            About
                        </a>
                    </Link>
                    <Link href={productLink + "/docs"} legacyBehavior>
                        <a className="flex items-center justify-center w-1/2 text-gray-300 hover:bg-gray-800 p-3 rounded-md"
                            target="_blank"
                            rel="noopener noreferrer">
                            <DocumentIcon className="w-5 h-5 mr-3 text-gray-400" />
                            Docs
                        </a>
                    </Link>
                </div>
            </aside>

            {/* Mobile Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform lg:hidden flex flex-col h-full`}>
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-700">
                    <Link href="/" legacyBehavior>
                        <a className="flex items-center space-x-2">
                            {/* Logo */}
                            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect width="32" height="32" rx="4" fill="#151A2D" />
                                <path d="M10 12L6 16L10 20" stroke="#4DB8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M22 12L26 16L22 20" stroke="#4DB8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M18 10L14 22" stroke="#4DB8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>

                            {/* Text */}
                            <h2 className="text-2xl font-bold text-white">Enscribe</h2>
                        </a>
                    </Link>
                    <button onClick={() => setSidebarOpen(false)}>
                        <XMarkIcon className="w-6 h-6 text-white" />
                    </button>
                </div>

                {/* Navigation Links */}
                <nav className="px-4 py-6 flex-grow">
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

                {/* Bottom Buttons */}
                <div className="mt-auto px-4 py-4 flex space-x-4">
                    <Link href={productLink} target="_blank" legacyBehavior>
                        <a className="flex items-center justify-center w-1/2 text-gray-300 hover:bg-gray-800 p-3 rounded-md"
                            target="_blank"
                            rel="noopener noreferrer">
                            <InformationCircleIcon className="w-5 h-5 mr-3 text-gray-400" />
                            About
                        </a>
                    </Link>
                    <Link href={`${productLink}/docs`} target="_blank" legacyBehavior>
                        <a className="flex items-center justify-center w-1/2 text-gray-300 hover:bg-gray-800 p-3 rounded-md"
                            target="_blank"
                            rel="noopener noreferrer">
                            <DocumentIcon className="w-5 h-5 mr-3 text-gray-400" />
                            Docs
                        </a>
                    </Link>
                </div>
            </div>

            {/* Main content area */}
            <div className="flex flex-1 flex-col">
                {/* Top Navbar */}
                <header className="flex items-center p-4 bg-white dark:bg-gray-800 shadow-md">
                    {/* Mobile Menu Button */}
                    <div className="lg:hidden">
                        <button onClick={() => setSidebarOpen(true)}>
                            <Bars3Icon className="w-6 h-6 text-gray-900 dark:text-white" />
                        </button>
                    </div>

                    <div className="flex-1"></div>

                    {/* WalletConnect Button */}
                    <ConnectButton accountStatus={{
                        smallScreen: 'avatar',
                        largeScreen: 'full',
                    }} chainStatus={{
                        smallScreen: 'icon',
                        largeScreen: 'full',
                    }} showBalance={{
                        smallScreen: false,
                        largeScreen: true,
                    }} />
                </header>

                <main className="flex-1 p-6 bg-white dark:bg-gray-800">
                    {children}
                </main>
            </div>
        </div>
    );
}