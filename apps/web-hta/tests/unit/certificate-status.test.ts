/**
 * Certificate Status Unit Tests
 *
 * Tests for certificate status transitions and validation
 *
 * Migrated from hta-calibration/src/lib/__tests__/certificate-status.test.ts
 */
import { describe, it, expect } from 'vitest'

// Certificate status constants
const CERTIFICATE_STATUSES = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  PENDING_CUSTOMER_APPROVAL: 'PENDING_CUSTOMER_APPROVAL',
  CUSTOMER_REVISION_REQUIRED: 'CUSTOMER_REVISION_REQUIRED',
  APPROVED: 'APPROVED',
  PENDING_ADMIN_AUTHORIZATION: 'PENDING_ADMIN_AUTHORIZATION',
  AUTHORIZED: 'AUTHORIZED',
  REJECTED: 'REJECTED',
} as const

type CertificateStatus = (typeof CERTIFICATE_STATUSES)[keyof typeof CERTIFICATE_STATUSES]

// Valid status transitions
const STATUS_TRANSITIONS: Record<CertificateStatus, CertificateStatus[]> = {
  DRAFT: ['PENDING_REVIEW'],
  PENDING_REVIEW: ['REVISION_REQUIRED', 'PENDING_CUSTOMER_APPROVAL', 'REJECTED'],
  REVISION_REQUIRED: ['PENDING_REVIEW'],
  PENDING_CUSTOMER_APPROVAL: ['APPROVED', 'CUSTOMER_REVISION_REQUIRED'],
  CUSTOMER_REVISION_REQUIRED: ['PENDING_CUSTOMER_APPROVAL'],
  APPROVED: ['PENDING_ADMIN_AUTHORIZATION'],
  PENDING_ADMIN_AUTHORIZATION: ['AUTHORIZED', 'REJECTED'],
  AUTHORIZED: [],
  REJECTED: [],
}

// Status labels
const STATUS_LABELS: Record<CertificateStatus, string> = {
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending Review',
  REVISION_REQUIRED: 'Revision Required',
  PENDING_CUSTOMER_APPROVAL: 'Pending Customer Approval',
  CUSTOMER_REVISION_REQUIRED: 'Customer Revision Required',
  APPROVED: 'Approved',
  PENDING_ADMIN_AUTHORIZATION: 'Pending Admin Authorization',
  AUTHORIZED: 'Authorized',
  REJECTED: 'Rejected',
}

function canTransition(from: CertificateStatus, to: CertificateStatus): boolean {
  const allowedTransitions = STATUS_TRANSITIONS[from]
  return allowedTransitions.includes(to)
}

function isTerminalStatus(status: CertificateStatus): boolean {
  return STATUS_TRANSITIONS[status].length === 0
}

function requiresCustomerAction(status: CertificateStatus): boolean {
  return status === 'PENDING_CUSTOMER_APPROVAL' || status === 'CUSTOMER_REVISION_REQUIRED'
}

function requiresStaffAction(status: CertificateStatus): boolean {
  return ['DRAFT', 'PENDING_REVIEW', 'REVISION_REQUIRED', 'PENDING_ADMIN_AUTHORIZATION'].includes(
    status
  )
}

function getStatusLabel(status: CertificateStatus): string {
  return STATUS_LABELS[status]
}

function getNextStatuses(status: CertificateStatus): CertificateStatus[] {
  return STATUS_TRANSITIONS[status]
}

