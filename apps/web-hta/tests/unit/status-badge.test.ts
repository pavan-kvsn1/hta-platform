/**
 * Status Badge Logic Unit Tests
 *
 * Tests for status badge rendering logic:
 * - Status label mapping
 * - Status styling (colors)
 * - Fallback behavior for unknown statuses
 *
 * Migrated from hta-calibration/src/components/__tests__/StatusBadge.test.tsx
 * Self-contained version testing logic without React rendering
 */
import { describe, it, expect } from 'vitest'

// Types
type CertificateStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'REVISION_REQUIRED'
  | 'PENDING_CUSTOMER_APPROVAL'
  | 'CUSTOMER_REVISION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | string

interface StatusConfig {
  label: string
  bgClass: string
  textClass: string
}

// Status configuration
const STATUS_CONFIG: Record<string, StatusConfig> = {
  DRAFT: {
    label: 'Draft',
    bgClass: 'bg-gray-100',
    textClass: 'text-gray-700',
  },
  PENDING_REVIEW: {
    label: 'Pending Review',
    bgClass: 'bg-yellow-100',
    textClass: 'text-yellow-800',
  },
  REVISION_REQUIRED: {
    label: 'Revision Required',
    bgClass: 'bg-orange-100',
    textClass: 'text-orange-800',
  },
  PENDING_CUSTOMER_APPROVAL: {
    label: 'Pending Customer',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-800',
  },
  CUSTOMER_REVISION_REQUIRED: {
    label: 'Customer Revision',
    bgClass: 'bg-purple-100',
    textClass: 'text-purple-800',
  },
  APPROVED: {
    label: 'Approved',
    bgClass: 'bg-green-100',
    textClass: 'text-green-800',
  },
  REJECTED: {
    label: 'Rejected',
    bgClass: 'bg-red-100',
    textClass: 'text-red-800',
  },
}

// Logic functions
function getStatusLabel(status: CertificateStatus): string {
  return STATUS_CONFIG[status]?.label ?? status
}

function getStatusStyles(status: CertificateStatus): { bgClass: string; textClass: string } {
  const config = STATUS_CONFIG[status]
  if (config) {
    return { bgClass: config.bgClass, textClass: config.textClass }
  }
  // Default fallback styling
  return { bgClass: 'bg-gray-100', textClass: 'text-gray-700' }
}

function getStatusBadgeClasses(status: CertificateStatus, customClass?: string): string {
  const styles = getStatusStyles(status)
  const baseClasses = 'rounded-full px-2 py-1 text-xs font-medium'
  const classes = [baseClasses, styles.bgClass, styles.textClass]

  if (customClass) {
    classes.push(customClass)
  }

  return classes.join(' ')
}

