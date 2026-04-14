/**
 * TAT (Turn-Around-Time) Calculator Unit Tests
 *
 * Tests for calculating certificate turnaround times
 * across different stages: reviewer, engineer revision,
 * customer review, customer revision, admin approval
 *
 * Migrated from hta-calibration/src/lib/__tests__/tat-calculator.test.ts
 */
import { describe, it, expect } from 'vitest'

// Types
interface CertificateEvent {
  id: string
  eventType: string
  createdAt: Date
  certificateId: string
}

interface StageMetrics {
  totalHours: number
  cycleCount: number
  avgHours: number
}

interface TotalTATMetrics {
  hours: number | null
  isComplete: boolean
  startedAt: Date | null
  completedAt: Date | null
}

interface CertificateTATMetrics {
  certificateId: string
  totalTAT: TotalTATMetrics
  reviewer: StageMetrics
  engineerRevision: StageMetrics
  customer: StageMetrics
  customerRevision: StageMetrics
  adminApproval: StageMetrics
}

interface AggregatedMetrics {
  certificateCount: number
  totalTAT: { avgHours: number; completedCount: number; overdueCount: number }
  reviewer: { avgHours: number; avgCycles: number; totalCycles: number }
  engineerRevision: { avgHours: number; avgCycles: number; totalCycles: number }
  customer: { avgHours: number; avgCycles: number; totalCycles: number }
  customerRevision: { avgHours: number; avgCycles: number; totalCycles: number }
  adminApproval: { avgHours: number; avgCycles: number; totalCycles: number }
}

// Implementation
function calculateCertificateTAT(events: CertificateEvent[]): CertificateTATMetrics | null {
  if (events.length === 0) return null

  // Sort events by createdAt
  const sortedEvents = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  )

  const certificateId = sortedEvents[0].certificateId

  // Find key events
  const submitEvent = sortedEvents.find((e) => e.eventType === 'SUBMITTED_FOR_REVIEW')
  const authorizedEvent = sortedEvents.find((e) => e.eventType === 'ADMIN_AUTHORIZED')

  // Calculate total TAT
  const totalTAT: TotalTATMetrics = {
    hours: null,
    isComplete: false,
    startedAt: submitEvent?.createdAt || null,
    completedAt: authorizedEvent?.createdAt || null,
  }

  if (submitEvent && authorizedEvent) {
    totalTAT.hours =
      (authorizedEvent.createdAt.getTime() - submitEvent.createdAt.getTime()) / (1000 * 60 * 60)
    totalTAT.isComplete = true
  }

  // Calculate stage metrics
  const reviewer = calculateStageMetrics(
    sortedEvents,
    ['SUBMITTED_FOR_REVIEW', 'RESUBMITTED_FOR_REVIEW'],
    ['REVIEWER_APPROVED', 'REVISION_REQUESTED']
  )

  const engineerRevision = calculateStageMetrics(
    sortedEvents,
    ['REVISION_REQUESTED'],
    ['RESUBMITTED_FOR_REVIEW']
  )

  const customer = calculateStageMetrics(
    sortedEvents,
    ['SENT_TO_CUSTOMER'],
    ['CUSTOMER_APPROVED', 'CUSTOMER_REVISION_REQUESTED']
  )

  const customerRevision = calculateStageMetrics(
    sortedEvents,
    ['CUSTOMER_REVISION_REQUESTED'],
    ['SENT_TO_CUSTOMER', 'CUSTOMER_APPROVED', 'ADMIN_REPLIED_TO_CUSTOMER']
  )

  const adminApproval = calculateStageMetrics(
    sortedEvents,
    ['CUSTOMER_APPROVED'],
    ['ADMIN_AUTHORIZED']
  )

  return {
    certificateId,
    totalTAT,
    reviewer,
    engineerRevision,
    customer,
    customerRevision,
    adminApproval,
  }
}

