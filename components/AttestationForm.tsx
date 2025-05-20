import React, {useEffect, useState} from "react";
import {useAccount} from "wagmi";
import {Conf, VeraxSdk} from "@verax-attestation-registry/verax-sdk";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {CHAINS} from "@/utils/constants";
import {Address, Hex} from "viem";
import {waitForTransactionReceipt} from "viem/actions";
import {wagmiConfig} from "@/pages/_app";

const schemaId = "0x21F071977E3C1BA143D43ADBE5085F284A562BF91789CFE9EE3AAD710B6A3CDC".toLowerCase() as Hex;
const portalId = "0xdc333373693370F4C3BF731Be8F35535D9E424e4".toLowerCase() as Address;
const SCHEMA = "((string name, string uri, string[] authors) auditor, uint256 issuedAt, uint256[] ercs, (bytes32 chainId, address deployment) auditedContract, bytes32 auditHash, string auditUri)"

export default function AttestationForm() {
    const {address, chain} = useAccount();

    const [loading, setLoading] = useState(false);
    const [veraxSdk, setVeraxSdk] = useState<VeraxSdk>();
    const [txHash, setTxHash] = useState<Hex>();
    const [attestationId, setAttestationId] = useState<Hex>();
    const [veraxExplorerUrl, setVeraxExplorerUrl] = useState<string>();

    useEffect(() => {
        if (chain?.id && address) {
            let sdkConf: Conf;
            let veraxExplorerUrl: string;
            switch (chain.id) {
                case CHAINS.BASE:
                    sdkConf = VeraxSdk.DEFAULT_BASE_FRONTEND;
                    veraxExplorerUrl = "https://explorer.ver.ax/base-mainnet";
                    break;
                case CHAINS.LINEA:
                    sdkConf = VeraxSdk.DEFAULT_LINEA_MAINNET_FRONTEND;
                    veraxExplorerUrl = "https://explorer.ver.ax/linea";
                    break;
                case CHAINS.LINEA_SEPOLIA:
                    sdkConf = VeraxSdk.DEFAULT_LINEA_SEPOLIA_FRONTEND;
                    veraxExplorerUrl = "https://explorer.ver.ax/linea-sepolia";
                    break;
                default:
                    sdkConf = VeraxSdk.DEFAULT_BASE_SEPOLIA_FRONTEND;
                    veraxExplorerUrl = "https://explorer.ver.ax/base-sepolia";
            }
            const veraxSdk = new VeraxSdk(sdkConf, address);
            setVeraxSdk(veraxSdk);
            setVeraxExplorerUrl(veraxExplorerUrl);
        }
    }, [chain, address]);

    const truncateHexString = (hexString: string) => {
        return `${hexString.slice(0, 5)}...${hexString.slice(hexString.length - 5, hexString.length)}`;
    };

    const [form, setForm] = useState({
        auditorName: "OpenZeppelin",
        auditorUri: "https://openzeppelin.com",
        authors: "Alice,Bob",
        issuedAt: Math.floor(Date.now() / 1000),
        ercs: "20,721",
        chainId: "0x0000000000000000000000000000000000014a34",
        deployment: "0x1234567890abcdef1234567890abcdef12345678",
        auditHash: "0xa5e8f3ab3ef8b4acb9e12780f745cc70ddf6c44b1c2d6f5f0c02cb7fdddb3cc8",
        auditUri: "ipfs://QmExampleAuditHash"
    });

    const handleChange = (e: any) => {
        setForm({...form, [e.target.name]: e.target.value});
    };

    const handleSubmit = async () => {
        if (!address) return alert("Wallet not connected");

        setLoading(true);
        setTxHash(undefined);
        setAttestationId(undefined);

        if (address && veraxSdk) {
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
                                },
                                auditHash: "0xa5e8f3ab3ef8b4acb9e12780f745cc70ddf6c44b1c2d6f5f0c02cb7fdddb3cc8",
                                auditUri: "ipfs://QmExampleAuditHash",
                            },
                        ],
                    },
                    []
                );

                const transactionHash = tx.transactionHash;

                if (transactionHash) {
                    setTxHash(transactionHash)

                    const receipt = await waitForTransactionReceipt(wagmiConfig.getClient(), {
                        hash: transactionHash,
                    });

                    const attId = receipt!.logs?.[0].topics[1] as Hex;
                    setAttestationId(attId)
                } else {
                    alert(`Oops, something went wrong!`);
                }
            } catch (e) {
                console.error(e);
                if (e instanceof Error) {
                    alert(`Oops, something went wrong: ${e.message}`);
                }
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-xl p-8">
            <h1 className="text-2xl font-bold text-black dark:text-white">Submit EIP-7512 Audit Attestation</h1>
            <div className="space-y-6 mt-6 text-black">
                <div>
                    <label htmlFor="auditorName" className="block font-medium mb-1">Auditor Name</label>
                    <Input id="auditorName" name="auditorName" value={form.auditorName} onChange={handleChange}
                           className="text-black"/>
                </div>

                <div>
                    <label htmlFor="auditorUri" className="block font-medium mb-1">Auditor URI</label>
                    <Input id="auditorUri" name="auditorUri" value={form.auditorUri} onChange={handleChange}
                           className="text-black"/>
                </div>

                <div>
                    <label htmlFor="authors" className="block font-medium mb-1">Authors (comma-separated)</label>
                    <Input id="authors" name="authors" value={form.authors} onChange={handleChange}
                           className="text-black"/>
                </div>

                <div>
                    <label htmlFor="ercs" className="block font-medium mb-1">ERCs (comma-separated)</label>
                    <Input id="ercs" name="ercs" value={form.ercs} onChange={handleChange} className="text-black"/>
                </div>

                <div>
                    <label htmlFor="deployment" className="block font-medium mb-1">Contract Address</label>
                    <Input id="deployment" name="deployment" value={form.deployment} onChange={handleChange}
                           className="text-black"/>
                </div>

                <div>
                    <label htmlFor="auditHash" className="block font-medium mb-1">Audit Hash (bytes32)</label>
                    <Input id="auditHash" name="auditHash" value={form.auditHash} onChange={handleChange}
                           className="text-black"/>
                </div>

                <div>
                    <label htmlFor="auditUri" className="block font-medium mb-1">Audit URI (e.g. IPFS)</label>
                    <Input id="auditUri" name="auditUri" value={form.auditUri} onChange={handleChange}
                           className="text-black"/>
                </div>
            </div>

            <Button onClick={handleSubmit} disabled={loading} className="w-full mt-6">
                {loading ? "Submitting..." : "Submit Attestation"}
            </Button>

            {txHash && (
                <div className="text-sm text-green-600 dark:text-green-400 mt-2 break-all">
                    Transaction: <a className="underline cursor-pointer font-bold"
                                         target="_blank"
                                         rel="noopener noreferrer"
                                         href={`${chain?.blockExplorers?.default.url}/tx/${txHash}`}>{truncateHexString(txHash)}</a>
                </div>
            )}

            {attestationId && (
                <div className="text-sm text-green-600 dark:text-green-400 mt-2 break-all">
                    Attestation: <a className="underline cursor-pointer font-bold"
                                       target="_blank"
                                       rel="noopener noreferrer"
                                       href={`${veraxExplorerUrl}/attestations/${attestationId}`}>{truncateHexString(attestationId)}</a>
                </div>
            )}
        </div>
    );
}
