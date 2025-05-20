// pages/request-audit.tsx
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const chains = ['Ethereum Mainnet', 'Base', 'Linea', 'Optimism', 'Polygon'];
const auditFirms = ['OpenZeppelin', 'Trail of Bits', 'Consensys Diligence', 'CertiK', 'Sherlock', 'Halborn'];

export default function RequestAuditForm() {
    const router = useRouter();
    const [contractAddress, setContractAddress] = useState('');
    const [authorName, setAuthorName] = useState('');
    const [email, setEmail] = useState('');
    const [repo, setRepo] = useState('');
    const [chain, setChain] = useState('');
    const [firm, setFirm] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [requestId, setRequestId] = useState('');

    useEffect(() => {
        if (router.query.contract) {
            setContractAddress(router.query.contract as string);
        }
    }, [router.query.contract]);

    const handleSubmit = async () => {
        const reqId = `REQ-${Math.floor(Math.random() * 1000000)}`;
        setRequestId(reqId);
        setSubmitted(true);
    };

    if (submitted) {
        return (
            <div className="max-w-xl mx-auto mt-10 p-6 bg-white dark:bg-gray-900 rounded-xl shadow space-y-4">
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

            <div>
                <label className="block text-black dark:text-white mb-1">Chain</label>
                <Select onValueChange={(val) => setChain(val)}>
                    <SelectTrigger className="text-black">
                        <SelectValue placeholder="Select Chain" />
                    </SelectTrigger>
                    <SelectContent>
                        {chains.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
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

            <Button onClick={handleSubmit} disabled={!authorName || !email || !repo || !chain || !firm}>
                Submit Audit Request
            </Button>
        </div>
    );
}