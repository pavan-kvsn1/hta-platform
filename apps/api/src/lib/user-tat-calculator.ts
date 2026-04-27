/**
 * User TAT (Turn Around Time) Calculator
 *
 * Calculates TAT metrics for individual users in two roles:
 * 1. As Reviewer - When they review certificates from other engineers
 * 2. As Engineer - When they create/revise certificates
 */

interface CertificateEvent {
  id: string
  eventType: string
  createdAt: Date
  certificateId: string
  userId?: string | null
}

interface CertificateWithEvents {
  id: string
  status: string
  currentRevision: number
  createdById: string
  reviewerId: string | null
  events: CertificateEvent[]
}

const EVENTS = {
  SUBMITTED_FOR_REVIEW: 'SUBMITTED_FOR_REVIEW',
  RESUBMITTED_FOR_REVIEW: 'RESUBMITTED_FOR_REVIEW',
  REVIEWER_APPROVED: 'REVIEWER_APPROVED',
  APPROVED: 'APPROVED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  SENT_TO_CUSTOMER: 'SENT_TO_CUSTOMER',
  CUSTOMER_APPROVED: 'CUSTOMER_APPROVED',
  CUSTOMER_REVISION_REQUESTED: 'CUSTOMER_REVISION_REQUESTED',
  ADMIN_AUTHORIZED: 'ADMIN_AUTHORIZED',
  REVIEWER_APPROVED_SENT_TO_CUSTOMER: 'REVIEWER_APPROVED_SENT_TO_CUSTOMER',
}

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60))
}

// ============================================================================
// AS REVIEWER METRICS
// ============================================================================

interface ReviewerInternalMetrics {
  avgResponseTimeHours: number
  avgRevisionCycles: number
  totalReviewed: number
  approvedFirstPass: number
  approvedAfterRevision: number
  sentForRevision: number
  avgTimeToFirstResponse: number
}

interface ReviewerCustomerMetrics {
  sentToCustomer: number
  customerApproved: number
  customerRevisions: number
  avgCustomerResponseTimeHours: number
  avgCustRevisionHandlingHours: number
}

interface ReviewerMetrics {
  internal: ReviewerInternalMetrics
  customer: ReviewerCustomerMetrics
  changes: {
    responseTime: { hours: number; percent: number }
    revisionCycles: { count: number; percent: number }
  }
}

function calculateReviewerMetrics(
  certificates: CertificateWithEvents[],
  userId: string,
  periodStart: Date,
  previousPeriodStart: Date
): ReviewerMetrics | null {
  const reviewedCerts = certificates.filter(c => c.reviewerId === userId)
  if (reviewedCerts.length === 0) return null

  const previousPeriodCerts = reviewedCerts.filter(c => {
    const firstEvent = c.events[0]
    return firstEvent &&
           new Date(firstEvent.createdAt) >= previousPeriodStart &&
           new Date(firstEvent.createdAt) < periodStart
  })

  const internal = calculateReviewerInternalMetrics(reviewedCerts)
  const internalPrev = calculateReviewerInternalMetrics(previousPeriodCerts)
  const customer = calculateReviewerCustomerMetrics(reviewedCerts)

  const responseTimeChange = internal.avgResponseTimeHours - internalPrev.avgResponseTimeHours
  const responseTimePercent = internalPrev.avgResponseTimeHours > 0
    ? Math.round((responseTimeChange / internalPrev.avgResponseTimeHours) * 100)
    : 0

  const cyclesChange = internal.avgRevisionCycles - internalPrev.avgRevisionCycles
  const cyclesPercent = internalPrev.avgRevisionCycles > 0
    ? Math.round((cyclesChange / internalPrev.avgRevisionCycles) * 100)
    : 0

  return {
    internal,
    customer,
    changes: {
      responseTime: { hours: responseTimeChange, percent: responseTimePercent },
      revisionCycles: { count: cyclesChange, percent: cyclesPercent },
    },
  }
}

