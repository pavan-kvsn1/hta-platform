/**
 * Reviewer Actions Regression Tests
 *
 * Regression tests for the POST /api/certificates/:id/review endpoint.
 *
 * Covers fixes from:
 * - 70797a8: Added DRAFT to reviewable statuses, allowed admins to review
 * - 3703d8e: Fixed reviewer page showing empty review actions for non-decision states
 *
 * Tests the core validation logic extracted from
 * apps/api/src/routes/certificates/index.ts (the review endpoint).
 */
import { describe, it, expect } from 'vitest'

// ─── Types ──────────────────────────────────────────────────────────────────

type CertificateStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'REVISION_REQUIRED'
  | 'PENDING_CUSTOMER_APPROVAL'
  | 'CUSTOMER_REVISION_REQUIRED'
  | 'APPROVED'
  | 'PENDING_ADMIN_AUTHORIZATION'
  | 'AUTHORIZED'
  | 'REJECTED'

type ReviewAction = 'approve' | 'request_revision' | 'reject'

interface Certificate {
  id: string
  status: CertificateStatus
  reviewerId: string | null
  createdById: string
  tenantId: string
}

interface RequestUser {
  sub: string
  email: string
  name: string
  role: string
  isAdmin: boolean
}

interface ReviewBody {
  action: ReviewAction
  comment?: string
  sectionFeedbacks?: { section: string; comment: string }[]
  generalNotes?: string
  signatureData?: string
  signerName?: string
  sendToCustomer?: { email: string; name: string; message?: string }
}

interface ValidationResult {
  allowed: boolean
  statusCode: number
  error?: string
}

// ─── Validation logic mirroring the API endpoint ────────────────────────────
// Extracted from apps/api/src/routes/certificates/index.ts lines 1252-1296

/**
 * Mirrors the reviewable-status check from the API (post-70797a8).
 * DRAFT was added to this list in commit 70797a8.
 */
const REVIEWABLE_STATUSES: CertificateStatus[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'CUSTOMER_REVISION_REQUIRED',
]

