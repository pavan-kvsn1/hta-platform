import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  calculateCertificateTAT,
  aggregateTATMetrics,
  compareWeeklyMetrics,
  type CertificateEvent,
  type CertificateTATMetrics,
  type AggregatedTATMetrics,
} from '../../src/lib/utils/tat-calculator'

// Helper to create dates relative to a base date
function createDate(hoursFromNow: number): Date {
  const date = new Date('2024-01-15T10:00:00.000Z')
  date.setHours(date.getHours() + hoursFromNow)
  return date
}

// Helper to create test events
function createEvent(
  eventType: string,
  hoursFromStart: number,
  certificateId = 'cert-1'
): CertificateEvent {
  return {
    id: `event-${eventType}-${hoursFromStart}`,
    eventType,
    createdAt: createDate(hoursFromStart),
    certificateId,
  }
}

describe('TAT Calculator', () => {
  describe('calculateCertificateTAT', () => {
    it('should return null for empty events array', () => {
      expect(calculateCertificateTAT([])).toBeNull()
    })

    it('should calculate total TAT for completed certificate', () => {
      const events = [
        createEvent('SUBMITTED_FOR_REVIEW', 0),
        createEvent('REVIEWER_APPROVED', 2),
        createEvent('SENT_TO_CUSTOMER', 2.5),
        createEvent('CUSTOMER_APPROVED', 10),
        createEvent('ADMIN_AUTHORIZED', 12),
      ]

      const result = calculateCertificateTAT(events)

      expect(result).not.toBeNull()
      expect(result!.totalTAT.isComplete).toBe(true)
      expect(result!.totalTAT.hours).toBe(12)
    })

    it('should calculate reviewer stage TAT', () => {
      const events = [
        createEvent('SUBMITTED_FOR_REVIEW', 0),
        createEvent('REVIEWER_APPROVED', 4),
      ]

      const result = calculateCertificateTAT(events)

      expect(result!.reviewer.cycleCount).toBe(1)
      expect(result!.reviewer.totalHours).toBe(4)
      expect(result!.reviewer.avgHours).toBe(4)
    })

    it('should calculate multiple reviewer cycles', () => {
      const events = [
        createEvent('SUBMITTED_FOR_REVIEW', 0),
        createEvent('REVISION_REQUESTED', 2),
        createEvent('RESUBMITTED_FOR_REVIEW', 5),
        createEvent('REVIEWER_APPROVED', 7),
      ]

      const result = calculateCertificateTAT(events)

      expect(result!.reviewer.cycleCount).toBe(2)
      // First cycle: 2 hours, Second cycle: 2 hours
      expect(result!.reviewer.totalHours).toBe(4)
      expect(result!.reviewer.avgHours).toBe(2)
    })

    it('should calculate engineer revision TAT', () => {
      const events = [
        createEvent('SUBMITTED_FOR_REVIEW', 0),
        createEvent('REVISION_REQUESTED', 2),
        createEvent('RESUBMITTED_FOR_REVIEW', 8),
        createEvent('REVIEWER_APPROVED', 10),
      ]

      const result = calculateCertificateTAT(events)

      expect(result!.engineerRevision.cycleCount).toBe(1)
      expect(result!.engineerRevision.totalHours).toBe(6) // 8 - 2 = 6 hours
      expect(result!.engineerRevision.avgHours).toBe(6)
    })

    it('should calculate customer stage TAT', () => {
      const events = [
        createEvent('SUBMITTED_FOR_REVIEW', 0),
        createEvent('REVIEWER_APPROVED', 2),
        createEvent('SENT_TO_CUSTOMER', 3),
        createEvent('CUSTOMER_APPROVED', 27), // 24 hours of customer wait
      ]

      const result = calculateCertificateTAT(events)

      expect(result!.customer.cycleCount).toBe(1)
      expect(result!.customer.totalHours).toBe(24)
    })

    it('should calculate customer revision TAT', () => {
      const events = [
        createEvent('SENT_TO_CUSTOMER', 0),
        createEvent('CUSTOMER_REVISION_REQUESTED', 5),
        createEvent('SENT_TO_CUSTOMER', 10),
        createEvent('CUSTOMER_APPROVED', 15),
      ]

      const result = calculateCertificateTAT(events)

      expect(result!.customerRevision.cycleCount).toBe(1)
      expect(result!.customerRevision.totalHours).toBe(5) // From revision request to resend
    })

    it('should calculate admin approval TAT', () => {
      const events = [
        createEvent('CUSTOMER_APPROVED', 0),
        createEvent('ADMIN_AUTHORIZED', 3),
      ]

      const result = calculateCertificateTAT(events)

      expect(result!.adminApproval.cycleCount).toBe(1)
      expect(result!.adminApproval.totalHours).toBe(3)
    })

    it('should handle events in random order', () => {
      // Events not in chronological order
      const events = [
        createEvent('ADMIN_AUTHORIZED', 12),
        createEvent('SUBMITTED_FOR_REVIEW', 0),
        createEvent('CUSTOMER_APPROVED', 10),
        createEvent('SENT_TO_CUSTOMER', 3),
        createEvent('REVIEWER_APPROVED', 2),
      ]

      const result = calculateCertificateTAT(events)

      expect(result).not.toBeNull()
      expect(result!.totalTAT.isComplete).toBe(true)
      expect(result!.totalTAT.hours).toBe(12)
    })

    it('should handle incomplete certificate (still in progress)', () => {
      // Mock Date.now for consistent testing
      vi.useFakeTimers()
      vi.setSystemTime(createDate(24))

      const events = [
        createEvent('SUBMITTED_FOR_REVIEW', 0),
        createEvent('REVIEWER_APPROVED', 4),
      ]

      const result = calculateCertificateTAT(events)

      expect(result!.totalTAT.isComplete).toBe(false)
      expect(result!.totalTAT.hours).toBe(24) // 24 hours from start to "now"

      vi.useRealTimers()
    })
  })

  describe('aggregateTATMetrics', () => {
    it('should return zeroed metrics for empty array', () => {
      const result = aggregateTATMetrics([])

      expect(result.certificateCount).toBe(0)
      expect(result.totalTAT.avgHours).toBe(0)
      expect(result.totalTAT.completedCount).toBe(0)
      expect(result.reviewer.avgHours).toBe(0)
    })

    it('should aggregate metrics from multiple certificates', () => {
      const metrics: CertificateTATMetrics[] = [
        {
          certificateId: 'cert-1',
          totalTAT: { hours: 24, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 4, cycleCount: 1, avgHours: 4 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 12, cycleCount: 1, avgHours: 12 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 2, cycleCount: 1, avgHours: 2 },
        },
        {
          certificateId: 'cert-2',
          totalTAT: { hours: 36, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 6, cycleCount: 2, avgHours: 3 },
          engineerRevision: { totalHours: 4, cycleCount: 1, avgHours: 4 },
          customer: { totalHours: 18, cycleCount: 1, avgHours: 18 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 4, cycleCount: 1, avgHours: 4 },
        },
      ]

      const result = aggregateTATMetrics(metrics)

      expect(result.certificateCount).toBe(2)
      expect(result.totalTAT.completedCount).toBe(2)
      expect(result.totalTAT.avgHours).toBe(30) // (24 + 36) / 2
    })

    it('should calculate average cycles correctly', () => {
      const metrics: CertificateTATMetrics[] = [
        {
          certificateId: 'cert-1',
          totalTAT: { hours: 24, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 4, cycleCount: 2, avgHours: 2 },
          engineerRevision: { totalHours: 6, cycleCount: 1, avgHours: 6 },
          customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
        },
        {
          certificateId: 'cert-2',
          totalTAT: { hours: 12, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 2, cycleCount: 1, avgHours: 2 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
        },
      ]

      const result = aggregateTATMetrics(metrics)

      expect(result.reviewer.totalCycles).toBe(3) // 2 + 1
      expect(result.reviewer.avgCycles).toBe(1.5) // 3 cycles / 2 certs with cycles
    })

    it('should count overdue certificates', () => {
      const metrics: CertificateTATMetrics[] = [
        {
          certificateId: 'cert-1',
          totalTAT: { hours: 24, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
        },
        {
          certificateId: 'cert-2',
          totalTAT: { hours: 72, isComplete: true, startedAt: new Date(), completedAt: new Date() }, // > 48 hours
          reviewer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
        },
      ]

      const result = aggregateTATMetrics(metrics)

      expect(result.totalTAT.overdueCount).toBe(1) // Only cert-2 is overdue (> 48 hours)
    })

    it('should not count incomplete certificates in total TAT average', () => {
      const metrics: CertificateTATMetrics[] = [
        {
          certificateId: 'cert-1',
          totalTAT: { hours: 24, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
        },
        {
          certificateId: 'cert-2',
          totalTAT: { hours: 100, isComplete: false, startedAt: new Date(), completedAt: null }, // Incomplete
          reviewer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
        },
      ]

      const result = aggregateTATMetrics(metrics)

      expect(result.totalTAT.completedCount).toBe(1)
      expect(result.totalTAT.avgHours).toBe(24) // Only cert-1 counted
    })
  })

  describe('compareWeeklyMetrics', () => {
    it('should calculate percentage changes correctly', () => {
      const thisWeek: AggregatedTATMetrics = {
        totalTAT: { avgHours: 30, completedCount: 10, overdueCount: 2 },
        reviewer: { avgHours: 4, avgCycles: 1.5, totalCycles: 15 },
        engineerRevision: { avgHours: 3, avgCycles: 0.5, totalCycles: 5 },
        customer: { avgHours: 12, avgCycles: 1, totalCycles: 10 },
        customerRevision: { avgHours: 2, avgCycles: 0.2, totalCycles: 2 },
        adminApproval: { avgHours: 2, avgCycles: 1, totalCycles: 10 },
        certificateCount: 10,
      }

      const lastWeek: AggregatedTATMetrics = {
        totalTAT: { avgHours: 36, completedCount: 8, overdueCount: 4 },
        reviewer: { avgHours: 5, avgCycles: 2, totalCycles: 16 },
        engineerRevision: { avgHours: 4, avgCycles: 1, totalCycles: 8 },
        customer: { avgHours: 15, avgCycles: 1, totalCycles: 8 },
        customerRevision: { avgHours: 3, avgCycles: 0.5, totalCycles: 4 },
        adminApproval: { avgHours: 3, avgCycles: 1, totalCycles: 8 },
        certificateCount: 8,
      }

      const result = compareWeeklyMetrics(thisWeek, lastWeek)

      // Total TAT: 30 - 36 = -6 hours difference
      expect(result.changes.totalTAT.hours).toBe(-6)
      expect(result.changes.totalTAT.percent).toBe(-17) // -6/36 * 100 = -16.67 rounded

      // Overdue: 2 - 4 = -2
      expect(result.changes.overdue.count).toBe(-2)
      expect(result.changes.overdue.percent).toBe(-50)

      // Reviewer hours: 4 - 5 = -1
      expect(result.changes.reviewer.hours).toBe(-1)
      expect(result.changes.reviewer.hoursPercent).toBe(-20)
    })

    it('should handle zero previous values gracefully', () => {
      const thisWeek: AggregatedTATMetrics = {
        totalTAT: { avgHours: 24, completedCount: 5, overdueCount: 1 },
        reviewer: { avgHours: 4, avgCycles: 1, totalCycles: 5 },
        engineerRevision: { avgHours: 2, avgCycles: 0.5, totalCycles: 2 },
        customer: { avgHours: 10, avgCycles: 1, totalCycles: 5 },
        customerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        adminApproval: { avgHours: 2, avgCycles: 1, totalCycles: 5 },
        certificateCount: 5,
      }

      const lastWeek: AggregatedTATMetrics = {
        totalTAT: { avgHours: 0, completedCount: 0, overdueCount: 0 },
        reviewer: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        engineerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        customer: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        customerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        adminApproval: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        certificateCount: 0,
      }

      const result = compareWeeklyMetrics(thisWeek, lastWeek)

      // When previous is 0 and current > 0, percent should be 100
      expect(result.changes.totalTAT.percent).toBe(100)
      expect(result.changes.reviewer.hoursPercent).toBe(100)
    })

    it('should include original metrics in result', () => {
      const thisWeek: AggregatedTATMetrics = {
        totalTAT: { avgHours: 24, completedCount: 5, overdueCount: 1 },
        reviewer: { avgHours: 4, avgCycles: 1, totalCycles: 5 },
        engineerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        customer: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        customerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        adminApproval: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        certificateCount: 5,
      }

      const lastWeek: AggregatedTATMetrics = {
        totalTAT: { avgHours: 30, completedCount: 4, overdueCount: 2 },
        reviewer: { avgHours: 5, avgCycles: 1.5, totalCycles: 6 },
        engineerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        customer: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        customerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        adminApproval: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
        certificateCount: 4,
      }

      const result = compareWeeklyMetrics(thisWeek, lastWeek)

      expect(result.thisWeek).toEqual(thisWeek)
      expect(result.lastWeek).toEqual(lastWeek)
    })
  })
})