function calculateStageMetrics(
  events: CertificateEvent[],
  startTypes: string[],
  endTypes: string[]
): StageMetrics {
  const metrics: StageMetrics = { totalHours: 0, cycleCount: 0, avgHours: 0 }

  let startEvent: CertificateEvent | null = null

  for (const event of events) {
    if (startTypes.includes(event.eventType)) {
      startEvent = event
    } else if (startEvent && endTypes.includes(event.eventType)) {
      const hours =
        (event.createdAt.getTime() - startEvent.createdAt.getTime()) / (1000 * 60 * 60)
      metrics.totalHours += hours
      metrics.cycleCount++
      startEvent = null
    }
  }

  if (metrics.cycleCount > 0) {
    metrics.avgHours = metrics.totalHours / metrics.cycleCount
  }

  return metrics
}

function aggregateTATMetrics(metricsArray: CertificateTATMetrics[]): AggregatedMetrics {
  const result: AggregatedMetrics = {
    certificateCount: metricsArray.length,
    totalTAT: { avgHours: 0, completedCount: 0, overdueCount: 0 },
    reviewer: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
    engineerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
    customer: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
    customerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
    adminApproval: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
  }

  if (metricsArray.length === 0) return result

  // Calculate total TAT average (only completed)
  const completedMetrics = metricsArray.filter((m) => m.totalTAT.isComplete)
  result.totalTAT.completedCount = completedMetrics.length

  if (completedMetrics.length > 0) {
    const totalHours = completedMetrics.reduce((sum, m) => sum + (m.totalTAT.hours || 0), 0)
    result.totalTAT.avgHours = totalHours / completedMetrics.length
  }

  // Count overdue (>48 hours)
  result.totalTAT.overdueCount = completedMetrics.filter(
    (m) => m.totalTAT.hours && m.totalTAT.hours > 48
  ).length

  // Calculate stage aggregates
  const stages: (keyof Pick<
    CertificateTATMetrics,
    'reviewer' | 'engineerRevision' | 'customer' | 'customerRevision' | 'adminApproval'
  >)[] = ['reviewer', 'engineerRevision', 'customer', 'customerRevision', 'adminApproval']

  for (const stage of stages) {
    const totalCycles = metricsArray.reduce((sum, m) => sum + m[stage].cycleCount, 0)
    const totalHours = metricsArray.reduce((sum, m) => sum + m[stage].totalHours, 0)

    result[stage].totalCycles = totalCycles
    result[stage].avgCycles = metricsArray.length > 0 ? totalCycles / metricsArray.length : 0
    result[stage].avgHours = totalCycles > 0 ? totalHours / totalCycles : 0
  }

  return result
}

function compareWeeklyMetrics(thisWeek: AggregatedMetrics, lastWeek: AggregatedMetrics) {
  const safePercent = (current: number, previous: number): number => {
    if (previous === 0 && current === 0) return 0
    if (previous === 0) return 100
    return Math.round(((current - previous) / previous) * 100)
  }

  const calculateStageChanges = (
    stage: 'reviewer' | 'engineerRevision' | 'customer' | 'customerRevision' | 'adminApproval'
  ) => ({
    hours: thisWeek[stage].avgHours - lastWeek[stage].avgHours,
    hoursPercent: safePercent(thisWeek[stage].avgHours, lastWeek[stage].avgHours),
    cycles: thisWeek[stage].avgCycles - lastWeek[stage].avgCycles,
    cyclesPercent: safePercent(thisWeek[stage].avgCycles, lastWeek[stage].avgCycles),
  })

  return {
    thisWeek,
    lastWeek,
    changes: {
      totalTAT: {
        hours: thisWeek.totalTAT.avgHours - lastWeek.totalTAT.avgHours,
        percent: safePercent(thisWeek.totalTAT.avgHours, lastWeek.totalTAT.avgHours),
      },
      overdue: {
        count: thisWeek.totalTAT.overdueCount - lastWeek.totalTAT.overdueCount,
      },
      reviewer: calculateStageChanges('reviewer'),
      engineerRevision: calculateStageChanges('engineerRevision'),
      customer: calculateStageChanges('customer'),
      customerRevision: calculateStageChanges('customerRevision'),
      adminApproval: calculateStageChanges('adminApproval'),
    },
  }
}

