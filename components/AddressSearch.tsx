import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { usePublicClient, useAccount } from 'wagmi';
import { isAddress, ethers } from 'ethers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import { CONTRACTS } from '@/utils/constants';
import { useAccount as useWagmiAccount } from 'wagmi'; // Alias to avoid conflict

export default function AddressSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChain, setSelectedChain] = useState<number>(1); // Default to Ethereum mainnet
  const [manuallyChanged, setManuallyChanged] = useState(false); // New state to track manual changes

  const router = useRouter();
  const publicClient = usePublicClient();
  const { chain, isConnected } = useWagmiAccount(); // Use aliased hook

  // Set the selected chain to the connected wallet's chain when available, unless manually changed
  useEffect(() => {
    if (chain?.id && !manuallyChanged) {
      console.log('Wallet connected to chain:', chain.id, chain.name);
      setSelectedChain(chain.id);
    }
  }, [chain?.id, manuallyChanged]);

  // Function to get the appropriate provider based on the selected chain
  const handleChainChange = (chainId: number) => {
    setSelectedChain(chainId);
    setManuallyChanged(true); // Mark as manually changed
  };

  const getProvider = (chainId: number) => {
    const config = CONTRACTS[chainId];
    if (!config) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    // Get the appropriate Infura RPC endpoint based on the chain
    let rpcEndpoint = '';

    // Use the chain-specific RPC endpoint from .env
    if (chainId === 1) { // Ethereum Mainnet
      rpcEndpoint = process.env.NEXT_PUBLIC_RPC || '';
    } else if (chainId === 11155111) { // Sepolia
      rpcEndpoint = process.env.NEXT_PUBLIC_RPC_SEPOLIA || '';
    } else if (chainId === 59144) { // Linea Mainnet
      rpcEndpoint = process.env.NEXT_PUBLIC_RPC_LENIA || '';
    } else if (chainId === 59140) { // Linea Sepolia
      rpcEndpoint = process.env.NEXT_PUBLIC_RPC_LINEA_SEPOLIA || '';
    } else if (chainId === 8453) { // Base Mainnet
      rpcEndpoint = process.env.NEXT_PUBLIC_RPC_BASE || '';
    } else if (chainId === 84532) { // Base Sepolia
      rpcEndpoint = process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || '';
    }

    // Append Infura API key if available
    const infuraApiKey = process.env.NEXT_PUBLIC_INFURA_API_KEY || '';
    if (infuraApiKey && rpcEndpoint) {
      rpcEndpoint += infuraApiKey;
    }

    // Fallback to config.RPC_ENDPOINT if no specific endpoint found
    const finalEndpoint = rpcEndpoint || config.RPC_ENDPOINT;
    console.log(`Using RPC endpoint for chain ${chainId}:`, finalEndpoint);

    return new ethers.JsonRpcProvider(finalEndpoint);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter an address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // First, check if it's a valid Ethereum address
      const cleanedQuery = searchQuery.trim();
      const isValidAddress = isAddress(cleanedQuery);
      console.log('Search query:', cleanedQuery);
      console.log('Is valid address:', isValidAddress);

      if (isValidAddress) {
        // It's a valid Ethereum address, redirect to explore page
        router.push(`/explore/${selectedChain}/${cleanedQuery}`);
      } else {
        // Not a valid Ethereum address, try to resolve it as an ENS name
        try {
          console.log('Not a valid address, trying to resolve as ENS name:', cleanedQuery);
          // For ENS resolution, we need to use the Ethereum mainnet provider
          const mainnetProvider = getProvider(1);
          const resolvedAddress = await mainnetProvider.resolveName(cleanedQuery);
          console.log('Resolved ENS address:', resolvedAddress);

          if (resolvedAddress) {
            // Successfully resolved ENS name, redirect to explore page
            router.push(`/explore/${selectedChain}/${resolvedAddress}`);
          } else {
            setError("Couldn't resolve ENS name / Address");
          }
        } catch (ensError) {
          console.error('Error resolving ENS name:', ensError);
          setError('Invalid address or ENS name');
        }
      }
    } catch (error: any) {
      setError(error.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Enter key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="flex w-full items-center space-x-2">
      <div className="flex-1">
        <Input
          type="text"
          placeholder="Search address"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`pr-3 text-black ${error ? 'border-red-500' : ''}`}
        />
        {error && (
          <p className="text-xs text-red-500 mt-1 absolute">{error}</p>
        )}
      </div>
      <Button
        onClick={handleSearch}
        disabled={isLoading}
        className="ml-2"
        size="icon"
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
}
