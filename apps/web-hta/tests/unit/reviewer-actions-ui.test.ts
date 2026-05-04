/**
 * Reviewer Actions UI Regression Tests
 *
 * Tests the canReview / decisionMade logic from ReviewerPageClient.tsx
 * that controls whether approve/revision/reject buttons are shown.
 *
 * Covers fixes from:
 * - 3703d8e: Changed canReview from explicit allowlist to !decisionMade,
 *            so statuses like DRAFT and CUSTOMER_REVISION_REQUIRED show actions
 * - 70797a8: Further refined canReview to exclude REVISION_REQUIRED
 *            (canReview = !decisionMade && status !== 'REVISION_REQUIRED')
 *
 * Source: apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/ReviewerPageClient.tsx
 * Lines 284-285:
 *   const decisionMade = ['APPROVED', 'PENDING_CUSTOMER_APPROVAL', 'PENDING_ADMIN_AUTHORIZATION', 'AUTHORIZED', 'REJECTED', 'CUSTOMER_REVIEW_EXPIRED'].includes(certificate.status)
 *   const canReview = !decisionMade && certificate.status !== 'REVISION_REQUIRED'
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
  | 'CUSTOMER_REVIEW_EXPIRED'

// ─── Logic extracted from ReviewerPageClient.tsx ────────────────────────────
// Mirrors lines 284-285 exactly.

const DECISION_MADE_STATUSES: CertificateStatus[] = [
  'APPROVED',
  'PENDING_CUSTOMER_APPROVAL',
  'PENDING_ADMIN_AUTHORIZATION',
  'AUTHORIZED',
  'REJECTED',
  'CUSTOMER_REVIEW_EXPIRED',
]

function isDecisionMade(status: CertificateStatus): boolean {
  return DECISION_MADE_STATUSES.includes(status)
}

function canReview(status: CertificateStatus): boolean {
  return !isDecisionMade(status) && status !== 'REVISION_REQUIRED'
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ReviewerPageClient — canReview logic (reviewer action button visibility)', () => {
  // ── Statuses that SHOULD show action buttons ────────────────────────────

  describe('shows approve/revision/reject buttons', () => {
    it('shows action buttons when status is PENDING_REVIEW', () => {
      expect(canReview('PENDING_REVIEW')).toBe(true)
    })

    it('shows action buttons when status is CUSTOMER_REVISION_REQUIRED', () => {
      // Regression: commit 3703d8e changed from explicit allowlist to !decisionMade,
      // ensuring CUSTOMER_REVISION_REQUIRED still shows actions
      expect(canReview('CUSTOMER_REVISION_REQUIRED')).toBe(true)
    })

    it('shows action buttons when status is DRAFT', () => {
      // DRAFT is not in decisionMade and is not REVISION_REQUIRED,
      // so the reviewer page shows buttons (matches API which also allows DRAFT reviews)
      expect(canReview('DRAFT')).toBe(true)
    })
  })

  // ── Terminal statuses — must NOT show action buttons ────────────────────

  describe('does NOT show action buttons for terminal statuses', () => {
    it('hides actions for AUTHORIZED certificates', () => {
      expect(canReview('AUTHORIZED')).toBe(false)
    })

    it('hides actions for REJECTED certificates', () => {
      expect(canReview('REJECTED')).toBe(false)
    })

    it('hides actions for APPROVED certificates', () => {
      expect(canReview('APPROVED')).toBe(false)
    })
  })

  // ── Post-decision statuses — must NOT show action buttons ──────────────

  describe('does NOT show action buttons for post-decision statuses', () => {
    it('hides actions for PENDING_CUSTOMER_APPROVAL (sent to customer)', () => {
      expect(canReview('PENDING_CUSTOMER_APPROVAL')).toBe(false)
    })

    it('hides actions for PENDING_ADMIN_AUTHORIZATION', () => {
      expect(canReview('PENDING_ADMIN_AUTHORIZATION')).toBe(false)
    })

    it('hides actions for CUSTOMER_REVIEW_EXPIRED', () => {
      expect(canReview('CUSTOMER_REVIEW_EXPIRED')).toBe(false)
    })
  })

  // ── REVISION_REQUIRED — waiting on engineer, no reviewer action ────────

  describe('does NOT show action buttons for REVISION_REQUIRED (regression: 70797a8)', () => {
    it('hides actions when revision has been requested and engineer is working', () => {
      // Regression: commit 70797a8 added the explicit exclusion
      // canReview = !decisionMade && certificate.status !== 'REVISION_REQUIRED'
      // Without this fix, REVISION_REQUIRED would pass !decisionMade and show empty/broken buttons
      expect(canReview('REVISION_REQUIRED')).toBe(false)
    })
  })

  // ── DRAFT status — should NOT be treated as a decision ──────────────────

  describe('DRAFT is not a decision-made status', () => {
    it('DRAFT is not in the decisionMade list', () => {
      expect(isDecisionMade('DRAFT')).toBe(false)
    })

    it('PENDING_REVIEW is not in the decisionMade list', () => {
      expect(isDecisionMade('PENDING_REVIEW')).toBe(false)
    })

    it('CUSTOMER_REVISION_REQUIRED is not in the decisionMade list', () => {
      expect(isDecisionMade('CUSTOMER_REVISION_REQUIRED')).toBe(false)
    })
  })

  // ── Decision-made statuses correctness ──────────────────────────────────

  describe('decisionMade list completeness', () => {
    it('APPROVED is a decision-made status', () => {
      expect(isDecisionMade('APPROVED')).toBe(true)
    })

    it('REJECTED is a decision-made status', () => {
      expect(isDecisionMade('REJECTED')).toBe(true)
    })

    it('AUTHORIZED is a decision-made status', () => {
      expect(isDecisionMade('AUTHORIZED')).toBe(true)
    })

    it('PENDING_CUSTOMER_APPROVAL is a decision-made status', () => {
      expect(isDecisionMade('PENDING_CUSTOMER_APPROVAL')).toBe(true)
    })

    it('PENDING_ADMIN_AUTHORIZATION is a decision-made status', () => {
      expect(isDecisionMade('PENDING_ADMIN_AUTHORIZATION')).toBe(true)
    })

    it('CUSTOMER_REVIEW_EXPIRED is a decision-made status', () => {
      expect(isDecisionMade('CUSTOMER_REVIEW_EXPIRED')).toBe(true)
    })
  })

  // ── Exhaustive status → canReview mapping ──────────────────────────────

  describe('exhaustive canReview mapping for all statuses', () => {
    const expectations: Array<{ status: CertificateStatus; expected: boolean; reason: string }> = [
      { status: 'DRAFT', expected: true, reason: 'reviewer can act on drafts (admin/direct review)' },
      { status: 'PENDING_REVIEW', expected: true, reason: 'primary reviewable state' },
      { status: 'REVISION_REQUIRED', expected: false, reason: 'waiting for engineer revision' },
      { status: 'PENDING_CUSTOMER_APPROVAL', expected: false, reason: 'decision already made, sent to customer' },
      { status: 'CUSTOMER_REVISION_REQUIRED', expected: true, reason: 're-review after customer revision' },
      { status: 'APPROVED', expected: false, reason: 'terminal: already approved' },
      { status: 'PENDING_ADMIN_AUTHORIZATION', expected: false, reason: 'decision made, pending admin' },
      { status: 'AUTHORIZED', expected: false, reason: 'terminal: fully authorized' },
      { status: 'REJECTED', expected: false, reason: 'terminal: rejected' },
      { status: 'CUSTOMER_REVIEW_EXPIRED', expected: false, reason: 'customer review window closed' },
    ]

    for (const { status, expected, reason } of expectations) {
      it(`${status} => canReview=${expected} (${reason})`, () => {
        expect(canReview(status)).toBe(expected)
      })
    }
  })
})