describe('Certificate Status Transitions', () => {
  describe('canTransition', () => {
    it('allows DRAFT -> PENDING_REVIEW', () => {
      expect(canTransition('DRAFT', 'PENDING_REVIEW')).toBe(true)
    })

    it('prevents DRAFT -> APPROVED (skip steps)', () => {
      expect(canTransition('DRAFT', 'APPROVED')).toBe(false)
    })

    it('allows PENDING_REVIEW -> REVISION_REQUIRED', () => {
      expect(canTransition('PENDING_REVIEW', 'REVISION_REQUIRED')).toBe(true)
    })

    it('allows PENDING_REVIEW -> PENDING_CUSTOMER_APPROVAL', () => {
      expect(canTransition('PENDING_REVIEW', 'PENDING_CUSTOMER_APPROVAL')).toBe(true)
    })

    it('allows PENDING_CUSTOMER_APPROVAL -> APPROVED', () => {
      expect(canTransition('PENDING_CUSTOMER_APPROVAL', 'APPROVED')).toBe(true)
    })

    it('allows PENDING_CUSTOMER_APPROVAL -> CUSTOMER_REVISION_REQUIRED', () => {
      expect(canTransition('PENDING_CUSTOMER_APPROVAL', 'CUSTOMER_REVISION_REQUIRED')).toBe(true)
    })

    it('allows APPROVED -> PENDING_ADMIN_AUTHORIZATION', () => {
      expect(canTransition('APPROVED', 'PENDING_ADMIN_AUTHORIZATION')).toBe(true)
    })

    it('allows PENDING_ADMIN_AUTHORIZATION -> AUTHORIZED', () => {
      expect(canTransition('PENDING_ADMIN_AUTHORIZATION', 'AUTHORIZED')).toBe(true)
    })

    it('prevents any transition from AUTHORIZED (terminal)', () => {
      expect(canTransition('AUTHORIZED', 'DRAFT')).toBe(false)
      expect(canTransition('AUTHORIZED', 'PENDING_REVIEW')).toBe(false)
    })

    it('prevents any transition from REJECTED (terminal)', () => {
      expect(canTransition('REJECTED', 'DRAFT')).toBe(false)
      expect(canTransition('REJECTED', 'PENDING_REVIEW')).toBe(false)
    })
  })

  describe('isTerminalStatus', () => {
    it('returns true for AUTHORIZED', () => {
      expect(isTerminalStatus('AUTHORIZED')).toBe(true)
    })

    it('returns true for REJECTED', () => {
      expect(isTerminalStatus('REJECTED')).toBe(true)
    })

    it('returns false for DRAFT', () => {
      expect(isTerminalStatus('DRAFT')).toBe(false)
    })

    it('returns false for PENDING_REVIEW', () => {
      expect(isTerminalStatus('PENDING_REVIEW')).toBe(false)
    })
  })

  describe('requiresCustomerAction', () => {
    it('returns true for PENDING_CUSTOMER_APPROVAL', () => {
      expect(requiresCustomerAction('PENDING_CUSTOMER_APPROVAL')).toBe(true)
    })

    it('returns true for CUSTOMER_REVISION_REQUIRED', () => {
      expect(requiresCustomerAction('CUSTOMER_REVISION_REQUIRED')).toBe(true)
    })

    it('returns false for PENDING_REVIEW', () => {
      expect(requiresCustomerAction('PENDING_REVIEW')).toBe(false)
    })

    it('returns false for DRAFT', () => {
      expect(requiresCustomerAction('DRAFT')).toBe(false)
    })
  })

  describe('requiresStaffAction', () => {
    it('returns true for DRAFT', () => {
      expect(requiresStaffAction('DRAFT')).toBe(true)
    })

    it('returns true for PENDING_REVIEW', () => {
      expect(requiresStaffAction('PENDING_REVIEW')).toBe(true)
    })

    it('returns true for REVISION_REQUIRED', () => {
      expect(requiresStaffAction('REVISION_REQUIRED')).toBe(true)
    })

    it('returns true for PENDING_ADMIN_AUTHORIZATION', () => {
      expect(requiresStaffAction('PENDING_ADMIN_AUTHORIZATION')).toBe(true)
    })

    it('returns false for PENDING_CUSTOMER_APPROVAL', () => {
      expect(requiresStaffAction('PENDING_CUSTOMER_APPROVAL')).toBe(false)
    })
  })

  describe('getStatusLabel', () => {
    it('returns human-readable label for DRAFT', () => {
      expect(getStatusLabel('DRAFT')).toBe('Draft')
    })

    it('returns human-readable label for PENDING_REVIEW', () => {
      expect(getStatusLabel('PENDING_REVIEW')).toBe('Pending Review')
    })

    it('returns human-readable label for AUTHORIZED', () => {
      expect(getStatusLabel('AUTHORIZED')).toBe('Authorized')
    })
  })

  describe('getNextStatuses', () => {
    it('returns valid next statuses for DRAFT', () => {
      expect(getNextStatuses('DRAFT')).toEqual(['PENDING_REVIEW'])
    })

    it('returns multiple options for PENDING_REVIEW', () => {
      const nextStatuses = getNextStatuses('PENDING_REVIEW')
      expect(nextStatuses).toContain('REVISION_REQUIRED')
      expect(nextStatuses).toContain('PENDING_CUSTOMER_APPROVAL')
      expect(nextStatuses).toContain('REJECTED')
    })

    it('returns empty array for terminal status', () => {
      expect(getNextStatuses('AUTHORIZED')).toEqual([])
      expect(getNextStatuses('REJECTED')).toEqual([])
    })
  })

  describe('CERTIFICATE_STATUSES', () => {
    it('contains all expected statuses', () => {
      expect(CERTIFICATE_STATUSES.DRAFT).toBe('DRAFT')
      expect(CERTIFICATE_STATUSES.PENDING_REVIEW).toBe('PENDING_REVIEW')
      expect(CERTIFICATE_STATUSES.AUTHORIZED).toBe('AUTHORIZED')
      expect(CERTIFICATE_STATUSES.REJECTED).toBe('REJECTED')
    })
  })
})