function calculateReviewerInternalMetrics(certificates: CertificateWithEvents[]): ReviewerInternalMetrics {
  if (certificates.length === 0) {
    return {
      avgResponseTimeHours: 0, avgRevisionCycles: 0, totalReviewed: 0,
      approvedFirstPass: 0, approvedAfterRevision: 0, sentForRevision: 0,
      avgTimeToFirstResponse: 0,
    }
  }

  let totalResponseTime = 0
  let responseCount = 0
  let totalRevisionCycles = 0
  let approvedFirstPass = 0
  let approvedAfterRevision = 0
  let sentForRevision = 0
  let totalFirstResponseTime = 0
  let firstResponseCount = 0

  for (const cert of certificates) {
    const sortedEvents = [...cert.events].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    let certRevisionCycles = 0
    let submissionTime: Date | null = null
    let hadFirstResponse = false

    for (const event of sortedEvents) {
      const eventDate = new Date(event.createdAt)

      if (event.eventType === EVENTS.SUBMITTED_FOR_REVIEW ||
          event.eventType === EVENTS.RESUBMITTED_FOR_REVIEW) {
        submissionTime = eventDate
      }

      if ((event.eventType === EVENTS.REVIEWER_APPROVED ||
           event.eventType === EVENTS.APPROVED ||
           event.eventType === EVENTS.REVIEWER_APPROVED_SENT_TO_CUSTOMER ||
           event.eventType === EVENTS.REVISION_REQUESTED) && submissionTime) {
        const responseTime = hoursBetween(submissionTime, eventDate)
        totalResponseTime += responseTime
        responseCount++

        if (!hadFirstResponse) {
          totalFirstResponseTime += responseTime
          firstResponseCount++
          hadFirstResponse = true
        }

        submissionTime = null
      }

      if (event.eventType === EVENTS.REVISION_REQUESTED) {
        certRevisionCycles++
        sentForRevision++
      }
    }

    totalRevisionCycles += certRevisionCycles

    const isApproved = cert.status === 'AUTHORIZED' || cert.status === 'APPROVED' ||
                       cert.status === 'PENDING_CUSTOMER_APPROVAL' ||
                       cert.status === 'PENDING_ADMIN_AUTHORIZATION'
    if (isApproved) {
      if (certRevisionCycles === 0) {
        approvedFirstPass++
      } else {
        approvedAfterRevision++
      }
    }
  }

  return {
    avgResponseTimeHours: responseCount > 0 ? totalResponseTime / responseCount : 0,
    avgRevisionCycles: certificates.length > 0 ? totalRevisionCycles / certificates.length : 0,
    totalReviewed: certificates.length,
    approvedFirstPass,
    approvedAfterRevision,
    sentForRevision,
    avgTimeToFirstResponse: firstResponseCount > 0 ? totalFirstResponseTime / firstResponseCount : 0,
  }
}

function calculateReviewerCustomerMetrics(certificates: CertificateWithEvents[]): ReviewerCustomerMetrics {
  let sentToCustomer = 0
  let customerApproved = 0
  let customerRevisions = 0
  let totalCustomerResponseTime = 0
  let customerResponseCount = 0
  let totalCustRevisionHandlingTime = 0
  let custRevisionHandlingCount = 0

  for (const cert of certificates) {
    const sortedEvents = [...cert.events].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    let sentToCustomerTime: Date | null = null
    let customerRevisionTime: Date | null = null

    for (const event of sortedEvents) {
      const eventDate = new Date(event.createdAt)

      if (event.eventType === EVENTS.SENT_TO_CUSTOMER ||
          event.eventType === EVENTS.REVIEWER_APPROVED_SENT_TO_CUSTOMER) {
        sentToCustomer++
        sentToCustomerTime = eventDate

        if (customerRevisionTime) {
          const handlingTime = hoursBetween(customerRevisionTime, eventDate)
          totalCustRevisionHandlingTime += handlingTime
          custRevisionHandlingCount++
          customerRevisionTime = null
        }
      }

      if (event.eventType === EVENTS.CUSTOMER_APPROVED && sentToCustomerTime) {
        customerApproved++
        const responseTime = hoursBetween(sentToCustomerTime, eventDate)
        totalCustomerResponseTime += responseTime
        customerResponseCount++
        sentToCustomerTime = null
      }

      if (event.eventType === EVENTS.CUSTOMER_REVISION_REQUESTED) {
        customerRevisions++
        customerRevisionTime = eventDate
        if (sentToCustomerTime) {
          const responseTime = hoursBetween(sentToCustomerTime, eventDate)
          totalCustomerResponseTime += responseTime
          customerResponseCount++
          sentToCustomerTime = null
        }
      }
    }
  }

  return {
    sentToCustomer,
    customerApproved,
    customerRevisions,
    avgCustomerResponseTimeHours: customerResponseCount > 0 ? totalCustomerResponseTime / customerResponseCount : 0,
    avgCustRevisionHandlingHours: custRevisionHandlingCount > 0 ? totalCustRevisionHandlingTime / custRevisionHandlingCount : 0,
  }
}

