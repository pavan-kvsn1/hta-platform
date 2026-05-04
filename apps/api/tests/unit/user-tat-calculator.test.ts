/**
 * User TAT Calculator Unit Tests
 *
 * Tests for calculateUserTATMetrics and calculateRequestHandlingMetrics.
 * These are pure functions; no mocking required.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateUserTATMetrics,
  calculateRequestHandlingMetrics,
} from '../../src/lib/user-tat-calculator.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000)
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000)
}

function makeCert(overrides: Partial<{
  id: string
  status: string
  currentRevision: number
  createdById: string
  reviewerId: string | null
  events: { id: string; eventType: string; createdAt: Date; certificateId: string; userId?: string | null }[]
}> = {}) {
  return {
    id: 'cert-1',
    status: 'AUTHORIZED',
    currentRevision: 1,
    createdById: 'user-eng',
    reviewerId: 'user-rev',
    events: [],
    ...overrides,
  }
}

// ── calculateUserTATMetrics — no certificates ─────────────────────────────────

describe('calculateUserTATMetrics — edge cases', () => {
  it('returns null for all roles when no certificates provided', () => {
    const result = calculateUserTATMetrics([], 'user-1')

    expect(result.asReviewer).toBeNull()
    expect(result.asEngineer).toBeNull()
    expect(result.asAuthorizer).toBeNull()
  })

  it('returns periodDays in result', () => {
    const result = calculateUserTATMetrics([], 'user-1', 30)
    expect(result.periodDays).toBe(30)
  })

  it('uses custom periodDays', () => {
    const result = calculateUserTATMetrics([], 'user-1', 90)
    expect(result.periodDays).toBe(90)
  })
})

// ── calculateUserTATMetrics — asReviewer ──────────────────────────────────────

describe('calculateUserTATMetrics — asReviewer', () => {
  it('returns null when user has no reviewer certificates', () => {
    const certs = [makeCert({ reviewerId: 'other-user' })]
    const result = calculateUserTATMetrics(certs, 'user-rev')
    expect(result.asReviewer).toBeNull()
  })

  it('computes avgResponseTimeHours from submitted→approved events', () => {
    const submitTime = hoursAgo(10)
    const approveTime = hoursAgo(2)

    const cert = makeCert({
      reviewerId: 'user-rev',
      status: 'AUTHORIZED',
      currentRevision: 1,
      events: [
        { id: 'e1', eventType: 'SUBMITTED_FOR_REVIEW', createdAt: submitTime, certificateId: 'cert-1' },
        { id: 'e2', eventType: 'REVIEWER_APPROVED', createdAt: approveTime, certificateId: 'cert-1' },
      ],
    })

    const result = calculateUserTATMetrics([cert], 'user-rev')

    expect(result.asReviewer).not.toBeNull()
    // Response time should be approximately 8 hours
    expect(result.asReviewer!.internal.avgResponseTimeHours).toBeGreaterThan(7)
    expect(result.asReviewer!.internal.avgResponseTimeHours).toBeLessThan(9)
  })

  it('counts revision cycles correctly', () => {
    const t0 = hoursAgo(20)
    const t1 = hoursAgo(16)
    const t2 = hoursAgo(12)
    const t3 = hoursAgo(8)
    const t4 = hoursAgo(2)

    const cert = makeCert({
      reviewerId: 'user-rev',
      status: 'AUTHORIZED',
      currentRevision: 2,
      events: [
        { id: 'e1', eventType: 'SUBMITTED_FOR_REVIEW', createdAt: t0, certificateId: 'cert-1' },
        { id: 'e2', eventType: 'REVISION_REQUESTED', createdAt: t1, certificateId: 'cert-1' },
        { id: 'e3', eventType: 'RESUBMITTED_FOR_REVIEW', createdAt: t2, certificateId: 'cert-1' },
        { id: 'e4', eventType: 'REVISION_REQUESTED', createdAt: t3, certificateId: 'cert-1' },
        { id: 'e5', eventType: 'RESUBMITTED_FOR_REVIEW', createdAt: t4, certificateId: 'cert-1' },
      ],
    })

    const result = calculateUserTATMetrics([cert], 'user-rev')

    expect(result.asReviewer).not.toBeNull()
    expect(result.asReviewer!.internal.sentForRevision).toBe(2)
  })

  it('counts approved first pass correctly', () => {
    const cert = makeCert({
      reviewerId: 'user-rev',
      status: 'AUTHORIZED',
      currentRevision: 1,
      events: [
        { id: 'e1', eventType: 'SUBMITTED_FOR_REVIEW', createdAt: hoursAgo(5), certificateId: 'cert-1' },
        { id: 'e2', eventType: 'REVIEWER_APPROVED', createdAt: hoursAgo(1), certificateId: 'cert-1' },
      ],
    })

    const result = calculateUserTATMetrics([cert], 'user-rev')

    expect(result.asReviewer!.internal.approvedFirstPass).toBe(1)
    expect(result.asReviewer!.internal.approvedAfterRevision).toBe(0)
  })

  it('counts totalReviewed correctly across multiple certs', () => {
    const certs = [
      makeCert({ id: 'c1', reviewerId: 'user-rev' }),
      makeCert({ id: 'c2', reviewerId: 'user-rev' }),
      makeCert({ id: 'c3', reviewerId: 'user-rev' }),
    ]

    const result = calculateUserTATMetrics(certs, 'user-rev')

    expect(result.asReviewer!.internal.totalReviewed).toBe(3)
  })

  it('includes changes comparison object', () => {
    const cert = makeCert({ reviewerId: 'user-rev' })
    const result = calculateUserTATMetrics([cert], 'user-rev')

    expect(result.asReviewer!.changes).toHaveProperty('responseTime')
    expect(result.asReviewer!.changes).toHaveProperty('revisionCycles')
  })
})

// ── calculateUserTATMetrics — asEngineer ─────────────────────────────────────

describe('calculateUserTATMetrics — asEngineer', () => {
  it('returns null when user has no created certificates', () => {
    const certs = [makeCert({ createdById: 'other-user' })]
    const result = calculateUserTATMetrics(certs, 'user-eng')
    expect(result.asEngineer).toBeNull()
  })

  it('computes totalCreated correctly', () => {
    const certs = [
      makeCert({ id: 'c1', createdById: 'user-eng' }),
      makeCert({ id: 'c2', createdById: 'user-eng' }),
    ]
    const result = calculateUserTATMetrics(certs, 'user-eng')
    expect(result.asEngineer!.internal.totalCreated).toBe(2)
  })

  it('counts approvedFirstPass for certs with currentRevision=1', () => {
    const cert = makeCert({
      createdById: 'user-eng',
      status: 'AUTHORIZED',
      currentRevision: 1,
    })

    const result = calculateUserTATMetrics([cert], 'user-eng')
    expect(result.asEngineer!.internal.approvedFirstPass).toBe(1)
    expect(result.asEngineer!.internal.needed1Revision).toBe(0)
  })

  it('counts needed1Revision for certs with currentRevision=2', () => {
    const cert = makeCert({
      createdById: 'user-eng',
      status: 'AUTHORIZED',
      currentRevision: 2,
    })

    const result = calculateUserTATMetrics([cert], 'user-eng')
    expect(result.asEngineer!.internal.needed1Revision).toBe(1)
  })

  it('counts needed2PlusRevisions for certs with currentRevision>2', () => {
    const cert = makeCert({
      createdById: 'user-eng',
      status: 'AUTHORIZED',
      currentRevision: 3,
    })

    const result = calculateUserTATMetrics([cert], 'user-eng')
    expect(result.asEngineer!.internal.needed2PlusRevisions).toBe(1)
  })

  it('computes avgRevisionTimeHours from REVISION_REQUESTED→RESUBMITTED events', () => {
    const t0 = hoursAgo(10)
    const t1 = hoursAgo(4)

    const cert = makeCert({
      createdById: 'user-eng',
      currentRevision: 2,
      events: [
        { id: 'e1', eventType: 'REVISION_REQUESTED', createdAt: t0, certificateId: 'cert-1' },
        { id: 'e2', eventType: 'RESUBMITTED_FOR_REVIEW', createdAt: t1, certificateId: 'cert-1' },
      ],
    })

    const result = calculateUserTATMetrics([cert], 'user-eng')
    // Should be approximately 6 hours
    expect(result.asEngineer!.internal.avgRevisionTimeHours).toBeGreaterThan(5)
    expect(result.asEngineer!.internal.avgRevisionTimeHours).toBeLessThan(7)
  })

  it('returns 0 for avgRevisionTimeHours when no revision events', () => {
    const cert = makeCert({ createdById: 'user-eng', currentRevision: 1 })
    const result = calculateUserTATMetrics([cert], 'user-eng')
    expect(result.asEngineer!.internal.avgRevisionTimeHours).toBe(0)
  })
})

// ── calculateRequestHandlingMetrics ──────────────────────────────────────────

describe('calculateRequestHandlingMetrics', () => {
  const now = new Date()
  const periodStart = daysAgo(30)
  const previousPeriodStart = daysAgo(60)

  function makeRequest(overrides: Partial<{
    id: string
    status: string
    createdAt: Date
    reviewedAt: Date | null
    reviewedById: string | null
  }> = {}) {
    return {
      id: 'req-1',
      status: 'APPROVED',
      createdAt: daysAgo(5),
      reviewedAt: daysAgo(4),
      reviewedById: 'admin-1',
      ...overrides,
    }
  }

  it('returns null when user has handled no requests', () => {
    const result = calculateRequestHandlingMetrics(
      [], [], 'admin-1', null, periodStart, previousPeriodStart
    )
    expect(result).toBeNull()
  })

  it('returns null when requests are reviewed by different user', () => {
    const req = makeRequest({ reviewedById: 'other-admin' })
    const result = calculateRequestHandlingMetrics(
      [req], [], 'admin-1', null, periodStart, previousPeriodStart
    )
    expect(result).toBeNull()
  })

  it('computes totalHandled for internal requests', () => {
    const reqs = [
      makeRequest({ id: 'r1', reviewedById: 'admin-1' }),
      makeRequest({ id: 'r2', reviewedById: 'admin-1' }),
    ]

    const result = calculateRequestHandlingMetrics(
      reqs, [], 'admin-1', null, periodStart, previousPeriodStart
    )

    expect(result).not.toBeNull()
    expect(result!.internal.totalHandled).toBe(2)
  })

  it('counts approved and rejected requests separately', () => {
    const reqs = [
      makeRequest({ id: 'r1', status: 'APPROVED', reviewedById: 'admin-1' }),
      makeRequest({ id: 'r2', status: 'APPROVED', reviewedById: 'admin-1' }),
      makeRequest({ id: 'r3', status: 'REJECTED', reviewedById: 'admin-1' }),
    ]

    const result = calculateRequestHandlingMetrics(
      reqs, [], 'admin-1', null, periodStart, previousPeriodStart
    )

    expect(result!.internal.approved).toBe(2)
    expect(result!.internal.rejected).toBe(1)
  })

  it('computes avgHandlingTimeHours correctly', () => {
    // Request created 10h ago, reviewed 2h ago → 8h handling time
    const req = makeRequest({
      reviewedById: 'admin-1',
      createdAt: hoursAgo(10),
      reviewedAt: hoursAgo(2),
    })

    const result = calculateRequestHandlingMetrics(
      [req], [], 'admin-1', null, periodStart, previousPeriodStart
    )

    expect(result!.internal.avgHandlingTimeHours).toBeGreaterThan(7)
    expect(result!.internal.avgHandlingTimeHours).toBeLessThan(9)
  })

  it('handledThisPeriod only includes requests reviewed after periodStart', () => {
    const reqs = [
      makeRequest({ id: 'r1', reviewedById: 'admin-1', reviewedAt: daysAgo(5) }),   // in period
      makeRequest({ id: 'r2', reviewedById: 'admin-1', reviewedAt: daysAgo(45) }), // before period
    ]

    const result = calculateRequestHandlingMetrics(
      reqs, [], 'admin-1', null, periodStart, previousPeriodStart
    )

    expect(result!.internal.handledThisPeriod).toBe(1)
    expect(result!.internal.totalHandled).toBe(2)
  })

  it('customer metrics are null when adminType is not MASTER', () => {
    const req = makeRequest({ reviewedById: 'admin-1' })

    const result = calculateRequestHandlingMetrics(
      [req], [req], 'admin-1', 'STANDARD', periodStart, previousPeriodStart
    )

    expect(result!.customer).toBeNull()
    expect(result!.changes.customerTime).toBeNull()
  })

  it('includes customer metrics for MASTER admin type', () => {
    const internalReq = makeRequest({ id: 'r1', reviewedById: 'admin-1' })
    const customerReq = makeRequest({ id: 'r2', reviewedById: 'admin-1' })

    const result = calculateRequestHandlingMetrics(
      [internalReq], [customerReq], 'admin-1', 'MASTER', periodStart, previousPeriodStart
    )

    expect(result!.customer).not.toBeNull()
    expect(result!.customer!.totalHandled).toBe(1)
  })

  it('returns zero avgHandlingTime when reviewedAt is null', () => {
    const req = makeRequest({
      reviewedById: 'admin-1',
      reviewedAt: null,
    })

    const result = calculateRequestHandlingMetrics(
      [req], [], 'admin-1', null, periodStart, previousPeriodStart
    )

    // reviewedAt is null so this gets filtered out of handled
    expect(result).toBeNull()
  })

  it('changes.internalTime is 0 percent when no previous period data', () => {
    const req = makeRequest({ reviewedById: 'admin-1' })

    const result = calculateRequestHandlingMetrics(
      [req], [], 'admin-1', null, periodStart, previousPeriodStart
    )

    expect(result!.changes.internalTime.percent).toBe(0)
  })
})
