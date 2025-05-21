import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount } from 'wagmi';
import { isAddress } from 'ethers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, ArrowRight } from 'lucide-react';
import Layout from '@/components/Layout';

export default function ContractsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { isConnected } = useAccount();

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter an address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Check if it's a valid Ethereum address
      if (isAddress(searchQuery)) {
        // Redirect to history page with the address as a query parameter
        router.push(`/history?address=${searchQuery}`);
      } else {
        // If it's not a valid address, try to resolve it as an ENS name
        // (You'll need to implement ENS resolution if needed)
        setError('Please enter a valid Ethereum address');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('An error occurred while processing your request');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Deployed Contracts Explorer
          </h1>
        </div>

        <Card className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700">
          <CardHeader className="border-b border-gray-200 dark:border-gray-700">
            <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
              Enter an Ethereum address to view its contract deployment history
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400 dark:text-gray-500" />
                <Input
                  type="text"
                  placeholder="0x... or ENS name"
                  className="pl-10 h-12 text-base border-gray-300 dark:border-gray-600 focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setError('');
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  disabled={!isConnected || isLoading}
                />
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-md">
                  {error}
                </div>
              )}

              <Button
                onClick={handleSearch}
                disabled={!isConnected || isLoading || !searchQuery.trim()}
                className="w-full sm:w-auto text-white font-medium py-2.5 px-6 rounded-lg transition-colors duration-200 flex items-center gap-2 h-11"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Searching...
                  </>
                ) : (
                  <>
                    Search
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