// Helper to create events with proper dates
function createEvent(
  eventType: string,
  hoursFromStart: number,
  certificateId: string = 'cert-1'
): CertificateEvent {
  const baseDate = new Date('2024-01-01T00:00:00.000Z')
  const eventDate = new Date(baseDate.getTime() + hoursFromStart * 60 * 60 * 1000)
  return {
    id: `event-${hoursFromStart}-${eventType}`,
    eventType,
    createdAt: eventDate,
    certificateId,
  }
}

describe('TAT Calculator', () => {
  describe('calculateCertificateTAT', () => {
    describe('basic functionality', () => {
      it('returns null for empty events array', () => {
        expect(calculateCertificateTAT([])).toBeNull()
      })

      it('returns metrics with certificateId from first event', () => {
        const events = [createEvent('SUBMITTED_FOR_REVIEW', 0, 'cert-123')]
        const result = calculateCertificateTAT(events)
        expect(result?.certificateId).toBe('cert-123')
      })

      it('sorts events by createdAt before processing', () => {
        const events = [
          createEvent('REVIEWER_APPROVED', 5),
          createEvent('SUBMITTED_FOR_REVIEW', 0), // Out of order
        ]
        const result = calculateCertificateTAT(events)
        expect(result?.reviewer.cycleCount).toBe(1)
        expect(result?.reviewer.totalHours).toBeCloseTo(5, 1)
      })
    })

    describe('total TAT calculation', () => {
      it('calculates total TAT from SUBMITTED_FOR_REVIEW to ADMIN_AUTHORIZED', () => {
        const events = [
          createEvent('SUBMITTED_FOR_REVIEW', 0),
          createEvent('REVIEWER_APPROVED', 10),
          createEvent('SENT_TO_CUSTOMER', 12),
          createEvent('CUSTOMER_APPROVED', 24),
          createEvent('ADMIN_AUTHORIZED', 30),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.totalTAT.isComplete).toBe(true)
        expect(result?.totalTAT.hours).toBeCloseTo(30, 1)
        expect(result?.totalTAT.startedAt).toEqual(new Date('2024-01-01T00:00:00.000Z'))
        expect(result?.totalTAT.completedAt).toEqual(new Date('2024-01-02T06:00:00.000Z'))
      })

      it('marks TAT as incomplete when ADMIN_AUTHORIZED is missing', () => {
        const events = [
          createEvent('SUBMITTED_FOR_REVIEW', 0),
          createEvent('REVIEWER_APPROVED', 10),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.totalTAT.isComplete).toBe(false)
        expect(result?.totalTAT.startedAt).not.toBeNull()
        expect(result?.totalTAT.completedAt).toBeNull()
      })

      it('sets startedAt to null when no SUBMITTED_FOR_REVIEW event', () => {
        const events = [createEvent('REVIEWER_APPROVED', 0)]
        const result = calculateCertificateTAT(events)

        expect(result?.totalTAT.startedAt).toBeNull()
        expect(result?.totalTAT.isComplete).toBe(false)
      })
    })

    describe('reviewer stage TAT', () => {
      it('calculates reviewer TAT from SUBMITTED_FOR_REVIEW to REVIEWER_APPROVED', () => {
        const events = [
          createEvent('SUBMITTED_FOR_REVIEW', 0),
          createEvent('REVIEWER_APPROVED', 8),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.reviewer.cycleCount).toBe(1)
        expect(result?.reviewer.totalHours).toBeCloseTo(8, 1)
        expect(result?.reviewer.avgHours).toBeCloseTo(8, 1)
      })

      it('calculates reviewer TAT from SUBMITTED_FOR_REVIEW to REVISION_REQUESTED', () => {
        const events = [
          createEvent('SUBMITTED_FOR_REVIEW', 0),
          createEvent('REVISION_REQUESTED', 4),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.reviewer.cycleCount).toBe(1)
        expect(result?.reviewer.totalHours).toBeCloseTo(4, 1)
      })

      it('handles multiple reviewer cycles', () => {
        const events = [
          createEvent('SUBMITTED_FOR_REVIEW', 0),
          createEvent('REVISION_REQUESTED', 4),
          createEvent('RESUBMITTED_FOR_REVIEW', 8),
          createEvent('REVISION_REQUESTED', 12),
          createEvent('RESUBMITTED_FOR_REVIEW', 20),
          createEvent('REVIEWER_APPROVED', 24),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.reviewer.cycleCount).toBe(3)
        expect(result?.reviewer.totalHours).toBeCloseTo(4 + 4 + 4, 1) // 12 hours total
        expect(result?.reviewer.avgHours).toBeCloseTo(4, 1)
      })
    })

    describe('engineer revision stage TAT', () => {
      it('calculates engineer revision TAT from REVISION_REQUESTED to RESUBMITTED', () => {
        const events = [
          createEvent('SUBMITTED_FOR_REVIEW', 0),
          createEvent('REVISION_REQUESTED', 4),
          createEvent('RESUBMITTED_FOR_REVIEW', 12),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.engineerRevision.cycleCount).toBe(1)
        expect(result?.engineerRevision.totalHours).toBeCloseTo(8, 1)
        expect(result?.engineerRevision.avgHours).toBeCloseTo(8, 1)
      })

      it('handles multiple engineer revision cycles', () => {
        const events = [
          createEvent('SUBMITTED_FOR_REVIEW', 0),
          createEvent('REVISION_REQUESTED', 2),
          createEvent('RESUBMITTED_FOR_REVIEW', 6),
          createEvent('REVISION_REQUESTED', 8),
          createEvent('RESUBMITTED_FOR_REVIEW', 14),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.engineerRevision.cycleCount).toBe(2)
        expect(result?.engineerRevision.totalHours).toBeCloseTo(4 + 6, 1) // 10 hours total
        expect(result?.engineerRevision.avgHours).toBeCloseTo(5, 1)
      })
    })

    describe('customer stage TAT', () => {
      it('calculates customer TAT from SENT_TO_CUSTOMER to CUSTOMER_APPROVED', () => {
        const events = [
          createEvent('SENT_TO_CUSTOMER', 0),
          createEvent('CUSTOMER_APPROVED', 24),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.customer.cycleCount).toBe(1)
        expect(result?.customer.totalHours).toBeCloseTo(24, 1)
        expect(result?.customer.avgHours).toBeCloseTo(24, 1)
      })

      it('calculates customer TAT from SENT_TO_CUSTOMER to CUSTOMER_REVISION_REQUESTED', () => {
        const events = [
          createEvent('SENT_TO_CUSTOMER', 0),
          createEvent('CUSTOMER_REVISION_REQUESTED', 48),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.customer.cycleCount).toBe(1)
        expect(result?.customer.totalHours).toBeCloseTo(48, 1)
      })

      it('handles multiple customer review cycles', () => {
        const events = [
          createEvent('SENT_TO_CUSTOMER', 0),
          createEvent('CUSTOMER_REVISION_REQUESTED', 10),
          createEvent('SENT_TO_CUSTOMER', 20),
          createEvent('CUSTOMER_APPROVED', 30),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.customer.cycleCount).toBe(2)
        expect(result?.customer.totalHours).toBeCloseTo(10 + 10, 1) // 20 hours total
        expect(result?.customer.avgHours).toBeCloseTo(10, 1)
      })
    })

    describe('customer revision stage TAT', () => {
      it('calculates customer revision TAT from CUSTOMER_REVISION_REQUESTED to SENT_TO_CUSTOMER', () => {
        const events = [
          createEvent('SENT_TO_CUSTOMER', 0),
          createEvent('CUSTOMER_REVISION_REQUESTED', 10),
          createEvent('SENT_TO_CUSTOMER', 18),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.customerRevision.cycleCount).toBe(1)
        expect(result?.customerRevision.totalHours).toBeCloseTo(8, 1)
      })

      it('closes customer revision on CUSTOMER_APPROVED', () => {
        const events = [
          createEvent('SENT_TO_CUSTOMER', 0),
          createEvent('CUSTOMER_REVISION_REQUESTED', 10),
          createEvent('CUSTOMER_APPROVED', 20),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.customerRevision.cycleCount).toBe(1)
        expect(result?.customerRevision.totalHours).toBeCloseTo(10, 1)
      })

      it('closes customer revision on ADMIN_REPLIED_TO_CUSTOMER', () => {
        const events = [
          createEvent('SENT_TO_CUSTOMER', 0),
          createEvent('CUSTOMER_REVISION_REQUESTED', 10),
          createEvent('ADMIN_REPLIED_TO_CUSTOMER', 14),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.customerRevision.cycleCount).toBe(1)
        expect(result?.customerRevision.totalHours).toBeCloseTo(4, 1)
      })
    })

    describe('admin approval stage TAT', () => {
      it('calculates admin approval TAT from CUSTOMER_APPROVED to ADMIN_AUTHORIZED', () => {
        const events = [
          createEvent('CUSTOMER_APPROVED', 0),
          createEvent('ADMIN_AUTHORIZED', 6),
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.adminApproval.cycleCount).toBe(1)
        expect(result?.adminApproval.totalHours).toBeCloseTo(6, 1)
        expect(result?.adminApproval.avgHours).toBeCloseTo(6, 1)
      })
    })

    describe('complete workflow', () => {
      it('tracks all stages in a complete certificate lifecycle', () => {
        const events = [
          createEvent('SUBMITTED_FOR_REVIEW', 0),
          createEvent('REVISION_REQUESTED', 4), // Reviewer: 4h
          createEvent('RESUBMITTED_FOR_REVIEW', 12), // Engineer revision: 8h
          createEvent('REVIEWER_APPROVED', 16), // Reviewer: 4h
          createEvent('SENT_TO_CUSTOMER', 17),
          createEvent('CUSTOMER_REVISION_REQUESTED', 25), // Customer: 8h
          createEvent('SENT_TO_CUSTOMER', 30), // Customer revision: 5h
          createEvent('CUSTOMER_APPROVED', 42), // Customer: 12h
          createEvent('ADMIN_AUTHORIZED', 48), // Admin: 6h
        ]
        const result = calculateCertificateTAT(events)

        expect(result?.totalTAT.isComplete).toBe(true)
        expect(result?.totalTAT.hours).toBeCloseTo(48, 1)

        expect(result?.reviewer.cycleCount).toBe(2)
        expect(result?.reviewer.totalHours).toBeCloseTo(8, 1)

        expect(result?.engineerRevision.cycleCount).toBe(1)
        expect(result?.engineerRevision.totalHours).toBeCloseTo(8, 1)

        expect(result?.customer.cycleCount).toBe(2)
        expect(result?.customer.totalHours).toBeCloseTo(20, 1)

        expect(result?.customerRevision.cycleCount).toBe(1)
        expect(result?.customerRevision.totalHours).toBeCloseTo(5, 1)

        expect(result?.adminApproval.cycleCount).toBe(1)
        expect(result?.adminApproval.totalHours).toBeCloseTo(6, 1)
      })
    })
  })

  describe('aggregateTATMetrics', () => {
    it('returns zero metrics for empty array', () => {
      const result = aggregateTATMetrics([])

      expect(result.certificateCount).toBe(0)
      expect(result.totalTAT.avgHours).toBe(0)
      expect(result.totalTAT.completedCount).toBe(0)
      expect(result.totalTAT.overdueCount).toBe(0)
      expect(result.reviewer.avgHours).toBe(0)
    })

    it('calculates average total TAT for completed certificates', () => {
      const metrics: CertificateTATMetrics[] = [
        {
          certificateId: 'cert-1',
          totalTAT: { hours: 24, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 8, cycleCount: 1, avgHours: 8 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 10, cycleCount: 1, avgHours: 10 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 6, cycleCount: 1, avgHours: 6 },
        },
        {
          certificateId: 'cert-2',
          totalTAT: { hours: 36, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 12, cycleCount: 2, avgHours: 6 },
          engineerRevision: { totalHours: 4, cycleCount: 1, avgHours: 4 },
          customer: { totalHours: 12, cycleCount: 1, avgHours: 12 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 8, cycleCount: 1, avgHours: 8 },
        },
      ]

      const result = aggregateTATMetrics(metrics)

      expect(result.certificateCount).toBe(2)
      expect(result.totalTAT.completedCount).toBe(2)
      expect(result.totalTAT.avgHours).toBeCloseTo(30, 1) // (24 + 36) / 2
    })

    it('excludes incomplete certificates from total TAT average', () => {
      const metrics: CertificateTATMetrics[] = [
        {
          certificateId: 'cert-1',
          totalTAT: { hours: 24, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 8, cycleCount: 1, avgHours: 8 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 10, cycleCount: 1, avgHours: 10 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 6, cycleCount: 1, avgHours: 6 },
        },
        {
          certificateId: 'cert-2',
          totalTAT: { hours: 100, isComplete: false, startedAt: new Date(), completedAt: null },
          reviewer: { totalHours: 20, cycleCount: 1, avgHours: 20 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
        },
      ]

      const result = aggregateTATMetrics(metrics)

      expect(result.totalTAT.completedCount).toBe(1)
      expect(result.totalTAT.avgHours).toBeCloseTo(24, 1) // Only completed cert
    })

    it('counts overdue certificates (>48 hours)', () => {
      const metrics: CertificateTATMetrics[] = [
        {
          certificateId: 'cert-1',
          totalTAT: { hours: 24, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 8, cycleCount: 1, avgHours: 8 },
          engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customer: { totalHours: 10, cycleCount: 1, avgHours: 10 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 6, cycleCount: 1, avgHours: 6 },
        },
        {
          certificateId: 'cert-2',
          totalTAT: { hours: 72, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 24, cycleCount: 2, avgHours: 12 },
          engineerRevision: { totalHours: 16, cycleCount: 1, avgHours: 16 },
          customer: { totalHours: 24, cycleCount: 1, avgHours: 24 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 8, cycleCount: 1, avgHours: 8 },
        },
      ]

      const result = aggregateTATMetrics(metrics)

      expect(result.totalTAT.overdueCount).toBe(1)
    })

    it('calculates stage averages across all cycles', () => {
      const metrics: CertificateTATMetrics[] = [
        {
          certificateId: 'cert-1',
          totalTAT: { hours: 24, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 8, cycleCount: 2, avgHours: 4 },
          engineerRevision: { totalHours: 4, cycleCount: 1, avgHours: 4 },
          customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
        },
        {
          certificateId: 'cert-2',
          totalTAT: { hours: 36, isComplete: true, startedAt: new Date(), completedAt: new Date() },
          reviewer: { totalHours: 12, cycleCount: 2, avgHours: 6 },
          engineerRevision: { totalHours: 8, cycleCount: 2, avgHours: 4 },
          customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
          adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
        },
      ]

      const result = aggregateTATMetrics(metrics)

      // Reviewer: (8 + 12) / 4 cycles = 5 hours avg per cycle
      expect(result.reviewer.avgHours).toBeCloseTo(5, 1)
      expect(result.reviewer.totalCycles).toBe(4)
      expect(result.reviewer.avgCycles).toBe(2) // 4 cycles / 2 certs

      // Engineer: (4 + 8) / 3 cycles = 4 hours avg per cycle
      expect(result.engineerRevision.avgHours).toBeCloseTo(4, 1)
      expect(result.engineerRevision.totalCycles).toBe(3)
    })
  })

  describe('compareWeeklyMetrics', () => {
    const createAggregatedMetrics = (overrides = {}): AggregatedMetrics => ({
      totalTAT: { avgHours: 24, completedCount: 10, overdueCount: 2 },
      reviewer: { avgHours: 4, avgCycles: 1.5, totalCycles: 15 },
      engineerRevision: { avgHours: 2, avgCycles: 0.5, totalCycles: 5 },
      customer: { avgHours: 12, avgCycles: 1, totalCycles: 10 },
      customerRevision: { avgHours: 4, avgCycles: 0.3, totalCycles: 3 },
      adminApproval: { avgHours: 2, avgCycles: 1, totalCycles: 10 },
      certificateCount: 10,
      ...overrides,
    })

    it('calculates changes between two weeks', () => {
      const thisWeek = createAggregatedMetrics({
        totalTAT: { avgHours: 20, completedCount: 12, overdueCount: 1 },
      })
      const lastWeek = createAggregatedMetrics({
        totalTAT: { avgHours: 25, completedCount: 10, overdueCount: 3 },
      })

      const result = compareWeeklyMetrics(thisWeek, lastWeek)

      expect(result.thisWeek).toBe(thisWeek)
      expect(result.lastWeek).toBe(lastWeek)
      expect(result.changes.totalTAT.hours).toBeCloseTo(-5, 1) // 20 - 25
      expect(result.changes.totalTAT.percent).toBe(-20) // -5/25 = -20%
      expect(result.changes.overdue.count).toBe(-2) // 1 - 3
    })

    it('calculates percentage changes for stages', () => {
      const thisWeek = createAggregatedMetrics({
        reviewer: { avgHours: 6, avgCycles: 2, totalCycles: 20 },
      })
      const lastWeek = createAggregatedMetrics({
        reviewer: { avgHours: 4, avgCycles: 1, totalCycles: 10 },
      })

      const result = compareWeeklyMetrics(thisWeek, lastWeek)

      expect(result.changes.reviewer.hours).toBeCloseTo(2, 1) // 6 - 4
      expect(result.changes.reviewer.hoursPercent).toBe(50) // 2/4 = 50%
      expect(result.changes.reviewer.cycles).toBe(1) // 2 - 1
      expect(result.changes.reviewer.cyclesPercent).toBe(100) // 1/1 = 100%
    })

    it('handles division by zero for percentage changes', () => {
      const thisWeek = createAggregatedMetrics({
        reviewer: { avgHours: 5, avgCycles: 2, totalCycles: 20 },
      })
      const lastWeek = createAggregatedMetrics({
        reviewer: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
      })

      const result = compareWeeklyMetrics(thisWeek, lastWeek)

      expect(result.changes.reviewer.hoursPercent).toBe(100)
      expect(result.changes.reviewer.cyclesPercent).toBe(100)
    })

    it('returns 0 percent when both values are 0', () => {
      const thisWeek = createAggregatedMetrics({
        engineerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
      })
      const lastWeek = createAggregatedMetrics({
        engineerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
      })

      const result = compareWeeklyMetrics(thisWeek, lastWeek)

      expect(result.changes.engineerRevision.hoursPercent).toBe(0)
      expect(result.changes.engineerRevision.cyclesPercent).toBe(0)
    })

    it('calculates changes for all stages', () => {
      const thisWeek = createAggregatedMetrics()
      const lastWeek = createAggregatedMetrics()

      const result = compareWeeklyMetrics(thisWeek, lastWeek)

      expect(result.changes).toHaveProperty('totalTAT')
      expect(result.changes).toHaveProperty('overdue')
      expect(result.changes).toHaveProperty('reviewer')
      expect(result.changes).toHaveProperty('engineerRevision')
      expect(result.changes).toHaveProperty('customer')
      expect(result.changes).toHaveProperty('customerRevision')
      expect(result.changes).toHaveProperty('adminApproval')
    })
  })
})