// ============================================================================
// AS ENGINEER METRICS
// ============================================================================

interface EngineerInternalMetrics {
  avgRevisionTimeHours: number
  avgRevisionCycles: number
  totalCreated: number
  approvedFirstPass: number
  needed1Revision: number
  needed2PlusRevisions: number
  avgTimeInRevision: number
}

interface EngineerCustomerMetrics {
  customerRevisionRequests: number
  resolvedQuickly: number
  neededEscalation: number
  avgResolutionTimeHours: number
}

interface EngineerMetrics {
  internal: EngineerInternalMetrics
  customer: EngineerCustomerMetrics
  changes: {
    revisionTime: { hours: number; percent: number }
    revisionCycles: { count: number; percent: number }
  }
}

const QUICK_RESOLUTION_THRESHOLD_HOURS = 4

function calculateEngineerMetrics(
  certificates: CertificateWithEvents[],
  userId: string,
  periodStart: Date,
  previousPeriodStart: Date
): EngineerMetrics | null {
  const createdCerts = certificates.filter(c => c.createdById === userId)
  if (createdCerts.length === 0) return null

  const previousPeriodCerts = createdCerts.filter(c => {
    const firstEvent = c.events[0]
    return firstEvent &&
           new Date(firstEvent.createdAt) >= previousPeriodStart &&
           new Date(firstEvent.createdAt) < periodStart
  })

  const internal = calculateEngineerInternalMetrics(createdCerts)
  const internalPrev = calculateEngineerInternalMetrics(previousPeriodCerts)
  const customer = calculateEngineerCustomerMetrics(createdCerts)

  const revisionTimeChange = internal.avgRevisionTimeHours - internalPrev.avgRevisionTimeHours
  const revisionTimePercent = internalPrev.avgRevisionTimeHours > 0
    ? Math.round((revisionTimeChange / internalPrev.avgRevisionTimeHours) * 100)
    : 0

  const cyclesChange = internal.avgRevisionCycles - internalPrev.avgRevisionCycles
  const cyclesPercent = internalPrev.avgRevisionCycles > 0
    ? Math.round((cyclesChange / internalPrev.avgRevisionCycles) * 100)
    : 0

  return {
    internal,
    customer,
    changes: {
      revisionTime: { hours: revisionTimeChange, percent: revisionTimePercent },
      revisionCycles: { count: cyclesChange, percent: cyclesPercent },
    },
  }
}

