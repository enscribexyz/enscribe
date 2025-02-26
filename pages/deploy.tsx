import React from 'react'
import Layout from '../components/Layout'
import DeployForm from '../components/DeployForm'

export default function DeployPage() {
    return (
        <Layout>
            <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white">
                Deploy New Contract
            </h1>
            <DeployForm />
        </Layout>
    )
}