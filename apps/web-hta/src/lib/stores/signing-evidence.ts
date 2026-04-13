import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/constants/consent-text'

// Re-export consent constants for convenience
export { CONSENT_TEXT, CONSENT_VERSION }

// Types
export interface ClientEvidence {
  clientTimestamp: number
  userAgent: string
  screenResolution: string
  timezone: string
  canvasSize: { width: number; height: number }
  consentVersion: string
  consentAcceptedAt: number
  documentHash?: string // SHA-256 of reviewed PDF (for customer signing)
}

export interface SigningEvidencePayload {
  // Layer 1: Consent
  consentVersion: string
  consentText: string
  consentAcceptedAt: string

  // Layer 2: Context
  ipAddress: string
  userAgent: string
  clientTimestamp: string
  serverTimestamp: string
  timezone: string
  screenResolution: string
  canvasSize: { width: number; height: number }
  sessionMethod: 'token' | 'session' | 'direct'
  tokenId?: string
  tokenEmail?: string

  // Layer 3: Document hash (for customer signing)
  documentHash?: string

  // Signer info
  signerType: 'ASSIGNEE' | 'REVIEWER' | 'CUSTOMER' | 'ADMIN'
  signerName: string
  signerEmail: string
  signerId?: string
  customerId?: string
}

export interface VerificationResult {
  valid: boolean
  brokenAt?: number
  totalRecords: number
  records: Array<{
    sequenceNumber: number
    eventType: string
    valid: boolean
    createdAt: string
  }>
}

/**
 * Compute SHA-256 hash of data
 */
export function computeHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Extract server-side evidence from request headers
 */
export function collectServerEvidence(
  request: Request,
  sessionMethod: 'token' | 'session' | 'direct'
): Pick<SigningEvidencePayload, 'ipAddress' | 'userAgent' | 'sessionMethod'> {
  // Get IP address from headers (handles proxies)
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'

  // Get user agent
  const userAgent = request.headers.get('user-agent') || 'unknown'

  return {
    ipAddress,
    userAgent,
    sessionMethod,
  }
}

/**
 * Append a new signing evidence record to the hash chain
 */
export async function appendSigningEvidence(
  certificateId: string,
  signatureId: string | null,
  eventType: string,
  evidence: SigningEvidencePayload,
  revision: number
): Promise<void> {
  // Get last evidence record for this certificate
  const lastRecord = await prisma.signingEvidence.findFirst({
    where: { certificateId },
    orderBy: { sequenceNumber: 'desc' },
  })

  // Compute hashes
  const previousHash = lastRecord?.recordHash || 'GENESIS'
  const evidenceJson = JSON.stringify(evidence)
  // Hash includes both the evidence and the previous hash to create the chain
  const recordHash = computeHash(evidenceJson + previousHash)

  // Create the evidence record
  await prisma.signingEvidence.create({
    data: {
      certificateId,
      signatureId,
      revision,
      sequenceNumber: (lastRecord?.sequenceNumber || 0) + 1,
      previousHash,
      recordHash,
      eventType,
      evidence: evidenceJson,
    },
  })
}

/**
 * Verify the integrity of the signing evidence chain for a certificate
 */
export async function verifyEvidenceChain(certificateId: string): Promise<VerificationResult> {
  // Get all evidence records in order
  const records = await prisma.signingEvidence.findMany({
    where: { certificateId },
    orderBy: { sequenceNumber: 'asc' },
  })

  if (records.length === 0) {
    return {
      valid: true,
      totalRecords: 0,
      records: [],
    }
  }

  const verificationRecords: VerificationResult['records'] = []
  let expectedPreviousHash = 'GENESIS'
  let chainValid = true
  let brokenAt: number | undefined

  for (const record of records) {
    // Check if previous hash matches expected
    const previousHashValid = record.previousHash === expectedPreviousHash

    // Recompute hash from evidence
    const recomputedHash = computeHash(record.evidence + record.previousHash)
    const recordHashValid = record.recordHash === recomputedHash

    const recordValid = previousHashValid && recordHashValid

    verificationRecords.push({
      sequenceNumber: record.sequenceNumber,
      eventType: record.eventType,
      valid: recordValid,
      createdAt: record.createdAt.toISOString(),
    })

    if (!recordValid && chainValid) {
      chainValid = false
      brokenAt = record.sequenceNumber
    }

    // Update expected previous hash for next iteration
    expectedPreviousHash = record.recordHash
  }

  return {
    valid: chainValid,
    brokenAt,
    totalRecords: records.length,
    records: verificationRecords,
  }
}

/**
 * Build a complete signing evidence payload
 */
export function buildSigningEvidencePayload(
  clientEvidence: ClientEvidence,
  serverEvidence: Pick<SigningEvidencePayload, 'ipAddress' | 'userAgent' | 'sessionMethod'>,
  signerInfo: {
    signerType: 'ASSIGNEE' | 'REVIEWER' | 'CUSTOMER' | 'ADMIN'
    signerName: string
    signerEmail: string
    signerId?: string
    customerId?: string
    tokenId?: string
    tokenEmail?: string
  }
): SigningEvidencePayload {
  return {
    // Layer 1: Consent
    consentVersion: clientEvidence.consentVersion,
    consentText: CONSENT_TEXT,
    consentAcceptedAt: new Date(clientEvidence.consentAcceptedAt).toISOString(),

    // Layer 2: Context
    ipAddress: serverEvidence.ipAddress,
    userAgent: serverEvidence.userAgent,
    clientTimestamp: new Date(clientEvidence.clientTimestamp).toISOString(),
    serverTimestamp: new Date().toISOString(),
    timezone: clientEvidence.timezone,
    screenResolution: clientEvidence.screenResolution,
    canvasSize: clientEvidence.canvasSize,
    sessionMethod: serverEvidence.sessionMethod,
    tokenId: signerInfo.tokenId,
    tokenEmail: signerInfo.tokenEmail,

    // Layer 3: Document hash (optional, for customer signing)
    documentHash: clientEvidence.documentHash,

    // Signer info
    signerType: signerInfo.signerType,
    signerName: signerInfo.signerName,
    signerEmail: signerInfo.signerEmail,
    signerId: signerInfo.signerId,
    customerId: signerInfo.customerId,
  }
}
