// pages/request-audit.tsx
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check } from 'lucide-react'; // For checkmark icon

const chains = ['Ethereum Mainnet', 'Base Mainnet', 'Linea Mainnet', 'Sepolia', 'Base Sepolia', 'Linea Sepolia'];
const auditFirms = ['Consensys Diligence', 'OpenZeppelin', 'Sherlock', 'Nethermind'];

export default function RequestAuditForm() {
    const router = useRouter();
    const [contractAddress, setContractAddress] = useState('');
    const [authorName, setAuthorName] = useState('');
    const [email, setEmail] = useState('');
    const [repo, setRepo] = useState('');
    const [selectedChains, setSelectedChains] = useState<string[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [firm, setFirm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [submitted, setSubmitted] = useState(false);
    const [requestId, setRequestId] = useState('');

    useEffect(() => {
        if (router.query.contract) {
            setContractAddress(router.query.contract as string);
        }
    }, [router.query.contract]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleSubmit = async () => {
        try {
            // Basic validation
            if (!authorName || !email || !repo || selectedChains.length === 0 || !firm) {
                alert('Please fill in all required fields');
                return;
            }

            // Prepare the request data
            const requestData = {
                contractAddress,
                authorName,
                email,
                contractRepo: repo,
                chains: selectedChains.map(chain => chain.split(' ')[0].toLowerCase()) // Convert to chain IDs
            };

            // Call the API
            const response = await fetch(`/api/v1/audit/firm/${encodeURIComponent(firm)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to submit audit request');
            }

            // Update state with the request ID from the server
            setRequestId(result.requestId);
            setSubmitted(true);
        } catch (error: unknown) {
            console.error('Error submitting audit request:', error);
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            alert(`Failed to submit audit request: ${errorMessage}`);
        }
    };

    if (submitted) {
        return (
            <div className="w-full max-w-5xl mx-auto mt-10 p-6 bg-white dark:bg-gray-900 rounded-xl shadow space-y-4">
                <h2 className="text-2xl font-bold text-black dark:text-white">Audit Request Submitted</h2>
                <p className="text-gray-800 dark:text-gray-300">
                    Your audit request ID is: <strong>{requestId}</strong>
                </p>
                <p className="text-gray-700 dark:text-gray-400">
                    The selected audit firm will contact you at <strong>{email}</strong> with further steps.
                </p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto p-8 bg-white dark:bg-gray-900 rounded-xl shadow space-y-6">
            <h2 className="text-2xl font-bold text-black dark:text-white">Request Smart Contract Audit</h2>

            <div>
                <label className="block text-black dark:text-white mb-1">Contract Address</label>
                <Input value={contractAddress} disabled className="bg-gray-100 dark:bg-gray-700 text-black dark:text-white" />
            </div>

            <div>
                <label className="block text-black dark:text-white mb-1">Contract Author Name</label>
                <Input className="text-black" value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
            </div>

            <div>
                <label className="block text-black dark:text-white mb-1">Email Address</label>
                <Input className="text-black" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div>
                <label className="block text-black dark:text-white mb-1">Contract Repository (GitHub / IPFS / etc.)</label>
                <Input className="text-black" value={repo} onChange={(e) => setRepo(e.target.value)} />
            </div>

            <div className="relative">
                <label className="block text-black dark:text-white mb-1">Chains</label>
                <div className="relative" ref={dropdownRef}>
                    <div
                        className="flex items-center justify-between w-full p-2 border rounded-md bg-white text-black cursor-pointer"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        <div className="flex flex-wrap gap-1">
                            {selectedChains.length === 0 ? (
                                <span className="text-gray-400">Select chains</span>
                            ) : (
                                selectedChains.map(chain => (
                                    <span
                                        key={chain}
                                        className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded flex items-center gap-1"
                                    >
                                        {chain}
                                        <span
                                            className="ml-1 cursor-pointer hover:text-blue-600"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedChains(prev => prev.filter(c => c !== chain));
                                            }}
                                        >
                                            &times;
                                        </span>
                                    </span>
                                ))
                            )}
                        </div>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>

                    {isOpen && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
                            {chains.map((chain) => (
                                <div
                                    key={chain}
                                    className="flex items-center p-2 hover:bg-gray-100 cursor-pointer"
                                    onClick={() => {
                                        setSelectedChains(prev =>
                                            prev.includes(chain)
                                                ? prev.filter(c => c !== chain)
                                                : [...prev, chain]
                                        );
                                    }}
                                >
                                    <span className={`w-5 h-5 flex items-center justify-center border rounded mr-2 ${selectedChains.includes(chain) ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                        {selectedChains.includes(chain) && <Check className="w-3 h-3 text-white" />}
                                    </span>
                                    <span className="text-black">{chain}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div>
                <label className="block text-black dark:text-white mb-1">Auditing Firm</label>
                <Select onValueChange={(val) => setFirm(val)}>
                    <SelectTrigger className="text-black">
                        <SelectValue placeholder="Select Audit Firm" />
                    </SelectTrigger>
                    <SelectContent>
                        {auditFirms.map((f) => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <Button
                onClick={handleSubmit}
                disabled={!authorName || !email || !repo || selectedChains.length === 0 || !firm}
            >
                Submit Audit Request
            </Button>
        </div>
    );
}