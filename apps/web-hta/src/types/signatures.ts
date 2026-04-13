// Client-side evidence collected during signing
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

export interface SignatureData {
  signatureImage: string // base64 PNG from canvas
  signerName: string
  clientEvidence?: ClientEvidence // Optional for backwards compatibility
}

export type SignerType = 'ASSIGNEE' | 'REVIEWER' | 'CUSTOMER'