function calculateEngineerInternalMetrics(certificates: CertificateWithEvents[]): EngineerInternalMetrics {
  if (certificates.length === 0) {
    return {
      avgRevisionTimeHours: 0, avgRevisionCycles: 0, totalCreated: 0,
      approvedFirstPass: 0, needed1Revision: 0, needed2PlusRevisions: 0,
      avgTimeInRevision: 0,
    }
  }

  let totalRevisionTime = 0
  let revisionCount = 0
  let totalRevisionCycles = 0
  let approvedFirstPass = 0
  let needed1Revision = 0
  let needed2PlusRevisions = 0
  let totalTimeInRevision = 0
  let certsWithRevisions = 0

  for (const cert of certificates) {
    const sortedEvents = [...cert.events].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    const certRevisionCycles = Math.max(0, cert.currentRevision - 1)
    totalRevisionCycles += certRevisionCycles

    let revisionRequestTime: Date | null = null
    let certRevisionTime = 0

    for (const event of sortedEvents) {
      const eventDate = new Date(event.createdAt)

      if (event.eventType === EVENTS.REVISION_REQUESTED) {
        revisionRequestTime = eventDate
      }

      if (event.eventType === EVENTS.RESUBMITTED_FOR_REVIEW && revisionRequestTime) {
        const revTime = hoursBetween(revisionRequestTime, eventDate)
        totalRevisionTime += revTime
        certRevisionTime += revTime
        revisionCount++
        revisionRequestTime = null
      }
    }

    if (certRevisionTime > 0) {
      totalTimeInRevision += certRevisionTime
      certsWithRevisions++
    }

    const isCompleted = cert.status === 'AUTHORIZED' || cert.status === 'APPROVED' ||
                        cert.status === 'PENDING_CUSTOMER_APPROVAL' ||
                        cert.status === 'PENDING_ADMIN_AUTHORIZATION'
    if (isCompleted) {
      if (certRevisionCycles === 0) {
        approvedFirstPass++
      } else if (certRevisionCycles === 1) {
        needed1Revision++
      } else {
        needed2PlusRevisions++
      }
    }
  }

  return {
    avgRevisionTimeHours: revisionCount > 0 ? totalRevisionTime / revisionCount : 0,
    avgRevisionCycles: certificates.length > 0 ? totalRevisionCycles / certificates.length : 0,
    totalCreated: certificates.length,
    approvedFirstPass,
    needed1Revision,
    needed2PlusRevisions,
    avgTimeInRevision: certsWithRevisions > 0 ? totalTimeInRevision / certsWithRevisions : 0,
  }
}

function calculateEngineerCustomerMetrics(certificates: CertificateWithEvents[]): EngineerCustomerMetrics {
  let customerRevisionRequests = 0
  let resolvedQuickly = 0
  let neededEscalation = 0
  let totalResolutionTime = 0
  let resolutionCount = 0

  for (const cert of certificates) {
    const sortedEvents = [...cert.events].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    let customerRevisionTime: Date | null = null

    for (const event of sortedEvents) {
      const eventDate = new Date(event.createdAt)

      if (event.eventType === EVENTS.CUSTOMER_REVISION_REQUESTED) {
        customerRevisionRequests++
        customerRevisionTime = eventDate
      }

      if (customerRevisionTime &&
          (event.eventType === EVENTS.SENT_TO_CUSTOMER ||
           event.eventType === EVENTS.CUSTOMER_APPROVED ||
           event.eventType === EVENTS.REVIEWER_APPROVED_SENT_TO_CUSTOMER)) {
        const resolutionTime = hoursBetween(customerRevisionTime, eventDate)
        totalResolutionTime += resolutionTime
        resolutionCount++

        if (resolutionTime <= QUICK_RESOLUTION_THRESHOLD_HOURS) {
          resolvedQuickly++
        } else {
          neededEscalation++
        }

        customerRevisionTime = null
      }
    }
  }

  return {
    customerRevisionRequests,
    resolvedQuickly,
    neededEscalation,
    avgResolutionTimeHours: resolutionCount > 0 ? totalResolutionTime / resolutionCount : 0,
  }
}

// ============================================================================
// AS AUTHORIZER METRICS (ADMIN)
// ============================================================================

interface AuthorizerMetrics {
  avgAuthorizationTimeHours: number
  totalAuthorized: number
  authorizedThisPeriod: number
  changes: {
    authorizationTime: { hours: number; percent: number }
    count: { count: number; percent: number }
  }
}

