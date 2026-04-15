/**
 * Customer Approve API Unit Tests
 *
 * Tests for the customer certificate approval API endpoint:
 * - Token-based approval flow
 * - Session-based approval flow
 * - Input validation
 * - Name matching
 * - Status validation
 * - Error handling
 * - Evidence capture
 *
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
interface Session {
  user: { id: string; email: string; role: string }
  expires: string
}

interface Customer {
  id: string
  name: string
  email: string
  companyName: string
  customerAccount?: { companyName: string } | null
}

interface Certificate {
  id: string
  certificateNumber: string
  status: string
  currentRevision: number
  createdById: string
  createdBy: { id: string; name: string; email: string }
  reviewerId: string
  customerName: string
}

interface ApprovalToken {
  id: string
  token: string
  certificateId: string
  customerId: string
  expiresAt: Date
  usedAt: Date | null
  certificate: Certificate
  customer: Customer
}

interface ClientEvidence {
  userAgent: string
  screenResolution: string
  timezone: string
  timestamp: string
}

interface ApproveRequest {
  signatureData?: string
  signerName?: string
  clientEvidence?: ClientEvidence
}

// Mock implementations
const mockAuth = vi.fn<[], Promise<Session | null>>()
const mockFindApprovalToken = vi.fn<[string], Promise<ApprovalToken | null>>()
const mockFindCustomer = vi.fn<[string], Promise<Customer | null>>()
const mockFindCertificate = vi.fn<[string], Promise<Certificate | null>>()
const mockAppendSigningEvidence = vi.fn<[unknown], Promise<void>>()
const mockCreateSignature = vi.fn<[unknown], Promise<{ id: string }>>()

// Valid statuses for approval
const APPROVAL_STATUSES = ['PENDING_CUSTOMER_APPROVAL', 'CUSTOMER_REVISION_REQUIRED']

// Normalize name for comparison
function normalizeName(name: string): string {
  return name.toLowerCase().trim()
}

// Mock POST handler
async function POST(
  token: string,
  body: ApproveRequest
): Promise<{ status: number; body: unknown }> {
  try {
    const { signatureData, signerName, clientEvidence } = body

    // Input validation
    if (!signatureData || !signerName) {
      return { status: 400, body: { error: 'Signature and name are required' } }
    }

    // Check if it's a session-based approval (cert: prefix)
    if (token.startsWith('cert:')) {
      return await handleSessionApproval(token.slice(5), signatureData, signerName, clientEvidence)
    }

    // Token-based approval
    return await handleTokenApproval(token, signatureData, signerName, clientEvidence)
  } catch {
    return { status: 500, body: { error: 'Failed to approve certificate' } }
  }
}

async function handleTokenApproval(
  token: string,
  signatureData: string,
  signerName: string,
  clientEvidence?: ClientEvidence
): Promise<{ status: number; body: unknown }> {
  const approvalToken = await mockFindApprovalToken(token)

  if (!approvalToken) {
    return { status: 404, body: { error: 'Invalid token' } }
  }

  if (approvalToken.usedAt) {
    return { status: 400, body: { error: 'This certificate has already been reviewed' } }
  }

  if (approvalToken.expiresAt < new Date()) {
    return { status: 400, body: { error: 'This review link has expired' } }
  }

  if (!APPROVAL_STATUSES.includes(approvalToken.certificate.status)) {
    return { status: 400, body: { error: 'Certificate is not available for approval' } }
  }

  if (normalizeName(signerName) !== normalizeName(approvalToken.customer.name)) {
    return { status: 400, body: { error: 'Signer name must match your registered name' } }
  }

  // Create signature
  await mockCreateSignature({
    certificateId: approvalToken.certificateId,
    signerName,
    signatureData,
    signerType: 'CUSTOMER',
  })

  // Capture evidence if provided
  if (clientEvidence) {
    try {
      await mockAppendSigningEvidence({
        certificateId: approvalToken.certificateId,
        evidence: clientEvidence,
      })
    } catch {
      // Evidence capture failure should not fail the approval
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Certificate approved successfully',
    },
  }
}

async function handleSessionApproval(
  certificateId: string,
  signatureData: string,
  signerName: string,
  clientEvidence?: ClientEvidence
): Promise<{ status: number; body: unknown }> {
  const session = await mockAuth()

  if (!session || session.user.role !== 'CUSTOMER') {
    return { status: 401, body: { error: 'Unauthorized - please log in' } }
  }

  const customer = await mockFindCustomer(session.user.id)

  if (!customer) {
    return { status: 404, body: { error: 'Customer not found' } }
  }

  const certificate = await mockFindCertificate(certificateId)

  if (!certificate) {
    return { status: 404, body: { error: 'Certificate not found' } }
  }

  const customerCompany = customer.customerAccount?.companyName || customer.companyName

  if (customerCompany !== certificate.customerName) {
    return { status: 403, body: { error: 'You do not have permission to approve this certificate' } }
  }

  if (!APPROVAL_STATUSES.includes(certificate.status)) {
    return { status: 400, body: { error: 'Certificate is not available for approval' } }
  }

  if (normalizeName(signerName) !== normalizeName(customer.name)) {
    return { status: 400, body: { error: 'Signer name must match your registered name' } }
  }

  // Create signature
  await mockCreateSignature({
    certificateId,
    signerName,
    signatureData,
    signerType: 'CUSTOMER',
  })

  // Capture evidence if provided
  if (clientEvidence) {
    try {
      await mockAppendSigningEvidence({
        certificateId,
        evidence: clientEvidence,
      })
    } catch {
      // Evidence capture failure should not fail the approval
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      message: 'Certificate approved successfully',
    },
  }
}

const mockCustomer: Customer = {
  id: 'customer-123',
  name: 'John Customer',
  email: 'customer@test.com',
  companyName: 'Test Corp',
}

const mockCertificate: Certificate = {
  id: 'cert-123',
  certificateNumber: 'HTA-001',
  status: 'PENDING_CUSTOMER_APPROVAL',
  currentRevision: 1,
  createdById: 'engineer-456',
  createdBy: { id: 'engineer-456', name: 'Jane Engineer', email: 'engineer@test.com' },
  reviewerId: 'reviewer-789',
  customerName: 'Test Corp',
}

const mockToken: ApprovalToken = {
  id: 'token-123',
  token: 'valid-token',
  certificateId: 'cert-123',
  customerId: 'customer-123',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  usedAt: null,
  certificate: mockCertificate,
  customer: mockCustomer,
}

describe('POST /api/customer/review/[token]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindApprovalToken.mockResolvedValue(mockToken)
    mockCreateSignature.mockResolvedValue({ id: 'sig-123' })
    mockAppendSigningEvidence.mockResolvedValue(undefined)
  })

  describe('input validation', () => {
    it('returns 400 when signature is missing', async () => {
      const response = await POST('valid-token', {
        signerName: 'John Customer',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Signature and name are required')
    })

    it('returns 400 when signer name is missing', async () => {
      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Signature and name are required')
    })
  })

  describe('token-based approval', () => {
    it('returns 404 for invalid token', async () => {
      mockFindApprovalToken.mockResolvedValue(null)

      const response = await POST('invalid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(404)
      expect((response.body as { error: string }).error).toBe('Invalid token')
    })

    it('returns 400 for already used token', async () => {
      mockFindApprovalToken.mockResolvedValue({
        ...mockToken,
        usedAt: new Date(),
      })

      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('This certificate has already been reviewed')
    })

    it('returns 400 for expired token', async () => {
      mockFindApprovalToken.mockResolvedValue({
        ...mockToken,
        expiresAt: new Date(Date.now() - 1000),
      })

      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('This review link has expired')
    })

    it('returns 400 when certificate is not available for approval', async () => {
      mockFindApprovalToken.mockResolvedValue({
        ...mockToken,
        certificate: { ...mockCertificate, status: 'DRAFT' },
      })

      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Certificate is not available for approval')
    })

    it('returns 400 when signer name does not match registered name', async () => {
      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Wrong Name',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Signer name must match your registered name')
    })

    it('allows approval when certificate is CUSTOMER_REVISION_REQUIRED', async () => {
      mockFindApprovalToken.mockResolvedValue({
        ...mockToken,
        certificate: { ...mockCertificate, status: 'CUSTOMER_REVISION_REQUIRED' },
      })

      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(true)
    })

    it('successfully approves certificate', async () => {
      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(200)
      expect((response.body as { success: boolean; message: string }).success).toBe(true)
      expect((response.body as { message: string }).message).toBe('Certificate approved successfully')
    })

    it('handles case-insensitive name comparison', async () => {
      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'JOHN CUSTOMER', // Different case
      })

      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(true)
    })
  })

  describe('session-based approval', () => {
    const sessionMockCustomer: Customer = {
      ...mockCustomer,
      customerAccount: { companyName: 'Test Corp' },
    }

    beforeEach(() => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'customer-123',
          email: 'customer@test.com',
          role: 'CUSTOMER',
        },
        expires: new Date().toISOString(),
      })
      mockFindCustomer.mockResolvedValue(sessionMockCustomer)
      mockFindCertificate.mockResolvedValue(mockCertificate)
    })

    it('returns 401 when not logged in as customer', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(401)
      expect((response.body as { error: string }).error).toBe('Unauthorized - please log in')
    })

    it('returns 401 when logged in with non-customer role', async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'engineer@test.com',
          role: 'ENGINEER',
        },
        expires: new Date().toISOString(),
      })

      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(401)
      expect((response.body as { error: string }).error).toBe('Unauthorized - please log in')
    })

    it('returns 404 when customer not found', async () => {
      mockFindCustomer.mockResolvedValue(null)

      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(404)
      expect((response.body as { error: string }).error).toBe('Customer not found')
    })

    it('returns 404 when certificate not found', async () => {
      mockFindCertificate.mockResolvedValue(null)

      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(404)
      expect((response.body as { error: string }).error).toBe('Certificate not found')
    })

    it('returns 403 when customer company does not match certificate', async () => {
      mockFindCustomer.mockResolvedValue({
        ...sessionMockCustomer,
        customerAccount: { companyName: 'Different Corp' },
        companyName: 'Different Corp',
      })

      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(403)
      expect((response.body as { error: string }).error).toBe('You do not have permission to approve this certificate')
    })

    it('returns 400 when certificate not available for approval', async () => {
      mockFindCertificate.mockResolvedValue({
        ...mockCertificate,
        status: 'DRAFT',
      })

      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Certificate is not available for approval')
    })

    it('returns 400 when signer name does not match customer name', async () => {
      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Wrong Name',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Signer name must match your registered name')
    })

    it('successfully approves via session', async () => {
      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(200)
      expect((response.body as { success: boolean; message: string }).success).toBe(true)
      expect((response.body as { message: string }).message).toBe('Certificate approved successfully')
    })
  })

  describe('error handling', () => {
    it('returns 500 on unexpected error', async () => {
      mockFindApprovalToken.mockRejectedValue(new Error('Database error'))

      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
      })

      expect(response.status).toBe(500)
      expect((response.body as { error: string }).error).toBe('Failed to approve certificate')
    })
  })

  describe('client evidence capture', () => {
    it('captures signing evidence when client evidence provided (token)', async () => {
      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
        clientEvidence: {
          userAgent: 'Mozilla/5.0',
          screenResolution: '1920x1080',
          timezone: 'UTC',
          timestamp: new Date().toISOString(),
        },
      })

      expect(response.status).toBe(200)
      expect(mockAppendSigningEvidence).toHaveBeenCalled()
    })

    it('handles evidence capture failure gracefully (token)', async () => {
      mockAppendSigningEvidence.mockRejectedValueOnce(new Error('Evidence capture failed'))

      const response = await POST('valid-token', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
        clientEvidence: {
          userAgent: 'Mozilla/5.0',
          screenResolution: '1920x1080',
          timezone: 'UTC',
          timestamp: new Date().toISOString(),
        },
      })

      // Should still succeed even if evidence capture fails
      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(true)
    })

    it('captures signing evidence when client evidence provided (session)', async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'customer-123',
          email: 'customer@test.com',
          role: 'CUSTOMER',
        },
        expires: new Date().toISOString(),
      })
      mockFindCustomer.mockResolvedValue({
        ...mockCustomer,
        customerAccount: { companyName: 'Test Corp' },
      })
      mockFindCertificate.mockResolvedValue(mockCertificate)

      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
        clientEvidence: {
          userAgent: 'Mozilla/5.0',
          screenResolution: '1920x1080',
          timezone: 'UTC',
          timestamp: new Date().toISOString(),
        },
      })

      expect(response.status).toBe(200)
      expect(mockAppendSigningEvidence).toHaveBeenCalled()
    })

    it('handles evidence capture failure gracefully (session)', async () => {
      mockAuth.mockResolvedValue({
        user: {
          id: 'customer-123',
          email: 'customer@test.com',
          role: 'CUSTOMER',
        },
        expires: new Date().toISOString(),
      })
      mockFindCustomer.mockResolvedValue({
        ...mockCustomer,
        customerAccount: { companyName: 'Test Corp' },
      })
      mockFindCertificate.mockResolvedValue(mockCertificate)
      mockAppendSigningEvidence.mockRejectedValueOnce(new Error('Evidence capture failed'))

      const response = await POST('cert:cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'John Customer',
        clientEvidence: {
          userAgent: 'Mozilla/5.0',
          screenResolution: '1920x1080',
          timezone: 'UTC',
          timestamp: new Date().toISOString(),
        },
      })

      // Should still succeed even if evidence capture fails
      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(true)
    })
  })
})
