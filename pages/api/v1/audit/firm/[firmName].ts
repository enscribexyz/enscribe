import { NextApiRequest, NextApiResponse } from 'next';
import { requestAudit, AuditRequestInput } from '@/lib/audit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { firmName } = req.query;

  if (typeof firmName !== 'string') {
    return res.status(400).json({ error: 'Invalid firm name' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { 
      contractAddress, 
      authorName, 
      email, 
      contractRepo, 
      chains 
    } = req.body as Partial<AuditRequestInput>;

    // Validate required fields
    if (!contractAddress || !authorName || !email || !contractRepo || !chains) {
      return res.status(400).json({
        error: 'Missing required fields. Required: contractAddress, authorName, email, contractRepo, chains',
      });
    }

    // Validate chains is an array if provided
    if (!Array.isArray(chains) || chains.length === 0) {
      return res.status(400).json({
        error: 'Chains must be a non-empty array',
      });
    }

    const { success, message, requestId } = await requestAudit(firmName, {
      contractAddress,
      authorName,
      email,
      contractRepo,
      chains,
    });

    return res.status(201).json({
      success,
      message,
      requestId,
      // Include all the request data for reference
      requestData: {
        contractAddress,
        authorName,
        email,
        contractRepo,
        chains,
        firmName
      }
    });
  } catch (err) {
    console.error('Audit request error:', err);
    const error = err as Error;
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