function calculateAuthorizerMetrics(
  certificates: CertificateWithEvents[],
  userId: string,
  periodStart: Date,
  previousPeriodStart: Date
): AuthorizerMetrics | null {
  let totalAuthorizationTime = 0
  let authorizationCount = 0
  let prevPeriodTime = 0
  let prevPeriodCount = 0

  for (const cert of certificates) {
    if (cert.status !== 'AUTHORIZED') continue

    const sortedEvents = [...cert.events].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    let customerApprovedTime: Date | null = null

    for (const event of sortedEvents) {
      const eventDate = new Date(event.createdAt)

      if (event.eventType === EVENTS.CUSTOMER_APPROVED) {
        customerApprovedTime = eventDate
      }

      if (event.eventType === EVENTS.ADMIN_AUTHORIZED && event.userId === userId && customerApprovedTime) {
        const authTime = hoursBetween(customerApprovedTime, eventDate)

        if (eventDate >= periodStart) {
          totalAuthorizationTime += authTime
          authorizationCount++
        } else if (eventDate >= previousPeriodStart) {
          prevPeriodTime += authTime
          prevPeriodCount++
        }
      }
    }
  }

  if (authorizationCount === 0 && prevPeriodCount === 0) return null

  const avgTime = authorizationCount > 0 ? totalAuthorizationTime / authorizationCount : 0
  const prevAvgTime = prevPeriodCount > 0 ? prevPeriodTime / prevPeriodCount : 0

  const timeChange = avgTime - prevAvgTime
  const timePercent = prevAvgTime > 0 ? Math.round((timeChange / prevAvgTime) * 100) : 0

  const countChange = authorizationCount - prevPeriodCount
  const countPercent = prevPeriodCount > 0 ? Math.round((countChange / prevPeriodCount) * 100) : 0

  return {
    avgAuthorizationTimeHours: avgTime,
    totalAuthorized: authorizationCount + prevPeriodCount,
    authorizedThisPeriod: authorizationCount,
    changes: {
      authorizationTime: { hours: timeChange, percent: timePercent },
      count: { count: countChange, percent: countPercent },
    },
  }
}

// ============================================================================
// REQUEST HANDLING METRICS (ADMIN)
// ============================================================================

interface RequestWithDates {
  id: string
  status: string
  createdAt: Date
  reviewedAt: Date | null
  reviewedById: string | null
}

interface RequestHandlingMetrics {
  internal: {
    totalHandled: number
    handledThisPeriod: number
    approved: number
    rejected: number
    avgHandlingTimeHours: number
  }
  customer: {
    totalHandled: number
    handledThisPeriod: number
    approved: number
    rejected: number
    avgHandlingTimeHours: number
  } | null
  changes: {
    internalTime: { hours: number; percent: number }
    customerTime: { hours: number; percent: number } | null
  }
}

