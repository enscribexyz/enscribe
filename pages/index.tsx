import React from 'react'
import Layout from '../components/Layout'

export default function Home() {
  return (
    <Layout>
      <div className="p-6">
        <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
          DApp to Deploy Contracts with Primary ENS name
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          Welcome! <br />
          Use the sidebar to navigate between deploying a new contract and viewing contract history.
        </p>
      </div>
    </Layout>
  )
}