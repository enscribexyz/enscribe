import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAccount, usePublicClient } from 'wagmi';
import { isAddress } from 'ethers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, ArrowRight, AlertCircle } from 'lucide-react';
import Layout from '@/components/Layout';
import ContractDetails from '@/components/ContractDetails';

export default function ContractsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchedAddress, setSearchedAddress] = useState('');
  const [isContract, setIsContract] = useState(false);
  const [isEOA, setIsEOA] = useState(false);

  const router = useRouter();
  const { isConnected } = useAccount();
  const publicClient = usePublicClient();

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter an address');
      return;
    }

    setIsLoading(true);
    setError('');
    setIsContract(false);
    setIsEOA(false);
    setSearchedAddress('');

    try {
      let address = searchQuery;

      // Check if it's a valid Ethereum address
      if (isAddress(searchQuery)) {
        // Check if it's a contract or EOA
        const code = await publicClient!.getBytecode({ address: searchQuery });

        if (code !== '0x') {
          // It's a contract
          setIsContract(true);
          setSearchedAddress(searchQuery);
          // Redirect to contract details page
          router.push(`/contracts/${searchQuery}`);
        } else {
          // It's an EOA (Externally Owned Account)
          setIsEOA(true);
          setSearchedAddress(searchQuery);

          // Optionally redirect to history page for EOAs
          // router.push(`/history?address=${searchQuery}`);
        }
      } else {
        // If it's not a valid address, try to resolve it as an ENS name
        try {
          const resolvedAddress = await publicClient!.getEnsAddress({ name: searchQuery });

          if (resolvedAddress) {
            address = resolvedAddress;
            const code = await publicClient!.getBytecode({ address: resolvedAddress });

            if (code !== '0x') {
              // It's a contract
              setIsContract(true);
              setSearchedAddress(resolvedAddress);
              // Redirect to contract details page
              router.push(`/contracts/${resolvedAddress}`);
            } else {
              // It's an EOA
              setIsEOA(true);
              setSearchedAddress(resolvedAddress);

              // Optionally redirect to history page for EOAs
              // router.push(`/history?address=${resolvedAddress}`);
            }
          } else {
            setError('Could not resolve ENS name to an address');
          }
        } catch (ensError) {
          console.error('ENS resolution error:', ensError);
          setError('Please enter a valid Ethereum address or ENS name');
        }
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
              Enter an Ethereum address or ENS name
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

        {isEOA && searchedAddress && (
          <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 relative">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-3 mt-0.5" />
              <div>
                <h5 className="text-yellow-800 dark:text-yellow-300 font-medium mb-1">Externally Owned Account (EOA)</h5>
                <div className="text-yellow-700 dark:text-yellow-400 text-sm">
                  The address {searchedAddress} is an Externally Owned Account, not a contract.
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      className="border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
                      onClick={() => router.push(`/history?address=${searchedAddress}`)}
                    >
                      View Deployment History
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isContract && searchedAddress && (
          <ContractDetails address={searchedAddress} />
        )}
      </div>
    </Layout>
  );
}