export function calculateRequestHandlingMetrics(
  internalRequests: RequestWithDates[],
  customerRequests: RequestWithDates[],
  userId: string,
  adminType: string | null,
  periodStart: Date,
  previousPeriodStart: Date
): RequestHandlingMetrics | null {
  const handledInternal = internalRequests.filter(r => r.reviewedById === userId && r.reviewedAt)
  const handledCustomer = customerRequests.filter(r => r.reviewedById === userId && r.reviewedAt)

  if (handledInternal.length === 0 && handledCustomer.length === 0) return null

  const internalThisPeriod = handledInternal.filter(r => new Date(r.reviewedAt!) >= periodStart)
  const internalPrevPeriod = handledInternal.filter(r =>
    new Date(r.reviewedAt!) >= previousPeriodStart && new Date(r.reviewedAt!) < periodStart
  )

  let internalTotalTime = 0
  let internalTimeCount = 0
  let internalApproved = 0
  let internalRejected = 0

  for (const req of handledInternal) {
    if (req.reviewedAt) {
      internalTotalTime += hoursBetween(new Date(req.createdAt), new Date(req.reviewedAt))
      internalTimeCount++
    }
    if (req.status === 'APPROVED') internalApproved++
    if (req.status === 'REJECTED') internalRejected++
  }

  const avgInternalTime = internalTimeCount > 0 ? internalTotalTime / internalTimeCount : 0

  let prevInternalTime = 0
  let prevInternalCount = 0
  for (const req of internalPrevPeriod) {
    if (req.reviewedAt) {
      prevInternalTime += hoursBetween(new Date(req.createdAt), new Date(req.reviewedAt))
      prevInternalCount++
    }
  }
  const prevAvgInternalTime = prevInternalCount > 0 ? prevInternalTime / prevInternalCount : 0

  const internalTimeChange = avgInternalTime - prevAvgInternalTime
  const internalTimePercent = prevAvgInternalTime > 0
    ? Math.round((internalTimeChange / prevAvgInternalTime) * 100)
    : 0

  let customerMetrics: RequestHandlingMetrics['customer'] = null
  let customerTimeChange: { hours: number; percent: number } | null = null

  if (adminType === 'MASTER' && handledCustomer.length > 0) {
    const customerThisPeriod = handledCustomer.filter(r => new Date(r.reviewedAt!) >= periodStart)
    const customerPrevPeriod = handledCustomer.filter(r =>
      new Date(r.reviewedAt!) >= previousPeriodStart && new Date(r.reviewedAt!) < periodStart
    )

    let customerTotalTime = 0
    let customerTimeCount = 0
    let customerApproved = 0
    let customerRejected = 0

    for (const req of handledCustomer) {
      if (req.reviewedAt) {
        customerTotalTime += hoursBetween(new Date(req.createdAt), new Date(req.reviewedAt))
        customerTimeCount++
      }
      if (req.status === 'APPROVED') customerApproved++
      if (req.status === 'REJECTED') customerRejected++
    }

    const avgCustomerTime = customerTimeCount > 0 ? customerTotalTime / customerTimeCount : 0

    let prevCustomerTime = 0
    let prevCustomerCount = 0
    for (const req of customerPrevPeriod) {
      if (req.reviewedAt) {
        prevCustomerTime += hoursBetween(new Date(req.createdAt), new Date(req.reviewedAt))
        prevCustomerCount++
      }
    }
    const prevAvgCustomerTime = prevCustomerCount > 0 ? prevCustomerTime / prevCustomerCount : 0

    const custTimeChange = avgCustomerTime - prevAvgCustomerTime
    const custTimePercent = prevAvgCustomerTime > 0
      ? Math.round((custTimeChange / prevAvgCustomerTime) * 100)
      : 0

    customerMetrics = {
      totalHandled: handledCustomer.length,
      handledThisPeriod: customerThisPeriod.length,
      approved: customerApproved,
      rejected: customerRejected,
      avgHandlingTimeHours: avgCustomerTime,
    }

    customerTimeChange = { hours: custTimeChange, percent: custTimePercent }
  }

  return {
    internal: {
      totalHandled: handledInternal.length,
      handledThisPeriod: internalThisPeriod.length,
      approved: internalApproved,
      rejected: internalRejected,
      avgHandlingTimeHours: avgInternalTime,
    },
    customer: customerMetrics,
    changes: {
      internalTime: { hours: internalTimeChange, percent: internalTimePercent },
      customerTime: customerTimeChange,
    },
  }
}

// ============================================================================
// COMBINED USER TAT METRICS
// ============================================================================

export function calculateUserTATMetrics(
  certificates: CertificateWithEvents[],
  userId: string,
  periodDays: number = 30
) {
  const now = new Date()
  const periodStart = new Date(now)
  periodStart.setDate(periodStart.getDate() - periodDays)
  periodStart.setHours(0, 0, 0, 0)

  const previousPeriodStart = new Date(periodStart)
  previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays)

  return {
    asReviewer: calculateReviewerMetrics(certificates, userId, periodStart, previousPeriodStart),
    asEngineer: calculateEngineerMetrics(certificates, userId, periodStart, previousPeriodStart),
    asAuthorizer: calculateAuthorizerMetrics(certificates, userId, periodStart, previousPeriodStart),
    periodDays,
  }
}
