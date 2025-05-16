import React, { useEffect, useState } from "react";
import { useWalletClient, useAccount } from "wagmi";
import { Conf, VeraxSdk } from "@verax-attestation-registry/verax-sdk";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CHAINS } from "@/utils/constants";
import { ethers } from 'ethers'
import { Hex, isAddress } from "viem";

const schemaId = "0x011199aa3fbc28f8aeaf05a60df42c819103830e00dc0a4631d4b4e4f4792b5c";
const portalId = "0xdc333373693370F4C3BF731Be8F35535D9E424e4";

export default function AttestationForm() {
    const { address, isConnected, chain } = useAccount();
    const { data: walletClient } = useWalletClient();

    const signer = walletClient ? new ethers.BrowserProvider(window.ethereum).getSigner() : null


    const [loading, setLoading] = useState(false);
    const [veraxSdk, setVeraxSdk] = useState<VeraxSdk>();
    const [txHash, setTxHash] = useState<Hex>();
    const [attestationId, setAttestationId] = useState<Hex>();


    useEffect(() => {
        if (chain?.id && address) {
            let sdkConf: Conf;
            switch (chain?.id) {
                case CHAINS.BASE:
                    sdkConf = VeraxSdk.DEFAULT_BASE;
                    break;

                case CHAINS.BASE_SEPOLIA:
                    sdkConf = VeraxSdk.DEFAULT_BASE_SEPOLIA;
                    break;

                case CHAINS.LINEA:
                    sdkConf = VeraxSdk.DEFAULT_LINEA_MAINNET;
                    break;

                case CHAINS.LINEA_SEPOLIA:
                    sdkConf = VeraxSdk.DEFAULT_LINEA_SEPOLIA;
                    break;

                default:
                    sdkConf = VeraxSdk.DEFAULT_BASE_SEPOLIA;
            }
            const veraxSdk = new VeraxSdk(sdkConf, address);
            setVeraxSdk(veraxSdk);
        }
    }, [chain, address]);

    const [form, setForm] = useState({
        auditorName: "OpenZeppelin",
        auditorUri: "https://openzeppelin.com",
        authors: "Alice,Bob",
        issuedAt: Math.floor(Date.now() / 1000),
        ercs: "20,721",
        chainId: "0x0000000000000000000000000000000000014a34",
        deployment: "0x1234567890abcdef1234567890abcdef12345678",
        ensName: "v0.app.enscribe.basetest.eth",
        auditHash: "0xa5e8f3ab3ef8b4acb9e12780f745cc70ddf6c44b1c2d6f5f0c02cb7fdddb3cc8",
        auditUri: "ipfs://QmExampleAuditHash"
    });


    const handleChange = (e: any) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        if (!walletClient || !address) return alert("Wallet not connected");

        setLoading(true);
        setTxHash(undefined);
        setAttestationId(undefined);
        if (address && veraxSdk) {

            console.log("verax config - ", veraxSdk)

            const alreadyExists = (await veraxSdk.schema.getSchema(schemaId)) as boolean;
            console.log("schema - ", schemaId, " exists - ", alreadyExists)

            try {
                const chainIdHex = "14a34";
                const paddedChainId = "0x" + chainIdHex.padStart(64, "0");
                let tx = await veraxSdk.portal.attest(
                    portalId,
                    {
                        schemaId,
                        expirationDate: 0,
                        subject: address,
                        attestationData: [
                            {
                                auditor: {
                                    name: "OpenZeppelin",
                                    uri: "https://openzeppelin.com",
                                    authors: ["Alice", "Bob"],
                                },
                                issuedAt: Math.floor(Date.now() / 1000),
                                ercs: [],
                                auditedContract: {
                                    chainId: paddedChainId,
                                    deployment: "0x3b854b093A4F60aB7C9635c2b84d015BC2359B2a",
                                    ensName: "v0.app.enscribe.basetest.eth",
                                },
                                auditHash: "0xa5e8f3ab3ef8b4acb9e12780f745cc70ddf6c44b1c2d6f5f0c02cb7fdddb3cc8",
                                auditUri: "ipfs://QmExampleAuditHash",
                            },
                        ],
                    },
                    []
                );

                if (tx.transactionHash) {
                    setTxHash(tx.transactionHash)
                    const receipt = await (await signer)?.provider!.waitForTransaction(tx.transactionHash!);

                    setAttestationId(receipt!.logs?.[0].topics[1] as `0x${string}`)
                    console.log("attestationID - ", attestationId)

                    const attestation = await veraxSdk.attestation.getAttestation(attestationId!);
                    console.log("attestation - ", attestation)

                    alert("Attestation submitted! : " + attestation);
                } else {
                    alert(`Oops, something went wrong!`);
                }
            } catch (e) {
                console.log(e);
                if (e instanceof Error) {
                    alert(`Oops, something went wrong: ${e.message}`);
                }
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow space-y-4 max-w-2xl">
            <h1 className="text-2xl font-bold text-black dark:text-white">Submit EIP-7512 Audit Attestation</h1>
            <div className="space-y-4 text-black">
                <div>
                    <label htmlFor="auditorName" className="block font-medium mb-1">Auditor Name</label>
                    <Input id="auditorName" name="auditorName" value={form.auditorName} onChange={handleChange} className="text-black" />
                </div>

                <div>
                    <label htmlFor="auditorUri" className="block font-medium mb-1">Auditor URI</label>
                    <Input id="auditorUri" name="auditorUri" value={form.auditorUri} onChange={handleChange} className="text-black" />
                </div>

                <div>
                    <label htmlFor="authors" className="block font-medium mb-1">Authors (comma-separated)</label>
                    <Input id="authors" name="authors" value={form.authors} onChange={handleChange} className="text-black" />
                </div>

                <div>
                    <label htmlFor="ercs" className="block font-medium mb-1">ERCs (comma-separated)</label>
                    <Input id="ercs" name="ercs" value={form.ercs} onChange={handleChange} className="text-black" />
                </div>

                <div>
                    <label htmlFor="deployment" className="block font-medium mb-1">Contract Address</label>
                    <Input id="deployment" name="deployment" value={form.deployment} onChange={handleChange} className="text-black" />
                </div>

                <div>
                    <label htmlFor="ensName" className="block font-medium mb-1">ENS Name</label>
                    <Input id="ensName" name="ensName" value={form.ensName} onChange={handleChange} className="text-black" />
                </div>

                <div>
                    <label htmlFor="auditHash" className="block font-medium mb-1">Audit Hash (bytes32)</label>
                    <Input id="auditHash" name="auditHash" value={form.auditHash} onChange={handleChange} className="text-black" />
                </div>

                <div>
                    <label htmlFor="auditUri" className="block font-medium mb-1">Audit URI (e.g. IPFS)</label>
                    <Input id="auditUri" name="auditUri" value={form.auditUri} onChange={handleChange} className="text-black" />
                </div>
            </div>
            <Button onClick={handleSubmit} disabled={loading} className="w-full">
                {loading ? "Submitting..." : "Submit Attestation"}
            </Button>

            {txHash && (
                <div className="text-sm text-green-600 dark:text-green-400 mt-2 break-all">
                    Submitted! Tx: {txHash}
                </div>
            )}
        </div>
    );
}