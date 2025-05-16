import AttestationForm from "@/components/AttestationForm";
import React from 'react'
import Layout from '../components/Layout'

export default function Page() {
    return (
        <Layout>
            <main className="p-10">
                <AttestationForm />
            </main>
        </Layout>

    );
}