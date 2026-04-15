import { describe, it, expect } from 'vitest'
import {
  CERTIFICATE_STATUSES,
  VALID_TRANSITIONS,
  canTransition,
  isTerminalStatus,
  requiresCustomerAction,
  requiresStaffAction,
  getStatusLabel,
  getNextStatuses,
} from '../../src/lib/utils/certificate-status'

describe('Certificate Status Utils', () => {
  describe('CERTIFICATE_STATUSES', () => {
    it('should have all expected statuses', () => {
      expect(CERTIFICATE_STATUSES).toHaveProperty('DRAFT')
      expect(CERTIFICATE_STATUSES).toHaveProperty('PENDING_REVIEW')
      expect(CERTIFICATE_STATUSES).toHaveProperty('REVISION_REQUIRED')
      expect(CERTIFICATE_STATUSES).toHaveProperty('PENDING_CUSTOMER_APPROVAL')
      expect(CERTIFICATE_STATUSES).toHaveProperty('CUSTOMER_REVISION_REQUIRED')
      expect(CERTIFICATE_STATUSES).toHaveProperty('APPROVED')
      expect(CERTIFICATE_STATUSES).toHaveProperty('PENDING_ADMIN_AUTHORIZATION')
      expect(CERTIFICATE_STATUSES).toHaveProperty('AUTHORIZED')
      expect(CERTIFICATE_STATUSES).toHaveProperty('REJECTED')
    })
  })

  describe('canTransition', () => {
    it('should allow DRAFT to PENDING_REVIEW', () => {
      expect(canTransition('DRAFT', 'PENDING_REVIEW')).toBe(true)
    })

    it('should not allow DRAFT to APPROVED', () => {
      expect(canTransition('DRAFT', 'APPROVED')).toBe(false)
    })

    it('should allow PENDING_REVIEW to REVISION_REQUIRED', () => {
      expect(canTransition('PENDING_REVIEW', 'REVISION_REQUIRED')).toBe(true)
    })

    it('should allow PENDING_REVIEW to PENDING_CUSTOMER_APPROVAL', () => {
      expect(canTransition('PENDING_REVIEW', 'PENDING_CUSTOMER_APPROVAL')).toBe(true)
    })

    it('should allow PENDING_REVIEW to REJECTED', () => {
      expect(canTransition('PENDING_REVIEW', 'REJECTED')).toBe(true)
    })

    it('should allow REVISION_REQUIRED to PENDING_REVIEW', () => {
      expect(canTransition('REVISION_REQUIRED', 'PENDING_REVIEW')).toBe(true)
    })

    it('should allow PENDING_CUSTOMER_APPROVAL to CUSTOMER_REVISION_REQUIRED', () => {
      expect(canTransition('PENDING_CUSTOMER_APPROVAL', 'CUSTOMER_REVISION_REQUIRED')).toBe(true)
    })

    it('should allow PENDING_CUSTOMER_APPROVAL to APPROVED', () => {
      expect(canTransition('PENDING_CUSTOMER_APPROVAL', 'APPROVED')).toBe(true)
    })

    it('should allow APPROVED to PENDING_ADMIN_AUTHORIZATION', () => {
      expect(canTransition('APPROVED', 'PENDING_ADMIN_AUTHORIZATION')).toBe(true)
    })

    it('should allow PENDING_ADMIN_AUTHORIZATION to AUTHORIZED', () => {
      expect(canTransition('PENDING_ADMIN_AUTHORIZATION', 'AUTHORIZED')).toBe(true)
    })

    it('should not allow transitions from terminal states', () => {
      expect(canTransition('AUTHORIZED', 'DRAFT')).toBe(false)
      expect(canTransition('AUTHORIZED', 'PENDING_REVIEW')).toBe(false)
      expect(canTransition('REJECTED', 'DRAFT')).toBe(false)
      expect(canTransition('REJECTED', 'PENDING_REVIEW')).toBe(false)
    })

    it('should handle invalid status gracefully', () => {
      // @ts-expect-error Testing invalid input
      expect(canTransition('INVALID_STATUS', 'DRAFT')).toBe(false)
    })
  })

  describe('isTerminalStatus', () => {
    it('should return true for AUTHORIZED', () => {
      expect(isTerminalStatus('AUTHORIZED')).toBe(true)
    })

    it('should return true for REJECTED', () => {
      expect(isTerminalStatus('REJECTED')).toBe(true)
    })

    it('should return false for non-terminal statuses', () => {
      expect(isTerminalStatus('DRAFT')).toBe(false)
      expect(isTerminalStatus('PENDING_REVIEW')).toBe(false)
      expect(isTerminalStatus('APPROVED')).toBe(false)
      expect(isTerminalStatus('PENDING_CUSTOMER_APPROVAL')).toBe(false)
    })
  })

  describe('requiresCustomerAction', () => {
    it('should return true for PENDING_CUSTOMER_APPROVAL', () => {
      expect(requiresCustomerAction('PENDING_CUSTOMER_APPROVAL')).toBe(true)
    })

    it('should return true for CUSTOMER_REVISION_REQUIRED', () => {
      expect(requiresCustomerAction('CUSTOMER_REVISION_REQUIRED')).toBe(true)
    })

    it('should return false for staff-action statuses', () => {
      expect(requiresCustomerAction('DRAFT')).toBe(false)
      expect(requiresCustomerAction('PENDING_REVIEW')).toBe(false)
      expect(requiresCustomerAction('APPROVED')).toBe(false)
      expect(requiresCustomerAction('AUTHORIZED')).toBe(false)
    })
  })

  describe('requiresStaffAction', () => {
    it('should return true for DRAFT', () => {
      expect(requiresStaffAction('DRAFT')).toBe(true)
    })

    it('should return true for PENDING_REVIEW', () => {
      expect(requiresStaffAction('PENDING_REVIEW')).toBe(true)
    })

    it('should return true for REVISION_REQUIRED', () => {
      expect(requiresStaffAction('REVISION_REQUIRED')).toBe(true)
    })

    it('should return true for PENDING_ADMIN_AUTHORIZATION', () => {
      expect(requiresStaffAction('PENDING_ADMIN_AUTHORIZATION')).toBe(true)
    })

    it('should return false for customer-action statuses', () => {
      expect(requiresStaffAction('PENDING_CUSTOMER_APPROVAL')).toBe(false)
      expect(requiresStaffAction('CUSTOMER_REVISION_REQUIRED')).toBe(false)
    })

    it('should return false for terminal statuses', () => {
      expect(requiresStaffAction('AUTHORIZED')).toBe(false)
      expect(requiresStaffAction('REJECTED')).toBe(false)
    })
  })

  describe('getStatusLabel', () => {
    it('should return human-readable label for DRAFT', () => {
      expect(getStatusLabel('DRAFT')).toBe('Draft')
    })

    it('should return human-readable label for PENDING_REVIEW', () => {
      expect(getStatusLabel('PENDING_REVIEW')).toBe('Pending Review')
    })

    it('should return human-readable label for PENDING_CUSTOMER_APPROVAL', () => {
      expect(getStatusLabel('PENDING_CUSTOMER_APPROVAL')).toBe('Pending Customer Approval')
    })

    it('should return human-readable label for CUSTOMER_REVISION_REQUIRED', () => {
      expect(getStatusLabel('CUSTOMER_REVISION_REQUIRED')).toBe('Customer Revision Required')
    })

    it('should return human-readable label for AUTHORIZED', () => {
      expect(getStatusLabel('AUTHORIZED')).toBe('Authorized')
    })

    it('should return human-readable label for REJECTED', () => {
      expect(getStatusLabel('REJECTED')).toBe('Rejected')
    })

    it('should return all labels correctly', () => {
      const expectedLabels: Record<string, string> = {
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

      for (const [status, label] of Object.entries(expectedLabels)) {
        expect(getStatusLabel(status as keyof typeof CERTIFICATE_STATUSES)).toBe(label)
      }
    })
  })

  describe('getNextStatuses', () => {
    it('should return [PENDING_REVIEW] for DRAFT', () => {
      expect(getNextStatuses('DRAFT')).toEqual(['PENDING_REVIEW'])
    })

    it('should return correct transitions for PENDING_REVIEW', () => {
      expect(getNextStatuses('PENDING_REVIEW')).toEqual([
        'REVISION_REQUIRED',
        'PENDING_CUSTOMER_APPROVAL',
        'REJECTED',
      ])
    })

    it('should return empty array for terminal statuses', () => {
      expect(getNextStatuses('AUTHORIZED')).toEqual([])
      expect(getNextStatuses('REJECTED')).toEqual([])
    })

    it('should return [PENDING_REVIEW] for REVISION_REQUIRED', () => {
      expect(getNextStatuses('REVISION_REQUIRED')).toEqual(['PENDING_REVIEW'])
    })

    it('should match VALID_TRANSITIONS for all statuses', () => {
      for (const status of Object.values(CERTIFICATE_STATUSES)) {
        expect(getNextStatuses(status)).toEqual(VALID_TRANSITIONS[status])
      }
    })
  })
})
