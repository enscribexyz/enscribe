import { NextApiRequest, NextApiResponse } from 'next';
import { getVerificationData, triggerVerificationLogic } from '@/lib/verification';

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const { networkId, contractAddress } = req.query;

    if (typeof networkId !== 'string' || typeof contractAddress !== 'string') {
        return res.status(400).json({ error: 'Invalid parameters' });
    }

    try {
        if (req.method === 'GET') {
            const data = await getVerificationData(networkId, contractAddress);
            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const data = await triggerVerificationLogic(networkId, contractAddress);
            return res.status(200).json(data);
        }

        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
}