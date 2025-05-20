export interface AuditRequestInput {
  contractAddress: string;
  authorName: string;
  email: string;
  contractRepo: string;
  chains: string[];
}

export interface AuditEntry {
  auditFirm: string;
  status: 'PENDING' | 'COMPLETED';
  attestationID: string;
}

export interface AuditInfo {
  audits: AuditEntry[];
  trustBadge: 'GREEN' | 'YELLOW' | 'RED';
  lastUpdated?: string;
}

// In-memory storage for demo purposes
const auditRequests: Record<string, {
  contractAddress: string;
  firmName: string;
  status: 'PENDING' | 'COMPLETED';
  requestedAt: string;
  authorName: string;
  email: string;
  contractRepo: string;
  chains: string[];
}> = {};

export async function requestAudit(
  firmName: string,
  requestData: AuditRequestInput
): Promise<{ success: boolean; message: string; requestId: string }> {
  const auditId = `${firmName}_${requestData.contractAddress}_${Date.now()}`;
  const now = new Date().toISOString();

  // For demo, randomly assign a trust badge (in real app, this would be determined by the audit firm)
  const trustBadges: ('GREEN' | 'YELLOW' | 'RED')[] = ['GREEN', 'YELLOW', 'RED'];
  const randomBadge = trustBadges[Math.floor(Math.random() * trustBadges.length)];

  auditRequests[auditId] = {
    contractAddress: requestData.contractAddress.toLowerCase(),
    firmName,
    status: 'PENDING',
    requestedAt: now,
    authorName: requestData.authorName,
    email: requestData.email,
    contractRepo: requestData.contractRepo,
    chains: requestData.chains,
  };

  return {
    success: true,
    message: 'Audit request submitted successfully',
    requestId: auditId
  };
}

export async function getAuditInfo(
  networkId: string,
  contractAddress: string
): Promise<AuditInfo> {
  // Return dummy data for demo purposes
  const now = new Date().toISOString();

  return {
    audits: [
      {
        auditFirm: 'ConsenSys Diligence',
        status: 'COMPLETED',
        attestationID: 'attestation-consensys-123'
      },
      {
        auditFirm: 'OpenZeppelin',
        status: 'COMPLETED',
        attestationID: 'attestation-oz-456'
      },
      {
        auditFirm: 'Nethermind',
        status: 'COMPLETED',
        attestationID: 'attestation-nethermind-789'
      }
    ],
    trustBadge: 'GREEN',
    lastUpdated: now
  };
}
