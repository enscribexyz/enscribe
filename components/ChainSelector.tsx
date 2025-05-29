import React, { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';
import { useRouter } from 'next/router';

// Chain information with logos
const CHAIN_OPTIONS = [
  { id: 1, name: 'Ethereum', logo: '/images/ethereum.svg' },
  { id: 59144, name: 'Linea Mainnet', logo: '/images/linea.svg' },
  { id: 8453, name: 'Base Mainnet', logo: '/images/base.svg' },
  { id: 11155111, name: 'Sepolia Testnet', logo: '/images/ethereum.svg' },
  { id: 59141, name: 'Linea Sepolia', logo: '/images/linea.svg' },
  { id: 84532, name: 'Base Sepolia', logo: '/images/base.svg' }
];

interface ChainSelectorProps {
  selectedChain: number;
  onChainChange: (chainId: number) => void;
}

// Helper function to get chain info by ID
const getChainById = (id: number) => {
  return CHAIN_OPTIONS.find(chain => chain.id === id) || CHAIN_OPTIONS[0];
};

export default function ChainSelector({ selectedChain, onChainChange }: ChainSelectorProps) {
  const [isMobile, setIsMobile] = useState(false);
  const selectedChainInfo = getChainById(selectedChain);
  const router = useRouter();

  // Sync with chainId from URL query parameter if present
  useEffect(() => {
    if (router.query.chainId && typeof router.query.chainId === 'string') {
      const chainId = parseInt(router.query.chainId);
      if (!isNaN(chainId) && CHAIN_OPTIONS.some(chain => chain.id === chainId) && chainId !== selectedChain) {
        onChainChange(chainId);
      }
    }
  }, [router.query.chainId, selectedChain, onChainChange]);

  // Check if screen is mobile size
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 640); // 640px is the sm breakpoint in Tailwind
    };

    // Initial check
    checkIfMobile();

    // Add event listener for window resize
    window.addEventListener('resize', checkIfMobile);

    // Cleanup
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  return (
    <Select
      value={selectedChain.toString()}
      onValueChange={(value) => onChainChange(parseInt(value))}
    >
      <SelectTrigger className="text-black md:w-[180px] w-fit min-w-[40px] transition-all focus:ring-0 focus:ring-offset-0">
        <div className="flex items-center gap-2 overflow-hidden">
          {selectedChainInfo.logo && (
            <div className="flex-shrink-0 w-6 h-6 relative"> {/* Increased size for full logo */}
              <Image
                src={selectedChainInfo.logo}
                alt={selectedChainInfo.name}
                width={24}
                height={24}
                className="object-contain"
              />
            </div>
          )}
          <span className={`whitespace-nowrap ${isMobile ? 'hidden' : 'inline'}`}>{selectedChainInfo.name}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {CHAIN_OPTIONS.map((chain) => (
          <SelectItem key={chain.id} value={chain.id.toString()} className="focus:bg-gray-100 dark:focus:bg-gray-700">
            <div className="flex items-center gap-2">
              {chain.logo && (
                <div className="flex-shrink-0 w-6 h-6 relative"> {/* Increased size for full logo */}
                  <Image
                    src={chain.logo}
                    alt={chain.name}
                    width={24}
                    height={24}
                    className="object-contain"
                  />
                </div>
              )}
              <span className="whitespace-nowrap">{chain.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
