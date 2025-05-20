import { NextApiRequest, NextApiResponse } from 'next';
import { getAuditInfo } from '@/lib/audit';

// This endpoint handles both GET and POST requests for a specific contract's audit status
// GET: Get audit status for a contract
// POST: Submit a new audit attestation for a contract
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { networkId, contractAddress } = req.query;

  if (typeof networkId !== 'string' || typeof contractAddress !== 'string') {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // Handle GET request - get audit status
  if (req.method === 'GET') {
    try {
      const auditInfo = await getAuditInfo(networkId, contractAddress);
      return res.status(200).json(auditInfo);
    } catch (err) {
      console.error('Audit API error:', err);
      const error = err as Error;
      // Return a default response with no audits if there's an error
      return res.status(200).json({
        audits: [],
        trustBadge: 'RED',
        lastUpdated: new Date().toISOString()
      });
    }
  }

  // Handle POST request - submit new audit attestation
  if (req.method === 'POST') {
    const { attestationId, formDetails } = req.body;

    // Validate required fields
    if (!attestationId) {
      return res.status(400).json({
        error: 'Missing required parameter: attestationId'
      });
    }

    try {
      // In a real implementation, you would:
      // 1. Verify the attestation exists on-chain
      // 2. Store the attestation ID with the contract address in your database
      // 3. Update any relevant audit statuses
      
      // For now, we'll just return a success response
      return res.status(200).json({
        success: true,
        message: 'Audit attestation recorded successfully',
        data: {
          networkId,
          contractAddress,
          attestationId,
          formDetails,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: unknown) {
      console.error('Error recording audit attestation:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      return res.status(500).json({
        error: 'Failed to record audit attestation',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      });
    }
  }

  // Handle other HTTP methods
  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
