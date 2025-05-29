import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { usePublicClient, useAccount } from 'wagmi';
import { isAddress, ethers } from 'ethers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import ChainSelector from './ChainSelector';
import { CONTRACTS } from '@/utils/constants';

export default function AddressSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedChain, setSelectedChain] = useState<number>(1); // Default to Ethereum mainnet

  const router = useRouter();
  const publicClient = usePublicClient();
  const { chain } = useAccount();

  // Track if the user has manually changed the chain
  const [manuallyChanged, setManuallyChanged] = useState(false);

  // Set the selected chain to the connected wallet's chain when available
  useEffect(() => {
    if (chain?.id && !manuallyChanged) {
      console.log('Wallet connected to chain:', chain.id, chain.name);
      console.log('Syncing chain selector with wallet chain:', chain.id);
      setSelectedChain(chain.id);
    }
  }, [chain?.id, manuallyChanged]);

  // Log when the selected chain changes
  useEffect(() => {
    console.log('Selected chain changed to:', selectedChain);
  }, [selectedChain]);

  const handleChainChange = (chainId: number) => {
    if (chainId !== chain?.id) {
      // If selecting a different chain than the wallet, mark as manually changed
      console.log('Manual chain selection different from wallet chain');
      setManuallyChanged(true);
    } else {
      // If selecting the same chain as the wallet, reset the manual flag
      console.log('Selected chain matches wallet chain');
      setManuallyChanged(false);
    }
    setSelectedChain(chainId);
  };

  // Function to get the appropriate provider based on the selected chain
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

      // Get a provider for the selected chain
      const provider = getProvider(selectedChain);

      if (isValidAddress) {
        // It's a valid Ethereum address, now check if it's a contract or EOA
        try {
          console.log('Checking code for address:', cleanedQuery);
          const code = await provider.getCode(cleanedQuery);
          console.log('Code result:', code);

          if (code && code !== '0x') {
            // It's a contract - redirect to contract details page with chainId
            console.log('Detected as CONTRACT, redirecting to:', `/contracts/${selectedChain}/${cleanedQuery}`);
            router.push(`/contracts/${selectedChain}/${cleanedQuery}`);
          } else {
            // It's an EOA - redirect to history/[address] page with chainId
            console.log('Detected as EOA, redirecting to:', `/history/${selectedChain}/${cleanedQuery}`);
            router.push(`/history/${selectedChain}/${cleanedQuery}`);
          }
        } catch (error) {
          console.error('Error checking code:', error);
          // Even if we can't check the code, we can still redirect to the history page
          // since it's a valid address (assume it's an EOA)
          console.log('Error occurred, redirecting valid address to history page');
          router.push(`/history/${selectedChain}/${cleanedQuery}`);
        }
      } else {
        // Not a valid Ethereum address, try to resolve it as an ENS name
        try {
          console.log('Not a valid address, trying to resolve as ENS name:', cleanedQuery);
          // For ENS resolution, we need to use the Ethereum mainnet provider
          const mainnetProvider = getProvider(1);
          const resolvedAddress = await mainnetProvider.resolveName(cleanedQuery);
          console.log('Resolved ENS address:', resolvedAddress);

          if (resolvedAddress) {
            // Successfully resolved ENS name
            try {
              console.log('Checking code for resolved address:', resolvedAddress);
              const code = await provider.getCode(resolvedAddress);
              console.log('Code result for resolved address:', code);

              if (code && code !== '0x') {
                // It's a contract
                console.log('Resolved address is a CONTRACT, redirecting to:', `/contracts/${selectedChain}/${resolvedAddress}`);
                router.push(`/contracts/${selectedChain}/${resolvedAddress}`);
              } else {
                // It's an EOA
                console.log('Resolved address is an EOA, redirecting to:', `/history/${selectedChain}/${resolvedAddress}`);
                router.push(`/history/${selectedChain}/${resolvedAddress}`);
              }
            } catch (codeError) {
              console.error('Error checking code for resolved address:', codeError);
              // Default to history page if we can't determine the type
              router.push(`/history/${selectedChain}/${resolvedAddress}`);
            }
          } else {
            console.error('Could not resolve ENS name');
            setError('Could not resolve ENS name');
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
    <div className="flex items-center max-w-md gap-2">
      <ChainSelector
        selectedChain={selectedChain}
        onChainChange={handleChainChange}
      />
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
