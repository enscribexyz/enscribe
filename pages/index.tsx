import React from 'react'
import { useWeb3Context } from '../context/Web3Context'
import DeployForm from '../components/DeployForm'

export default function Home() {
  const { isConnected, address, connectWallet, disconnectWallet } = useWeb3Context()

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <nav className="w-full flex justify-between items-center bg-white dark:bg-gray-800 shadow-md p-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Named</h1>
        <div>
          {!isConnected ? (
            <button
              onClick={connectWallet}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg"
            >
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <p className="text-gray-700 dark:text-gray-300 hidden md:block">{address}</p>
              <button
                onClick={disconnectWallet}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="flex flex-col items-center justify-center p-6">
        <DeployForm />
      </div>
    </div>
  )
}