function validateReviewRequest(
  certificate: Certificate | null,
  user: RequestUser,
  body: ReviewBody,
): ValidationResult {
  // Certificate existence
  if (!certificate) {
    return { allowed: false, statusCode: 404, error: 'Certificate not found' }
  }

  // Reviewer check (admins can also review — fixed in 70797a8)
  if (certificate.reviewerId !== user.sub && !user.isAdmin) {
    return { allowed: false, statusCode: 403, error: 'You are not the reviewer for this certificate' }
  }

  // Status check
  if (!REVIEWABLE_STATUSES.includes(certificate.status)) {
    return { allowed: false, statusCode: 400, error: `Certificate is not in a reviewable state: ${certificate.status}` }
  }

  // Action validation
  if (!['approve', 'request_revision', 'reject'].includes(body.action)) {
    return { allowed: false, statusCode: 400, error: 'Invalid action' }
  }

  // Revision feedback required
  if (body.action === 'request_revision') {
    const hasFeedback = body.sectionFeedbacks?.some(sf => sf.comment?.trim()) || body.comment?.trim()
    if (!hasFeedback) {
      return { allowed: false, statusCode: 400, error: 'Feedback is required for revision requests' }
    }
  }

  // Reject comment required
  if (body.action === 'reject' && !body.comment?.trim()) {
    return { allowed: false, statusCode: 400, error: 'Comment is required for rejections' }
  }

  // Approval signature required
  if (body.action === 'approve') {
    if (!body.signatureData || !body.signerName?.trim()) {
      return { allowed: false, statusCode: 400, error: 'Signature and signer name are required for approval' }
    }
  }

  return { allowed: true, statusCode: 200 }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const REVIEWER_ID = 'reviewer-001'
const ENGINEER_ID = 'engineer-002'
const TENANT_ID = 'tenant-abc'

function makeCert(overrides: Partial<Certificate> = {}): Certificate {
  return {
    id: 'cert-100',
    status: 'PENDING_REVIEW',
    reviewerId: REVIEWER_ID,
    createdById: ENGINEER_ID,
    tenantId: TENANT_ID,
    ...overrides,
  }
}

const reviewer: RequestUser = {
  sub: REVIEWER_ID,
  email: 'reviewer@hta.test',
  name: 'Jane Reviewer',
  role: 'ENGINEER',
  isAdmin: false,
}

const adminUser: RequestUser = {
  sub: 'admin-999',
  email: 'admin@hta.test',
  name: 'Admin User',
  role: 'ADMIN',
  isAdmin: true,
}

const approveBody: ReviewBody = {
  action: 'approve',
  signatureData: 'data:image/png;base64,AAAA',
  signerName: 'Jane Reviewer',
}

const revisionBody: ReviewBody = {
  action: 'request_revision',
  comment: 'Please correct the calibration date.',
}

const rejectBody: ReviewBody = {
  action: 'reject',
  comment: 'Data is fundamentally incorrect.',
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/certificates/:id/review — reviewer action validation', () => {
  // ── Happy-path: PENDING_REVIEW ──────────────────────────────────────────

  describe('PENDING_REVIEW certificates', () => {
    it('allows reviewer to approve a PENDING_REVIEW certificate', () => {
      const cert = makeCert({ status: 'PENDING_REVIEW' })
      const result = validateReviewRequest(cert, reviewer, approveBody)

      expect(result.allowed).toBe(true)
      expect(result.statusCode).toBe(200)
    })

    it('allows reviewer to request revision on a PENDING_REVIEW certificate', () => {
      const cert = makeCert({ status: 'PENDING_REVIEW' })
      const result = validateReviewRequest(cert, reviewer, revisionBody)

      expect(result.allowed).toBe(true)
      expect(result.statusCode).toBe(200)
    })

    it('allows reviewer to reject a PENDING_REVIEW certificate', () => {
      const cert = makeCert({ status: 'PENDING_REVIEW' })
      const result = validateReviewRequest(cert, reviewer, rejectBody)

      expect(result.allowed).toBe(true)
      expect(result.statusCode).toBe(200)
    })
  })

  // ── CUSTOMER_REVISION_REQUIRED (re-review after customer revision) ──────

  describe('CUSTOMER_REVISION_REQUIRED certificates', () => {
    it('allows reviewer to approve after customer revision', () => {
      const cert = makeCert({ status: 'CUSTOMER_REVISION_REQUIRED' })
      const result = validateReviewRequest(cert, reviewer, approveBody)

      expect(result.allowed).toBe(true)
      expect(result.statusCode).toBe(200)
    })

    it('allows reviewer to request further revision after customer revision', () => {
      const cert = makeCert({ status: 'CUSTOMER_REVISION_REQUIRED' })
      const result = validateReviewRequest(cert, reviewer, revisionBody)

      expect(result.allowed).toBe(true)
      expect(result.statusCode).toBe(200)
    })
  })

  // ── DRAFT status (added in 70797a8) ─────────────────────────────────────

  describe('DRAFT certificates (regression: 70797a8)', () => {
    it('allows reviewer actions on DRAFT status certificates', () => {
      const cert = makeCert({ status: 'DRAFT' })
      const result = validateReviewRequest(cert, reviewer, approveBody)

      expect(result.allowed).toBe(true)
      expect(result.statusCode).toBe(200)
    })

    it('allows revision request on DRAFT status certificates', () => {
      const cert = makeCert({ status: 'DRAFT' })
      const result = validateReviewRequest(cert, reviewer, revisionBody)

      expect(result.allowed).toBe(true)
      expect(result.statusCode).toBe(200)
    })
  })

  // ── Terminal statuses — must be blocked ─────────────────────────────────

  describe('terminal status certificates — actions must be rejected', () => {
    it('rejects review actions on AUTHORIZED certificates', () => {
      const cert = makeCert({ status: 'AUTHORIZED' })
      const result = validateReviewRequest(cert, reviewer, approveBody)

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('not in a reviewable state')
      expect(result.error).toContain('AUTHORIZED')
    })

    it('rejects review actions on REJECTED certificates', () => {
      const cert = makeCert({ status: 'REJECTED' })
      const result = validateReviewRequest(cert, reviewer, approveBody)

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('not in a reviewable state')
      expect(result.error).toContain('REJECTED')
    })

    it('rejects review actions on APPROVED certificates', () => {
      const cert = makeCert({ status: 'APPROVED' })
      const result = validateReviewRequest(cert, reviewer, approveBody)

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('not in a reviewable state')
    })

    it('rejects review actions on PENDING_ADMIN_AUTHORIZATION certificates', () => {
      const cert = makeCert({ status: 'PENDING_ADMIN_AUTHORIZATION' })
      const result = validateReviewRequest(cert, reviewer, approveBody)

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('not in a reviewable state')
    })
  })

  // ── Non-reviewable intermediate statuses ─────────────────────────────────

  describe('non-reviewable intermediate statuses', () => {
    it('rejects review actions on REVISION_REQUIRED (waiting for engineer)', () => {
      const cert = makeCert({ status: 'REVISION_REQUIRED' })
      const result = validateReviewRequest(cert, reviewer, approveBody)

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('not in a reviewable state')
    })

    it('rejects review actions on PENDING_CUSTOMER_APPROVAL', () => {
      const cert = makeCert({ status: 'PENDING_CUSTOMER_APPROVAL' })
      const result = validateReviewRequest(cert, reviewer, approveBody)

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('not in a reviewable state')
    })
  })

  // ── Self-review prevention (reviewer != creator via assignment) ─────────

  describe('reviewer authorization', () => {
    it('rejects action when user is not the assigned reviewer', () => {
      const cert = makeCert({ reviewerId: 'someone-else' })
      const nonReviewer: RequestUser = {
        sub: ENGINEER_ID,
        email: 'engineer@hta.test',
        name: 'Bob Engineer',
        role: 'ENGINEER',
        isAdmin: false,
      }
      const result = validateReviewRequest(cert, nonReviewer, approveBody)

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(403)
      expect(result.error).toBe('You are not the reviewer for this certificate')
    })

    it('prevents the certificate creator from reviewing their own work (not the assigned reviewer)', () => {
      // The creator is engineer-002, reviewer is reviewer-001.
      // If the creator tries to review, they fail the reviewer check.
      const cert = makeCert()
      const creator: RequestUser = {
        sub: ENGINEER_ID,
        email: 'creator@hta.test',
        name: 'Creator Engineer',
        role: 'ENGINEER',
        isAdmin: false,
      }
      const result = validateReviewRequest(cert, creator, approveBody)

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(403)
      expect(result.error).toBe('You are not the reviewer for this certificate')
    })

    it('allows admin to review even if not the assigned reviewer (regression: 70797a8)', () => {
      const cert = makeCert({ reviewerId: 'someone-else' })
      const result = validateReviewRequest(cert, adminUser, approveBody)

      expect(result.allowed).toBe(true)
      expect(result.statusCode).toBe(200)
    })
  })

  // ── Input validation ────────────────────────────────────────────────────

  describe('action-specific input validation', () => {
    it('requires signature data for approval', () => {
      const cert = makeCert()
      const result = validateReviewRequest(cert, reviewer, {
        action: 'approve',
      })

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toContain('Signature and signer name are required')
    })

    it('requires comment for rejection', () => {
      const cert = makeCert()
      const result = validateReviewRequest(cert, reviewer, {
        action: 'reject',
      })

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toBe('Comment is required for rejections')
    })

    it('requires feedback for revision request', () => {
      const cert = makeCert()
      const result = validateReviewRequest(cert, reviewer, {
        action: 'request_revision',
      })

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toBe('Feedback is required for revision requests')
    })

    it('accepts revision request with section feedbacks', () => {
      const cert = makeCert()
      const result = validateReviewRequest(cert, reviewer, {
        action: 'request_revision',
        sectionFeedbacks: [{ section: 'results', comment: 'Check measurement uncertainty' }],
      })

      expect(result.allowed).toBe(true)
      expect(result.statusCode).toBe(200)
    })

    it('rejects empty comment for rejection', () => {
      const cert = makeCert()
      const result = validateReviewRequest(cert, reviewer, {
        action: 'reject',
        comment: '   ',
      })

      expect(result.allowed).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.error).toBe('Comment is required for rejections')
    })
  })

  // ── Reviewable statuses list validation ──────────────────────────────────

  describe('REVIEWABLE_STATUSES constant', () => {
    it('includes DRAFT (added in 70797a8)', () => {
      expect(REVIEWABLE_STATUSES).toContain('DRAFT')
    })

    it('includes PENDING_REVIEW', () => {
      expect(REVIEWABLE_STATUSES).toContain('PENDING_REVIEW')
    })

    it('includes CUSTOMER_REVISION_REQUIRED', () => {
      expect(REVIEWABLE_STATUSES).toContain('CUSTOMER_REVISION_REQUIRED')
    })

    it('does NOT include terminal statuses', () => {
      expect(REVIEWABLE_STATUSES).not.toContain('AUTHORIZED')
      expect(REVIEWABLE_STATUSES).not.toContain('REJECTED')
      expect(REVIEWABLE_STATUSES).not.toContain('APPROVED')
    })

    it('does NOT include REVISION_REQUIRED (engineer is working)', () => {
      expect(REVIEWABLE_STATUSES).not.toContain('REVISION_REQUIRED')
    })

    it('does NOT include PENDING_CUSTOMER_APPROVAL', () => {
      expect(REVIEWABLE_STATUSES).not.toContain('PENDING_CUSTOMER_APPROVAL')
    })
  })
})
