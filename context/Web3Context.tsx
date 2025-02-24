import React, { createContext, useContext, useState, ReactNode } from 'react'
import { BrowserProvider, Signer } from 'ethers';

type Web3ContextType = {
    address?: string
    isConnected: boolean
    connectWallet: () => Promise<void>
    disconnectWallet: () => void
    signer?: Signer
    provider?: BrowserProvider
}

const Web3Context = createContext<Web3ContextType>({
    address: undefined,
    isConnected: false,
    connectWallet: async () => { },
    disconnectWallet: () => { },
    signer: undefined,
    provider: undefined,
})

export const Web3Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [address, setAddress] = useState<string>()
    const [isConnected, setIsConnected] = useState(false)
    const [provider, setProvider] = useState<BrowserProvider>()
    const [signer, setSigner] = useState<Signer>()

    const connectWallet = async () => {
        if (typeof window !== 'undefined' && (window as any).ethereum) {
            try {
                const _provider = new BrowserProvider((window as any).ethereum)
                await _provider.send('eth_requestAccounts', [])
                const _signer = await _provider.getSigner()
                const _address = await _signer.getAddress()

                setProvider(_provider)
                setSigner(_signer)
                setAddress(_address)
                setIsConnected(true)
            } catch (error) {
                console.error("Error connecting wallet:", error)
            }
        } else {
            alert('Please install MetaMask!')
        }
    }

    const disconnectWallet = () => {
        setProvider(undefined)
        setSigner(undefined)
        setAddress(undefined)
        setIsConnected(false)
    }

    return (
        <Web3Context.Provider
            value={{
                address,
                isConnected,
                connectWallet,
                disconnectWallet,
                provider,
                signer,
            }}
        >
            {children}
        </Web3Context.Provider>
    )
}

export const useWeb3Context = () => useContext(Web3Context)
