import React, { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';

// Chain information with logos
const CHAIN_OPTIONS = [
  { id: 1, name: 'Ethereum Mainnet', logo: '/images/ethereum.svg' },
  { id: 11155111, name: 'Sepolia Testnet', logo: '/images/ethereum.svg' },
  { id: 59144, name: 'Linea Mainnet', logo: '/images/linea.svg' },
  { id: 59141, name: 'Linea Sepolia Testnet', logo: '/images/linea.svg' },
  { id: 8453, name: 'Base Mainnet', logo: '/images/base.svg' },
  { id: 84532, name: 'Base Sepolia Testnet', logo: '/images/base.svg' }
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
      <SelectTrigger className="text-black md:w-[180px] w-[40px] transition-all">
        <div className="flex items-center gap-2 overflow-hidden">
          {selectedChainInfo.logo && (
            <div className="flex-shrink-0 w-5 h-5 relative">
              <Image 
                src={selectedChainInfo.logo} 
                alt={selectedChainInfo.name}
                width={20}
                height={20}
                className="object-contain"
              />
            </div>
          )}
          {!isMobile && (
            <span className="truncate">{selectedChainInfo.name}</span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent>
        {CHAIN_OPTIONS.map((chain) => (
          <SelectItem key={chain.id} value={chain.id.toString()}>
            <div className="flex items-center gap-2">
              {chain.logo && (
                <div className="flex-shrink-0 w-5 h-5 relative">
                  <Image 
                    src={chain.logo} 
                    alt={chain.name}
                    width={20}
                    height={20}
                    className="object-contain"
                  />
                </div>
              )}
              <span className="truncate">{chain.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
