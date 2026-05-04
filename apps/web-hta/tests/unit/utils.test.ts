/**
 * Utility Functions Unit Tests
 *
 * Tests for business logic utilities in src/lib/utils/:
 * - certificate-status: transitions, terminal states, customer/staff action required
 * - change-detection: field changes, parameter changes, change summary
 * - tat-calculator: calculateCertificateTAT, aggregateTATMetrics, compareWeeklyMetrics
 * - user-tat-calculator: calculateReviewerMetrics, calculateEngineerMetrics
 *
 * Imports actual source modules for real coverage.
 */
import { describe, it, expect, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// 1. Certificate status utilities (actual imports for coverage)
// ---------------------------------------------------------------------------
import {
  canTransition,
  isTerminalStatus,
  requiresCustomerAction,
  requiresStaffAction,
  getStatusLabel,
  getNextStatuses,
  CERTIFICATE_STATUSES,
  VALID_TRANSITIONS,
} from '@/lib/utils/certificate-status'

describe('Certificate Status Utilities', () => {
  describe('CERTIFICATE_STATUSES', () => {
    it('defines all expected statuses', () => {
      expect(CERTIFICATE_STATUSES.DRAFT).toBe('DRAFT')
      expect(CERTIFICATE_STATUSES.AUTHORIZED).toBe('AUTHORIZED')
      expect(CERTIFICATE_STATUSES.REJECTED).toBe('REJECTED')
    })

    it('has 10 distinct statuses', () => {
      expect(Object.keys(CERTIFICATE_STATUSES)).toHaveLength(10)
    })
  })

  describe('canTransition', () => {
    it('DRAFT can transition to PENDING_REVIEW', () => {
      expect(canTransition('DRAFT', 'PENDING_REVIEW')).toBe(true)
    })

    it('DRAFT cannot transition to AUTHORIZED', () => {
      expect(canTransition('DRAFT', 'AUTHORIZED')).toBe(false)
    })

    it('PENDING_REVIEW can transition to REVISION_REQUIRED', () => {
      expect(canTransition('PENDING_REVIEW', 'REVISION_REQUIRED')).toBe(true)
    })

    it('PENDING_REVIEW can transition to PENDING_CUSTOMER_APPROVAL', () => {
      expect(canTransition('PENDING_REVIEW', 'PENDING_CUSTOMER_APPROVAL')).toBe(true)
    })

    it('PENDING_REVIEW can transition to REJECTED', () => {
      expect(canTransition('PENDING_REVIEW', 'REJECTED')).toBe(true)
    })

    it('REVISION_REQUIRED can go back to PENDING_REVIEW', () => {
      expect(canTransition('REVISION_REQUIRED', 'PENDING_REVIEW')).toBe(true)
    })

    it('AUTHORIZED has no valid transitions', () => {
      expect(canTransition('AUTHORIZED', 'DRAFT')).toBe(false)
    })

    it('REJECTED has no valid transitions', () => {
      expect(canTransition('REJECTED', 'PENDING_REVIEW')).toBe(false)
    })

    it('APPROVED can move to PENDING_ADMIN_AUTHORIZATION', () => {
      expect(canTransition('APPROVED', 'PENDING_ADMIN_AUTHORIZATION')).toBe(true)
    })

    it('CUSTOMER_REVIEW_EXPIRED can go back to PENDING_CUSTOMER_APPROVAL', () => {
      expect(canTransition('CUSTOMER_REVIEW_EXPIRED', 'PENDING_CUSTOMER_APPROVAL')).toBe(true)
    })
  })

  describe('isTerminalStatus', () => {
    it('AUTHORIZED is terminal', () => {
      expect(isTerminalStatus('AUTHORIZED')).toBe(true)
    })

    it('REJECTED is terminal', () => {
      expect(isTerminalStatus('REJECTED')).toBe(true)
    })

    it('DRAFT is not terminal', () => {
      expect(isTerminalStatus('DRAFT')).toBe(false)
    })

    it('PENDING_REVIEW is not terminal', () => {
      expect(isTerminalStatus('PENDING_REVIEW')).toBe(false)
    })

    it('APPROVED is not terminal', () => {
      expect(isTerminalStatus('APPROVED')).toBe(false)
    })
  })

  describe('requiresCustomerAction', () => {
    it('PENDING_CUSTOMER_APPROVAL requires customer action', () => {
      expect(requiresCustomerAction('PENDING_CUSTOMER_APPROVAL')).toBe(true)
    })

    it('CUSTOMER_REVISION_REQUIRED requires customer action', () => {
      expect(requiresCustomerAction('CUSTOMER_REVISION_REQUIRED')).toBe(true)
    })

    it('DRAFT does not require customer action', () => {
      expect(requiresCustomerAction('DRAFT')).toBe(false)
    })

    it('PENDING_REVIEW does not require customer action', () => {
      expect(requiresCustomerAction('PENDING_REVIEW')).toBe(false)
    })

    it('AUTHORIZED does not require customer action', () => {
      expect(requiresCustomerAction('AUTHORIZED')).toBe(false)
    })
  })

  describe('requiresStaffAction', () => {
    it('DRAFT requires staff action', () => {
      expect(requiresStaffAction('DRAFT')).toBe(true)
    })

    it('PENDING_REVIEW requires staff action', () => {
      expect(requiresStaffAction('PENDING_REVIEW')).toBe(true)
    })

    it('REVISION_REQUIRED requires staff action', () => {
      expect(requiresStaffAction('REVISION_REQUIRED')).toBe(true)
    })

    it('PENDING_ADMIN_AUTHORIZATION requires staff action', () => {
      expect(requiresStaffAction('PENDING_ADMIN_AUTHORIZATION')).toBe(true)
    })

    it('CUSTOMER_REVIEW_EXPIRED requires staff action', () => {
      expect(requiresStaffAction('CUSTOMER_REVIEW_EXPIRED')).toBe(true)
    })

    it('PENDING_CUSTOMER_APPROVAL does not require staff action', () => {
      expect(requiresStaffAction('PENDING_CUSTOMER_APPROVAL')).toBe(false)
    })

    it('AUTHORIZED does not require staff action', () => {
      expect(requiresStaffAction('AUTHORIZED')).toBe(false)
    })
  })

  describe('getStatusLabel', () => {
    it('returns human-readable label for DRAFT', () => {
      expect(getStatusLabel('DRAFT')).toBe('Draft')
    })

    it('returns human-readable label for PENDING_REVIEW', () => {
      expect(getStatusLabel('PENDING_REVIEW')).toBe('Pending Review')
    })

    it('returns human-readable label for REVISION_REQUIRED', () => {
      expect(getStatusLabel('REVISION_REQUIRED')).toBe('Revision Required')
    })

    it('returns human-readable label for PENDING_CUSTOMER_APPROVAL', () => {
      expect(getStatusLabel('PENDING_CUSTOMER_APPROVAL')).toBe('Pending Customer Approval')
    })

    it('returns human-readable label for AUTHORIZED', () => {
      expect(getStatusLabel('AUTHORIZED')).toBe('Authorized')
    })

    it('returns human-readable label for REJECTED', () => {
      expect(getStatusLabel('REJECTED')).toBe('Rejected')
    })

    it('returns human-readable label for CUSTOMER_REVIEW_EXPIRED', () => {
      expect(getStatusLabel('CUSTOMER_REVIEW_EXPIRED')).toBe('Review Expired')
    })
  })

  describe('getNextStatuses', () => {
    it('returns valid transitions for DRAFT', () => {
      expect(getNextStatuses('DRAFT')).toEqual(['PENDING_REVIEW'])
    })

    it('returns multiple transitions for PENDING_REVIEW', () => {
      const next = getNextStatuses('PENDING_REVIEW')
      expect(next).toContain('REVISION_REQUIRED')
      expect(next).toContain('PENDING_CUSTOMER_APPROVAL')
      expect(next).toContain('REJECTED')
    })

    it('returns empty array for AUTHORIZED', () => {
      expect(getNextStatuses('AUTHORIZED')).toEqual([])
    })

    it('returns empty array for REJECTED', () => {
      expect(getNextStatuses('REJECTED')).toEqual([])
    })
  })

  describe('VALID_TRANSITIONS completeness', () => {
    it('every status has a defined transition list', () => {
      const allStatuses = Object.values(CERTIFICATE_STATUSES)
      for (const status of allStatuses) {
        expect(VALID_TRANSITIONS[status]).toBeDefined()
        expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Change detection utilities (actual imports for coverage)
// ---------------------------------------------------------------------------
import {
  detectCertificateChanges,
  generateChangeSummary,
  FIELD_LABELS,
  PARAMETER_FIELD_LABELS,
} from '@/lib/utils/change-detection'

describe('Change Detection Utilities', () => {
  describe('FIELD_LABELS', () => {
    it('has label and section for customerName', () => {
      expect(FIELD_LABELS.customerName.label).toBe('Customer Name')
      expect(FIELD_LABELS.customerName.section).toBe('summary')
    })

    it('has label for uucDescription', () => {
      expect(FIELD_LABELS.uucDescription.label).toBe('UUC Description')
    })

    it('has at least 10 entries', () => {
      expect(Object.keys(FIELD_LABELS).length).toBeGreaterThanOrEqual(10)
    })
  })

  describe('PARAMETER_FIELD_LABELS', () => {
    it('has entry for parameterName', () => {
      expect(PARAMETER_FIELD_LABELS.parameterName).toBe('Parameter Name')
    })

    it('has entry for accuracyValue', () => {
      expect(PARAMETER_FIELD_LABELS.accuracyValue).toBe('Accuracy Value')
    })
  })

  describe('detectCertificateChanges', () => {
    it('returns hasChanges=false when records are identical', () => {
      const cert = { customerName: 'Acme Corp', srfNumber: 'SRF-001', parameters: [] }
      const result = detectCertificateChanges(cert, cert)
      expect(result.hasChanges).toBe(false)
      expect(result.certificateFields).toHaveLength(0)
    })

    it('detects a changed customerName', () => {
      const existing = { customerName: 'Old Name', parameters: [] }
      const incoming = { customerName: 'New Name', parameters: [] }
      const result = detectCertificateChanges(existing, incoming)

      expect(result.hasChanges).toBe(true)
      const change = result.certificateFields.find((c) => c.field === 'customerName')
      expect(change).toBeDefined()
      expect(change!.previousValue).toBe('Old Name')
      expect(change!.newValue).toBe('New Name')
    })

    it('treats null and empty string as equal (no change)', () => {
      const existing = { customerName: null, parameters: [] }
      const incoming = { customerName: '', parameters: [] }
      const result = detectCertificateChanges(existing as Record<string, unknown>, incoming)
      expect(result.certificateFields.find((c) => c.field === 'customerName')).toBeUndefined()
    })

    it('treats null and undefined as equal (no change)', () => {
      const existing = { customerName: null, parameters: [] }
      const incoming = { customerName: undefined, parameters: [] }
      const result = detectCertificateChanges(existing as Record<string, unknown>, incoming as Record<string, unknown>)
      expect(result.certificateFields.find((c) => c.field === 'customerName')).toBeUndefined()
    })

    it('detects boolean change', () => {
      const existing = { dueDateNotApplicable: false, parameters: [] }
      const incoming = { dueDateNotApplicable: true, parameters: [] }
      const result = detectCertificateChanges(existing, incoming)
      const change = result.certificateFields.find((c) => c.field === 'dueDateNotApplicable')
      expect(change).toBeDefined()
      expect(change!.previousValue).toBe('No')
      expect(change!.newValue).toBe('Yes')
    })

    it('detects new parameter added', () => {
      const existing = { parameters: [{ id: 'p1', parameterName: 'Temp' }] }
      const incoming = {
        parameters: [
          { id: 'p1', parameterName: 'Temp', dbId: 'p1' },
          { parameterName: 'Pressure' },
        ],
      }
      const result = detectCertificateChanges(existing, incoming)
      const added = result.parameters.find((p) => p.type === 'ADDED')
      expect(added).toBeDefined()
      expect(added!.parameterName).toBe('Pressure')
    })

    it('detects parameter deletion', () => {
      const existing = {
        parameters: [
          { id: 'p1', parameterName: 'Temp' },
          { id: 'p2', parameterName: 'Pressure' },
        ],
      }
      const incoming = {
        parameters: [{ id: 'p1', parameterName: 'Temp', dbId: 'p1' }],
      }
      const result = detectCertificateChanges(existing, incoming)
      const deleted = result.parameters.find((p) => p.type === 'DELETED')
      expect(deleted).toBeDefined()
      expect(deleted!.parameterName).toBe('Pressure')
    })

    it('detects parameter modification', () => {
      const existing = {
        parameters: [{ id: 'p1', parameterName: 'Temperature', parameterUnit: '°C' }],
      }
      const incoming = {
        parameters: [{ dbId: 'p1', parameterName: 'Temperature', parameterUnit: '°F' }],
      }
      const result = detectCertificateChanges(existing, incoming)
      const modified = result.parameters.find((p) => p.type === 'MODIFIED')
      expect(modified).toBeDefined()
    })

    it('normalizes date strings to YYYY-MM-DD for comparison', () => {
      const existing = { srfDate: '2024-01-15T00:00:00.000Z', parameters: [] }
      const incoming = { srfDate: '2024-01-15', parameters: [] }
      const result = detectCertificateChanges(existing, incoming)
      const change = result.certificateFields.find((c) => c.field === 'srfDate')
      expect(change).toBeUndefined() // Same date, no change
    })
  })

  describe('generateChangeSummary', () => {
    it('returns "No changes" for empty change set', () => {
      const changeSet = { certificateFields: [], parameters: [], results: [], hasChanges: false }
      expect(generateChangeSummary(changeSet)).toBe('No changes')
    })

    it('includes field count in summary', () => {
      const changeSet = {
        certificateFields: [
          { field: 'customerName', fieldLabel: 'Customer Name', previousValue: 'Old', newValue: 'New', section: 'summary' },
          { field: 'srfNumber', fieldLabel: 'SRF Number', previousValue: 'SRF-001', newValue: 'SRF-002', section: 'summary' },
        ],
        parameters: [],
        results: [],
        hasChanges: true,
      }
      expect(generateChangeSummary(changeSet)).toContain('2 fields')
    })

    it('includes added parameter count', () => {
      const changeSet = {
        certificateFields: [],
        parameters: [{ type: 'ADDED' as const, parameterName: 'Pressure' }],
        results: [],
        hasChanges: true,
      }
      expect(generateChangeSummary(changeSet)).toContain('1 parameter added')
    })

    it('includes plural for multiple added parameters', () => {
      const changeSet = {
        certificateFields: [],
        parameters: [
          { type: 'ADDED' as const, parameterName: 'Pressure' },
          { type: 'ADDED' as const, parameterName: 'Humidity' },
        ],
        results: [],
        hasChanges: true,
      }
      expect(generateChangeSummary(changeSet)).toContain('2 parameters added')
    })

    it('includes deleted parameter count', () => {
      const changeSet = {
        certificateFields: [],
        parameters: [{ type: 'DELETED' as const, parameterName: 'Old Param', parameterId: 'p1' }],
        results: [],
        hasChanges: true,
      }
      expect(generateChangeSummary(changeSet)).toContain('1 parameter deleted')
    })

    it('combines field and parameter changes in one summary', () => {
      const changeSet = {
        certificateFields: [
          { field: 'customerName', fieldLabel: 'Customer Name', previousValue: 'Old', newValue: 'New', section: 'summary' },
        ],
        parameters: [{ type: 'ADDED' as const, parameterName: 'Pressure' }],
        results: [],
        hasChanges: true,
      }
      const summary = generateChangeSummary(changeSet)
      expect(summary).toContain('1 field')
      expect(summary).toContain('1 parameter added')
    })

    it('uses singular form for one field', () => {
      const changeSet = {
        certificateFields: [
          { field: 'customerName', fieldLabel: 'Customer Name', previousValue: 'Old', newValue: 'New', section: 'summary' },
        ],
        parameters: [],
        results: [],
        hasChanges: true,
      }
      const summary = generateChangeSummary(changeSet)
      // singular: "1 field" not "1 fields"
      expect(summary).toMatch(/\b1 field\b/)
    })
  })
})

// ---------------------------------------------------------------------------
// 3. TAT calculator (actual imports for coverage)
// ---------------------------------------------------------------------------
import {
  calculateCertificateTAT,
  aggregateTATMetrics,
  compareWeeklyMetrics,
} from '@/lib/utils/tat-calculator'

describe('TAT Calculator', () => {
  function makeEvent(id: string, eventType: string, createdAt: Date, certificateId = 'cert-1') {
    return { id, eventType, createdAt, certificateId }
  }

  describe('calculateCertificateTAT', () => {
    it('returns null for empty events', () => {
      expect(calculateCertificateTAT([])).toBeNull()
    })

    it('calculates total TAT for a complete certificate', () => {
      const now = new Date()
      const submitTime = new Date(now.getTime() - 48 * 60 * 60 * 1000) // 48h ago
      const authorizeTime = new Date(now.getTime() - 2 * 60 * 60 * 1000) // 2h ago

      const events = [
        makeEvent('e1', 'SUBMITTED_FOR_REVIEW', submitTime),
        makeEvent('e2', 'REVIEWER_APPROVED', new Date(submitTime.getTime() + 8 * 3600000)),
        makeEvent('e3', 'SENT_TO_CUSTOMER', new Date(submitTime.getTime() + 10 * 3600000)),
        makeEvent('e4', 'CUSTOMER_APPROVED', new Date(submitTime.getTime() + 30 * 3600000)),
        makeEvent('e5', 'ADMIN_AUTHORIZED', authorizeTime),
      ]

      const result = calculateCertificateTAT(events)
      expect(result).not.toBeNull()
      expect(result!.totalTAT.isComplete).toBe(true)
      expect(result!.totalTAT.hours).toBeGreaterThan(0)
    })

    it('marks TAT as incomplete when not yet authorized', () => {
      const submitTime = new Date(Date.now() - 2 * 3600000)
      const events = [makeEvent('e1', 'SUBMITTED_FOR_REVIEW', submitTime)]
      const result = calculateCertificateTAT(events)
      expect(result!.totalTAT.isComplete).toBe(false)
      expect(result!.totalTAT.hours).toBeGreaterThan(0)
    })

    it('sets certificateId from first event', () => {
      const events = [makeEvent('e1', 'SUBMITTED_FOR_REVIEW', new Date(), 'cert-abc')]
      const result = calculateCertificateTAT(events)
      expect(result!.certificateId).toBe('cert-abc')
    })

    it('calculates reviewer stage TAT', () => {
      const base = new Date('2024-01-15T08:00:00Z')
      const submitTime = base
      const approveTime = new Date(base.getTime() + 4 * 3600000) // 4h later

      const events = [
        makeEvent('e1', 'SUBMITTED_FOR_REVIEW', submitTime),
        makeEvent('e2', 'REVIEWER_APPROVED', approveTime),
      ]

      const result = calculateCertificateTAT(events)
      expect(result!.reviewer.cycleCount).toBe(1)
      expect(result!.reviewer.totalHours).toBeCloseTo(4, 0)
      expect(result!.reviewer.avgHours).toBeCloseTo(4, 0)
    })

    it('calculates revision cycle TAT', () => {
      const base = new Date('2024-01-15T08:00:00Z')
      const events = [
        makeEvent('e1', 'SUBMITTED_FOR_REVIEW', base),
        makeEvent('e2', 'REVISION_REQUESTED', new Date(base.getTime() + 2 * 3600000)),
        makeEvent('e3', 'RESUBMITTED_FOR_REVIEW', new Date(base.getTime() + 5 * 3600000)),
        makeEvent('e4', 'REVIEWER_APPROVED', new Date(base.getTime() + 8 * 3600000)),
      ]

      const result = calculateCertificateTAT(events)
      expect(result!.reviewer.cycleCount).toBe(2)
      expect(result!.engineerRevision.cycleCount).toBe(1)
    })

    it('calculates customer stage TAT', () => {
      const base = new Date('2024-01-15T08:00:00Z')
      const events = [
        makeEvent('e1', 'SUBMITTED_FOR_REVIEW', base),
        makeEvent('e2', 'REVIEWER_APPROVED', new Date(base.getTime() + 2 * 3600000)),
        makeEvent('e3', 'SENT_TO_CUSTOMER', new Date(base.getTime() + 3 * 3600000)),
        makeEvent('e4', 'CUSTOMER_APPROVED', new Date(base.getTime() + 7 * 3600000)),
      ]

      const result = calculateCertificateTAT(events)
      expect(result!.customer.cycleCount).toBe(1)
      expect(result!.customer.totalHours).toBeCloseTo(4, 0)
    })

    it('initializes all stage metrics', () => {
      const events = [makeEvent('e1', 'SUBMITTED_FOR_REVIEW', new Date())]
      const result = calculateCertificateTAT(events)
      expect(result!.reviewer).toHaveProperty('totalHours')
      expect(result!.reviewer).toHaveProperty('cycleCount')
      expect(result!.reviewer).toHaveProperty('avgHours')
      expect(result!.engineerRevision).toHaveProperty('totalHours')
      expect(result!.customer).toHaveProperty('totalHours')
      expect(result!.customerRevision).toHaveProperty('totalHours')
      expect(result!.adminApproval).toHaveProperty('totalHours')
    })
  })

  describe('aggregateTATMetrics', () => {
    it('returns zeroed metrics for empty list', () => {
      const result = aggregateTATMetrics([])
      expect(result.certificateCount).toBe(0)
      expect(result.totalTAT.avgHours).toBe(0)
    })

    it('counts completed certificates', () => {
      const base = new Date('2024-01-15T08:00:00Z')
      const events = [
        makeEvent('e1', 'SUBMITTED_FOR_REVIEW', base),
        makeEvent('e2', 'ADMIN_AUTHORIZED', new Date(base.getTime() + 24 * 3600000)),
      ]
      const cert = calculateCertificateTAT(events)!
      const result = aggregateTATMetrics([cert])
      expect(result.totalTAT.completedCount).toBe(1)
      expect(result.certificateCount).toBe(1)
    })

    it('flags overdue when TAT > 48 hours', () => {
      const base = new Date('2024-01-15T08:00:00Z')
      const events = [
        makeEvent('e1', 'SUBMITTED_FOR_REVIEW', base),
        makeEvent('e2', 'ADMIN_AUTHORIZED', new Date(base.getTime() + 72 * 3600000)), // 72h overdue
      ]
      const cert = calculateCertificateTAT(events)!
      const result = aggregateTATMetrics([cert])
      expect(result.totalTAT.overdueCount).toBe(1)
    })

    it('does not flag overdue when TAT <= 48 hours', () => {
      const base = new Date('2024-01-15T08:00:00Z')
      const events = [
        makeEvent('e1', 'SUBMITTED_FOR_REVIEW', base),
        makeEvent('e2', 'ADMIN_AUTHORIZED', new Date(base.getTime() + 24 * 3600000)), // 24h ok
      ]
      const cert = calculateCertificateTAT(events)!
      const result = aggregateTATMetrics([cert])
      expect(result.totalTAT.overdueCount).toBe(0)
    })

    it('aggregates multiple certificates', () => {
      const base = new Date('2024-01-15T08:00:00Z')
      function makeCert(hours: number) {
        return calculateCertificateTAT([
          makeEvent(`e1-${hours}`, 'SUBMITTED_FOR_REVIEW', base, `cert-${hours}`),
          makeEvent(`e2-${hours}`, 'ADMIN_AUTHORIZED', new Date(base.getTime() + hours * 3600000), `cert-${hours}`),
        ])!
      }
      const result = aggregateTATMetrics([makeCert(24), makeCert(48)])
      expect(result.certificateCount).toBe(2)
      expect(result.totalTAT.completedCount).toBe(2)
      expect(result.totalTAT.avgHours).toBe(36) // (24 + 48) / 2
    })
  })

  describe('compareWeeklyMetrics', () => {
    it('returns thisWeek and lastWeek data', () => {
      const empty = aggregateTATMetrics([])
      const result = compareWeeklyMetrics(empty, empty)
      expect(result.thisWeek).toBeDefined()
      expect(result.lastWeek).toBeDefined()
      expect(result.changes).toBeDefined()
    })

    it('calculates total TAT change', () => {
      const base = new Date('2024-01-15T08:00:00Z')
      function makeCert(hours: number, certId: string) {
        return calculateCertificateTAT([
          makeEvent(`s-${certId}`, 'SUBMITTED_FOR_REVIEW', base, certId),
          makeEvent(`a-${certId}`, 'ADMIN_AUTHORIZED', new Date(base.getTime() + hours * 3600000), certId),
        ])!
      }

      const thisWeek = aggregateTATMetrics([makeCert(20, 'c1')])
      const lastWeek = aggregateTATMetrics([makeCert(40, 'c2')])
      const result = compareWeeklyMetrics(thisWeek, lastWeek)

      expect(result.changes.totalTAT.hours).toBe(-20) // improved by 20h
      expect(result.changes.totalTAT.percent).toBe(-50) // 50% faster
    })

    it('handles zero-comparison gracefully', () => {
      const empty = aggregateTATMetrics([])
      const result = compareWeeklyMetrics(empty, empty)
      expect(result.changes.totalTAT.percent).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// 4. User TAT Calculator (actual imports for coverage)
// ---------------------------------------------------------------------------
import {
  calculateReviewerMetrics,
  calculateEngineerMetrics,
  calculateAuthorizerMetrics,
  calculateUserTATMetrics,
} from '@/lib/utils/user-tat-calculator'

describe('User TAT Calculator', () => {
  const now = new Date()
  const periodStart = new Date(now.getTime() - 30 * 24 * 3600000)
  const previousPeriodStart = new Date(now.getTime() - 60 * 24 * 3600000)

  function makeEvent(id: string, type: string, hoursAgo: number, certId = 'cert-1') {
    return { id, eventType: type, createdAt: new Date(Date.now() - hoursAgo * 3600000), certificateId: certId }
  }

  function makeCert(id: string, createdById: string, reviewerId: string | null, status = 'AUTHORIZED', events = [] as ReturnType<typeof makeEvent>[]) {
    return { id, status, currentRevision: 1, createdById, reviewerId, events }
  }

  describe('calculateReviewerMetrics', () => {
    it('returns null when no certificates reviewed by user', () => {
      const certs = [makeCert('c1', 'user-engineer', 'other-reviewer')]
      const result = calculateReviewerMetrics(certs, 'user-reviewer', periodStart, previousPeriodStart)
      expect(result).toBeNull()
    })

    it('returns metrics when user has reviewed certificates', () => {
      const events = [
        makeEvent('e1', 'SUBMITTED_FOR_REVIEW', 100),
        makeEvent('e2', 'REVIEWER_APPROVED', 96),
      ]
      const certs = [makeCert('c1', 'engineer-1', 'reviewer-1', 'AUTHORIZED', events)]
      const result = calculateReviewerMetrics(certs, 'reviewer-1', periodStart, previousPeriodStart)
      expect(result).not.toBeNull()
      expect(result!.internal).toBeDefined()
      expect(result!.customer).toBeDefined()
    })

    it('counts revision cycles', () => {
      const events = [
        makeEvent('e1', 'SUBMITTED_FOR_REVIEW', 200),
        makeEvent('e2', 'REVISION_REQUESTED', 196),
        makeEvent('e3', 'RESUBMITTED_FOR_REVIEW', 192),
        makeEvent('e4', 'REVIEWER_APPROVED', 188),
      ]
      const certs = [makeCert('c1', 'engineer-1', 'reviewer-1', 'AUTHORIZED', events)]
      const result = calculateReviewerMetrics(certs, 'reviewer-1', periodStart, previousPeriodStart)
      expect(result!.internal.sentForRevision).toBe(1)
    })
  })

  describe('calculateEngineerMetrics', () => {
    it('returns null when no certificates created by user', () => {
      const certs = [makeCert('c1', 'other-engineer', null)]
      const result = calculateEngineerMetrics(certs, 'engineer-1', periodStart, previousPeriodStart)
      expect(result).toBeNull()
    })

    it('returns metrics when user has created certificates', () => {
      const events = [makeEvent('e1', 'SUBMITTED_FOR_REVIEW', 50)]
      const certs = [makeCert('c1', 'engineer-1', null, 'AUTHORIZED', events)]
      const result = calculateEngineerMetrics(certs, 'engineer-1', periodStart, previousPeriodStart)
      expect(result).not.toBeNull()
      expect(result!.internal.totalCreated).toBe(1)
    })

    it('categorizes approved-first-pass correctly', () => {
      const events = [makeEvent('e1', 'SUBMITTED_FOR_REVIEW', 50)]
      const certs = [makeCert('c1', 'engineer-1', null, 'AUTHORIZED', events)]
      const result = calculateEngineerMetrics(certs, 'engineer-1', periodStart, previousPeriodStart)
      expect(result!.internal.approvedFirstPass).toBe(1)
    })
  })

  describe('calculateAuthorizerMetrics', () => {
    it('returns null when no authorized certificates', () => {
      const certs = [makeCert('c1', 'eng', null, 'PENDING_REVIEW')]
      const result = calculateAuthorizerMetrics(certs, 'admin-1', periodStart, previousPeriodStart)
      expect(result).toBeNull()
    })

    it('calculates authorization time', () => {
      const base = Date.now()
      const events = [
        makeEvent('e1', 'CUSTOMER_APPROVED', 100),
        makeEvent('e2', 'ADMIN_AUTHORIZED', 95), // 5h later
      ]
      const certs = [makeCert('c1', 'eng', null, 'AUTHORIZED', events)]
      const result = calculateAuthorizerMetrics(certs, 'admin-1', periodStart, previousPeriodStart)
      expect(result).not.toBeNull()
      expect(result!.avgAuthorizationTimeHours).toBeGreaterThanOrEqual(0)
    })
  })

  describe('calculateUserTATMetrics', () => {
    it('returns combined metrics structure', () => {
      const certs = [makeCert('c1', 'user-1', 'reviewer-1')]
      const result = calculateUserTATMetrics(certs, 'user-1', 30)
      expect(result).toHaveProperty('asReviewer')
      expect(result).toHaveProperty('asEngineer')
      expect(result).toHaveProperty('asAuthorizer')
      expect(result.periodDays).toBe(30)
    })

    it('uses default period of 30 days', () => {
      const result = calculateUserTATMetrics([], 'user-1')
      expect(result.periodDays).toBe(30)
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Route Guard pure utilities
// ---------------------------------------------------------------------------

// Mock next/navigation and @/lib/auth to avoid server-side dependencies
import { vi } from 'vitest'
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
  isMasterAdmin: vi.fn((user: { adminType?: string }) => user?.adminType === 'MASTER'),
  isAdmin: vi.fn((user: { role?: string }) => user?.role === 'ADMIN'),
  canReviewCertificate: vi.fn(() => false),
}))

import { getRoleDisplayName, isNewWorkflowEnabled } from '@/lib/utils/route-guards'

describe('getRoleDisplayName', () => {
  it('returns Master Admin for ADMIN with adminType MASTER', () => {
    expect(getRoleDisplayName({ id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN', adminType: 'MASTER' })).toBe('Master Admin')
  })

  it('returns Worker Admin for ADMIN with adminType WORKER', () => {
    expect(getRoleDisplayName({ id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN', adminType: 'WORKER' })).toBe('Worker Admin')
  })

  it('returns Admin for ADMIN with no adminType', () => {
    expect(getRoleDisplayName({ id: '1', email: 'a@b.com', name: 'A', role: 'ADMIN' })).toBe('Admin')
  })

  it('returns Engineer for ENGINEER role', () => {
    expect(getRoleDisplayName({ id: '1', email: 'a@b.com', name: 'A', role: 'ENGINEER' })).toBe('Engineer')
  })

  it('returns Customer for CUSTOMER role', () => {
    expect(getRoleDisplayName({ id: '1', email: 'a@b.com', name: 'A', role: 'CUSTOMER' })).toBe('Customer')
  })

  it('returns role as-is for unknown roles', () => {
    expect(getRoleDisplayName({ id: '1', email: 'a@b.com', name: 'A', role: 'UNKNOWN_ROLE' })).toBe('UNKNOWN_ROLE')
  })
})

describe('isNewWorkflowEnabled', () => {
  const originalEnv = process.env.FEATURE_NEW_WORKFLOW

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FEATURE_NEW_WORKFLOW
    } else {
      process.env.FEATURE_NEW_WORKFLOW = originalEnv
    }
  })

  it('returns true when FEATURE_NEW_WORKFLOW is "true"', () => {
    process.env.FEATURE_NEW_WORKFLOW = 'true'
    expect(isNewWorkflowEnabled()).toBe(true)
  })

  it('returns false when FEATURE_NEW_WORKFLOW is "false"', () => {
    process.env.FEATURE_NEW_WORKFLOW = 'false'
    expect(isNewWorkflowEnabled()).toBe(false)
  })

  it('returns false when FEATURE_NEW_WORKFLOW is not set', () => {
    delete process.env.FEATURE_NEW_WORKFLOW
    expect(isNewWorkflowEnabled()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 6. Cache types — CacheKeys and CacheTTL constants
// ---------------------------------------------------------------------------
import { CacheKeys, CacheTTL } from '@/lib/cache/types'

describe('CacheKeys', () => {
  it('user key includes user ID', () => {
    expect(CacheKeys.user('user-123')).toBe('user:user-123')
  })

  it('userSession key includes token', () => {
    expect(CacheKeys.userSession('tok-abc')).toBe('session:tok-abc')
  })

  it('userStats key includes ID', () => {
    expect(CacheKeys.userStats('u1')).toBe('stats:user:u1')
  })

  it('certificate key includes cert ID', () => {
    expect(CacheKeys.certificate('cert-456')).toBe('cert:cert-456')
  })

  it('certificateList key includes userId and page', () => {
    expect(CacheKeys.certificateList('user-1', 2)).toBe('certs:list:user-1:2')
  })

  it('certificateStats is a fixed key', () => {
    expect(CacheKeys.certificateStats()).toBe('certs:stats')
  })

  it('customer key includes customer ID', () => {
    expect(CacheKeys.customer('cust-789')).toBe('customer:cust-789')
  })

  it('customerDashboard key includes email', () => {
    expect(CacheKeys.customerDashboard('test@example.com')).toBe('dashboard:customer:test@example.com')
  })

  it('dropdownAdmins is a fixed key', () => {
    expect(CacheKeys.dropdownAdmins()).toBe('dropdown:admins')
  })

  it('dropdownReviewers key includes user ID', () => {
    expect(CacheKeys.dropdownReviewers('user-5')).toBe('dropdown:reviewers:user-5')
  })

  it('dashboardStats includes role and userId', () => {
    expect(CacheKeys.dashboardStats('user-1', 'ENGINEER')).toBe('dashboard:ENGINEER:user-1')
  })

  it('adminDashboard is a fixed key', () => {
    expect(CacheKeys.adminDashboard()).toBe('dashboard:admin')
  })

  it('engineerDashboard includes userId', () => {
    expect(CacheKeys.engineerDashboard('eng-123')).toBe('dashboard:engineer:eng-123')
  })

  it('engineerCertificates includes userId', () => {
    expect(CacheKeys.engineerCertificates('eng-456')).toBe('certs:engineer:eng-456')
  })
})

describe('CacheTTL', () => {
  it('VERY_SHORT is 30 seconds', () => {
    expect(CacheTTL.VERY_SHORT).toBe(30)
  })

  it('SHORT is 60 seconds', () => {
    expect(CacheTTL.SHORT).toBe(60)
  })

  it('MEDIUM is 300 seconds', () => {
    expect(CacheTTL.MEDIUM).toBe(300)
  })

  it('LONG is 600 seconds', () => {
    expect(CacheTTL.LONG).toBe(600)
  })

  it('VERY_LONG is 3600 seconds (1 hour)', () => {
    expect(CacheTTL.VERY_LONG).toBe(3600)
  })

  it('SESSION is 1800 seconds (30 minutes)', () => {
    expect(CacheTTL.SESSION).toBe(1800)
  })

  it('VERY_SHORT < SHORT < MEDIUM < LONG < VERY_LONG', () => {
    expect(CacheTTL.VERY_SHORT).toBeLessThan(CacheTTL.SHORT)
    expect(CacheTTL.SHORT).toBeLessThan(CacheTTL.MEDIUM)
    expect(CacheTTL.MEDIUM).toBeLessThan(CacheTTL.LONG)
    expect(CacheTTL.LONG).toBeLessThan(CacheTTL.VERY_LONG)
  })
})

// ---------------------------------------------------------------------------
// 7. isHeicImage from image-processing (pure function, mocks sharp)
// ---------------------------------------------------------------------------
vi.mock('sharp', () => ({
  default: vi.fn(),
}))

import { isHeicImage } from '@/lib/services/image-processing'

describe('isHeicImage', () => {
  it('returns true for image/heic', () => {
    expect(isHeicImage('image/heic')).toBe(true)
  })

  it('returns true for image/heif', () => {
    expect(isHeicImage('image/heif')).toBe(true)
  })

  it('returns false for image/jpeg', () => {
    expect(isHeicImage('image/jpeg')).toBe(false)
  })

  it('returns false for image/png', () => {
    expect(isHeicImage('image/png')).toBe(false)
  })

  it('returns false for image/webp', () => {
    expect(isHeicImage('image/webp')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isHeicImage('')).toBe(false)
  })

  it('returns false for application/pdf', () => {
    expect(isHeicImage('application/pdf')).toBe(false)
  })
})
