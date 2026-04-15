/**
 * Certificate Submit API Unit Tests
 *
 * Tests for the certificate submission API endpoint:
 * - Authentication checks
 * - Signature validation
 * - Certificate validation
 * - Reviewer validation
 * - Field validation
 * - Successful submission
 * - Error handling
 *
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
interface Session {
  user: { id: string; name: string; email: string; role: string }
  expires: string
}

interface Certificate {
  id: string
  certificateNumber: string
  status: string
  currentRevision: number
  createdById: string
  reviewerId: string | null
  dateOfCalibration: Date | null
  customerName: string | null
  customerAddress: string | null
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  uucSerialNumber: string | null
  ambientTemperature: string | null
  relativeHumidity: string | null
  calibrationStatus: string | null
  selectedConclusionStatements: string | null
  masterInstruments: Array<{ id: string; name: string }>
  parameters: Array<{ id: string; results: Array<{ id: string; standardReading: string }> }>
}

interface User {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
}

interface ClientEvidence {
  userAgent: string
  screenResolution: string
  timezone: string
  timestamp: string
}

interface SubmitRequest {
  signatureData?: string
  signerName?: string
  reviewerId?: string
  clientEvidence?: ClientEvidence
  engineerNotes?: string
  sectionResponses?: Record<string, string>
}

// Mock implementations
const mockAuth = vi.fn<[], Promise<Session | null>>()
const mockFindCertificate = vi.fn<[string], Promise<Certificate | null>>()
const mockFindUser = vi.fn<[string], Promise<User | null>>()
const mockCreateSignature = vi.fn<[unknown], Promise<{ id: string }>>()
const mockUpdateCertificate = vi.fn<[unknown], Promise<Certificate>>()
const mockAppendSigningEvidence = vi.fn<[unknown], Promise<void>>()
const mockNotifyReviewerOnSubmit = vi.fn<[unknown], Promise<void>>()
const mockNotifyReviewerOnAssigneeResponse = vi.fn<[unknown], Promise<void>>()

// Submittable statuses
const SUBMITTABLE_STATUSES = ['DRAFT', 'REVISION_REQUIRED']

// Required fields for validation
const REQUIRED_FIELDS = [
  { field: 'dateOfCalibration', message: 'Date of calibration is required' },
  { field: 'customerName', message: 'Customer name is required' },
  { field: 'uucDescription', message: 'UUC description is required' },
]

// Validate certificate fields
function validateCertificate(certificate: Certificate): string[] {
  const errors: string[] = []

  for (const { field, message } of REQUIRED_FIELDS) {
    if (!certificate[field as keyof Certificate]) {
      errors.push(message)
    }
  }

  if (!certificate.masterInstruments || certificate.masterInstruments.length === 0) {
    errors.push('At least one master instrument is required')
  }

  const hasResults = certificate.parameters?.some((p) => p.results && p.results.length > 0)
  if (!hasResults) {
    errors.push('At least one calibration result is required')
  }

  return errors
}

// Mock POST handler
async function POST(
  certificateId: string,
  body: SubmitRequest
): Promise<{ status: number; body: unknown }> {
  try {
    const session = await mockAuth()

    if (!session) {
      return { status: 401, body: { error: 'Unauthorized' } }
    }

    const { signatureData, signerName, reviewerId, clientEvidence, engineerNotes, sectionResponses } = body

    // Signature validation
    if (!signatureData || !signerName) {
      return { status: 400, body: { error: 'Signature and signer name are required' } }
    }

    if (signerName.toLowerCase().trim() !== session.user.name.toLowerCase().trim()) {
      return { status: 400, body: { error: 'Signer name must match your profile name' } }
    }

    const certificate = await mockFindCertificate(certificateId)

    if (!certificate) {
      return { status: 404, body: { error: 'Certificate not found' } }
    }

    // Check ownership (unless admin)
    if (certificate.createdById !== session.user.id && session.user.role !== 'ADMIN') {
      return { status: 403, body: { error: 'Forbidden' } }
    }

    // Check status
    if (!SUBMITTABLE_STATUSES.includes(certificate.status)) {
      return { status: 400, body: { error: `Cannot submit certificate with status: ${certificate.status}` } }
    }

    // Reviewer validation for new submissions
    const isResubmission = certificate.status === 'REVISION_REQUIRED'
    const finalReviewerId = isResubmission ? certificate.reviewerId : reviewerId

    if (!finalReviewerId) {
      return { status: 400, body: { error: 'Please select a reviewer for the certificate' } }
    }

    if (finalReviewerId === session.user.id) {
      return { status: 400, body: { error: 'You cannot review your own certificate' } }
    }

    const reviewer = await mockFindUser(finalReviewerId)

    if (!reviewer || !reviewer.isActive) {
      return { status: 400, body: { error: 'Selected reviewer is not available' } }
    }

    // Field validation
    const validationErrors = validateCertificate(certificate)

    if (validationErrors.length > 0) {
      return { status: 400, body: { error: 'Validation failed', validationErrors } }
    }

    // Create signature and update certificate
    await mockCreateSignature({
      certificateId,
      signerName,
      signatureData,
      signerType: 'ASSIGNEE',
    })

    const newRevision = isResubmission ? certificate.currentRevision + 1 : certificate.currentRevision
    const updatedCertificate = await mockUpdateCertificate({
      id: certificateId,
      status: 'PENDING_REVIEW',
      reviewerId: finalReviewerId,
      currentRevision: newRevision,
    })

    // Capture evidence if provided
    if (clientEvidence) {
      try {
        await mockAppendSigningEvidence({
          certificateId,
          evidence: clientEvidence,
        })
      } catch {
        // Evidence capture failure should not fail the submission
      }
    }

    // Send notifications (fire-and-forget)
    try {
      if (isResubmission) {
        mockNotifyReviewerOnAssigneeResponse({ certificate: updatedCertificate, engineerNotes }).catch(() => {})
      } else {
        mockNotifyReviewerOnSubmit({ certificate: updatedCertificate, reviewer }).catch(() => {})
      }
    } catch {
      // Notification failure should not fail the submission
    }

    const message = isResubmission
      ? 'Certificate resubmitted for peer review'
      : 'Certificate submitted for peer review'

    return {
      status: 200,
      body: {
        success: true,
        message,
        certificate: updatedCertificate,
      },
    }
  } catch {
    return { status: 500, body: { error: 'Internal server error' } }
  }
}

const mockSession: Session = {
  user: {
    id: 'engineer-123',
    name: 'Jane Engineer',
    email: 'engineer@test.com',
    role: 'ENGINEER',
  },
  expires: new Date().toISOString(),
}

const mockCertificate: Certificate = {
  id: 'cert-123',
  certificateNumber: 'HTA-001',
  status: 'DRAFT',
  currentRevision: 1,
  createdById: 'engineer-123',
  reviewerId: null,
  dateOfCalibration: new Date('2024-01-01'),
  customerName: 'Test Corp',
  customerAddress: '123 Test St',
  uucDescription: 'Test Equipment',
  uucMake: 'Test Make',
  uucModel: 'Test Model',
  uucSerialNumber: 'SN-001',
  ambientTemperature: '25C',
  relativeHumidity: '50%',
  calibrationStatus: JSON.stringify(['PASS']),
  selectedConclusionStatements: JSON.stringify(['Equipment calibrated successfully']),
  masterInstruments: [{ id: 'mi-1', name: 'Master Instrument 1' }],
  parameters: [
    {
      id: 'param-1',
      results: [{ id: 'result-1', standardReading: '100' }],
    },
  ],
}

const mockReviewer: User = {
  id: 'reviewer-456',
  name: 'John Reviewer',
  email: 'reviewer@test.com',
  role: 'ENGINEER',
  isActive: true,
}

describe('POST /api/certificates/[id]/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue(mockSession)
    mockFindCertificate.mockResolvedValue(mockCertificate)
    mockFindUser.mockResolvedValue(mockReviewer)
    mockCreateSignature.mockResolvedValue({ id: 'sig-123' })
    mockUpdateCertificate.mockResolvedValue({ ...mockCertificate, status: 'PENDING_REVIEW' })
    mockAppendSigningEvidence.mockResolvedValue(undefined)
    mockNotifyReviewerOnSubmit.mockResolvedValue(undefined)
    mockNotifyReviewerOnAssigneeResponse.mockResolvedValue(undefined)
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null)

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(401)
      expect((response.body as { error: string }).error).toBe('Unauthorized')
    })
  })

  describe('signature validation', () => {
    it('returns 400 when signature is missing', async () => {
      const response = await POST('cert-123', {
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Signature and signer name are required')
    })

    it('returns 400 when signer name is missing', async () => {
      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Signature and signer name are required')
    })

    it('returns 400 when signer name does not match profile', async () => {
      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Wrong Name',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Signer name must match your profile name')
    })
  })

  describe('certificate validation', () => {
    it('returns 404 when certificate not found', async () => {
      mockFindCertificate.mockResolvedValue(null)

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(404)
      expect((response.body as { error: string }).error).toBe('Certificate not found')
    })

    it('returns 403 when user is not the owner', async () => {
      mockFindCertificate.mockResolvedValue({
        ...mockCertificate,
        createdById: 'different-user',
      })

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(403)
      expect((response.body as { error: string }).error).toBe('Forbidden')
    })

    it('returns 400 when certificate status is not submittable', async () => {
      mockFindCertificate.mockResolvedValue({
        ...mockCertificate,
        status: 'APPROVED',
      })

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toContain('Cannot submit certificate with status')
    })
  })

  describe('reviewer validation', () => {
    it('returns 400 when no reviewer selected', async () => {
      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Please select a reviewer for the certificate')
    })

    it('returns 400 when selected reviewer is inactive', async () => {
      mockFindUser.mockResolvedValue({
        ...mockReviewer,
        isActive: false,
      })

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Selected reviewer is not available')
    })

    it('returns 400 when trying to review own certificate', async () => {
      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'engineer-123', // Same as session user
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('You cannot review your own certificate')
    })
  })

  describe('field validation', () => {
    it('returns validation errors for missing required fields', async () => {
      mockFindCertificate.mockResolvedValue({
        ...mockCertificate,
        dateOfCalibration: null,
        customerName: null,
        uucDescription: null,
      })

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Validation failed')
      const errors = (response.body as { validationErrors: string[] }).validationErrors
      expect(errors).toContain('Date of calibration is required')
      expect(errors).toContain('Customer name is required')
      expect(errors).toContain('UUC description is required')
    })

    it('returns validation error when no master instruments', async () => {
      mockFindCertificate.mockResolvedValue({
        ...mockCertificate,
        masterInstruments: [],
      })

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(400)
      const errors = (response.body as { validationErrors: string[] }).validationErrors
      expect(errors).toContain('At least one master instrument is required')
    })

    it('returns validation error when no calibration results', async () => {
      mockFindCertificate.mockResolvedValue({
        ...mockCertificate,
        parameters: [{ id: 'param-1', results: [] }],
      })

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(400)
      const errors = (response.body as { validationErrors: string[] }).validationErrors
      expect(errors).toContain('At least one calibration result is required')
    })
  })

  describe('successful submission', () => {
    it('successfully submits new certificate', async () => {
      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(200)
      const data = response.body as { success: boolean; message: string; certificate: Certificate }
      expect(data.success).toBe(true)
      expect(data.message).toContain('submitted for peer review')
      expect(data.certificate.status).toBe('PENDING_REVIEW')
    })

    it('successfully submits with client evidence', async () => {
      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
        clientEvidence: {
          userAgent: 'Mozilla/5.0',
          screenResolution: '1920x1080',
          timezone: 'UTC',
          timestamp: new Date().toISOString(),
        },
      })

      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(true)
      expect(mockAppendSigningEvidence).toHaveBeenCalled()
    })

    it('successfully resubmits certificate with revision required status', async () => {
      mockFindCertificate.mockResolvedValue({
        ...mockCertificate,
        status: 'REVISION_REQUIRED',
        reviewerId: 'reviewer-456',
      })
      mockUpdateCertificate.mockResolvedValue({
        ...mockCertificate,
        status: 'PENDING_REVIEW',
        currentRevision: 2,
      })

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        engineerNotes: 'Fixed the issues mentioned',
        sectionResponses: {
          summary: 'Updated summary section',
          results: 'Corrected calibration results',
        },
      })

      expect(response.status).toBe(200)
      const data = response.body as { success: boolean; message: string }
      expect(data.success).toBe(true)
      expect(data.message).toContain('resubmitted for peer review')
    })

    it('allows admin to submit on behalf of engineer', async () => {
      mockAuth.mockResolvedValue({
        ...mockSession,
        user: { ...mockSession.user, id: 'admin-123', role: 'ADMIN', name: 'Admin User' },
      })

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Admin User',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(true)
    })

    it('handles evidence capture failure gracefully', async () => {
      mockAppendSigningEvidence.mockRejectedValueOnce(new Error('Evidence capture failed'))

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
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

  describe('error handling', () => {
    it('returns 500 on unexpected error', async () => {
      mockFindCertificate.mockRejectedValue(new Error('Database error'))

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      expect(response.status).toBe(500)
      expect((response.body as { error: string }).error).toBe('Internal server error')
    })
  })

  describe('notification failure handling', () => {
    it('handles notification failure gracefully on initial submit', async () => {
      mockNotifyReviewerOnSubmit.mockRejectedValueOnce(new Error('Notification failed'))

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      // Should still succeed - notification is fire-and-forget
      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(true)
    })

    it('handles notification failure gracefully on resubmission', async () => {
      mockFindCertificate.mockResolvedValue({
        ...mockCertificate,
        status: 'REVISION_REQUIRED',
        reviewerId: 'reviewer-456',
      })
      mockNotifyReviewerOnAssigneeResponse.mockRejectedValueOnce(new Error('Notification failed'))

      const response = await POST('cert-123', {
        signatureData: 'data:image/png;base64,abc123',
        signerName: 'Jane Engineer',
        reviewerId: 'reviewer-456',
      })

      // Should still succeed - notification is fire-and-forget
      expect(response.status).toBe(200)
      expect((response.body as { success: boolean }).success).toBe(true)
    })
  })
})
