import crypto from 'crypto'

function computeHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Append a signing evidence record to the hash chain for a certificate.
 * Works with both prisma and transaction clients.
 */
export async function appendSigningEvidence(
  db: any,
  params: {
    certificateId: string
    signatureId: string
    eventType: string
    revision: number
    evidence: Record<string, unknown>
  }
): Promise<void> {
  const lastRecord = await db.signingEvidence.findFirst({
    where: { certificateId: params.certificateId },
    orderBy: { sequenceNumber: 'desc' },
  })

  const previousHash = lastRecord?.recordHash || 'GENESIS'
  const evidenceJson = JSON.stringify(params.evidence)
  const recordHash = computeHash(evidenceJson + previousHash)

  await db.signingEvidence.create({
    data: {
      certificateId: params.certificateId,
      signatureId: params.signatureId,
      revision: params.revision,
      sequenceNumber: (lastRecord?.sequenceNumber || 0) + 1,
      previousHash,
      recordHash,
      eventType: params.eventType,
      evidence: evidenceJson,
    },
  })
}

/**
 * Collect server-side evidence from a Fastify request.
 */
export function collectFastifyEvidence(
  request: { ip: string; headers: Record<string, string | string[] | undefined> },
  signerInfo: {
    signerType: string
    signerName: string
    signerEmail: string
    sessionMethod: 'direct' | 'session' | 'token'
  }
): Record<string, unknown> {
  const forwardedFor = request.headers['x-forwarded-for']
  const ipAddress = typeof forwardedFor === 'string'
    ? forwardedFor.split(',')[0]?.trim()
    : request.ip || 'unknown'

  const userAgent = (request.headers['user-agent'] as string) || 'unknown'

  return {
    ipAddress,
    userAgent,
    serverTimestamp: new Date().toISOString(),
    signerType: signerInfo.signerType,
    signerName: signerInfo.signerName,
    signerEmail: signerInfo.signerEmail,
    sessionMethod: signerInfo.sessionMethod,
  }
}
