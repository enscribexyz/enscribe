import React from "react";
import Layout from "@theme/Layout";
import ContractNamingAuditPage from "../components/ContractNamingAuditPage";

export default function ContractNamingAudit() {
    return (
        <Layout
            title="Contract Naming Audit & Adoption Program"
            description="A turnkey ENS-powered contract naming and verification audit for your protocol."
        >
            <ContractNamingAuditPage />
        </Layout>
    );
}