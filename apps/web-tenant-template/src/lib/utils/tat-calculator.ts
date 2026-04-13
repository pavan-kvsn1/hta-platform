/**
 * TAT (Turn Around Time) Calculator
 *
 * Calculates TAT metrics for certificates based on event history.
 *
 * Total TAT: First SUBMITTED_FOR_REVIEW → ADMIN_AUTHORIZED
 *
 * Stage TAT:
 * - Reviewer: SUBMITTED/RESUBMITTED → REVIEWER_APPROVED/REVISION_REQUESTED
 * - Engineer Revision: REVISION_REQUESTED → RESUBMITTED_FOR_REVIEW
 * - Customer: SENT_TO_CUSTOMER → CUSTOMER_APPROVED/CUSTOMER_REVISION_REQUESTED
 * - Customer Revision: CUSTOMER_REVISION_REQUESTED → SENT_TO_CUSTOMER/CUSTOMER_APPROVED
 * - Admin Approval: CUSTOMER_APPROVED → ADMIN_AUTHORIZED
 */

interface CertificateEvent {
  id: string
  eventType: string
  createdAt: Date
  certificateId: string
}

interface StageTATResult {
  totalHours: number
  cycleCount: number
  avgHours: number
}

interface CertificateTATMetrics {
  certificateId: string
  totalTAT: {
    hours: number
    isComplete: boolean
    startedAt: Date | null
    completedAt: Date | null
  }
  reviewer: StageTATResult
  engineerRevision: StageTATResult
  customer: StageTATResult
  customerRevision: StageTATResult
  adminApproval: StageTATResult
}

interface AggregatedTATMetrics {
  totalTAT: {
    avgHours: number
    completedCount: number
    overdueCount: number
  }
  reviewer: {
    avgHours: number
    avgCycles: number
    totalCycles: number
  }
  engineerRevision: {
    avgHours: number
    avgCycles: number
    totalCycles: number
  }
  customer: {
    avgHours: number
    avgCycles: number
    totalCycles: number
  }
  customerRevision: {
    avgHours: number
    avgCycles: number
    totalCycles: number
  }
  adminApproval: {
    avgHours: number
    avgCycles: number
    totalCycles: number
  }
  certificateCount: number
}

interface WeeklyComparison {
  thisWeek: AggregatedTATMetrics
  lastWeek: AggregatedTATMetrics
  changes: {
    totalTAT: { hours: number; percent: number }
    overdue: { count: number; percent: number }
    reviewer: { hours: number; hoursPercent: number; cycles: number; cyclesPercent: number }
    engineerRevision: { hours: number; hoursPercent: number; cycles: number; cyclesPercent: number }
    customer: { hours: number; hoursPercent: number; cycles: number; cyclesPercent: number }
    customerRevision: { hours: number; hoursPercent: number; cycles: number; cyclesPercent: number }
    adminApproval: { hours: number; hoursPercent: number; cycles: number; cyclesPercent: number }
  }
}

// Event type constants
const EVENTS = {
  SUBMITTED_FOR_REVIEW: 'SUBMITTED_FOR_REVIEW',
  RESUBMITTED_FOR_REVIEW: 'RESUBMITTED_FOR_REVIEW',
  REVIEWER_APPROVED: 'REVIEWER_APPROVED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  SENT_TO_CUSTOMER: 'SENT_TO_CUSTOMER',
  CUSTOMER_APPROVED: 'CUSTOMER_APPROVED',
  CUSTOMER_REVISION_REQUESTED: 'CUSTOMER_REVISION_REQUESTED',
  ADMIN_AUTHORIZED: 'ADMIN_AUTHORIZED',
  ADMIN_REPLIED_TO_CUSTOMER: 'ADMIN_REPLIED_TO_CUSTOMER',
}

/**
 * Calculate hours between two dates
 */
function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60))
}

/**
 * Calculate TAT metrics for a single certificate based on its events
 */
