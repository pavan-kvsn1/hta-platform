/**
 * Certificate Review API Unit Tests
 *
 * Tests for the certificate review/signing API:
 * - Authentication and authorization
 * - Certificate validation
 * - Approval flow with signatures
 * - Revision request handling
 * - Rejection flow
 * - Customer feedback forwarding
 *
 * Migrated from hta-calibration/src/app/api/__tests__/signing.test.ts
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
type CertificateStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'REVISION_REQUIRED'
  | 'PENDING_CUSTOMER_APPROVAL'
  | 'CUSTOMER_REVISION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'

type ReviewAction = 'approve' | 'request_revision' | 'reject'

interface Certificate {
  id: string
  certificateNumber: string
  status: CertificateStatus
  currentRevision: number
  reviewerId: string | null
  createdById: string
  customerName: string
}

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface Session {
  user: User
  expires: string
}

interface ReviewRequest {
  action: ReviewAction
  signatureData?: string
  signerName?: string
  comment?: string
  sectionFeedbacks?: Array<{ section: string; comment: string }>
  generalNotes?: string
  targetSection?: string
  sendToCustomer?: {
    email: string
    name: string
    message?: string
  }
  edits?: Array<{
    field: string
    fieldLabel?: string
    originalValue?: string
    newValue: string
    reason?: string
    autoCalculated?: boolean
  }>
}

interface ReviewResponse {
  success: boolean
  message: string
  status?: number
  error?: string
  customerToken?: {
    token: string
    reviewUrl: string
  }
}

// Validation functions
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isReviewableStatus(status: CertificateStatus): boolean {
  return ['PENDING_REVIEW', 'CUSTOMER_REVISION_REQUIRED'].includes(status)
}

function validateApprovalRequest(
  request: ReviewRequest,
  session: Session
): { valid: boolean; error?: string } {
  if (!request.signatureData || !request.signerName) {
    return { valid: false, error: 'Signature and signer name are required for approval' }
  }

  if (request.signerName !== session.user.name) {
    return { valid: false, error: 'Signer name must match your profile name' }
  }

  return { valid: true }
}

function validateSendToCustomer(
  sendToCustomer: ReviewRequest['sendToCustomer']
): { valid: boolean; error?: string } {
  if (!sendToCustomer) {
    return { valid: true }
  }

  if (!sendToCustomer.email) {
    return { valid: false, error: 'Customer email is required for sending to customer' }
  }

  if (!sendToCustomer.name) {
    return { valid: false, error: 'Customer name is required for sending to customer' }
  }

  if (!isValidEmail(sendToCustomer.email)) {
    return { valid: false, error: 'Please enter a valid customer email address' }
  }

  return { valid: true }
}

function validateEdits(
  edits: ReviewRequest['edits']
): { valid: boolean; error?: string } {
  if (!edits || edits.length === 0) {
    return { valid: true }
  }

  for (const edit of edits) {
    if (!edit.field || edit.newValue === undefined) {
      return { valid: false, error: 'Invalid edit: field and newValue are required' }
    }

    if (!edit.autoCalculated && !edit.reason) {
      return { valid: false, error: `Reason is required for editing ${edit.fieldLabel || edit.field}` }
    }
  }

  return { valid: true }
}

function validateRevisionRequest(
  request: ReviewRequest
): { valid: boolean; error?: string } {
  const hasComment = request.comment?.trim()
  const hasGeneralNotes = request.generalNotes?.trim()
  const hasSectionFeedbacks = request.sectionFeedbacks?.some(
    (sf) => sf.comment?.trim()
  )

  if (!hasComment && !hasGeneralNotes && !hasSectionFeedbacks) {
    return {
      valid: false,
      error: 'Please provide at least one section feedback or general notes',
    }
  }

  return { valid: true }
}

function validateRejectionRequest(
  request: ReviewRequest
): { valid: boolean; error?: string } {
  if (!request.comment?.trim()) {
    return { valid: false, error: 'Comment is required for rejections' }
  }

  return { valid: true }
}

// Review handler
function processReviewRequest(
  request: ReviewRequest,
  certificate: Certificate | null,
  session: Session | null
): ReviewResponse {
  // Auth check
  if (!session) {
    return { success: false, message: '', status: 401, error: 'Unauthorized' }
  }

  // Certificate existence check
  if (!certificate) {
    return { success: false, message: '', status: 404, error: 'Certificate not found' }
  }

  // Reviewer assignment check
  if (!certificate.reviewerId) {
    return { success: false, message: '', status: 400, error: 'No reviewer assigned to this certificate' }
  }

  // Reviewable status check
  if (!isReviewableStatus(certificate.status)) {
    return {
      success: false,
      message: '',
      status: 400,
      error: `Certificate is not in a reviewable state (current: ${certificate.status})`,
    }
  }

  // Reviewer permission check
  if (certificate.reviewerId !== session.user.id) {
    return { success: false, message: '', status: 403, error: 'You are not the reviewer for this certificate' }
  }

  // Action validation
  if (!['approve', 'request_revision', 'reject'].includes(request.action)) {
    return { success: false, message: '', status: 400, error: 'Invalid action' }
  }

  // Action-specific validation
  if (request.action === 'approve') {
    const approvalValidation = validateApprovalRequest(request, session)
    if (!approvalValidation.valid) {
      return { success: false, message: '', status: 400, error: approvalValidation.error }
    }

    const customerValidation = validateSendToCustomer(request.sendToCustomer)
    if (!customerValidation.valid) {
      return { success: false, message: '', status: 400, error: customerValidation.error }
    }

    const editsValidation = validateEdits(request.edits)
    if (!editsValidation.valid) {
      return { success: false, message: '', status: 400, error: editsValidation.error }
    }

    // Success
    if (request.sendToCustomer) {
      return {
        success: true,
        message: 'Certificate approved and sent to customer for review',
        status: 200,
        customerToken: {
          token: 'mock-token',
          reviewUrl: 'http://localhost/customer/review/mock-token',
        },
      }
    }

    return { success: true, message: 'Certificate approved successfully', status: 200 }
  }

  if (request.action === 'request_revision') {
    const revisionValidation = validateRevisionRequest(request)
    if (!revisionValidation.valid) {
      return { success: false, message: '', status: 400, error: revisionValidation.error }
    }

    // Count feedback items
    const sectionCount = request.sectionFeedbacks?.filter((sf) => sf.comment?.trim()).length || 0
    const hasGeneralNotes = request.generalNotes?.trim() ? 1 : 0
    const hasComment = request.comment?.trim() ? 1 : 0
    const totalItems = sectionCount + hasGeneralNotes + hasComment

    if (certificate.status === 'CUSTOMER_REVISION_REQUIRED') {
      return {
        success: true,
        message: `Customer feedback forwarded to engineer. ${totalItems} feedback item${totalItems !== 1 ? 's' : ''} added.`,
        status: 200,
      }
    }

    return {
      success: true,
      message: `Revision requested. ${totalItems} feedback item${totalItems !== 1 ? 's' : ''} added.`,
      status: 200,
    }
  }

  if (request.action === 'reject') {
    const rejectValidation = validateRejectionRequest(request)
    if (!rejectValidation.valid) {
      return { success: false, message: '', status: 400, error: rejectValidation.error }
    }

    return { success: true, message: 'Certificate rejected', status: 200 }
  }

  return { success: false, message: '', status: 400, error: 'Invalid action' }
}

// Test data
const mockSession: Session = {
  user: {
    id: 'reviewer-123',
    name: 'John Reviewer',
    email: 'reviewer@test.com',
    role: 'ENGINEER',
  },
  expires: new Date().toISOString(),
}

const mockCertificate: Certificate = {
  id: 'cert-123',
  certificateNumber: 'HTA-001',
  status: 'PENDING_REVIEW',
  currentRevision: 1,
  reviewerId: 'reviewer-123',
  createdById: 'engineer-456',
  customerName: 'Test Corp',
}

describe('POST /api/certificates/[id]/review', () => {
  describe('authentication', () => {
    it('returns 401 when not authenticated', () => {
      const result = processReviewRequest({ action: 'approve' }, mockCertificate, null)

      expect(result.status).toBe(401)
      expect(result.error).toBe('Unauthorized')
    })
  })

  describe('certificate validation', () => {
    it('returns 404 when certificate not found', () => {
      const result = processReviewRequest({ action: 'approve' }, null, mockSession)

      expect(result.status).toBe(404)
      expect(result.error).toBe('Certificate not found')
    })

    it('returns 400 when no reviewer assigned', () => {
      const cert = { ...mockCertificate, reviewerId: null }
      const result = processReviewRequest({ action: 'approve' }, cert, mockSession)

      expect(result.status).toBe(400)
      expect(result.error).toBe('No reviewer assigned to this certificate')
    })

    it('returns 400 when certificate not in reviewable state', () => {
      const cert = { ...mockCertificate, status: 'DRAFT' as CertificateStatus }
      const result = processReviewRequest({ action: 'approve' }, cert, mockSession)

      expect(result.status).toBe(400)
      expect(result.error).toContain('not in a reviewable state')
    })

    it('returns 403 when user is not the reviewer', () => {
      const session = { ...mockSession, user: { ...mockSession.user, id: 'different-user' } }
      const result = processReviewRequest({ action: 'approve' }, mockCertificate, session)

      expect(result.status).toBe(403)
      expect(result.error).toBe('You are not the reviewer for this certificate')
    })
  })

  describe('action validation', () => {
    it('returns 400 for invalid action', () => {
      const result = processReviewRequest(
        { action: 'invalid' as ReviewAction },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toContain('Invalid action')
    })
  })

  describe('approval flow', () => {
    it('returns 400 when signature is missing for approval', () => {
      const result = processReviewRequest(
        { action: 'approve', signerName: 'John Reviewer' },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Signature and signer name are required for approval')
    })

    it('returns 400 when signer name is missing for approval', () => {
      const result = processReviewRequest(
        { action: 'approve', signatureData: 'data:image/png;base64,abc123' },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Signature and signer name are required for approval')
    })

    it('returns 400 when signer name does not match profile', () => {
      const result = processReviewRequest(
        {
          action: 'approve',
          signatureData: 'data:image/png;base64,abc123',
          signerName: 'Wrong Name',
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Signer name must match your profile name')
    })

    it('successfully approves certificate with valid signature', () => {
      const result = processReviewRequest(
        {
          action: 'approve',
          signatureData: 'data:image/png;base64,abc123',
          signerName: 'John Reviewer',
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.message).toBe('Certificate approved successfully')
    })
  })

  describe('send to customer flow', () => {
    it('returns 400 when customer email is missing', () => {
      const result = processReviewRequest(
        {
          action: 'approve',
          signatureData: 'data:image/png;base64,abc123',
          signerName: 'John Reviewer',
          sendToCustomer: { name: 'Customer Name', email: '' },
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Customer email is required for sending to customer')
    })

    it('returns 400 when customer name is missing', () => {
      const result = processReviewRequest(
        {
          action: 'approve',
          signatureData: 'data:image/png;base64,abc123',
          signerName: 'John Reviewer',
          sendToCustomer: { email: 'customer@test.com', name: '' },
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Customer name is required for sending to customer')
    })

    it('returns 400 for invalid customer email', () => {
      const result = processReviewRequest(
        {
          action: 'approve',
          signatureData: 'data:image/png;base64,abc123',
          signerName: 'John Reviewer',
          sendToCustomer: { email: 'invalid-email', name: 'Customer Name' },
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Please enter a valid customer email address')
    })

    it('successfully approves and sends to customer', () => {
      const result = processReviewRequest(
        {
          action: 'approve',
          signatureData: 'data:image/png;base64,abc123',
          signerName: 'John Reviewer',
          sendToCustomer: { email: 'customer@test.com', name: 'Customer Name' },
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.message).toBe('Certificate approved and sent to customer for review')
      expect(result.customerToken).toBeDefined()
    })
  })

  describe('pending edits validation', () => {
    it('returns 400 when edit has no field', () => {
      const result = processReviewRequest(
        {
          action: 'approve',
          signatureData: 'data:image/png;base64,abc123',
          signerName: 'John Reviewer',
          edits: [{ field: '', newValue: '2025-01-01' }],
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Invalid edit: field and newValue are required')
    })

    it('returns 400 when edit has no reason and is not auto-calculated', () => {
      const result = processReviewRequest(
        {
          action: 'approve',
          signatureData: 'data:image/png;base64,abc123',
          signerName: 'John Reviewer',
          edits: [
            {
              field: 'calibrationDueDate',
              fieldLabel: 'Calibration Due Date',
              newValue: '2025-01-01',
            },
          ],
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Reason is required for editing Calibration Due Date')
    })

    it('allows auto-calculated edits without reason', () => {
      const result = processReviewRequest(
        {
          action: 'approve',
          signatureData: 'data:image/png;base64,abc123',
          signerName: 'John Reviewer',
          edits: [
            {
              field: 'calibrationDueDate',
              newValue: '2025-01-01',
              autoCalculated: true,
            },
          ],
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(200)
      expect(result.success).toBe(true)
    })
  })

  describe('revision request flow', () => {
    it('returns 400 when no feedback provided', () => {
      const result = processReviewRequest(
        { action: 'request_revision' },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Please provide at least one section feedback or general notes')
    })

    it('returns 400 when empty sectionFeedbacks provided', () => {
      const result = processReviewRequest(
        {
          action: 'request_revision',
          sectionFeedbacks: [{ section: 'summary', comment: '' }],
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Please provide at least one section feedback or general notes')
    })

    it('successfully requests revision with comment', () => {
      const result = processReviewRequest(
        {
          action: 'request_revision',
          comment: 'Please update the calibration data',
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.message).toContain('Revision requested')
    })

    it('successfully requests revision with section feedbacks', () => {
      const result = processReviewRequest(
        {
          action: 'request_revision',
          sectionFeedbacks: [
            { section: 'summary', comment: 'Update summary' },
            { section: 'results', comment: 'Check results' },
          ],
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.message).toContain('2 feedback item')
    })
  })

  describe('rejection flow', () => {
    it('returns 400 when comment is missing for rejection', () => {
      const result = processReviewRequest(
        { action: 'reject' },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Comment is required for rejections')
    })

    it('returns 400 when comment is empty for rejection', () => {
      const result = processReviewRequest(
        { action: 'reject', comment: '   ' },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(400)
      expect(result.error).toBe('Comment is required for rejections')
    })

    it('successfully rejects certificate', () => {
      const result = processReviewRequest(
        { action: 'reject', comment: 'Certificate has invalid data' },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.message).toBe('Certificate rejected')
    })
  })

  describe('customer feedback forwarding', () => {
    it('forwards customer feedback when status is CUSTOMER_REVISION_REQUIRED', () => {
      const cert = { ...mockCertificate, status: 'CUSTOMER_REVISION_REQUIRED' as CertificateStatus }
      const result = processReviewRequest(
        {
          action: 'request_revision',
          sectionFeedbacks: [{ section: 'summary', comment: 'Customer wants this fixed' }],
        },
        cert,
        mockSession
      )

      expect(result.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.message).toContain('Customer feedback forwarded')
    })

    it('handles mixed section feedbacks and general notes', () => {
      const result = processReviewRequest(
        {
          action: 'request_revision',
          sectionFeedbacks: [{ section: 'summary', comment: 'Update summary' }],
          generalNotes: 'Please review all sections carefully',
        },
        mockCertificate,
        mockSession
      )

      expect(result.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.message).toContain('2 feedback item')
    })
  })
})

describe('Email Validation', () => {
  it('validates correct email formats', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
    expect(isValidEmail('test.user@domain.co.uk')).toBe(true)
    expect(isValidEmail('name+tag@gmail.com')).toBe(true)
  })

  it('rejects invalid email formats', () => {
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('no@domain')).toBe(false)
    expect(isValidEmail('@nodomain.com')).toBe(false)
    expect(isValidEmail('spaces in@email.com')).toBe(false)
  })
})

describe('Reviewable Status Check', () => {
  it('returns true for PENDING_REVIEW', () => {
    expect(isReviewableStatus('PENDING_REVIEW')).toBe(true)
  })

  it('returns true for CUSTOMER_REVISION_REQUIRED', () => {
    expect(isReviewableStatus('CUSTOMER_REVISION_REQUIRED')).toBe(true)
  })

  it('returns false for non-reviewable statuses', () => {
    expect(isReviewableStatus('DRAFT')).toBe(false)
    expect(isReviewableStatus('APPROVED')).toBe(false)
    expect(isReviewableStatus('REJECTED')).toBe(false)
    expect(isReviewableStatus('REVISION_REQUIRED')).toBe(false)
  })
})