describe('StatusBadge Logic', () => {
  describe('getStatusLabel', () => {
    it('returns "Draft" for DRAFT status', () => {
      expect(getStatusLabel('DRAFT')).toBe('Draft')
    })

    it('returns "Pending Review" for PENDING_REVIEW status', () => {
      expect(getStatusLabel('PENDING_REVIEW')).toBe('Pending Review')
    })

    it('returns "Revision Required" for REVISION_REQUIRED status', () => {
      expect(getStatusLabel('REVISION_REQUIRED')).toBe('Revision Required')
    })

    it('returns "Pending Customer" for PENDING_CUSTOMER_APPROVAL status', () => {
      expect(getStatusLabel('PENDING_CUSTOMER_APPROVAL')).toBe('Pending Customer')
    })

    it('returns "Customer Revision" for CUSTOMER_REVISION_REQUIRED status', () => {
      expect(getStatusLabel('CUSTOMER_REVISION_REQUIRED')).toBe('Customer Revision')
    })

    it('returns "Approved" for APPROVED status', () => {
      expect(getStatusLabel('APPROVED')).toBe('Approved')
    })

    it('returns "Rejected" for REJECTED status', () => {
      expect(getStatusLabel('REJECTED')).toBe('Rejected')
    })

    it('returns status as-is for unknown status', () => {
      expect(getStatusLabel('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS')
    })
  })

  describe('getStatusStyles', () => {
    it('returns gray colors for DRAFT status', () => {
      const styles = getStatusStyles('DRAFT')
      expect(styles.bgClass).toBe('bg-gray-100')
      expect(styles.textClass).toBe('text-gray-700')
    })

    it('returns green colors for APPROVED status', () => {
      const styles = getStatusStyles('APPROVED')
      expect(styles.bgClass).toBe('bg-green-100')
      expect(styles.textClass).toBe('text-green-800')
    })

    it('returns red colors for REJECTED status', () => {
      const styles = getStatusStyles('REJECTED')
      expect(styles.bgClass).toBe('bg-red-100')
      expect(styles.textClass).toBe('text-red-800')
    })

    it('returns yellow colors for PENDING_REVIEW status', () => {
      const styles = getStatusStyles('PENDING_REVIEW')
      expect(styles.bgClass).toBe('bg-yellow-100')
      expect(styles.textClass).toBe('text-yellow-800')
    })

    it('returns orange colors for REVISION_REQUIRED status', () => {
      const styles = getStatusStyles('REVISION_REQUIRED')
      expect(styles.bgClass).toBe('bg-orange-100')
      expect(styles.textClass).toBe('text-orange-800')
    })

    it('returns blue colors for PENDING_CUSTOMER_APPROVAL status', () => {
      const styles = getStatusStyles('PENDING_CUSTOMER_APPROVAL')
      expect(styles.bgClass).toBe('bg-blue-100')
      expect(styles.textClass).toBe('text-blue-800')
    })

    it('returns purple colors for CUSTOMER_REVISION_REQUIRED status', () => {
      const styles = getStatusStyles('CUSTOMER_REVISION_REQUIRED')
      expect(styles.bgClass).toBe('bg-purple-100')
      expect(styles.textClass).toBe('text-purple-800')
    })

    it('returns default gray colors for unknown status', () => {
      const styles = getStatusStyles('UNKNOWN_STATUS')
      expect(styles.bgClass).toBe('bg-gray-100')
      expect(styles.textClass).toBe('text-gray-700')
    })
  })

  describe('getStatusBadgeClasses', () => {
    it('includes base classes', () => {
      const classes = getStatusBadgeClasses('DRAFT')
      expect(classes).toContain('rounded-full')
      expect(classes).toContain('px-2')
      expect(classes).toContain('py-1')
      expect(classes).toContain('text-xs')
      expect(classes).toContain('font-medium')
    })

    it('includes status-specific colors', () => {
      const classes = getStatusBadgeClasses('APPROVED')
      expect(classes).toContain('bg-green-100')
      expect(classes).toContain('text-green-800')
    })

    it('includes custom class when provided', () => {
      const classes = getStatusBadgeClasses('DRAFT', 'custom-class')
      expect(classes).toContain('custom-class')
      expect(classes).toContain('rounded-full') // Still has base classes
    })

    it('works without custom class', () => {
      const classes = getStatusBadgeClasses('REJECTED')
      expect(classes).toContain('bg-red-100')
      expect(classes).toContain('text-red-800')
    })
  })

  describe('STATUS_CONFIG completeness', () => {
    it('has configuration for all known statuses', () => {
      const knownStatuses: CertificateStatus[] = [
        'DRAFT',
        'PENDING_REVIEW',
        'REVISION_REQUIRED',
        'PENDING_CUSTOMER_APPROVAL',
        'CUSTOMER_REVISION_REQUIRED',
        'APPROVED',
        'REJECTED',
      ]

      for (const status of knownStatuses) {
        expect(STATUS_CONFIG[status]).toBeDefined()
        expect(STATUS_CONFIG[status].label).toBeDefined()
        expect(STATUS_CONFIG[status].bgClass).toBeDefined()
        expect(STATUS_CONFIG[status].textClass).toBeDefined()
      }
    })

    it('all configs have unique labels', () => {
      const labels = Object.values(STATUS_CONFIG).map((c) => c.label)
      const uniqueLabels = new Set(labels)
      expect(uniqueLabels.size).toBe(labels.length)
    })
  })
})