export function calculateCertificateTAT(events: CertificateEvent[]): CertificateTATMetrics | null {
  if (events.length === 0) return null

  // Sort events by createdAt ascending
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  const certificateId = sortedEvents[0].certificateId

  // Initialize results
  const result: CertificateTATMetrics = {
    certificateId,
    totalTAT: {
      hours: 0,
      isComplete: false,
      startedAt: null,
      completedAt: null,
    },
    reviewer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
    engineerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
    customer: { totalHours: 0, cycleCount: 0, avgHours: 0 },
    customerRevision: { totalHours: 0, cycleCount: 0, avgHours: 0 },
    adminApproval: { totalHours: 0, cycleCount: 0, avgHours: 0 },
  }

  // Find first submission and admin signed for total TAT
  const firstSubmission = sortedEvents.find(
    e => e.eventType === EVENTS.SUBMITTED_FOR_REVIEW
  )
  const adminSigned = sortedEvents.find(
    e => e.eventType === EVENTS.ADMIN_AUTHORIZED
  )

  if (firstSubmission) {
    result.totalTAT.startedAt = new Date(firstSubmission.createdAt)

    if (adminSigned) {
      result.totalTAT.completedAt = new Date(adminSigned.createdAt)
      result.totalTAT.hours = hoursBetween(
        result.totalTAT.startedAt,
        result.totalTAT.completedAt
      )
      result.totalTAT.isComplete = true
    } else {
      // Still in progress - calculate to now
      result.totalTAT.hours = hoursBetween(result.totalTAT.startedAt, new Date())
    }
  }

  // Track pending start events for each stage
  let reviewerStartEvent: CertificateEvent | null = null
  let engineerRevisionStartEvent: CertificateEvent | null = null
  let customerStartEvent: CertificateEvent | null = null
  let customerRevisionStartEvent: CertificateEvent | null = null
  let adminApprovalStartEvent: CertificateEvent | null = null

  // Process events to calculate stage TATs
  for (const event of sortedEvents) {
    const eventDate = new Date(event.createdAt)

    switch (event.eventType) {
      // Reviewer stage start
      case EVENTS.SUBMITTED_FOR_REVIEW:
      case EVENTS.RESUBMITTED_FOR_REVIEW:
        reviewerStartEvent = event
        break

      // Reviewer stage end
      case EVENTS.REVIEWER_APPROVED:
      case EVENTS.REVISION_REQUESTED:
        if (reviewerStartEvent) {
          const hours = hoursBetween(new Date(reviewerStartEvent.createdAt), eventDate)
          result.reviewer.totalHours += hours
          result.reviewer.cycleCount++
          reviewerStartEvent = null
        }
        // If revision requested, start engineer revision stage
        if (event.eventType === EVENTS.REVISION_REQUESTED) {
          engineerRevisionStartEvent = event
        }
        break

      // Engineer revision stage end (resubmission)
      // Note: RESUBMITTED_FOR_REVIEW also handled above for reviewer start
      // We need to close engineer revision when resubmitted
      // This is handled by checking if engineerRevisionStartEvent exists when we see RESUBMITTED

      // Customer stage start
      case EVENTS.SENT_TO_CUSTOMER:
        // Close customer revision if pending
        if (customerRevisionStartEvent) {
          const hours = hoursBetween(new Date(customerRevisionStartEvent.createdAt), eventDate)
          result.customerRevision.totalHours += hours
          result.customerRevision.cycleCount++
          customerRevisionStartEvent = null
        }
        customerStartEvent = event
        break

      // Customer stage end
      case EVENTS.CUSTOMER_APPROVED:
        if (customerStartEvent) {
          const hours = hoursBetween(new Date(customerStartEvent.createdAt), eventDate)
          result.customer.totalHours += hours
          result.customer.cycleCount++
          customerStartEvent = null
        }
        // Also close customer revision if pending
        if (customerRevisionStartEvent) {
          const hours = hoursBetween(new Date(customerRevisionStartEvent.createdAt), eventDate)
          result.customerRevision.totalHours += hours
          result.customerRevision.cycleCount++
          customerRevisionStartEvent = null
        }
        // Start admin approval stage
        adminApprovalStartEvent = event
        break

      // Admin approval stage end
      case EVENTS.ADMIN_AUTHORIZED:
        if (adminApprovalStartEvent) {
          const hours = hoursBetween(new Date(adminApprovalStartEvent.createdAt), eventDate)
          result.adminApproval.totalHours += hours
          result.adminApproval.cycleCount++
          adminApprovalStartEvent = null
        }
        break

      case EVENTS.CUSTOMER_REVISION_REQUESTED:
        if (customerStartEvent) {
          const hours = hoursBetween(new Date(customerStartEvent.createdAt), eventDate)
          result.customer.totalHours += hours
          result.customer.cycleCount++
          customerStartEvent = null
        }
        customerRevisionStartEvent = event
        break

      case EVENTS.ADMIN_REPLIED_TO_CUSTOMER:
        // This might close customer revision stage
        if (customerRevisionStartEvent) {
          const hours = hoursBetween(new Date(customerRevisionStartEvent.createdAt), eventDate)
          result.customerRevision.totalHours += hours
          result.customerRevision.cycleCount++
          customerRevisionStartEvent = null
        }
        break
    }

    // Handle engineer revision end when we see resubmission
    if (event.eventType === EVENTS.RESUBMITTED_FOR_REVIEW && engineerRevisionStartEvent) {
      const hours = hoursBetween(new Date(engineerRevisionStartEvent.createdAt), eventDate)
      result.engineerRevision.totalHours += hours
      result.engineerRevision.cycleCount++
      engineerRevisionStartEvent = null
    }
  }

  // Calculate averages
  if (result.reviewer.cycleCount > 0) {
    result.reviewer.avgHours = result.reviewer.totalHours / result.reviewer.cycleCount
  }
  if (result.engineerRevision.cycleCount > 0) {
    result.engineerRevision.avgHours = result.engineerRevision.totalHours / result.engineerRevision.cycleCount
  }
  if (result.customer.cycleCount > 0) {
    result.customer.avgHours = result.customer.totalHours / result.customer.cycleCount
  }
  if (result.customerRevision.cycleCount > 0) {
    result.customerRevision.avgHours = result.customerRevision.totalHours / result.customerRevision.cycleCount
  }
  if (result.adminApproval.cycleCount > 0) {
    result.adminApproval.avgHours = result.adminApproval.totalHours / result.adminApproval.cycleCount
  }

  return result
}

