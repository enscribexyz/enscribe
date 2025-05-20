import { NextApiRequest, NextApiResponse } from 'next';
import { getAuditInfo } from '@/lib/audit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { networkId, contractAddress } = req.query;

  if (typeof networkId !== 'string' || typeof contractAddress !== 'string') {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const auditInfo = await getAuditInfo(networkId, contractAddress);
    return res.status(200).json(auditInfo);
  } catch (err) {
    console.error('Audit API error:', err);
    const error = err as Error;
    // Return a default response with no audits if there's an error
    res.status(200).json({
      audits: [],
      trustBadge: 'RED',
      lastUpdated: new Date().toISOString()
    });
  }
}
