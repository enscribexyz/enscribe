import React from "react";
import Layout from "@theme/Layout";
import ContractNamingAuditPage from "../components/ContractNamingAuditPage";

export default function ContractNamingAudit() {
    return (
        <Layout
            title="Contract Naming Audit & Adoption Program"
            description="A bespoke ENS-powered contract naming audit for your app or protocol."
        >
            <ContractNamingAuditPage />
        </Layout>
    );
}