/**
 * Aggregate TAT metrics across multiple certificates
 */
export function aggregateTATMetrics(
  certificateMetrics: CertificateTATMetrics[]
): AggregatedTATMetrics {
  const result: AggregatedTATMetrics = {
    totalTAT: { avgHours: 0, completedCount: 0, overdueCount: 0 },
    reviewer: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
    engineerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
    customer: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
    customerRevision: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
    adminApproval: { avgHours: 0, avgCycles: 0, totalCycles: 0 },
    certificateCount: certificateMetrics.length,
  }

  if (certificateMetrics.length === 0) return result

  let totalTATSum = 0
  let totalTATCount = 0
  let reviewerHoursSum = 0
  let reviewerCyclesSum = 0
  let reviewerCertsWithCycles = 0
  let engineerHoursSum = 0
  let engineerCyclesSum = 0
  let engineerCertsWithCycles = 0
  let customerHoursSum = 0
  let customerCyclesSum = 0
  let customerCertsWithCycles = 0
  let customerRevHoursSum = 0
  let customerRevCyclesSum = 0
  let customerRevCertsWithCycles = 0
  let adminHoursSum = 0
  let adminCyclesSum = 0
  let adminCertsWithCycles = 0

  for (const metrics of certificateMetrics) {
    // Total TAT (only count completed certificates for average)
    if (metrics.totalTAT.isComplete) {
      totalTATSum += metrics.totalTAT.hours
      totalTATCount++
      if (metrics.totalTAT.hours > 48) {
        result.totalTAT.overdueCount++
      }
    }

    // Reviewer
    if (metrics.reviewer.cycleCount > 0) {
      reviewerHoursSum += metrics.reviewer.totalHours
      reviewerCyclesSum += metrics.reviewer.cycleCount
      reviewerCertsWithCycles++
    }

    // Engineer Revision
    if (metrics.engineerRevision.cycleCount > 0) {
      engineerHoursSum += metrics.engineerRevision.totalHours
      engineerCyclesSum += metrics.engineerRevision.cycleCount
      engineerCertsWithCycles++
    }

    // Customer
    if (metrics.customer.cycleCount > 0) {
      customerHoursSum += metrics.customer.totalHours
      customerCyclesSum += metrics.customer.cycleCount
      customerCertsWithCycles++
    }

    // Customer Revision
    if (metrics.customerRevision.cycleCount > 0) {
      customerRevHoursSum += metrics.customerRevision.totalHours
      customerRevCyclesSum += metrics.customerRevision.cycleCount
      customerRevCertsWithCycles++
    }

    // Admin Approval
    if (metrics.adminApproval.cycleCount > 0) {
      adminHoursSum += metrics.adminApproval.totalHours
      adminCyclesSum += metrics.adminApproval.cycleCount
      adminCertsWithCycles++
    }
  }

  // Calculate averages (keep decimal precision for proper formatting)
  result.totalTAT.completedCount = totalTATCount
  result.totalTAT.avgHours = totalTATCount > 0 ? totalTATSum / totalTATCount : 0

  result.reviewer.totalCycles = reviewerCyclesSum
  result.reviewer.avgHours = reviewerCyclesSum > 0 ? reviewerHoursSum / reviewerCyclesSum : 0
  result.reviewer.avgCycles = reviewerCertsWithCycles > 0
    ? Math.round((reviewerCyclesSum / reviewerCertsWithCycles) * 10) / 10
    : 0

  result.engineerRevision.totalCycles = engineerCyclesSum
  result.engineerRevision.avgHours = engineerCyclesSum > 0 ? engineerHoursSum / engineerCyclesSum : 0
  result.engineerRevision.avgCycles = engineerCertsWithCycles > 0
    ? Math.round((engineerCyclesSum / engineerCertsWithCycles) * 10) / 10
    : 0

  result.customer.totalCycles = customerCyclesSum
  result.customer.avgHours = customerCyclesSum > 0 ? customerHoursSum / customerCyclesSum : 0
  result.customer.avgCycles = customerCertsWithCycles > 0
    ? Math.round((customerCyclesSum / customerCertsWithCycles) * 10) / 10
    : 0

  result.customerRevision.totalCycles = customerRevCyclesSum
  result.customerRevision.avgHours = customerRevCyclesSum > 0 ? customerRevHoursSum / customerRevCyclesSum : 0
  result.customerRevision.avgCycles = customerRevCertsWithCycles > 0
    ? Math.round((customerRevCyclesSum / customerRevCertsWithCycles) * 10) / 10
    : 0

  result.adminApproval.totalCycles = adminCyclesSum
  result.adminApproval.avgHours = adminCyclesSum > 0 ? adminHoursSum / adminCyclesSum : 0
  result.adminApproval.avgCycles = adminCertsWithCycles > 0
    ? Math.round((adminCyclesSum / adminCertsWithCycles) * 10) / 10
    : 0

  return result
}

