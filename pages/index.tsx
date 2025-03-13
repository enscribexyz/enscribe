import React from 'react';
import Layout from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function Home() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center px-6">
        {/* Logo & Branding */}
        <div className="flex items-center space-x-3 mb-6">
          {/* SVG Logo */}
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="4" fill="#151A2D" />
            <path d="M10 12L6 16L10 20" stroke="#4DB8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 12L26 16L22 20" stroke="#4DB8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M18 10L14 22" stroke="#4DB8E8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          {/* Brand Name */}
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Enscribe</h2>
        </div>

        {/* Main Content Card */}
        <Card className="w-full max-w-4xl shadow-lg rounded-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-gray-900 dark:text-white text-center">
              DApp to Deploy Contracts with Primary ENS Name
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-gray-700 dark:text-gray-300 text-center leading-relaxed">
              This DApp allows users to seamlessly deploy Ethereum contracts while linking them to their primary ENS names.
              Utilize the sidebar for quick navigation and streamlined contract deployment.
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}