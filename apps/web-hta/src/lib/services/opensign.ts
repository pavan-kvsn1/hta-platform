/**
 * OpenSign API client for self-hosted document signing.
 *
 * OpenSign is used as a backend-only service for legally compliant
 * e-signatures, digital certificates, and audit trails.
 * The customer stays within the HTA portal — OpenSign handles the
 * cryptographic signing and compliance layer.
 *
 * Environment variables:
 *   OPENSIGN_SERVER_URL  – Base URL for the OpenSign server API (e.g. http://localhost:8080/app)
 *   OPENSIGN_API_KEY     – API key / master key for authentication
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const OPENSIGN_SERVER_URL = process.env.OPENSIGN_SERVER_URL || 'http://localhost:8080/app'
const OPENSIGN_API_KEY = process.env.OPENSIGN_API_KEY || ''

function getHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-token': OPENSIGN_API_KEY,
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenSignWidget {
  type: 'signature' | 'date' | 'name' | 'text'
  page: number
  x: number
  y: number
  w: number
  h: number
  options?: {
    name?: string
    required?: boolean
    value?: string
  }
}

export interface OpenSignSigner {
  name: string
  email: string
  role?: string
}

export interface CreateDocumentRequest {
  file: string // base64-encoded PDF
  title: string
  signers: OpenSignSigner[]
  widgets: OpenSignWidget[]
  sendEmail?: boolean
  emailSubject?: string
  emailBody?: string
}

export interface CreateDocumentResponse {
  message: string
  documentId: string
  signingUrl: string
}

export interface SelfSignRequest {
  file: string // base64-encoded PDF
  title: string
  signerName: string
  signerEmail: string
  widgets: OpenSignWidget[]
}

export interface SelfSignResponse {
  message: string
  documentId: string
  signedPdfUrl: string
  auditTrailUrl?: string
}

export interface WebhookPayload {
  event: 'document.signed' | 'document.completed' | 'document.declined'
  documentId: string
  documentTitle?: string
  completedAt?: string
  signers?: Array<{
    name: string
    email: string
    signedAt: string
    ipAddress?: string
  }>
  signedDocumentUrl?: string
  auditTrailUrl?: string
}

export interface OpenSignDocumentInfo {
  documentId: string
  title: string
  status: string
  signers: Array<{
    name: string
    email: string
    status: string
    signedAt?: string
  }>
  signedDocumentUrl?: string
  auditTrailUrl?: string
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

/**
 * Check if the OpenSign server is reachable and responding.
 * Returns true if healthy, false otherwise.
 */
export async function isOpenSignHealthy(): Promise<boolean> {
  if (!OPENSIGN_API_KEY) return false

  try {
    const response = await fetch(`${OPENSIGN_SERVER_URL}/health`, {
      method: 'GET',
      headers: getHeaders(),
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

/**
 * Create a document in OpenSign and send for signature.
 * Used when sending a certificate to a customer for signing via email.
 */
export async function createDocument(
  request: CreateDocumentRequest
): Promise<CreateDocumentResponse> {
  const response = await fetch(`${OPENSIGN_SERVER_URL}/createdocument`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      file: request.file,
      title: request.title,
      signers: request.signers,
      widgets: request.widgets,
      sendEmail: request.sendEmail ?? true,
      ...(request.emailSubject ? { emailSubject: request.emailSubject } : {}),
      ...(request.emailBody ? { emailBody: request.emailBody } : {}),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`OpenSign createDocument failed (${response.status}): ${errorText}`)
  }

  return response.json()
}

/**
 * Self-sign a document using OpenSign.
 * Used in the portal-centric flow where the customer has already drawn
 * their signature in the HTA portal. We send the PDF + signature widget
 * positions to OpenSign for legal compliance (digital certificate,
 * tamper-evident sealing, audit trail).
 */
export async function selfSignDocument(
  request: SelfSignRequest
): Promise<SelfSignResponse> {
  const response = await fetch(`${OPENSIGN_SERVER_URL}/selfsign`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      file: request.file,
      title: request.title,
      signerName: request.signerName,
      signerEmail: request.signerEmail,
      widgets: request.widgets,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`OpenSign selfSign failed (${response.status}): ${errorText}`)
  }

  return response.json()
}

/**
 * Retrieve information about a document from OpenSign.
 */
export async function getDocument(documentId: string): Promise<OpenSignDocumentInfo> {
  const response = await fetch(`${OPENSIGN_SERVER_URL}/getdocument/${documentId}`, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`OpenSign getDocument failed (${response.status}): ${errorText}`)
  }

  return response.json()
}

/**
 * Download the signed PDF from OpenSign.
 * Returns the PDF as a Buffer.
 */
export async function downloadSignedPdf(signedPdfUrl: string): Promise<Buffer> {
  const response = await fetch(signedPdfUrl, {
    method: 'GET',
    headers: getHeaders(),
  })

  if (!response.ok) {
    throw new Error(`OpenSign PDF download failed (${response.status})`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ---------------------------------------------------------------------------
// Widget Helpers
// ---------------------------------------------------------------------------

/**
 * Generate signature widget positions for a given signer type.
 * These positions correspond to the customer acknowledgment section
 * in the CalibrationCertificatePDF layout.
 *
 * @param signerType – REVIEWER or CUSTOMER
 * @param lastPage – The page number where the signature should appear
 */
export function getSignatureWidgets(
  signerType: 'REVIEWER' | 'CUSTOMER',
  lastPage: number
): OpenSignWidget[] {
  if (signerType === 'CUSTOMER') {
    return [
      {
        type: 'signature',
        page: lastPage,
        x: 50,
        y: 650,
        w: 150,
        h: 50,
        options: { name: 'customer_signature', required: true },
      },
      {
        type: 'name',
        page: lastPage,
        x: 220,
        y: 650,
        w: 150,
        h: 20,
        options: { name: 'signer_name', required: true },
      },
      {
        type: 'date',
        page: lastPage,
        x: 220,
        y: 680,
        w: 100,
        h: 20,
        options: { name: 'signing_date', required: true },
      },
    ]
  }

  // Reviewer widgets — positioned in the "Checked By" / "Approved & Issued By" columns
  return [
    {
      type: 'signature',
      page: lastPage,
      x: 250,
      y: 720,
      w: 120,
      h: 40,
      options: { name: 'hod_signature', required: true },
    },
    {
      type: 'name',
      page: lastPage,
      x: 250,
      y: 760,
      w: 120,
      h: 20,
      options: { name: 'hod_name', required: true },
    },
  ]
}

// ---------------------------------------------------------------------------
// Retry Helper
// ---------------------------------------------------------------------------

/**
 * Retry an async operation with exponential backoff.
 * Used for OpenSign API calls to handle transient failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}