/**
 * Calculate percentage change between two values
 */
function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

/**
 * Compare TAT metrics between two weeks
 */
export function compareWeeklyMetrics(
  thisWeek: AggregatedTATMetrics,
  lastWeek: AggregatedTATMetrics
): WeeklyComparison {
  return {
    thisWeek,
    lastWeek,
    changes: {
      totalTAT: {
        hours: thisWeek.totalTAT.avgHours - lastWeek.totalTAT.avgHours,
        percent: percentChange(thisWeek.totalTAT.avgHours, lastWeek.totalTAT.avgHours),
      },
      overdue: {
        count: thisWeek.totalTAT.overdueCount - lastWeek.totalTAT.overdueCount,
        percent: percentChange(thisWeek.totalTAT.overdueCount, lastWeek.totalTAT.overdueCount),
      },
      reviewer: {
        hours: thisWeek.reviewer.avgHours - lastWeek.reviewer.avgHours,
        hoursPercent: percentChange(thisWeek.reviewer.avgHours, lastWeek.reviewer.avgHours),
        cycles: Math.round((thisWeek.reviewer.avgCycles - lastWeek.reviewer.avgCycles) * 10) / 10,
        cyclesPercent: percentChange(thisWeek.reviewer.avgCycles, lastWeek.reviewer.avgCycles),
      },
      engineerRevision: {
        hours: thisWeek.engineerRevision.avgHours - lastWeek.engineerRevision.avgHours,
        hoursPercent: percentChange(thisWeek.engineerRevision.avgHours, lastWeek.engineerRevision.avgHours),
        cycles: Math.round((thisWeek.engineerRevision.avgCycles - lastWeek.engineerRevision.avgCycles) * 10) / 10,
        cyclesPercent: percentChange(thisWeek.engineerRevision.avgCycles, lastWeek.engineerRevision.avgCycles),
      },
      customer: {
        hours: thisWeek.customer.avgHours - lastWeek.customer.avgHours,
        hoursPercent: percentChange(thisWeek.customer.avgHours, lastWeek.customer.avgHours),
        cycles: Math.round((thisWeek.customer.avgCycles - lastWeek.customer.avgCycles) * 10) / 10,
        cyclesPercent: percentChange(thisWeek.customer.avgCycles, lastWeek.customer.avgCycles),
      },
      customerRevision: {
        hours: thisWeek.customerRevision.avgHours - lastWeek.customerRevision.avgHours,
        hoursPercent: percentChange(thisWeek.customerRevision.avgHours, lastWeek.customerRevision.avgHours),
        cycles: Math.round((thisWeek.customerRevision.avgCycles - lastWeek.customerRevision.avgCycles) * 10) / 10,
        cyclesPercent: percentChange(thisWeek.customerRevision.avgCycles, lastWeek.customerRevision.avgCycles),
      },
      adminApproval: {
        hours: thisWeek.adminApproval.avgHours - lastWeek.adminApproval.avgHours,
        hoursPercent: percentChange(thisWeek.adminApproval.avgHours, lastWeek.adminApproval.avgHours),
        cycles: Math.round((thisWeek.adminApproval.avgCycles - lastWeek.adminApproval.avgCycles) * 10) / 10,
        cyclesPercent: percentChange(thisWeek.adminApproval.avgCycles, lastWeek.adminApproval.avgCycles),
      },
    },
  }
}

export type {
  CertificateEvent,
  StageTATResult,
  CertificateTATMetrics,
  AggregatedTATMetrics,
  WeeklyComparison,
}
