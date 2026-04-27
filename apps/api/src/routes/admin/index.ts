import { FastifyPluginAsync } from 'fastify'
import crypto from 'crypto'
import { prisma, Prisma } from '@hta/database'
import { requireAdmin, requireMasterAdmin } from '../../middleware/auth.js'
import { enforceLimit, updateUsageTracking } from '../../services/index.js'
import { createLogger } from '@hta/shared'
import { queueStaffActivationEmail, enqueueNotification } from '../../services/queue.js'
import { appendSigningEvidence, collectFastifyEvidence } from '../../lib/signing-evidence.js'

const logger = createLogger('admin-routes')

// Helper to safely parse JSON
function safeJsonParse<T>(value: unknown, defaultValue: T): T {
  if (!value) return defaultValue
  if (typeof value === 'object') return value as T
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return defaultValue
    }
  }
  return defaultValue
}

/**
 * Alert all admins (except the actor) when master instruments are modified.
 * This is a security control to detect unauthorized changes.
 */
async function alertAdminsOnInstrumentChange(
  tenantId: string,
  actorId: string,
  actorName: string,
  action: 'CREATED' | 'UPDATED' | 'DELETED',
  instrument: { assetNumber: string; description: string },
  changeDetails?: string
): Promise<void> {
  try {
    // Get all other admins in the tenant
    const otherAdmins = await prisma.user.findMany({
      where: {
        tenantId,
        role: 'ADMIN',
        isActive: true,
        NOT: { id: actorId },
      },
      select: { id: true, email: true, name: true },
    })

    if (otherAdmins.length === 0) return

    const actionText = {
      CREATED: 'created',
      UPDATED: 'modified',
      DELETED: 'deleted',
    }[action]

    const title = `Master Instrument ${actionText.charAt(0).toUpperCase() + actionText.slice(1)}`
    const message = `${actorName} ${actionText} master instrument: ${instrument.assetNumber} - ${instrument.description}${changeDetails ? `. Changes: ${changeDetails}` : ''}`

    // Create notifications for all other admins
    await prisma.notification.createMany({
      data: otherAdmins.map((admin) => ({
        userId: admin.id,
        type: 'MASTER_INSTRUMENT_CHANGE',
        title,
        message,
        data: JSON.stringify({
          action,
          actorId,
          actorName,
          assetNumber: instrument.assetNumber,
          description: instrument.description,
          changeDetails,
          timestamp: new Date().toISOString(),
        }),
      })),
    })

    // Log to audit trail (external logging for tamper-evidence)
    logger.info({
      audit: true,
      security: true,
      event: 'MASTER_INSTRUMENT_CHANGE',
      tenantId,
      actorId,
      actorName,
      action,
      instrument: {
        assetNumber: instrument.assetNumber,
        description: instrument.description,
      },
      changeDetails,
      notifiedAdmins: otherAdmins.map((a) => a.email),
    })

    // Send email alerts to other admins (non-blocking)
    const dashboardUrl = process.env.APP_URL
      ? `${process.env.APP_URL}/admin/instruments`
      : 'https://app.hta-calibration.com/admin/instruments'

    const { sendEmail } = await import('../../services/email.js')
    for (const admin of otherAdmins) {
      sendEmail({
        to: admin.email,
        template: 'master-instrument-change',
        props: {
          recipientName: admin.name || 'Admin',
          actorName,
          action: actionText,
          assetNumber: instrument.assetNumber,
          description: instrument.description,
          changeDetails: changeDetails || '',
          timestamp: new Date().toISOString(),
          dashboardUrl,
        },
      }).catch(() => {})
    }
  } catch (error) {
    // Don't fail the main operation if alerting fails
    logger.error({ error }, 'Failed to alert admins on instrument change')
  }
}

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/admin/certificates - List all certificates with filters
  fastify.get('/certificates', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as {
      status?: string
      search?: string
      page?: string
      limit?: string
    }

    const status = query.status
    const search = query.search
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '20'), 25))

    const where: Record<string, unknown> = { tenantId }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (search) {
      where.OR = [
        { certificateNumber: { contains: search } },
        { customerName: { contains: search } },
        { uucDescription: { contains: search } },
        { uucMake: { contains: search } },
        { uucModel: { contains: search } },
      ]
    }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              assignedAdmin: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          lastModifiedBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.certificate.count({ where }),
    ])

    // Get stats
    const stats = await getCertificateStats(tenantId)

    return {
      certificates: certificates.map((cert: (typeof certificates)[number]) => ({
        id: cert.id,
        certificateNumber: cert.certificateNumber,
        status: cert.status,
        customerName: cert.customerName || '-',
        uucDescription: cert.uucDescription || '-',
        uucMake: cert.uucMake || '',
        uucModel: cert.uucModel || '',
        dateOfCalibration: cert.dateOfCalibration?.toISOString() || null,
        calibrationDueDate: cert.calibrationDueDate?.toISOString() || null,
        currentRevision: cert.currentRevision,
        createdAt: cert.createdAt.toISOString(),
        updatedAt: cert.updatedAt.toISOString(),
        createdBy: {
          id: cert.createdBy.id,
          name: cert.createdBy.name,
          email: cert.createdBy.email,
        },
        assignedAdmin: cert.createdBy.assignedAdmin || null,
        lastModifiedBy: cert.lastModifiedBy,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    }
  })

  // GET /api/admin/users - List all users
  fastify.get('/users', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as { search?: string; role?: string; isActive?: string; page?: string; limit?: string }
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '10'), 25))
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { tenantId }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ]
    }
    if (query.role && query.role !== 'ALL') {
      where.role = query.role
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true'
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isAdmin: true,
          adminType: true,
          isActive: true,
          signatureUrl: true,
          createdAt: true,
          assignedAdmin: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: {
              createdCertificates: true,
              reviewedCertificates: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  })

  // GET /api/admin/customers - List customer accounts with pagination
  fastify.get('/customers', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as { search?: string; isActive?: string; page?: string; limit?: string }
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '10'), 25))
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { tenantId }
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactEmail: { contains: query.search, mode: 'insensitive' } },
      ]
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive === 'true'
    }

    const [accounts, total] = await Promise.all([
      prisma.customerAccount.findMany({
        where,
        include: {
          primaryPoc: {
            select: { id: true, name: true, email: true },
          },
          assignedAdmin: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { users: true },
          },
        },
        orderBy: { companyName: 'asc' },
        skip,
        take: limit,
      }),
      prisma.customerAccount.count({ where }),
    ])

    return {
      accounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  })

  // GET /api/admin/registrations - List customer registrations with pagination
  fastify.get('/registrations', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const query = request.query as { status?: string; page?: string; limit?: string }
    const status = query.status || 'PENDING'
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '10'), 25))
    const skip = (page - 1) * limit

    const where = { status }

    const [registrations, total] = await Promise.all([
      prisma.customerRegistration.findMany({
        where,
        include: {
          customerAccount: {
            select: { id: true, companyName: true },
          },
          reviewedBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.customerRegistration.count({ where }),
    ])

    return {
      registrations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  })

  // POST /api/admin/registrations/:id/approve - Approve a registration
  fastify.post<{ Params: { id: string } }>('/registrations/:id/approve', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user!.sub

    const registration = await prisma.customerRegistration.findUnique({
      where: { id },
    })

    if (!registration) {
      return reply.status(404).send({ error: 'Registration not found' })
    }

    if (registration.status !== 'PENDING') {
      return reply.status(400).send({ error: 'Registration is not pending' })
    }

    // Check subscription limit for customer users
    await enforceLimit(request.tenantId, 'customerUsers')

    // Create customer user from registration
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create the customer user
      const customer = await tx.customerUser.create({
        data: {
          tenantId: request.tenantId,
          email: registration.email,
          name: registration.name,
          passwordHash: registration.passwordHash,
          customerAccountId: registration.customerAccountId,
          isActive: true,
          activatedAt: new Date(),
        },
      })

      // Update registration status
      await tx.customerRegistration.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      })

      return customer
    })

    // Update usage tracking (async, non-blocking)
    updateUsageTracking(request.tenantId).catch(() => {})

    return { success: true }
  })

  // POST /api/admin/registrations/:id/reject - Reject a registration
  fastify.post<{ Params: { id: string } }>('/registrations/:id/reject', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user!.sub
    const body = request.body as { reason?: string }

    const registration = await prisma.customerRegistration.findUnique({
      where: { id },
    })

    if (!registration) {
      return reply.status(404).send({ error: 'Registration not found' })
    }

    if (registration.status !== 'PENDING') {
      return reply.status(400).send({ error: 'Registration is not pending' })
    }

    await prisma.customerRegistration.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: userId,
        reviewedAt: new Date(),
        rejectionReason: body.reason,
      },
    })

    return { success: true }
  })

  // GET /api/admin/analytics - Performance analytics dashboard
  fastify.get('/analytics', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as {
      days?: string
      customerId?: string
      engineerId?: string
    }

    const days = Math.max(1, parseInt(query.days || '30', 10))
    const customerId = query.customerId || undefined
    const engineerId = query.engineerId || undefined

    const now = new Date()
    const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    const prevPeriodStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000)

    // ---------- helpers ----------
    function median(arr: number[]): number {
      if (arr.length === 0) return 0
      const sorted = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }

    function hoursDiff(a: Date, b: Date): number {
      return Math.max(0, (b.getTime() - a.getTime()) / (1000 * 60 * 60))
    }

    function changePercent(current: number, prev: number): number {
      if (prev === 0) return current > 0 ? 100 : 0
      return Math.round(((current - prev) / prev) * 100)
    }

    // ---------- Build certificate filter ----------
    const certWhere: Record<string, unknown> = { tenantId }
    if (engineerId) certWhere.createdById = engineerId
    if (customerId) {
      // Filter by customer account company name
      const account = await prisma.customerAccount.findUnique({
        where: { id: customerId },
        select: { companyName: true },
      })
      if (account) certWhere.customerName = account.companyName
    }

    // ---------- Fetch certificates in current period ----------
    const currentCerts = await prisma.certificate.findMany({
      where: {
        ...certWhere,
        createdAt: { gte: periodStart },
      },
      select: {
        id: true,
        certificateNumber: true,
        status: true,
        customerName: true,
        createdAt: true,
        createdById: true,
        createdBy: { select: { name: true } },
      },
    })

    // ---------- Fetch events for current-period certs ----------
    const certIds = currentCerts.map((c) => c.id)

    const [allEvents, allFeedbacks, allUnlockRequests] = await Promise.all([
      certIds.length > 0
        ? prisma.certificateEvent.findMany({
            where: { certificateId: { in: certIds } },
            orderBy: { createdAt: 'asc' },
            select: {
              certificateId: true,
              eventType: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      certIds.length > 0
        ? prisma.reviewFeedback.findMany({
            where: { certificateId: { in: certIds } },
            select: {
              certificateId: true,
              feedbackType: true,
              targetSection: true,
              createdAt: true,
              isResolved: true,
              resolvedAt: true,
            },
          })
        : Promise.resolve([]),
      prisma.internalRequest.findMany({
        where: {
          type: 'SECTION_UNLOCK',
          createdAt: { gte: periodStart },
          ...(certIds.length > 0 ? { certificateId: { in: certIds } } : {}),
        },
        select: {
          id: true,
          certificateId: true,
          status: true,
          data: true,
          createdAt: true,
          reviewedAt: true,
        },
      }),
    ])

    // Group events by certificate
    type EventEntry = { certificateId: string; eventType: string; createdAt: Date }
    const eventsByCert = new Map<string, EventEntry[]>()
    for (const ev of allEvents) {
      if (!eventsByCert.has(ev.certificateId)) eventsByCert.set(ev.certificateId, [])
      eventsByCert.get(ev.certificateId)!.push(ev)
    }

    // ---------- Stage TAT computation ----------
    type StageKey = 'createdToSubmitted' | 'submittedToReviewed' | 'reviewedToCustomer' | 'customerToAuthorized' | 'total'
    const stageDurations: Record<StageKey, number[]> = {
      createdToSubmitted: [],
      submittedToReviewed: [],
      reviewedToCustomer: [],
      customerToAuthorized: [],
      total: [],
    }

    // Per-certificate stage info for the detail table
    type CertStages = { name: string; hours: number; status: 'ok' | 'slow' | 'stuck' }[]
    const certStagesMap = new Map<string, CertStages>()

    for (const cert of currentCerts) {
      const events = eventsByCert.get(cert.id) || []
      const createdAt = cert.createdAt

      // Find first submit event
      const submitEvent = events.find(
        (e) => e.eventType === 'SUBMITTED_FOR_REVIEW' || e.eventType === 'RESUBMITTED_FOR_REVIEW'
      )
      // Find first review-complete event (approve or revision request)
      const reviewEvent = events.find(
        (e) =>
          e.eventType === 'APPROVED' ||
          e.eventType === 'REVIEWER_APPROVED_SENT_TO_CUSTOMER' ||
          e.eventType === 'REVISION_REQUESTED'
      )
      // Find sent-to-customer event
      const customerEvent = events.find(
        (e) => e.eventType === 'SENT_TO_CUSTOMER' || e.eventType === 'REVIEWER_APPROVED_SENT_TO_CUSTOMER'
      )
      // Find admin-authorized event
      const authEvent = events.find((e) => e.eventType === 'ADMIN_AUTHORIZED')
      // Find customer-approved event
      const custApprovedEvent = events.find((e) => e.eventType === 'CUSTOMER_APPROVED')

      const stages: CertStages = []

      // Stage 1: Created -> Submitted
      let s1Hours = 0
      if (submitEvent) {
        s1Hours = hoursDiff(createdAt, submitEvent.createdAt)
        stageDurations.createdToSubmitted.push(s1Hours)
      }
      stages.push({ name: 'Draft', hours: Math.round(s1Hours * 10) / 10, status: s1Hours > 48 ? 'stuck' : s1Hours > 24 ? 'slow' : 'ok' })

      // Stage 2: Submitted -> Reviewed
      let s2Hours = 0
      if (submitEvent && reviewEvent) {
        s2Hours = hoursDiff(submitEvent.createdAt, reviewEvent.createdAt)
        stageDurations.submittedToReviewed.push(s2Hours)
      }
      stages.push({ name: 'Review', hours: Math.round(s2Hours * 10) / 10, status: s2Hours > 48 ? 'stuck' : s2Hours > 24 ? 'slow' : 'ok' })

      // Stage 3: Reviewed -> Customer
      let s3Hours = 0
      if (reviewEvent && customerEvent) {
        s3Hours = hoursDiff(reviewEvent.createdAt, customerEvent.createdAt)
        stageDurations.reviewedToCustomer.push(s3Hours)
      }
      stages.push({ name: 'Customer', hours: Math.round(s3Hours * 10) / 10, status: s3Hours > 72 ? 'stuck' : s3Hours > 48 ? 'slow' : 'ok' })

      // Stage 4: Customer -> Authorized
      let s4Hours = 0
      const custStageStart = custApprovedEvent || customerEvent
      if (custStageStart && authEvent) {
        s4Hours = hoursDiff(custStageStart.createdAt, authEvent.createdAt)
        stageDurations.customerToAuthorized.push(s4Hours)
      }
      stages.push({ name: 'Authorization', hours: Math.round(s4Hours * 10) / 10, status: s4Hours > 48 ? 'stuck' : s4Hours > 24 ? 'slow' : 'ok' })

      // Total
      const totalHours = s1Hours + s2Hours + s3Hours + s4Hours
      if (submitEvent) {
        stageDurations.total.push(totalHours)
      }

      certStagesMap.set(cert.id, stages)
    }

    // ---------- Previous period certs for comparison ----------
    const prevCerts = await prisma.certificate.findMany({
      where: {
        ...certWhere,
        createdAt: { gte: prevPeriodStart, lt: periodStart },
      },
      select: { id: true, createdAt: true },
    })

    const prevCertIds = prevCerts.map((c) => c.id)

    const [prevEvents, prevFeedbacks] = await Promise.all([
      prevCertIds.length > 0
        ? prisma.certificateEvent.findMany({
            where: { certificateId: { in: prevCertIds } },
            orderBy: { createdAt: 'asc' },
            select: {
              certificateId: true,
              eventType: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      prevCertIds.length > 0
        ? prisma.reviewFeedback.findMany({
            where: { certificateId: { in: prevCertIds } },
            select: {
              certificateId: true,
              feedbackType: true,
              targetSection: true,
              createdAt: true,
              isResolved: true,
              resolvedAt: true,
            },
          })
        : Promise.resolve([]),
    ])

    // Group prev events by cert
    const prevEventsByCert = new Map<string, EventEntry[]>()
    for (const ev of prevEvents) {
      if (!prevEventsByCert.has(ev.certificateId)) prevEventsByCert.set(ev.certificateId, [])
      prevEventsByCert.get(ev.certificateId)!.push(ev)
    }

    // Compute prev period stage durations
    const prevStageDurations: Record<StageKey, number[]> = {
      createdToSubmitted: [],
      submittedToReviewed: [],
      reviewedToCustomer: [],
      customerToAuthorized: [],
      total: [],
    }

    for (const cert of prevCerts) {
      const events = prevEventsByCert.get(cert.id) || []
      const submitEvent = events.find(
        (e) => e.eventType === 'SUBMITTED_FOR_REVIEW' || e.eventType === 'RESUBMITTED_FOR_REVIEW'
      )
      const reviewEvent = events.find(
        (e) =>
          e.eventType === 'APPROVED' ||
          e.eventType === 'REVIEWER_APPROVED_SENT_TO_CUSTOMER' ||
          e.eventType === 'REVISION_REQUESTED'
      )
      const customerEvent = events.find(
        (e) => e.eventType === 'SENT_TO_CUSTOMER' || e.eventType === 'REVIEWER_APPROVED_SENT_TO_CUSTOMER'
      )
      const authEvent = events.find((e) => e.eventType === 'ADMIN_AUTHORIZED')
      const custApprovedEvent = events.find((e) => e.eventType === 'CUSTOMER_APPROVED')

      if (submitEvent) {
        prevStageDurations.createdToSubmitted.push(hoursDiff(cert.createdAt, submitEvent.createdAt))
      }
      if (submitEvent && reviewEvent) {
        prevStageDurations.submittedToReviewed.push(hoursDiff(submitEvent.createdAt, reviewEvent.createdAt))
      }
      if (reviewEvent && customerEvent) {
        prevStageDurations.reviewedToCustomer.push(hoursDiff(reviewEvent.createdAt, customerEvent.createdAt))
      }
      const custStart = custApprovedEvent || customerEvent
      if (custStart && authEvent) {
        prevStageDurations.customerToAuthorized.push(hoursDiff(custStart.createdAt, authEvent.createdAt))
      }

      let total = 0
      if (submitEvent) total += hoursDiff(cert.createdAt, submitEvent.createdAt)
      if (submitEvent && reviewEvent) total += hoursDiff(submitEvent.createdAt, reviewEvent.createdAt)
      if (reviewEvent && customerEvent) total += hoursDiff(reviewEvent.createdAt, customerEvent.createdAt)
      const cs = custApprovedEvent || customerEvent
      if (cs && authEvent) total += hoursDiff(cs.createdAt, authEvent.createdAt)
      if (submitEvent) prevStageDurations.total.push(total)
    }

    // Build stage metrics
    function buildStageMetrics(current: number[], prev: number[]): { avgHours: number; medianHours: number; count: number; changePercent: number } {
      const avgCurrent = current.length > 0 ? current.reduce((a, b) => a + b, 0) / current.length : 0
      const avgPrev = prev.length > 0 ? prev.reduce((a, b) => a + b, 0) / prev.length : 0
      return {
        avgHours: Math.round(avgCurrent * 10) / 10,
        medianHours: Math.round(median(current) * 10) / 10,
        count: current.length,
        changePercent: changePercent(avgCurrent, avgPrev),
      }
    }

    const stageTAT = {
      createdToSubmitted: buildStageMetrics(stageDurations.createdToSubmitted, prevStageDurations.createdToSubmitted),
      submittedToReviewed: buildStageMetrics(stageDurations.submittedToReviewed, prevStageDurations.submittedToReviewed),
      reviewedToCustomer: buildStageMetrics(stageDurations.reviewedToCustomer, prevStageDurations.reviewedToCustomer),
      customerToAuthorized: buildStageMetrics(stageDurations.customerToAuthorized, prevStageDurations.customerToAuthorized),
      total: buildStageMetrics(stageDurations.total, prevStageDurations.total),
    }

    // ---------- Bottleneck ----------
    const stageAvgs: { key: string; label: string; avg: number }[] = [
      { key: 'createdToSubmitted', label: 'draft', avg: stageTAT.createdToSubmitted.avgHours },
      { key: 'submittedToReviewed', label: 'review', avg: stageTAT.submittedToReviewed.avgHours },
      { key: 'reviewedToCustomer', label: 'customer', avg: stageTAT.reviewedToCustomer.avgHours },
      { key: 'customerToAuthorized', label: 'authorization', avg: stageTAT.customerToAuthorized.avgHours },
    ]
    const maxStage = stageAvgs.reduce((best, s) => (s.avg > best.avg ? s : best), stageAvgs[0])
    const bottleneck = maxStage && maxStage.avg > 0 ? maxStage.label : null

    // ---------- Revision metrics ----------
    function computeRevisionMetrics(
      feedbacks: typeof allFeedbacks,
      prevFeedbackList: typeof prevFeedbacks,
      feedbackTypes: string[],
      totalCerts: number,
      prevTotalCerts: number
    ) {
      const current = feedbacks.filter((f) => feedbackTypes.includes(f.feedbackType))
      const prev = prevFeedbackList.filter((f) => feedbackTypes.includes(f.feedbackType))

      const total = current.length
      const avgPerCert = totalCerts > 0 ? Math.round((total / totalCerts) * 10) / 10 : 0

      // TAT: time from creation to resolution
      const resolvedCurrent = current.filter((f) => f.isResolved && f.resolvedAt)
      const tatHours = resolvedCurrent.map((f) => hoursDiff(f.createdAt, f.resolvedAt!))
      const avgTATHours = tatHours.length > 0
        ? Math.round((tatHours.reduce((a, b) => a + b, 0) / tatHours.length) * 10) / 10
        : 0

      // First-pass rate: certs with zero feedbacks of this type / total certs
      const certsWithFeedback = new Set(current.map((f) => f.certificateId))
      const firstPassRate = totalCerts > 0
        ? Math.round(((totalCerts - certsWithFeedback.size) / totalCerts) * 100)
        : 0

      // Previous period
      const prevTotal = prev.length
      const prevAvgPerCert = prevTotalCerts > 0 ? Math.round((prevTotal / prevTotalCerts) * 10) / 10 : 0
      const prevResolved = prev.filter((f) => f.isResolved && f.resolvedAt)
      const prevTatHours = prevResolved.map((f) => hoursDiff(f.createdAt, f.resolvedAt!))
      const prevAvgTATHours = prevTatHours.length > 0
        ? Math.round((prevTatHours.reduce((a, b) => a + b, 0) / prevTatHours.length) * 10) / 10
        : 0
      const prevCertsWithFeedback = new Set(prev.map((f) => f.certificateId))
      const prevFirstPassRate = prevTotalCerts > 0
        ? Math.round(((prevTotalCerts - prevCertsWithFeedback.size) / prevTotalCerts) * 100)
        : 0

      // By sections
      const sectionCounts = new Map<string, number>()
      for (const f of current) {
        const section = f.targetSection || 'general'
        sectionCounts.set(section, (sectionCounts.get(section) || 0) + 1)
      }
      const bySections = Array.from(sectionCounts.entries())
        .map(([section, count]) => ({ section, count }))
        .sort((a, b) => b.count - a.count)

      return {
        total,
        avgPerCert,
        avgTATHours,
        firstPassRate,
        prevTotal,
        prevAvgPerCert,
        prevAvgTATHours,
        prevFirstPassRate,
        hasPrevData: prevCertIds.length > 0,
        bySections,
      }
    }

    const reviewerRevisions = computeRevisionMetrics(
      allFeedbacks,
      prevFeedbacks,
      ['REVISION_REQUESTED', 'REJECTED'],
      currentCerts.length,
      prevCerts.length
    )

    // Customer revisions: count CUSTOMER_REVISION_REQUESTED events (always logged)
    // plus any CUSTOMER_REVISION_FORWARDED feedback for TAT / by-section detail
    const customerRevisions = (() => {
      const currentEventCount = allEvents.filter((e) => e.eventType === 'CUSTOMER_REVISION_REQUESTED').length
      const prevEventCount = prevEvents.filter((e) => e.eventType === 'CUSTOMER_REVISION_REQUESTED').length

      const certsWithCustomerRevision = new Set(
        allEvents.filter((e) => e.eventType === 'CUSTOMER_REVISION_REQUESTED').map((e) => e.certificateId)
      )
      const prevCertsWithCustomerRevision = new Set(
        prevEvents.filter((e) => e.eventType === 'CUSTOMER_REVISION_REQUESTED').map((e) => e.certificateId)
      )

      const total = currentEventCount
      const avgPerCert = currentCerts.length > 0 ? Math.round((total / currentCerts.length) * 10) / 10 : 0
      const firstPassRate = currentCerts.length > 0
        ? Math.round(((currentCerts.length - certsWithCustomerRevision.size) / currentCerts.length) * 100)
        : 0

      // TAT from CUSTOMER_REVISION_FORWARDED feedback (when available)
      const forwardedFeedback = allFeedbacks.filter((f) => f.feedbackType === 'CUSTOMER_REVISION_FORWARDED')
      const resolvedForwarded = forwardedFeedback.filter((f) => f.isResolved && f.resolvedAt)
      const tatHours = resolvedForwarded.map((f) => hoursDiff(f.createdAt, f.resolvedAt!))
      const avgTATHours = tatHours.length > 0
        ? Math.round((tatHours.reduce((a, b) => a + b, 0) / tatHours.length) * 10) / 10
        : 0

      // Previous period
      const prevTotal = prevEventCount
      const prevAvgPerCert = prevCerts.length > 0 ? Math.round((prevTotal / prevCerts.length) * 10) / 10 : 0
      const prevFirstPassRate = prevCerts.length > 0
        ? Math.round(((prevCerts.length - prevCertsWithCustomerRevision.size) / prevCerts.length) * 100)
        : 0
      const prevForwarded = prevFeedbacks.filter((f) => f.feedbackType === 'CUSTOMER_REVISION_FORWARDED')
      const prevResolved = prevForwarded.filter((f) => f.isResolved && f.resolvedAt)
      const prevTatHours = prevResolved.map((f) => hoursDiff(f.createdAt, f.resolvedAt!))
      const prevAvgTATHours = prevTatHours.length > 0
        ? Math.round((prevTatHours.reduce((a, b) => a + b, 0) / prevTatHours.length) * 10) / 10
        : 0

      // By sections: use forwarded feedback if available, otherwise use events (no section info)
      const sectionCounts = new Map<string, number>()
      for (const f of forwardedFeedback) {
        const section = f.targetSection || 'general'
        sectionCounts.set(section, (sectionCounts.get(section) || 0) + 1)
      }
      const bySections = Array.from(sectionCounts.entries())
        .map(([section, count]) => ({ section, count }))
        .sort((a, b) => b.count - a.count)

      return {
        total,
        avgPerCert,
        avgTATHours,
        firstPassRate,
        prevTotal,
        prevAvgPerCert,
        prevAvgTATHours,
        prevFirstPassRate,
        hasPrevData: prevCertIds.length > 0,
        bySections,
      }
    })()

    // ---------- Unlock metrics ----------
    const resolvedUnlocks = allUnlockRequests.filter((r) => r.status !== 'PENDING' && r.reviewedAt)
    const unlockTATHours = resolvedUnlocks.map((r) => hoursDiff(r.createdAt, r.reviewedAt!))
    const avgUnlockTAT = unlockTATHours.length > 0
      ? Math.round((unlockTATHours.reduce((a, b) => a + b, 0) / unlockTATHours.length) * 10) / 10
      : 0

    const approvedCount = allUnlockRequests.filter((r) => r.status === 'APPROVED').length
    const rejectedCount = allUnlockRequests.filter((r) => r.status === 'REJECTED').length
    const totalUnlocks = allUnlockRequests.length

    const unlockSectionCounts = new Map<string, number>()
    for (const req of allUnlockRequests) {
      try {
        const parsed = typeof req.data === 'string' ? JSON.parse(req.data) : req.data
        const sections = Array.isArray(parsed?.sections) ? parsed.sections : []
        for (const s of sections) {
          unlockSectionCounts.set(s, (unlockSectionCounts.get(s) || 0) + 1)
        }
      } catch {
        // skip malformed data
      }
    }
    const unlockBySections = Array.from(unlockSectionCounts.entries())
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => b.count - a.count)

    const unlockMetrics = {
      total: totalUnlocks,
      avgTATHours: avgUnlockTAT,
      approvedPercent: totalUnlocks > 0 ? Math.round((approvedCount / totalUnlocks) * 100) : 0,
      rejectedPercent: totalUnlocks > 0 ? Math.round((rejectedCount / totalUnlocks) * 100) : 0,
      bySections: unlockBySections,
    }

    // ---------- Certificate detail table ----------
    // Count feedbacks and unlocks per cert
    const feedbackCountsByCert = new Map<string, { reviewer: number; customer: number }>()
    for (const f of allFeedbacks) {
      if (!feedbackCountsByCert.has(f.certificateId)) {
        feedbackCountsByCert.set(f.certificateId, { reviewer: 0, customer: 0 })
      }
      const counts = feedbackCountsByCert.get(f.certificateId)!
      if (f.feedbackType === 'REVISION_REQUESTED' || f.feedbackType === 'REJECTED') {
        counts.reviewer++
      } else if (f.feedbackType === 'CUSTOMER_REVISION_FORWARDED') {
        counts.customer++
      }
    }
    // Also count CUSTOMER_REVISION_REQUESTED events for certs that had customer
    // revisions but were forwarded via the normal revision flow (no CUSTOMER_REVISION_FORWARDED feedback)
    for (const ev of allEvents) {
      if (ev.eventType === 'CUSTOMER_REVISION_REQUESTED') {
        if (!feedbackCountsByCert.has(ev.certificateId)) {
          feedbackCountsByCert.set(ev.certificateId, { reviewer: 0, customer: 0 })
        }
        const counts = feedbackCountsByCert.get(ev.certificateId)!
        if (counts.customer === 0) {
          counts.customer++
        }
      }
    }

    const unlockCountsByCert = new Map<string, number>()
    for (const req of allUnlockRequests) {
      if (req.certificateId) {
        unlockCountsByCert.set(req.certificateId, (unlockCountsByCert.get(req.certificateId) || 0) + 1)
      }
    }

    const certificates = currentCerts.map((cert) => {
      const stages = certStagesMap.get(cert.id) || []
      const totalTATHours = stages.reduce((sum, s) => sum + s.hours, 0)
      const fbCounts = feedbackCountsByCert.get(cert.id) || { reviewer: 0, customer: 0 }

      return {
        id: cert.id,
        certificateNumber: cert.certificateNumber,
        customer: cert.customerName || 'N/A',
        engineer: cert.createdBy?.name || 'N/A',
        totalTATHours: Math.round(totalTATHours * 10) / 10,
        reviewerRevisions: fbCounts.reviewer,
        customerRevisions: fbCounts.customer,
        unlocks: unlockCountsByCert.get(cert.id) || 0,
        status: cert.status,
        stages,
      }
    })

    return {
      stageTAT,
      bottleneck,
      unlockMetrics,
      reviewerRevisions,
      customerRevisions,
      certificates,
      totalCertificates: currentCerts.length,
    }
  })

  // ============================================================================
  // INSTRUMENTS
  // ============================================================================

  // GET /api/admin/instruments - List instruments with filters and pagination
  fastify.get('/instruments', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as {
      category?: string
      status?: string
      search?: string
      page?: string
      limit?: string
      includeInactive?: string
    }

    const category = query.category
    const status = query.status
    const search = query.search
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '20'), 25))
    const includeInactive = query.includeInactive === 'true'

    const where: Record<string, unknown> = {
      tenantId,
      isLatest: true,
    }

    if (!includeInactive) {
      where.isActive = true
    }

    if (category && category !== 'ALL') {
      where.category = category
    }

    if (search) {
      where.OR = [
        { description: { contains: search } },
        { assetNumber: { contains: search } },
        { make: { contains: search } },
        { model: { contains: search } },
        { serialNumber: { contains: search } },
      ]
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const thirtyDaysFromNow = new Date(today)
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    if (status === 'expired') {
      where.calibrationDueDate = { lt: today }
    } else if (status === 'expiring') {
      where.calibrationDueDate = { gte: today, lte: thirtyDaysFromNow }
    } else if (status === 'valid') {
      where.calibrationDueDate = { gt: thirtyDaysFromNow }
    } else if (status === 'underRecal') {
      where.status = 'UNDER_RECAL'
    }

    const [instruments, total] = await Promise.all([
      prisma.masterInstrument.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: [
          { category: 'asc' },
          { description: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.masterInstrument.count({ where }),
    ])

    // Calculate status for each instrument
    const instrumentsWithStatus = instruments.map((inst: (typeof instruments)[number]) => {
      let instrumentStatus = 'VALID'
      let daysUntilExpiry = 999

      if (inst.status) {
        instrumentStatus = inst.status
      } else if (inst.calibrationDueDate) {
        const dueDate = new Date(inst.calibrationDueDate)
        const diffTime = dueDate.getTime() - today.getTime()
        daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (daysUntilExpiry < 0) {
          instrumentStatus = 'EXPIRED'
        } else if (daysUntilExpiry <= 30) {
          instrumentStatus = 'EXPIRING_SOON'
        }
      }

      if (inst.calibrationDueDate && daysUntilExpiry === 999) {
        const dueDate = new Date(inst.calibrationDueDate)
        const diffTime = dueDate.getTime() - today.getTime()
        daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      }

      return {
        ...inst,
        status: instrumentStatus,
        daysUntilExpiry,
        rangeData: safeJsonParse<unknown[]>(inst.rangeData, []),
      }
    })

    // Get stats
    const stats = await getInstrumentStats(tenantId)

    return {
      instruments: instrumentsWithStatus,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    }
  })

  // POST /api/admin/instruments - Create new instrument
  fastify.post('/instruments', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const body = request.body as {
      category: string
      description: string
      assetNumber: string
      make?: string
      model?: string
      serialNumber?: string
      usage?: string
      calibratedAtLocation?: string
      reportNo?: string
      calibrationDueDate?: string
      rangeData?: unknown[]
      remarks?: string
      parameterGroup?: string
      parameterRoles?: string[]
      parameterCapabilities?: string[]
      sopReferences?: string[]
    }

    // Validate required fields
    if (!body.category || !body.description || !body.assetNumber) {
      return reply.status(400).send({
        error: 'Category, description, and asset number are required',
      })
    }

    // Check for duplicate asset number among latest versions
    const existing = await prisma.masterInstrument.findFirst({
      where: {
        tenantId,
        assetNumber: body.assetNumber,
        isLatest: true,
      },
    })

    if (existing) {
      return reply.status(400).send({
        error: 'An instrument with this asset number already exists',
      })
    }

    // Generate a new instrumentId for this instrument
    const instrumentId = crypto.randomUUID()

    const instrument = await prisma.masterInstrument.create({
      data: {
        tenantId,
        instrumentId,
        version: 1,
        isLatest: true,
        category: body.category,
        description: body.description,
        make: body.make || '',
        model: body.model || '',
        assetNumber: body.assetNumber,
        serialNumber: body.serialNumber || '',
        usage: body.usage || null,
        calibratedAtLocation: body.calibratedAtLocation || null,
        reportNo: body.reportNo || null,
        calibrationDueDate: body.calibrationDueDate
          ? new Date(body.calibrationDueDate)
          : null,
        rangeData: body.rangeData ? (body.rangeData as Prisma.InputJsonValue) : Prisma.DbNull,
        remarks: body.remarks || null,
        parameterGroup: body.parameterGroup || null,
        parameterRoles: body.parameterRoles || [],
        parameterCapabilities: body.parameterCapabilities || [],
        sopReferences: body.sopReferences || [],
        isActive: true,
        createdById: userId,
        changeReason: 'Manual creation',
      },
    })

    // Alert other admins about the new master instrument
    const actorName = request.user!.name || request.user!.email || 'Unknown Admin'
    alertAdminsOnInstrumentChange(
      tenantId,
      userId,
      actorName,
      'CREATED',
      { assetNumber: body.assetNumber, description: body.description }
    ).catch(() => {}) // Non-blocking

    return {
      success: true,
      instrument,
    }
  })

  // GET /api/admin/instruments/:id - Get single instrument detail
  fastify.get<{ Params: { id: string } }>('/instruments/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params

    const instrument = await prisma.masterInstrument.findFirst({
      where: {
        tenantId,
        id,
        isActive: true,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    if (!instrument) {
      return reply.status(404).send({ error: 'Instrument not found' })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueDate = instrument.calibrationDueDate ? new Date(instrument.calibrationDueDate) : null
    const daysUntilExpiry = dueDate
      ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : 0

    let status = 'VALID'
    if (!dueDate || daysUntilExpiry < 0) {
      status = 'EXPIRED'
    } else if (daysUntilExpiry <= 30) {
      status = 'EXPIRING_SOON'
    }
    if (instrument.status === 'UNDER_RECAL') {
      status = 'UNDER_RECAL'
    }

    // Parse rangeData safely
    let rangeData: unknown[] = []
    try {
      if (instrument.rangeData) {
        rangeData = typeof instrument.rangeData === 'string'
          ? JSON.parse(instrument.rangeData)
          : Array.isArray(instrument.rangeData) ? instrument.rangeData : []
      }
    } catch {
      rangeData = []
    }

    return {
      id: instrument.id,
      instrumentId: instrument.instrumentId || instrument.id,
      version: instrument.version,
      category: instrument.category,
      description: instrument.description,
      make: instrument.make,
      model: instrument.model,
      assetNumber: instrument.assetNumber || '',
      serialNumber: instrument.serialNumber || '',
      usage: instrument.usage,
      calibratedAtLocation: instrument.calibratedAtLocation,
      reportNo: instrument.reportNo,
      calibrationDueDate: instrument.calibrationDueDate?.toISOString() || null,
      remarks: instrument.remarks,
      isActive: instrument.isActive,
      status,
      daysUntilExpiry,
      rangeData,
      createdBy: instrument.createdBy,
      createdAt: instrument.createdAt.toISOString(),
      changeReason: instrument.changeReason,
      parameterGroup: instrument.parameterGroup,
      parameterCapabilities: instrument.parameterCapabilities || [],
      parameterRoles: instrument.parameterRoles || [],
      sopReferences: instrument.sopReferences || [],
    }
  })

  // PUT /api/admin/instruments/:id - Update instrument (creates new version)
  fastify.put<{ Params: { id: string } }>('/instruments/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { id } = request.params
    const body = request.body as {
      category?: string
      description?: string
      assetNumber?: string
      make?: string
      model?: string
      serialNumber?: string
      usage?: string
      calibratedAtLocation?: string
      reportNo?: string
      calibrationDueDate?: string
      rangeData?: unknown[]
      remarks?: string
      status?: string
      parameterGroup?: string
      parameterRoles?: string[]
      parameterCapabilities?: string[]
      sopReferences?: string[]
      isActive?: boolean
      changeReason?: string
    }

    // Find current version
    const current = await prisma.masterInstrument.findFirst({
      where: { tenantId, id, isLatest: true },
    })

    if (!current) {
      return reply.status(404).send({ error: 'Instrument not found' })
    }

    // Check for duplicate asset number if changed
    if (body.assetNumber && body.assetNumber !== current.assetNumber) {
      const duplicate = await prisma.masterInstrument.findFirst({
        where: {
          tenantId,
          assetNumber: body.assetNumber,
          isLatest: true,
          NOT: { instrumentId: current.instrumentId },
        },
      })
      if (duplicate) {
        return reply.status(400).send({
          error: 'An instrument with this asset number already exists',
        })
      }
    }

    // Create new version in transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Mark current as not latest
      await tx.masterInstrument.update({
        where: { id: current.id },
        data: { isLatest: false },
      })

      // Create new version
      const newVersion = await tx.masterInstrument.create({
        data: {
          tenantId,
          instrumentId: current.instrumentId,
          version: current.version + 1,
          isLatest: true,
          category: body.category ?? current.category,
          description: body.description ?? current.description,
          make: body.make ?? current.make,
          model: body.model ?? current.model,
          assetNumber: body.assetNumber ?? current.assetNumber,
          serialNumber: body.serialNumber ?? current.serialNumber,
          usage: body.usage ?? current.usage,
          calibratedAtLocation: body.calibratedAtLocation ?? current.calibratedAtLocation,
          reportNo: body.reportNo ?? current.reportNo,
          calibrationDueDate: body.calibrationDueDate
            ? new Date(body.calibrationDueDate)
            : current.calibrationDueDate,
          rangeData: body.rangeData !== undefined
            ? (body.rangeData ? (body.rangeData as Prisma.InputJsonValue) : Prisma.DbNull)
            : (current.rangeData as Prisma.InputJsonValue ?? Prisma.DbNull),
          remarks: body.remarks ?? current.remarks,
          status: body.status ?? current.status,
          parameterGroup: body.parameterGroup ?? current.parameterGroup,
          parameterRoles: body.parameterRoles ?? current.parameterRoles,
          parameterCapabilities: body.parameterCapabilities ?? current.parameterCapabilities,
          sopReferences: body.sopReferences ?? current.sopReferences,
          isActive: body.isActive ?? current.isActive,
          createdById: userId,
          changeReason: body.changeReason || 'Manual update',
        },
      })

      return newVersion
    })

    // Alert other admins about the instrument update
    const actorName = request.user!.name || request.user!.email || 'Unknown Admin'
    const changedFields: string[] = []
    if (body.description && body.description !== current.description) changedFields.push('description')
    if (body.assetNumber && body.assetNumber !== current.assetNumber) changedFields.push('assetNumber')
    if (body.calibrationDueDate) changedFields.push('calibrationDueDate')
    if (body.rangeData !== undefined) changedFields.push('rangeData')
    if (body.status && body.status !== current.status) changedFields.push('status')
    if (body.isActive !== undefined && body.isActive !== current.isActive) changedFields.push('isActive')

    alertAdminsOnInstrumentChange(
      tenantId,
      userId,
      actorName,
      'UPDATED',
      { assetNumber: result.assetNumber, description: result.description },
      changedFields.length > 0 ? changedFields.join(', ') : 'general update'
    ).catch(() => {}) // Non-blocking

    return {
      success: true,
      instrument: result,
    }
  })

  // DELETE /api/admin/instruments/:id - Soft delete instrument
  fastify.delete<{ Params: { id: string } }>('/instruments/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { id } = request.params

    const instrument = await prisma.masterInstrument.findFirst({
      where: { tenantId, id, isLatest: true },
    })

    if (!instrument) {
      return reply.status(404).send({ error: 'Instrument not found' })
    }

    await prisma.masterInstrument.update({
      where: { id: instrument.id },
      data: { isActive: false },
    })

    // Alert other admins about the instrument deletion
    const actorName = request.user!.name || request.user!.email || 'Unknown Admin'
    alertAdminsOnInstrumentChange(
      tenantId,
      userId,
      actorName,
      'DELETED',
      { assetNumber: instrument.assetNumber, description: instrument.description }
    ).catch(() => {}) // Non-blocking

    return { success: true }
  })

  // ============================================================================
  // INSTRUMENT CERTIFICATES
  // ============================================================================

  // GET /api/admin/instruments/:id/certificates/latest - Get latest certificate PDF
  fastify.get<{ Params: { id: string } }>('/instruments/:id/certificates/latest', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const query = request.query as { metadata?: string }
    const metadataOnly = query.metadata === 'true'

    const { getStorageProvider } = await import('../../lib/storage/index.js')

    // Fetch latest certificate record
    const certificate = await prisma.masterInstrumentCertificate.findFirst({
      where: {
        masterInstrumentId: id,
        isLatest: true,
        isActive: true,
      },
      include: {
        masterInstrument: {
          select: { assetNumber: true, description: true },
        },
        uploadedBy: {
          select: { id: true, name: true },
        },
      },
    })

    if (certificate) {
      if (metadataOnly) {
        return { certificate }
      }

      const storage = getStorageProvider()
      const exists = await storage.exists(certificate.storagePath)

      if (exists) {
        const signedUrl = await storage.getSignedUrl(certificate.storagePath, {
          expiresInMinutes: 15,
        })
        return { certificate, url: signedUrl }
      }

      return { certificate, url: null }
    }

    // No certificate or file not found in storage
    const instrument = await prisma.masterInstrument.findUnique({
      where: { id },
      select: { assetNumber: true, description: true },
    })

    if (!instrument) {
      return reply.status(404).send({ error: 'Instrument not found' })
    }

    return reply.status(404).send({
      error: `No certificate found for this instrument`,
    })
  })

  // GET /api/admin/instruments/:id/certificates - List all certificates
  fastify.get<{ Params: { id: string } }>('/instruments/:id/certificates', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const tenantId = request.tenantId
    const query = request.query as { includeInactive?: string; latestOnly?: string }

    const instrument = await prisma.masterInstrument.findFirst({
      where: { id, tenantId },
      select: { id: true, assetNumber: true, description: true },
    })

    if (!instrument) {
      return reply.status(404).send({ error: 'Instrument not found' })
    }

    const where: Record<string, unknown> = { masterInstrumentId: id }
    if (query.includeInactive !== 'true') where.isActive = true
    if (query.latestOnly === 'true') where.isLatest = true

    const certificates = await prisma.masterInstrumentCertificate.findMany({
      where,
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { uploadedAt: 'desc' },
    })

    return {
      instrument: { id: instrument.id, assetNumber: instrument.assetNumber, description: instrument.description },
      certificates,
      total: certificates.length,
    }
  })

  // POST /api/admin/instruments/:id/certificates - Upload new certificate
  fastify.post<{ Params: { id: string } }>('/instruments/:id/certificates', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const tenantId = request.tenantId
    const userId = request.user!.sub

    const { getStorageProvider, assetNumberToFileName } = await import('../../lib/storage/index.js')

    const instrument = await prisma.masterInstrument.findFirst({
      where: { id, tenantId },
      select: { id: true, assetNumber: true, reportNo: true, calibrationDueDate: true },
    })

    if (!instrument) {
      return reply.status(404).send({ error: 'Instrument not found' })
    }

    const data = await request.file()
    if (!data) {
      return reply.status(400).send({ error: 'No file provided' })
    }

    if (data.mimetype !== 'application/pdf') {
      return reply.status(400).send({ error: 'Only PDF files are allowed' })
    }

    const chunks: Buffer[] = []
    for await (const chunk of data.file) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    const maxSize = 10 * 1024 * 1024
    if (buffer.length > maxSize) {
      return reply.status(400).send({ error: 'File size exceeds 10MB limit' })
    }

    // Parse form fields
    const fields = data.fields as Record<string, { value?: string } | undefined>
    const reportNo = fields.reportNo?.value || null
    const validFromStr = fields.validFrom?.value || null
    const validUntilStr = fields.validUntil?.value || null

    const fileName = assetNumberToFileName(instrument.assetNumber)
    const storagePath = `master-instruments/${fileName}`

    const storage = getStorageProvider()
    await storage.upload(storagePath, buffer, {
      contentType: 'application/pdf',
      metadata: {
        instrumentId: id,
        assetNumber: instrument.assetNumber,
        uploadedBy: userId,
      },
    })

    // Mark existing certificates as not latest
    await prisma.masterInstrumentCertificate.updateMany({
      where: { masterInstrumentId: id, isLatest: true },
      data: { isLatest: false },
    })

    const certificate = await prisma.masterInstrumentCertificate.create({
      data: {
        masterInstrumentId: id,
        fileName: data.filename,
        fileSize: buffer.length,
        mimeType: 'application/pdf',
        storagePath,
        reportNo: reportNo || instrument.reportNo,
        validFrom: validFromStr ? new Date(validFromStr) : null,
        validUntil: validUntilStr ? new Date(validUntilStr) : instrument.calibrationDueDate,
        uploadedById: userId,
        isLatest: true,
        isActive: true,
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return { success: true, certificate }
  })

  // ============================================================================
  // CUSTOMER DETAILS
  // ============================================================================

  // GET /api/admin/customers/:id - Get customer account details (Master Admin only)
  fastify.get<{ Params: { id: string } }>('/customers/:id', {
    preHandler: [requireMasterAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params

    const account = await prisma.customerAccount.findFirst({
      where: { tenantId, id },
      include: {
        assignedAdmin: {
          select: { id: true, name: true, email: true },
        },
        primaryPoc: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            activatedAt: true,
            createdAt: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            isPoc: true,
            isActive: true,
            activatedAt: true,
            createdAt: true,
          },
          orderBy: [{ isPoc: 'desc' }, { name: 'asc' }],
        },
        requests: {
          where: { status: 'PENDING' },
          select: {
            id: true,
            type: true,
            data: true,
            createdAt: true,
            requestedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!account) {
      return reply.status(404).send({ error: 'Customer account not found' })
    }

    // Get recent certificates by company name match
    const recentCertificates = await prisma.certificate.findMany({
      where: { tenantId, customerName: account.companyName },
      select: {
        id: true,
        certificateNumber: true,
        uucDescription: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    const certificateCount = await prisma.certificate.count({
      where: { tenantId, customerName: account.companyName },
    })

    return {
      account: {
        id: account.id,
        companyName: account.companyName,
        address: account.address,
        contactEmail: account.contactEmail,
        contactPhone: account.contactPhone,
        isActive: account.isActive,
        assignedAdmin: account.assignedAdmin,
        primaryPocId: account.primaryPocId,
        primaryPoc: account.primaryPoc ? {
          ...account.primaryPoc,
          activatedAt: account.primaryPoc.activatedAt?.toISOString() || null,
          createdAt: account.primaryPoc.createdAt.toISOString(),
        } : null,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      },
      users: account.users.map((u: (typeof account.users)[number]) => ({
        ...u,
        activatedAt: u.activatedAt?.toISOString() || null,
        createdAt: u.createdAt.toISOString(),
      })),
      pendingRequests: account.requests.map((r: (typeof account.requests)[number]) => ({
        id: r.id,
        type: r.type,
        data: safeJsonParse<Record<string, unknown>>(r.data, {}),
        requestedBy: r.requestedBy,
        createdAt: r.createdAt.toISOString(),
      })),
      recentCertificates: recentCertificates.map((c: (typeof recentCertificates)[number]) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
      certificateCount,
    }
  })

  // PUT /api/admin/customers/:id - Update customer account (Master Admin only)
  fastify.put<{ Params: { id: string } }>('/customers/:id', {
    preHandler: [requireMasterAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params
    const body = request.body as {
      companyName?: string
      address?: string
      contactEmail?: string
      contactPhone?: string
      assignedAdminId?: string | null
      isActive?: boolean
    }

    const existing = await prisma.customerAccount.findFirst({
      where: { tenantId, id },
    })

    if (!existing) {
      return reply.status(404).send({ error: 'Customer account not found' })
    }

    const updateData: Record<string, unknown> = {}

    if (body.companyName !== undefined) {
      const trimmedName = body.companyName.trim()
      if (!trimmedName) {
        return reply.status(400).send({ error: 'Company name cannot be empty' })
      }

      if (trimmedName !== existing.companyName) {
        const duplicate = await prisma.customerAccount.findFirst({
          where: { tenantId, companyName: trimmedName },
        })
        if (duplicate) {
          return reply.status(400).send({
            error: 'A customer account with this name already exists',
          })
        }
      }
      updateData.companyName = trimmedName
    }

    if (body.address !== undefined) {
      updateData.address = body.address?.trim() || null
    }

    if (body.contactEmail !== undefined) {
      updateData.contactEmail = body.contactEmail?.trim() || null
    }

    if (body.contactPhone !== undefined) {
      updateData.contactPhone = body.contactPhone?.trim() || null
    }

    if (body.assignedAdminId !== undefined) {
      if (body.assignedAdminId) {
        const admin = await prisma.user.findFirst({
          where: { tenantId, id: body.assignedAdminId, role: 'ADMIN', isActive: true },
        })
        if (!admin) {
          return reply.status(400).send({ error: 'Invalid Admin selected' })
        }
      }
      updateData.assignedAdminId = body.assignedAdminId || null
    }

    if (body.isActive !== undefined) {
      updateData.isActive = body.isActive
    }

    const account = await prisma.customerAccount.update({
      where: { id },
      data: updateData,
      include: {
        assignedAdmin: {
          select: { id: true, name: true },
        },
      },
    })

    return {
      success: true,
      account: {
        id: account.id,
        companyName: account.companyName,
        isActive: account.isActive,
        assignedAdmin: account.assignedAdmin,
      },
    }
  })

  // ============================================================================
  // UNIFIED REQUESTS (internal + customer)
  // ============================================================================

  // GET /api/admin/requests - Unified requests listing (section unlocks + customer requests)
  fastify.get('/requests', {
    preHandler: [requireMasterAdmin],
  }, async (request) => {
    const query = request.query as {
      status?: string
      type?: string
      page?: string
      limit?: string
    }
    const status = query.status || 'PENDING'
    const type = query.type || 'ALL'
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '15'), 25))

    // Build where clauses
    const internalWhere: Record<string, unknown> = {}
    const customerWhere: Record<string, unknown> = {}

    if (status !== 'ALL') {
      internalWhere.status = status
      customerWhere.status = status
    }

    // Type filtering
    const fetchInternal = type === 'ALL' || type === 'SECTION_UNLOCK'
    const fetchCustomer = type === 'ALL' || type === 'USER_ADDITION' || type === 'POC_CHANGE'

    if (type === 'USER_ADDITION' || type === 'POC_CHANGE') {
      customerWhere.type = type
    }

    // Fetch counts for summary cards
    const [
      internalPendingCount,
      userAddPendingCount,
      pocChangePendingCount,
      internalApprovedCount,
      internalRejectedCount,
      customerApprovedCount,
      customerRejectedCount,
    ] = await Promise.all([
      prisma.internalRequest.count({ where: { status: 'PENDING' } }),
      prisma.customerRequest.count({ where: { status: 'PENDING', type: 'USER_ADDITION' } }),
      prisma.customerRequest.count({ where: { status: 'PENDING', type: 'POC_CHANGE' } }),
      prisma.internalRequest.count({ where: { status: 'APPROVED' } }),
      prisma.internalRequest.count({ where: { status: 'REJECTED' } }),
      prisma.customerRequest.count({ where: { status: 'APPROVED' } }),
      prisma.customerRequest.count({ where: { status: 'REJECTED' } }),
    ])

    // Fetch requests from both tables
    const [internalRequests, customerRequests] = await Promise.all([
      fetchInternal
        ? prisma.internalRequest.findMany({
            where: internalWhere,
            include: {
              certificate: {
                select: { id: true, certificateNumber: true, status: true },
              },
              requestedBy: {
                select: { id: true, name: true, email: true },
              },
              reviewedBy: {
                select: { id: true, name: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      fetchCustomer
        ? prisma.customerRequest.findMany({
            where: customerWhere,
            include: {
              customerAccount: {
                select: { id: true, companyName: true },
              },
              requestedBy: {
                select: { id: true, name: true, email: true },
              },
              reviewedBy: {
                select: { id: true, name: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : [],
    ])

    const SECTION_LABELS: Record<string, string> = {
      'summary': 'Summary',
      'uuc-details': 'UUC Details',
      'master-inst': 'Master Instruments',
      'environment': 'Environmental',
      'results': 'Results',
      'remarks': 'Remarks',
      'conclusion': 'Conclusion',
    }

    // Normalize internal requests
    const normalizedInternal = internalRequests.map((r) => {
      const data = typeof r.data === 'string' ? JSON.parse(r.data as string) : r.data
      const sections = ((data as Record<string, unknown>)?.sections || []) as string[]
      const sectionLabels = sections.map((s: string) => SECTION_LABELS[s] || s).join(', ')

      return {
        id: r.id,
        category: 'internal' as const,
        type: r.type,
        status: r.status,
        title: r.certificate?.certificateNumber || 'Unknown Certificate',
        subtitle: `by ${r.requestedBy.name || 'Unknown'}`,
        details: sectionLabels || 'No sections specified',
        requestedBy: r.requestedBy.name || 'Unknown',
        requestedByEmail: r.requestedBy.email,
        createdAt: r.createdAt.toISOString(),
      }
    })

    // Normalize customer requests
    const normalizedCustomer = customerRequests.map((r) => {
      const data = typeof r.data === 'string' ? JSON.parse(r.data as string) : r.data
      const dataObj = data as Record<string, unknown> | null

      let details = ''
      if (r.type === 'USER_ADDITION') {
        details = `Add: ${dataObj?.name || 'Unknown'} (${dataObj?.email || 'No email'})`
      } else if (r.type === 'POC_CHANGE') {
        details = 'POC change requested'
      }

      return {
        id: r.id,
        category: 'customer' as const,
        type: r.type,
        status: r.status,
        title: r.customerAccount.companyName,
        subtitle: r.requestedBy ? `by ${r.requestedBy.name} (POC)` : 'System',
        details,
        requestedBy: r.requestedBy?.name || 'System',
        requestedByEmail: r.requestedBy?.email || '',
        createdAt: r.createdAt.toISOString(),
      }
    })

    // Merge and sort by createdAt desc
    const allRequests = [...normalizedInternal, ...normalizedCustomer].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    // Pagination
    const total = allRequests.length
    const totalPages = Math.ceil(total / limit)
    const paginatedRequests = allRequests.slice((page - 1) * limit, page * limit)

    return {
      requests: paginatedRequests,
      pagination: { page, limit, total, totalPages },
      counts: {
        pending: {
          sectionUnlock: internalPendingCount,
          userAddition: userAddPendingCount,
          pocChange: pocChangePendingCount,
          total: internalPendingCount + userAddPendingCount + pocChangePendingCount,
        },
        approved: internalApprovedCount + customerApprovedCount,
        rejected: internalRejectedCount + customerRejectedCount,
      },
    }
  })

  // ============================================================================
  // INTERNAL REQUESTS
  // ============================================================================

  // GET /api/admin/internal-requests - List all internal requests
  fastify.get('/internal-requests', {
    preHandler: [requireMasterAdmin],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as {
      status?: string
      type?: string
      page?: string
      limit?: string
    }

    const status = query.status || 'PENDING'
    const type = query.type
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '20'), 25))

    // Filter by tenant via requestedBy user
    const where: Record<string, unknown> = {
      requestedBy: { tenantId },
    }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (type) {
      where.type = type
    }

    const [requests, total] = await Promise.all([
      prisma.internalRequest.findMany({
        where,
        include: {
          requestedBy: {
            select: { id: true, name: true, email: true },
          },
          certificate: {
            select: { id: true, certificateNumber: true, status: true },
          },
          reviewedBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.internalRequest.count({ where }),
    ])

    // Get counts by status for tabs
    const baseWhere: Record<string, unknown> = {
      requestedBy: { tenantId },
    }
    if (type) {
      baseWhere.type = type
    }
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.internalRequest.count({ where: { ...baseWhere, status: 'PENDING' } }),
      prisma.internalRequest.count({ where: { ...baseWhere, status: 'APPROVED' } }),
      prisma.internalRequest.count({ where: { ...baseWhere, status: 'REJECTED' } }),
    ])

    return {
      requests: requests.map((r: (typeof requests)[number]) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        data: safeJsonParse<Record<string, unknown>>(r.data, {}),
        certificate: r.certificate,
        requestedBy: r.requestedBy,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt?.toISOString() || null,
        adminNote: r.adminNote,
        createdAt: r.createdAt.toISOString(),
      })),
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  })

  // POST /api/admin/internal-requests/:id/review - Approve or reject an internal request
  fastify.post<{ Params: { id: string } }>('/internal-requests/:id/review', {
    preHandler: [requireMasterAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { id } = request.params
    const body = request.body as {
      action: 'approve' | 'reject'
      adminNote?: string
    }

    if (!body.action || !['approve', 'reject'].includes(body.action)) {
      return reply.status(400).send({
        error: 'Invalid action. Must be "approve" or "reject"',
      })
    }

    const internalRequest = await prisma.internalRequest.findUnique({
      where: { id },
      include: {
        certificate: {
          select: { id: true, certificateNumber: true, status: true, currentRevision: true, tenantId: true },
        },
        requestedBy: {
          select: { id: true, name: true, email: true, tenantId: true },
        },
      },
    })

    if (!internalRequest) {
      return reply.status(404).send({ error: 'Request not found' })
    }

    // Verify tenant access via the requestedBy user
    if (internalRequest.requestedBy.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    if (internalRequest.status !== 'PENDING') {
      return reply.status(400).send({ error: 'Request has already been processed' })
    }

    const newStatus = body.action === 'approve' ? 'APPROVED' : 'REJECTED'

    // Update the request
    const updatedRequest = await prisma.internalRequest.update({
      where: { id },
      data: {
        status: newStatus,
        reviewedById: userId,
        reviewedAt: new Date(),
        adminNote: body.adminNote || null,
      },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
        certificate: {
          select: { id: true, certificateNumber: true },
        },
        reviewedBy: {
          select: { id: true, name: true },
        },
      },
    })

    // Handle SECTION_UNLOCK specific actions
    if (internalRequest.type === 'SECTION_UNLOCK' && internalRequest.certificateId) {
      const data = safeJsonParse<{ sections?: string[]; reason?: string }>(internalRequest.data, {})
      const sectionList = data.sections?.join(', ') || 'requested sections'

      const latestEvent = await prisma.certificateEvent.findFirst({
        where: { certificateId: internalRequest.certificateId },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      })
      const nextSequence = (latestEvent?.sequenceNumber || 0) + 1

      // Create certificate event
      await prisma.certificateEvent.create({
        data: {
          certificateId: internalRequest.certificateId,
          eventType: newStatus === 'APPROVED' ? 'SECTION_UNLOCK_APPROVED' : 'SECTION_UNLOCK_REJECTED',
          eventData: JSON.stringify({
            sections: data.sections,
            reason: data.reason,
            adminNote: body.adminNote || null,
            requestId: internalRequest.id,
          }),
          userId,
          userRole: 'ADMIN',
          sequenceNumber: nextSequence,
          revision: internalRequest.certificate?.currentRevision || 0,
        },
      })

      // Create notification for the engineer
      if (newStatus === 'APPROVED') {
        await prisma.notification.create({
          data: {
            userId: internalRequest.requestedById,
            type: 'SECTION_UNLOCK_APPROVED',
            title: 'Section Unlock Approved',
            message: `Your request to unlock ${sectionList} for certificate ${internalRequest.certificate?.certificateNumber || ''} has been approved.`,
            certificateId: internalRequest.certificateId,
            data: JSON.stringify({
              requestId: internalRequest.id,
              sections: data.sections,
              adminNote: body.adminNote,
            }),
          },
        })
      } else {
        await prisma.notification.create({
          data: {
            userId: internalRequest.requestedById,
            type: 'SECTION_UNLOCK_REJECTED',
            title: 'Section Unlock Rejected',
            message: `Your section unlock request for certificate ${internalRequest.certificate?.certificateNumber || ''} has been rejected.${body.adminNote ? ` Reason: ${body.adminNote}` : ''}`,
            certificateId: internalRequest.certificateId,
            data: JSON.stringify({
              requestId: internalRequest.id,
              adminNote: body.adminNote,
            }),
          },
        })
      }
    }

    return {
      success: true,
      message: `Request ${newStatus.toLowerCase()}`,
      request: {
        id: updatedRequest.id,
        type: updatedRequest.type,
        status: updatedRequest.status,
        data: safeJsonParse<Record<string, unknown>>(updatedRequest.data, {}),
        certificate: updatedRequest.certificate,
        requestedBy: updatedRequest.requestedBy,
        reviewedBy: updatedRequest.reviewedBy,
        reviewedAt: updatedRequest.reviewedAt?.toISOString() || null,
        adminNote: updatedRequest.adminNote,
      },
    }
  })

  // ============================================================================
  // AUTHORIZATION
  // ============================================================================

  // GET /api/admin/authorization - List certificates pending admin authorization
  fastify.get('/authorization', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as {
      status?: string
      page?: string
      limit?: string
    }

    const status = query.status || 'PENDING_ADMIN_AUTHORIZATION'
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '20'), 25))

    const where: Record<string, unknown> = { tenantId }
    if (status === 'ALL') {
      where.status = { in: ['PENDING_ADMIN_AUTHORIZATION', 'AUTHORIZED'] }
    } else {
      where.status = status
    }

    const [certificates, total] = await Promise.all([
      prisma.certificate.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.certificate.count({ where }),
    ])

    return {
      certificates: certificates.map((cert: (typeof certificates)[number]) => ({
        id: cert.id,
        certificateNumber: cert.certificateNumber,
        customerName: cert.customerName,
        uucDescription: cert.uucDescription,
        uucMake: cert.uucMake,
        uucModel: cert.uucModel,
        uucSerialNumber: cert.uucSerialNumber,
        dateOfCalibration: cert.dateOfCalibration?.toISOString() || null,
        status: cert.status,
        currentRevision: cert.currentRevision,
        createdBy: cert.createdBy,
        createdAt: cert.createdAt.toISOString(),
        updatedAt: cert.updatedAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  })

  // POST /api/admin/authorization/:id/authorize - Authorize a certificate
  fastify.post<{ Params: { id: string } }>('/authorization/:id/authorize', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userEmail = request.user!.email
    const userName = request.user!.name
    const userRole = request.user!.role
    const { id } = request.params
    const body = request.body as {
      signatureData: string
      signerName: string
      sendDownloadLink?: boolean
      customerEmail?: string
      customerName?: string
    }

    if (!body.signatureData || !body.signerName) {
      return reply.status(400).send({
        error: 'Signature data and signer name are required',
      })
    }

    // Validate customer info if sending download link
    if (body.sendDownloadLink) {
      if (!body.customerEmail?.trim() || !body.customerName?.trim()) {
        return reply.status(400).send({
          error: 'Customer email and name are required to send download link',
        })
      }
    }

    // Get certificate
    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.status !== 'PENDING_ADMIN_AUTHORIZATION') {
      return reply.status(400).send({
        error: 'Certificate is not pending admin authorization',
      })
    }

    // Create admin signature and update certificate status in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Check for existing admin signature and remove it
      await tx.signature.deleteMany({
        where: { certificateId: id, signerType: 'ADMIN' },
      })

      // Create new admin signature
      const signature = await tx.signature.create({
        data: {
          certificateId: id,
          signerType: 'ADMIN',
          signerName: body.signerName.toUpperCase(),
          signerEmail: userEmail,
          signatureData: body.signatureData,
          signedAt: new Date(),
          signerId: userId,
        },
      })

      // Record signing evidence
      await appendSigningEvidence(tx, {
        certificateId: id,
        signatureId: signature.id,
        eventType: 'ADMIN_SIGNED',
        revision: certificate.currentRevision,
        evidence: collectFastifyEvidence(request, {
          signerType: 'ADMIN',
          signerName: body.signerName.toUpperCase(),
          signerEmail: userEmail,
          sessionMethod: 'direct',
        }),
      })

      // Update certificate status to AUTHORIZED
      const updatedCertificate = await tx.certificate.update({
        where: { id },
        data: {
          status: 'AUTHORIZED',
          lastModifiedById: userId,
          signedPdfPath: null, // Clear cached PDF to force regeneration
        },
      })

      // Get next event sequence
      const lastEvent = await tx.certificateEvent.findFirst({
        where: { certificateId: id },
        orderBy: { sequenceNumber: 'desc' },
      })
      const nextSequence = (lastEvent?.sequenceNumber ?? 0) + 1

      // Create certificate event
      await tx.certificateEvent.create({
        data: {
          certificateId: id,
          sequenceNumber: nextSequence,
          revision: updatedCertificate.currentRevision,
          eventType: 'ADMIN_AUTHORIZED',
          eventData: JSON.stringify({
            signerName: body.signerName.toUpperCase(),
            signerEmail: userEmail,
            authorizedAt: new Date().toISOString(),
          }),
          userId,
          userRole,
        },
      })

      return { signature, certificate: updatedCertificate }
    })

    // Notify engineer and reviewer that certificate was authorized (email + notification)
    const certNum = result.certificate.certificateNumber || `CERT-${id.substring(0, 8)}`
    const { queueCertificateReviewedEmail } = await import('../../services/queue.js')
    const staffToNotify = [certificate.createdById, certificate.reviewerId].filter(
      (uid): uid is string => !!uid
    )
    const uniqueStaff = [...new Set(staffToNotify)]

    for (const staffId of uniqueStaff) {
      enqueueNotification({
        type: 'create-notification',
        userId: staffId,
        notificationType: 'ADMIN_AUTHORIZED',
        certificateId: id,
        data: { certificateNumber: certNum, adminName: userName },
      }).catch(() => {})
    }

    // Notify customer that certificate is authorized
    prisma.signature.findFirst({
      where: { certificateId: id, signerType: 'CUSTOMER' },
      select: { customerId: true },
      orderBy: { signedAt: 'desc' },
    }).then((customerSig) => {
      if (customerSig?.customerId) {
        enqueueNotification({
          type: 'create-notification',
          customerId: customerSig.customerId,
          notificationType: 'ADMIN_AUTHORIZED',
          certificateId: id,
          data: { certificateNumber: certNum, adminName: userName },
        }).catch(() => {})
      }
    }).catch(() => {})

    // Email the engineer that the certificate is authorized
    if (certificate.createdById) {
      prisma.user.findUnique({
        where: { id: certificate.createdById },
        select: { email: true, name: true },
      }).then((engineer) => {
        if (engineer) {
          queueCertificateReviewedEmail({
            assigneeEmail: engineer.email,
            assigneeName: engineer.name,
            certificateNumber: certNum,
            reviewerName: userName,
            approved: true,
          }).catch(() => {})
        }
      }).catch(() => {})
    }

    // Handle download link if requested
    let downloadLinkResult = null
    if (body.sendDownloadLink && body.customerEmail && body.customerName) {
      try {
        const token = crypto.randomUUID()
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

        const downloadToken = await prisma.downloadToken.create({
          data: {
            token,
            certificateId: id,
            customerEmail: body.customerEmail.toLowerCase().trim(),
            customerName: body.customerName.trim(),
            expiresAt,
            maxDownloads: 5,
            sentById: userId,
          },
        })

        // Log the download link sent event
        const lastEvent = await prisma.certificateEvent.findFirst({
          where: { certificateId: id },
          orderBy: { sequenceNumber: 'desc' },
        })

        await prisma.certificateEvent.create({
          data: {
            certificateId: id,
            sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
            revision: result.certificate.currentRevision,
            eventType: 'DOWNLOAD_LINK_SENT',
            eventData: JSON.stringify({
              customerEmail: body.customerEmail.toLowerCase().trim(),
              customerName: body.customerName.trim(),
              tokenId: downloadToken.id,
              expiresAt: expiresAt.toISOString(),
              sentBy: userName,
            }),
            userId,
            userRole,
          },
        })

        downloadLinkResult = {
          sent: true,
          token,
          customerEmail: body.customerEmail.toLowerCase().trim(),
          expiresAt: expiresAt.toISOString(),
        }
      } catch {
        downloadLinkResult = {
          sent: false,
          error: 'Failed to send download link. You can send it manually later.',
        }
      }
    }

    return {
      success: true,
      certificate: {
        id: result.certificate.id,
        status: result.certificate.status,
      },
      downloadLink: downloadLinkResult,
    }
  })

  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================

  // GET /api/admin/users/admins - Get list of admins for engineer assignment
  fastify.get('/users/admins', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId

    const admins = await prisma.user.findMany({
      where: {
        tenantId,
        role: 'ADMIN',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        adminType: true,
        _count: {
          select: { engineers: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return {
      admins: admins.map((admin: (typeof admins)[number]) => ({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        adminType: admin.adminType,
        engineerCount: admin._count.engineers,
      })),
    }
  })

  // GET /api/admin/users/:id - Get user details
  fastify.get<{ Params: { id: string } }>('/users/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params

    const user = await prisma.user.findFirst({
      where: { tenantId, id },
      include: {
        assignedAdmin: {
          select: { id: true, name: true, email: true },
        },
        engineers: {
          where: { isActive: true },
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { createdCertificates: true },
        },
      },
    })

    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    // Get certificate stats
    const certificateStats = await prisma.certificate.groupBy({
      by: ['status'],
      where: { createdById: id },
      _count: true,
    })

    const stats = {
      total: user._count.createdCertificates,
      byStatus: Object.fromEntries(
        certificateStats.map((s: (typeof certificateStats)[number]) => [s.status, s._count])
      ),
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        adminType: user.adminType,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
        authProvider: user.authProvider,
        signatureUrl: user.signatureUrl,
        profileImageUrl: user.profileImageUrl,
        assignedAdmin: user.assignedAdmin,
        engineers: user.engineers,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      stats,
    }
  })

  // POST /api/admin/users - Create staff user (sends activation email)
  fastify.post('/users', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const body = request.body as {
      email: string
      name: string
      role: 'ENGINEER' | 'ADMIN'
      assignedAdminId?: string
      adminType?: 'MASTER' | 'WORKER'
    }

    // Validation
    if (!body.email || !body.name || !body.role) {
      return reply.status(400).send({ error: 'Email, name, and role are required' })
    }

    if (!['ENGINEER', 'ADMIN'].includes(body.role)) {
      return reply.status(400).send({ error: 'Invalid role. Must be ENGINEER or ADMIN' })
    }

    // Check unique email within tenant
    const existingUser = await prisma.user.findFirst({
      where: { tenantId, email: body.email },
    })

    if (existingUser) {
      return reply.status(400).send({ error: 'A user with this email already exists' })
    }

    // Validate Admin assignment for engineers
    if (body.role === 'ENGINEER') {
      if (!body.assignedAdminId) {
        return reply.status(400).send({ error: 'Engineers must be assigned to an Admin' })
      }

      const admin = await prisma.user.findFirst({
        where: { tenantId, id: body.assignedAdminId, role: 'ADMIN', isActive: true },
      })

      if (!admin) {
        return reply.status(400).send({ error: 'Invalid Admin selected' })
      }
    }

    // Validate adminType for ADMIN role
    if (body.role === 'ADMIN' && body.adminType && !['MASTER', 'WORKER'].includes(body.adminType)) {
      return reply.status(400).send({ error: 'Invalid admin type. Must be MASTER or WORKER' })
    }

    // Check subscription limit for staff users
    await enforceLimit(tenantId, 'staffUsers')

    // Generate activation token
    const activationToken = crypto.randomUUID()
    const activationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Create user (inactive, no password)
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: body.email,
        name: body.name,
        role: body.role,
        authProvider: 'PASSWORD',
        assignedAdminId: body.role === 'ENGINEER' && body.assignedAdminId ? body.assignedAdminId : null,
        adminType: body.role === 'ADMIN' ? (body.adminType || 'WORKER') : null,
        isAdmin: body.role === 'ADMIN',
        isActive: false,
        activationToken,
        activationExpiry,
      },
      include: {
        assignedAdmin: {
          select: { id: true, name: true },
        },
      },
    })

    queueStaffActivationEmail({
      to: body.email,
      userName: body.name,
      token: activationToken,
    }).catch(() => {})

    // Notify all admins about new staff creation
    const creatorName = request.user!.name || 'Admin'
    prisma.user.findMany({
      where: { tenantId, role: 'ADMIN', isActive: true, NOT: { id: request.user!.sub } },
      select: { id: true },
    }).then((admins) => {
      for (const admin of admins) {
        enqueueNotification({
          type: 'create-notification',
          userId: admin.id,
          notificationType: 'STAFF_CREATED',
          data: { creatorName, staffName: body.name, staffEmail: body.email },
        }).catch(() => {})
      }
    }).catch(() => {})

    // Update usage tracking (async, non-blocking)
    updateUsageTracking(tenantId).catch(() => {})

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        adminType: user.adminType,
        assignedAdmin: user.assignedAdmin,
        isActive: user.isActive,
      },
      activationToken, // Return for now, remove when email sending is implemented
      message: `User created. Activation email will be sent to ${body.email}`,
    }
  })

  // PUT /api/admin/users/:id - Update user
  fastify.put<{ Params: { id: string } }>('/users/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const currentUserId = request.user!.sub
    const { id } = request.params
    const body = request.body as {
      name?: string
      role?: 'ENGINEER' | 'ADMIN'
      assignedAdminId?: string | null
      signatureUrl?: string
      adminType?: 'MASTER' | 'WORKER'
    }

    const existingUser = await prisma.user.findFirst({
      where: { tenantId, id },
      include: {
        engineers: { select: { id: true } },
      },
    })

    if (!existingUser) {
      return reply.status(404).send({ error: 'User not found' })
    }

    // Prevent admin from changing their own role
    if (id === currentUserId && body.role && body.role !== existingUser.role) {
      return reply.status(400).send({ error: 'You cannot change your own role' })
    }

    const updateData: Record<string, unknown> = {}

    if (body.name !== undefined) {
      updateData.name = body.name
    }

    if (body.signatureUrl !== undefined) {
      updateData.signatureUrl = body.signatureUrl
    }

    if (body.role !== undefined && body.role !== existingUser.role) {
      if (!['ENGINEER', 'ADMIN'].includes(body.role)) {
        return reply.status(400).send({ error: 'Invalid role' })
      }

      // If changing from ADMIN to ENGINEER, ensure no engineers are assigned
      if (existingUser.role === 'ADMIN' && body.role === 'ENGINEER') {
        if (existingUser.engineers.length > 0) {
          return reply.status(400).send({
            error: 'Cannot demote Admin with assigned engineers. Reassign them first.',
          })
        }
      }

      updateData.role = body.role
      updateData.isAdmin = body.role === 'ADMIN'

      // Clear Admin assignment if becoming ADMIN
      if (body.role !== 'ENGINEER') {
        updateData.assignedAdminId = null
      } else {
        updateData.adminType = null
      }
    }

    // Handle Admin assignment for engineers
    if (body.assignedAdminId !== undefined) {
      const finalRole = body.role || existingUser.role

      if (finalRole === 'ENGINEER') {
        if (body.assignedAdminId === null) {
          return reply.status(400).send({ error: 'Engineers must be assigned to an Admin' })
        }

        const admin = await prisma.user.findFirst({
          where: { tenantId, id: body.assignedAdminId, role: 'ADMIN', isActive: true },
        })

        if (!admin) {
          return reply.status(400).send({ error: 'Invalid Admin selected' })
        }

        updateData.assignedAdminId = body.assignedAdminId
      }
    }

    // Handle adminType - only applies to ADMIN role
    if (body.adminType !== undefined) {
      const finalRole = body.role || existingUser.role
      if (finalRole === 'ADMIN') {
        if (!['MASTER', 'WORKER'].includes(body.adminType)) {
          return reply.status(400).send({ error: 'Invalid admin type. Must be MASTER or WORKER.' })
        }
        updateData.adminType = body.adminType
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        assignedAdmin: {
          select: { id: true, name: true },
        },
      },
    })

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        adminType: user.adminType,
        isActive: user.isActive,
        assignedAdmin: user.assignedAdmin,
      },
    }
  })

  // DELETE /api/admin/users/:id - Deactivate user (soft delete)
  fastify.delete<{ Params: { id: string } }>('/users/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const currentUserId = request.user!.sub
    const { id } = request.params

    // Prevent admin from deactivating themselves
    if (id === currentUserId) {
      return reply.status(400).send({ error: 'You cannot deactivate your own account' })
    }

    const user = await prisma.user.findFirst({
      where: { tenantId, id },
    })

    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    // Prevent deactivating the last admin
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { tenantId, role: 'ADMIN', isActive: true },
      })

      if (adminCount <= 1) {
        return reply.status(400).send({ error: 'Cannot deactivate the last admin user' })
      }
    }

    // Soft delete - set isActive to false
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    })

    // Update usage tracking (async, non-blocking)
    updateUsageTracking(tenantId).catch(() => {})

    return { success: true, message: 'User deactivated successfully' }
  })

  // PUT /api/admin/users/:id/reactivate - Reactivate a deactivated user
  fastify.put<{ Params: { id: string } }>('/users/:id/reactivate', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params

    const user = await prisma.user.findFirst({
      where: { tenantId, id },
    })

    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    if (user.isActive) {
      return reply.status(400).send({ error: 'User is already active' })
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: true },
    })

    return { success: true, message: 'User reactivated successfully' }
  })

  // GET /api/admin/users/:id/tat-metrics - Per-user TAT performance metrics
  fastify.get('/users/:id/tat-metrics', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { periodDays: periodDaysStr } = request.query as { periodDays?: string }
    const periodDays = Math.max(1, parseInt(periodDaysStr || '30', 10))
    const tenantId = request.tenantId

    const { calculateUserTATMetrics, calculateRequestHandlingMetrics } = await import('../../lib/user-tat-calculator.js')

    const user = await prisma.user.findUnique({
      where: { id, tenantId },
      select: { id: true, role: true, adminType: true },
    })

    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - (periodDays * 2))
    startDate.setHours(0, 0, 0, 0)

    const periodStart = new Date(now)
    periodStart.setDate(periodStart.getDate() - periodDays)
    periodStart.setHours(0, 0, 0, 0)

    const previousPeriodStart = new Date(periodStart)
    previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays)

    const whereConditions: { OR: object[] } = {
      OR: [
        { createdById: id },
        { reviewerId: id },
      ],
    }

    if (user.role === 'ADMIN') {
      whereConditions.OR.push({
        status: 'AUTHORIZED',
        events: {
          some: {
            eventType: 'ADMIN_AUTHORIZED',
            userId: id,
            createdAt: { gte: startDate },
          },
        },
      })
    }

    const certificates = await prisma.certificate.findMany({
      where: {
        tenantId,
        ...whereConditions,
        events: {
          some: {
            createdAt: { gte: startDate },
          },
        },
      },
      select: {
        id: true,
        status: true,
        currentRevision: true,
        createdById: true,
        reviewerId: true,
        events: {
          select: {
            id: true,
            eventType: true,
            createdAt: true,
            certificateId: true,
            userId: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    const certMetrics = calculateUserTATMetrics(certificates, id, periodDays)

    let requestHandling = null
    if (user.role === 'ADMIN') {
      const internalRequests = await prisma.internalRequest.findMany({
        where: {
          reviewedById: id,
          reviewedAt: { gte: startDate },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          reviewedAt: true,
          reviewedById: true,
        },
      })

      const customerRequests = user.adminType === 'MASTER'
        ? await prisma.customerRequest.findMany({
            where: {
              reviewedById: id,
              reviewedAt: { gte: startDate },
            },
            select: {
              id: true,
              status: true,
              createdAt: true,
              reviewedAt: true,
              reviewedById: true,
            },
          })
        : []

      requestHandling = calculateRequestHandlingMetrics(
        internalRequests,
        customerRequests,
        id,
        user.adminType,
        periodStart,
        previousPeriodStart
      )
    }

    return {
      ...certMetrics,
      requestHandling,
    }
  })

  // ============================================================================
  // CUSTOMERS SEARCH
  // ============================================================================

  // GET /api/admin/customers/search - Search customer accounts for autocomplete
  fastify.get('/customers/search', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as { q?: string; limit?: string }
    const searchQuery = query.q || ''
    const limit = Math.min(parseInt(query.limit || '10'), 20)

    if (searchQuery.length < 2) {
      return { customers: [] }
    }

    const customers = await prisma.customerAccount.findMany({
      where: {
        tenantId,
        isActive: true,
        companyName: {
          contains: searchQuery,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        companyName: true,
        address: true,
        contactEmail: true,
        contactPhone: true,
      },
      orderBy: { companyName: 'asc' },
      take: limit,
    })

    return { customers }
  })

  // ============================================================================
  // SUBSCRIPTION
  // ============================================================================

  // GET /api/admin/subscription - Get subscription status and usage
  fastify.get('/subscription', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const { getSubscriptionStatus, getCurrentUsage } = await import('../../services/subscription.js')
    const tenantId = request.tenantId

    // Tier-based limits
    const TIER_LIMITS: Record<string, { certificates: number; staffUsers: number; customerAccounts: number; customerUsers: number }> = {
      STARTER:  { certificates: 500,  staffUsers: 5,  customerAccounts: 20,  customerUsers: 50 },
      GROWTH:   { certificates: 5000, staffUsers: 15, customerAccounts: 100, customerUsers: 300 },
      SCALE:    { certificates: -1,   staffUsers: -1, customerAccounts: -1,  customerUsers: -1 },
      INTERNAL: { certificates: -1,   staffUsers: -1, customerAccounts: -1,  customerUsers: -1 },
    }

    // Base prices in paise
    const TIER_BASE_PRICE: Record<string, number> = {
      STARTER: 299900,
      GROWTH: 599900,
      SCALE: 1199900,
      INTERNAL: 0,
    }

    // Per-resource add-on prices in paise
    const ADD_ON_PRICES = {
      staffSeat: 5000,        // ₹50/month
      customerAccount: 50000, // ₹500/month
      customerUser: 10000,    // ₹100/month
    }
    const GST_RATE = 0.18

    const status = await getSubscriptionStatus(tenantId)

    // Always compute live usage even without a subscription
    const liveUsage = status
      ? status.usage
      : await getCurrentUsage(tenantId)

    const usage = {
      certificatesThisPeriod: liveUsage.certificatesIssued,
      staffUsers: liveUsage.staffUserCount,
      customerAccounts: liveUsage.customerAccountCount,
      customerUsers: liveUsage.customerUserCount,
    }

    if (!status) {
      return {
        subscription: null,
        usage,
        limits: TIER_LIMITS.STARTER, // default limits for display
        billing: { subtotal: 0, tax: 0, total: 0 },
        addOnPrices: ADD_ON_PRICES,
      }
    }

    const tier = status.tier as string
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.STARTER

    const extraStaffCost = (status.extraSeats.staff || 0) * ADD_ON_PRICES.staffSeat
    const extraAccountsCost = (status.extraSeats.customerAccounts || 0) * ADD_ON_PRICES.customerAccount
    const extraUsersCost = (status.extraSeats.customerUsers || 0) * ADD_ON_PRICES.customerUser
    const basePrice = TIER_BASE_PRICE[tier] || 0
    const subtotal = basePrice + extraStaffCost + extraAccountsCost + extraUsersCost
    const tax = Math.round(subtotal * GST_RATE)
    const total = subtotal + tax

    return {
      subscription: {
        tier: status.tier,
        status: status.status,
        currentPeriodStart: status.currentPeriodStart.toISOString(),
        currentPeriodEnd: status.currentPeriodEnd.toISOString(),
        extraStaffSeats: status.extraSeats.staff,
        extraCustomerAccounts: status.extraSeats.customerAccounts,
        extraCustomerUserSeats: status.extraSeats.customerUsers,
      },
      usage,
      limits,
      billing: { subtotal, tax, total },
      addOnPrices: ADD_ON_PRICES,
    }
  })

  // POST /api/admin/subscription/seats - Update add-on seats/accounts
  fastify.post('/subscription/seats', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const body = request.body as {
      extraStaffSeats?: number
      extraCustomerAccounts?: number
      extraCustomerUserSeats?: number
    }

    const subscription = await prisma.tenantSubscription.findUnique({
      where: { tenantId },
    })

    if (!subscription) {
      return reply.status(404).send({ error: 'No subscription found' })
    }

    if (['SCALE', 'INTERNAL'].includes(subscription.tier)) {
      return reply.status(400).send({ error: 'Add-ons not available for unlimited tiers' })
    }

    const extraStaffSeats = Math.max(0, Math.floor(body.extraStaffSeats ?? subscription.extraStaffSeats))
    const extraCustomerAccounts = Math.max(0, Math.floor(body.extraCustomerAccounts ?? subscription.extraCustomerAccounts))
    const extraCustomerUserSeats = Math.max(0, Math.floor(body.extraCustomerUserSeats ?? subscription.extraCustomerUserSeats))

    await prisma.tenantSubscription.update({
      where: { tenantId },
      data: {
        extraStaffSeats,
        extraCustomerAccounts,
        extraCustomerUserSeats,
      },
    })

    return { success: true }
  })

  // GET /api/admin/certificates/:id - Admin certificate detail view
  fastify.get<{ Params: { id: string } }>('/certificates/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params

    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true, email: true } },
        parameters: {
          include: { results: true },
          orderBy: { sortOrder: 'asc' },
        },
        masterInstruments: true,
        feedbacks: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true, role: true } } },
        },
        chatThreads: {
          include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
        },
        events: {
          orderBy: { sequenceNumber: 'desc' },
          include: {
            user: { select: { id: true, name: true, role: true } },
            customer: { select: { id: true, name: true, email: true } },
          },
        },
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    // Calculate TAT
    const submissionEvents = certificate.events.filter((e: any) => e.eventType === 'SUBMITTED_FOR_REVIEW')
    const firstSubmission = submissionEvents.length > 0
      ? submissionEvents.reduce((earliest: any, e: any) => e.createdAt < earliest.createdAt ? e : earliest)
      : null
    const authorizedEvent = certificate.status === 'AUTHORIZED'
      ? certificate.events.find((e: any) => e.eventType === 'ADMIN_AUTHORIZED')
      : null

    let tat: { hours: number; status: 'ok' | 'warning' | 'overdue' } = { hours: 0, status: 'ok' }
    if (firstSubmission) {
      const end = authorizedEvent?.createdAt || new Date()
      const diffMs = end.getTime() - firstSubmission.createdAt.getTime()
      const hours = Math.floor(diffMs / (1000 * 60 * 60))
      tat = { hours, status: hours > 48 ? 'overdue' : hours > 24 ? 'warning' : 'ok' }
    }

    const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
      DRAFT: { label: 'Draft', className: 'bg-amber-50 text-amber-600 border-amber-100' },
      PENDING_REVIEW: { label: 'Pending Review', className: 'bg-blue-50 text-blue-600 border-blue-100' },
      REVISION_REQUIRED: { label: 'Revision Required', className: 'bg-orange-50 text-orange-600 border-orange-100' },
      PENDING_CUSTOMER_APPROVAL: { label: 'Pending Customer', className: 'bg-purple-50 text-purple-600 border-purple-100' },
      CUSTOMER_REVISION_REQUIRED: { label: 'Customer Revision', className: 'bg-pink-50 text-pink-600 border-pink-100' },
      PENDING_ADMIN_AUTHORIZATION: { label: 'Pending Authorization', className: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
      APPROVED: { label: 'Approved', className: 'bg-green-50 text-green-600 border-green-100' },
      AUTHORIZED: { label: 'Authorized', className: 'bg-green-50 text-green-600 border-green-100' },
      REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-600 border-red-100' },
    }
    const statusConfig = STATUS_CONFIG[certificate.status] || STATUS_CONFIG.PENDING_REVIEW

    const engineerThread = certificate.chatThreads.find((t: any) => t.threadType === 'ASSIGNEE_REVIEWER')
    const customerThread = certificate.chatThreads.find((t: any) => t.threadType === 'REVIEWER_CUSTOMER')

    const reviewers = await prisma.user.findMany({
      where: { tenantId, role: 'ADMIN', id: { not: certificate.createdById } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })

    return {
      certificate: {
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
        status: certificate.status,
        customerName: certificate.customerName,
        customerAddress: certificate.customerAddress,
        calibratedAt: certificate.calibratedAt,
        srfNumber: certificate.srfNumber,
        srfDate: certificate.srfDate?.toISOString() || null,
        dateOfCalibration: certificate.dateOfCalibration?.toISOString() || null,
        calibrationDueDate: certificate.calibrationDueDate?.toISOString() || null,
        dueDateNotApplicable: certificate.dueDateNotApplicable,
        uucDescription: certificate.uucDescription,
        uucMake: certificate.uucMake,
        uucModel: certificate.uucModel,
        uucSerialNumber: certificate.uucSerialNumber,
        uucLocationName: certificate.uucLocationName,
        ambientTemperature: certificate.ambientTemperature,
        relativeHumidity: certificate.relativeHumidity,
        calibrationStatus: safeJsonParse<string[]>(certificate.calibrationStatus, []),
        conclusionStatements: safeJsonParse<string[]>(certificate.selectedConclusionStatements, []),
        additionalConclusionStatement: certificate.additionalConclusionStatement,
        currentRevision: certificate.currentRevision,
        createdAt: certificate.createdAt.toISOString(),
        updatedAt: certificate.updatedAt.toISOString(),
        parameters: certificate.parameters.map((p: any) => ({
          id: p.id,
          parameterName: p.parameterName,
          parameterUnit: p.parameterUnit,
          rangeMin: p.rangeMin,
          rangeMax: p.rangeMax,
          rangeUnit: p.rangeUnit,
          accuracyValue: p.accuracyValue,
          accuracyUnit: p.accuracyUnit,
          accuracyType: p.accuracyType,
          errorFormula: p.errorFormula,
          showAfterAdjustment: p.showAfterAdjustment,
          requiresBinning: p.requiresBinning,
          bins: p.bins,
          sopReference: p.sopReference,
          results: p.results.map((r: any) => ({
            id: r.id,
            pointNumber: r.pointNumber,
            standardReading: r.standardReading,
            beforeAdjustment: r.beforeAdjustment,
            afterAdjustment: r.afterAdjustment,
            errorObserved: r.errorObserved,
            isOutOfLimit: r.isOutOfLimit,
          })),
        })),
        masterInstruments: certificate.masterInstruments.map((mi: any) => ({
          id: mi.id,
          description: mi.description,
          make: mi.make,
          model: mi.model,
          serialNumber: mi.serialNumber,
          calibrationDueDate: mi.calibrationDueDate,
        })),
      },
      assignee: {
        id: certificate.createdBy.id,
        name: certificate.createdBy.name || 'Unknown',
        email: certificate.createdBy.email,
      },
      reviewer: certificate.reviewer ? {
        id: certificate.reviewer.id,
        name: certificate.reviewer.name || 'Unknown',
        email: certificate.reviewer.email,
      } : null,
      feedbacks: certificate.feedbacks.map((f: any) => ({
        id: f.id,
        feedbackType: f.feedbackType,
        comment: f.comment,
        createdAt: f.createdAt.toISOString(),
        revisionNumber: f.revisionNumber,
        targetSection: f.targetSection,
        user: { name: f.user.name, role: f.user.role },
      })),
      events: certificate.events.map((e: any) => ({
        id: e.id,
        sequenceNumber: e.sequenceNumber,
        revision: e.revision,
        eventType: e.eventType,
        eventData: e.eventData,
        userRole: e.userRole,
        createdAt: e.createdAt.toISOString(),
        user: e.user ? { id: e.user.id, name: e.user.name, role: e.user.role } : null,
        customer: e.customer ? { id: e.customer.id, name: e.customer.name, email: e.customer.email } : null,
      })),
      chatThreads: {
        engineer: engineerThread?.id || null,
        customer: customerThread?.id || null,
      },
      headerData: {
        certificateNumber: certificate.certificateNumber,
        status: certificate.status,
        statusLabel: statusConfig.label,
        statusClassName: statusConfig.className,
        tat,
        assigneeName: certificate.createdBy.name || 'Unknown',
        customerName: certificate.customerName || '-',
        calibratedAt: certificate.calibratedAt,
        currentRevision: certificate.currentRevision,
      },
      reviewers,
    }
  })

  // PATCH /api/admin/certificates/:id/edit - Admin edits certificate fields
  fastify.patch<{ Params: { id: string } }>('/certificates/:id/edit', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userName = request.user!.name
    const { id } = request.params
    const body = request.body as { field: string; value: string; reason: string }

    const ALLOWED_FIELDS = ['certificateNumber', 'dateOfCalibration', 'calibrationDueDate', 'reviewerId'] as const
    type AllowedField = (typeof ALLOWED_FIELDS)[number]

    if (!body.field || !ALLOWED_FIELDS.includes(body.field as AllowedField)) {
      return reply.status(400).send({ error: `Field not editable. Allowed: ${ALLOWED_FIELDS.join(', ')}` })
    }

    if (!body.reason?.trim()) {
      return reply.status(400).send({ error: 'Reason is required for audit trail' })
    }

    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    const oldValue = (certificate as Record<string, unknown>)[body.field]
    const oldValueStr = oldValue instanceof Date ? oldValue.toISOString() : oldValue != null ? String(oldValue) : null

    // Prepare update data
    let updateData: Record<string, unknown> = {}
    if (body.field === 'dateOfCalibration' || body.field === 'calibrationDueDate') {
      updateData = { [body.field]: body.value ? new Date(body.value) : null }
    } else if (body.field === 'reviewerId') {
      updateData = { [body.field]: body.value || null }
    } else {
      updateData = { [body.field]: body.value }
    }

    // Validate specific fields
    if (body.field === 'certificateNumber' && body.value) {
      const existing = await prisma.certificate.findFirst({
        where: { tenantId, certificateNumber: body.value, id: { not: id } },
      })
      if (existing) {
        return reply.status(400).send({ error: 'Certificate number already exists' })
      }
    }

    if (body.field === 'reviewerId' && body.value) {
      const reviewer = await prisma.user.findFirst({
        where: { tenantId, id: body.value, isActive: true },
      })
      if (!reviewer) {
        return reply.status(400).send({ error: 'Reviewer not found' })
      }
      if (reviewer.id === certificate.createdById) {
        return reply.status(400).send({ error: 'Cannot assign certificate creator as reviewer' })
      }
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const lastEvent = await tx.certificateEvent.findFirst({
        where: { certificateId: id },
        orderBy: { sequenceNumber: 'desc' },
      })

      await tx.certificate.update({
        where: { id },
        data: { ...updateData, lastModifiedById: userId },
      })

      await tx.certificateEvent.create({
        data: {
          certificateId: id,
          sequenceNumber: (lastEvent?.sequenceNumber ?? 0) + 1,
          revision: certificate.currentRevision,
          userId,
          userRole: 'ADMIN',
          eventType: 'ADMIN_EDIT',
          eventData: JSON.stringify({
            field: body.field,
            from: oldValueStr,
            to: body.value,
            reason: body.reason.trim(),
            adminId: userId,
            adminName: userName,
          }),
        },
      })

      await tx.auditLog.create({
        data: {
          entityType: 'Certificate',
          entityId: id,
          action: 'ADMIN_EDIT',
          actorId: userId,
          actorType: 'ADMIN',
          changes: JSON.stringify({
            field: body.field,
            from: oldValueStr,
            to: body.value,
            reason: body.reason.trim(),
          }),
        },
      })
    })

    const fieldLabels: Record<string, string> = {
      certificateNumber: 'Certificate Number',
      dateOfCalibration: 'Date of Calibration',
      calibrationDueDate: 'Calibration Due Date',
      reviewerId: 'Reviewer',
    }

    return { success: true, message: `${fieldLabels[body.field] || body.field} updated successfully` }
  })

  // POST /api/admin/certificates/:id/send-download-link - Send download link to customer
  fastify.post<{ Params: { id: string } }>('/certificates/:id/send-download-link', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userName = request.user!.name
    const userEmail = request.user!.email
    const { id } = request.params
    const body = request.body as {
      customerEmail: string
      customerName: string
      ccAdmin?: boolean
    }

    if (!body.customerEmail?.trim()) {
      return reply.status(400).send({ error: 'Customer email is required' })
    }
    if (!body.customerName?.trim()) {
      return reply.status(400).send({ error: 'Customer name is required' })
    }

    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (!['AUTHORIZED', 'COMPLETED'].includes(certificate.status)) {
      return reply.status(400).send({ error: 'Certificate must be authorized before sending download link' })
    }

    if (!certificate.signedPdfPath) {
      return reply.status(400).send({ error: 'Signed PDF not available. Please generate the PDF first.' })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const token = crypto.randomUUID()

    const downloadToken = await prisma.downloadToken.create({
      data: {
        token,
        certificateId: id,
        customerEmail: body.customerEmail.toLowerCase().trim(),
        customerName: body.customerName.trim(),
        expiresAt,
        maxDownloads: 5,
        sentById: userId,
      },
    })

    // Log event
    const lastEvent = await prisma.certificateEvent.findFirst({
      where: { certificateId: id },
      orderBy: { sequenceNumber: 'desc' },
    })

    await prisma.certificateEvent.create({
      data: {
        certificateId: id,
        sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
        revision: certificate.currentRevision,
        eventType: 'DOWNLOAD_LINK_SENT',
        eventData: JSON.stringify({
          customerEmail: body.customerEmail.toLowerCase().trim(),
          customerName: body.customerName.trim(),
          tokenId: downloadToken.id,
          expiresAt: expiresAt.toISOString(),
          sentBy: userName,
        }),
        userId,
        userRole: 'ADMIN',
      },
    })

    const baseUrl = process.env.APP_URL || 'https://app.hta-calibration.com'
    const downloadUrl = `${baseUrl}/customer/download/${token}`

    // Send email
    const { sendEmail } = await import('../../services/email.js')
    const recipients = [body.customerEmail.toLowerCase().trim()]
    if (body.ccAdmin && userEmail) {
      recipients.push(userEmail)
    }

    for (const to of recipients) {
      sendEmail({
        to,
        template: 'certificate-download-ready' as any,
        props: {
          customerName: body.customerName.trim(),
          certificateNumber: certificate.certificateNumber,
          instrumentDescription: certificate.uucDescription || 'Calibration Certificate',
          serialNumber: certificate.uucSerialNumber || '',
          calibrationDate: certificate.dateOfCalibration
            ? certificate.dateOfCalibration.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : '',
          downloadUrl,
        },
      }).catch(() => {})
    }

    return {
      success: true,
      token: downloadToken.token,
      tokenExpiry: downloadToken.expiresAt.toISOString(),
      downloadUrl,
      maxDownloads: downloadToken.maxDownloads,
    }
  })

  // GET /api/admin/certificates/:id/send-download-link - Download link history
  fastify.get<{ Params: { id: string } }>('/certificates/:id/send-download-link', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const { id } = request.params

    const tokens = await prisma.downloadToken.findMany({
      where: { certificateId: id },
      orderBy: { createdAt: 'desc' },
      include: { sentBy: { select: { name: true, email: true } } },
    })

    const baseUrl = process.env.APP_URL || 'https://app.hta-calibration.com'

    return {
      tokens: tokens.map((t: any) => ({
        id: t.id,
        customerEmail: t.customerEmail,
        customerName: t.customerName,
        downloadUrl: `${baseUrl}/customer/download/${t.token}`,
        createdAt: t.createdAt.toISOString(),
        expiresAt: t.expiresAt.toISOString(),
        downloadCount: t.downloadCount,
        maxDownloads: t.maxDownloads,
        downloadedAt: t.downloadedAt?.toISOString() || null,
        isExpired: new Date() > t.expiresAt,
        isExhausted: t.downloadCount >= t.maxDownloads,
        sentBy: t.sentBy?.name || 'Unknown',
      })),
    }
  })

  // POST /api/admin/customers - Create customer account with POC
  fastify.post('/customers', {
    preHandler: [requireMasterAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const body = request.body as {
      companyName: string
      address?: string
      contactEmail?: string
      contactPhone?: string
      assignedAdminId?: string
      pocName: string
      pocEmail: string
    }

    if (!body.companyName?.trim()) {
      return reply.status(400).send({ error: 'Company name is required' })
    }
    if (!body.pocName?.trim()) {
      return reply.status(400).send({ error: 'POC name is required' })
    }
    if (!body.pocEmail?.trim()) {
      return reply.status(400).send({ error: 'POC email is required' })
    }

    // Check unique company name
    const existingAccount = await prisma.customerAccount.findFirst({
      where: { tenantId, companyName: body.companyName.trim() },
    })
    if (existingAccount) {
      return reply.status(400).send({ error: 'A customer account with this name already exists' })
    }

    // Check unique POC email
    const existingUser = await prisma.customerUser.findFirst({
      where: { tenantId, email: body.pocEmail.trim().toLowerCase() },
    })
    if (existingUser) {
      return reply.status(400).send({ error: 'A user with this email already exists' })
    }

    // Validate admin if provided
    if (body.assignedAdminId) {
      const admin = await prisma.user.findFirst({
        where: { tenantId, id: body.assignedAdminId, role: 'ADMIN', isActive: true },
      })
      if (!admin) {
        return reply.status(400).send({ error: 'Invalid Admin selected' })
      }
    }

    const activationToken = crypto.randomUUID()
    const activationExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.customerAccount.create({
        data: {
          tenantId,
          companyName: body.companyName.trim(),
          address: body.address?.trim() || null,
          contactEmail: body.contactEmail?.trim() || null,
          contactPhone: body.contactPhone?.trim() || null,
          assignedAdminId: body.assignedAdminId || null,
          isActive: true,
        },
      })

      const pocUser = await tx.customerUser.create({
        data: {
          tenantId,
          email: body.pocEmail.trim().toLowerCase(),
          name: body.pocName.trim(),
          customerAccountId: account.id,
          companyName: body.companyName.trim(),
          isPoc: true,
          isActive: false,
          activationToken,
          activationExpiry,
        },
      })

      const updatedAccount = await tx.customerAccount.update({
        where: { id: account.id },
        data: { primaryPocId: pocUser.id },
        include: {
          assignedAdmin: { select: { id: true, name: true } },
          primaryPoc: { select: { id: true, name: true, email: true, isActive: true } },
        },
      })

      return { account: updatedAccount, pocUser }
    })

    // Send activation email
    const baseUrl = process.env.APP_URL || 'https://app.hta-calibration.com'
    const activationUrl = `${baseUrl}/customer/activate/${activationToken}`

    const { sendEmail } = await import('../../services/email.js')
    sendEmail({
      to: body.pocEmail.trim().toLowerCase(),
      template: 'customer-activation' as any,
      props: {
        userName: body.pocName.trim(),
        companyName: body.companyName.trim(),
        activationUrl,
      },
    }).catch(() => {})

    return {
      success: true,
      account: {
        id: result.account.id,
        companyName: result.account.companyName,
        assignedAdmin: result.account.assignedAdmin,
        primaryPoc: result.account.primaryPoc,
      },
      message: 'Customer account created. Activation email will be sent to the POC.',
    }
  })

  // GET /api/admin/customers/:id/users - List users for a customer account
  fastify.get<{ Params: { id: string } }>('/customers/:id/users', {
    preHandler: [requireMasterAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params

    const account = await prisma.customerAccount.findFirst({
      where: { tenantId, id },
      select: { id: true, companyName: true, primaryPocId: true },
    })

    if (!account) {
      return reply.status(404).send({ error: 'Customer account not found' })
    }

    const users = await prisma.customerUser.findMany({
      where: { customerAccountId: id },
      select: {
        id: true,
        email: true,
        name: true,
        isPoc: true,
        isActive: true,
        activatedAt: true,
        createdAt: true,
      },
      orderBy: [{ isPoc: 'desc' }, { name: 'asc' }],
    })

    return {
      users: users.map((u: any) => ({
        ...u,
        activatedAt: u.activatedAt?.toISOString() || null,
        createdAt: u.createdAt.toISOString(),
      })),
    }
  })

  // POST /api/admin/customers/:id/users - Admin adds user to customer account
  fastify.post<{ Params: { id: string } }>('/customers/:id/users', {
    preHandler: [requireMasterAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { id } = request.params
    const body = request.body as { name: string; email: string }

    if (!body.name?.trim()) {
      return reply.status(400).send({ error: 'User name is required' })
    }
    if (!body.email?.trim()) {
      return reply.status(400).send({ error: 'User email is required' })
    }

    const normalizedEmail = body.email.trim().toLowerCase()

    const account = await prisma.customerAccount.findFirst({
      where: { tenantId, id },
      select: { id: true, companyName: true },
    })

    if (!account) {
      return reply.status(404).send({ error: 'Customer account not found' })
    }

    const existingUser = await prisma.customerUser.findFirst({
      where: { tenantId, email: normalizedEmail },
    })

    if (existingUser) {
      return reply.status(400).send({ error: 'A user with this email already exists' })
    }

    const activationToken = crypto.randomUUID()
    const activationExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.customerUser.create({
        data: {
          tenantId,
          email: normalizedEmail,
          name: body.name.trim(),
          customerAccountId: id,
          companyName: account.companyName,
          isPoc: false,
          isActive: false,
          activationToken,
          activationExpiry,
        },
      })

      await tx.customerRequest.create({
        data: {
          type: 'USER_ADDITION',
          status: 'APPROVED',
          customerAccountId: id,
          data: JSON.stringify({ name: body.name.trim(), email: normalizedEmail }),
          reviewedById: userId,
          reviewedAt: new Date(),
        },
      })

      return user
    })

    // Send activation email
    const baseUrl = process.env.APP_URL || 'https://app.hta-calibration.com'
    const activationUrl = `${baseUrl}/customer/activate/${activationToken}`

    const { sendEmail } = await import('../../services/email.js')
    sendEmail({
      to: normalizedEmail,
      template: 'customer-activation' as any,
      props: {
        userName: body.name.trim(),
        companyName: account.companyName,
        activationUrl,
      },
    }).catch(() => {})

    return {
      success: true,
      user: {
        id: result.id,
        name: result.name,
        email: result.email,
        isActive: result.isActive,
      },
      message: 'User created. Invite email will be sent.',
    }
  })

  // GET /api/admin/customers/requests - Get customer requests (team additions, etc.)
  fastify.get('/customers/requests', {
    preHandler: [requireMasterAdmin],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as { status?: string; page?: string; limit?: string }
    const status = query.status || 'PENDING'
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '20'), 25))

    const where: Record<string, unknown> = {}
    if (status !== 'ALL') {
      where.status = status
    }

    // Filter by tenant through customer account
    const [requests, total] = await Promise.all([
      prisma.customerRequest.findMany({
        where,
        include: {
          customerAccount: { select: { id: true, companyName: true, tenantId: true } },
          requestedBy: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customerRequest.count({ where }),
    ])

    // Filter by tenant
    const tenantRequests = requests.filter((r: any) => r.customerAccount?.tenantId === tenantId)

    return {
      requests: tenantRequests.map((r: any) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        data: safeJsonParse(r.data, {}),
        customerAccount: r.customerAccount ? { id: r.customerAccount.id, companyName: r.customerAccount.companyName } : null,
        requestedBy: r.requestedBy,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }
  })

  // GET /api/admin/customers/requests/:id - Get customer request detail
  fastify.get<{ Params: { id: string } }>('/customers/requests/:id', {
    preHandler: [requireMasterAdmin],
  }, async (request, reply) => {
    const { id } = request.params

    const customerRequest = await prisma.customerRequest.findUnique({
      where: { id },
      include: {
        customerAccount: {
          select: { id: true, companyName: true, primaryPocId: true },
        },
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    })

    if (!customerRequest) {
      return reply.status(404).send({ error: 'Request not found' })
    }

    return {
      id: customerRequest.id,
      type: customerRequest.type,
      status: customerRequest.status,
      data: typeof customerRequest.data === 'string' ? JSON.parse(customerRequest.data) : customerRequest.data,
      customerAccount: customerRequest.customerAccount
        ? { id: customerRequest.customerAccount.id, companyName: customerRequest.customerAccount.companyName }
        : null,
      requestedBy: customerRequest.requestedBy,
      reviewedBy: customerRequest.reviewedBy,
      reviewedAt: customerRequest.reviewedAt?.toISOString() || null,
      rejectionReason: customerRequest.rejectionReason,
      createdAt: customerRequest.createdAt.toISOString(),
    }
  })

  // POST /api/admin/customers/requests/:id/approve - Approve a customer request
  fastify.post<{ Params: { id: string } }>('/customers/requests/:id/approve', {
    preHandler: [requireMasterAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const adminId = request.user!.sub

    const customerRequest = await prisma.customerRequest.findUnique({
      where: { id },
      include: {
        customerAccount: {
          select: { id: true, companyName: true, primaryPocId: true, tenantId: true },
        },
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    })

    if (!customerRequest) {
      return reply.status(404).send({ error: 'Request not found' })
    }
    if (customerRequest.status !== 'PENDING') {
      return reply.status(400).send({ error: 'Request has already been processed' })
    }

    const data = typeof customerRequest.data === 'string'
      ? JSON.parse(customerRequest.data) as Record<string, string>
      : customerRequest.data as Record<string, string>

    if (customerRequest.type === 'USER_ADDITION') {
      const normalizedEmail = (data.email || '').toLowerCase()

      // Check email not already in use
      const existingUser = await prisma.customerUser.findFirst({
        where: { email: normalizedEmail },
      })
      if (existingUser) {
        return reply.status(400).send({ error: 'A user with this email already exists' })
      }

      const { randomUUID } = await import('crypto')
      const activationToken = randomUUID()
      const activationExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      const result = await prisma.$transaction(async (tx) => {
        const user = await tx.customerUser.create({
          data: {
            tenantId: customerRequest.customerAccount?.tenantId || request.tenantId,
            email: normalizedEmail,
            name: data.name || '',
            customerAccountId: customerRequest.customerAccount!.id,
            companyName: customerRequest.customerAccount!.companyName,
            isPoc: false,
            isActive: false,
            activationToken,
            activationExpiry,
          },
        })
        await tx.customerRequest.update({
          where: { id: customerRequest.id },
          data: {
            status: 'APPROVED',
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        })
        return user
      })

      // Send activation email
      const baseUrl = process.env.APP_URL || 'https://app.hta-calibration.com'
      const activationUrl = `${baseUrl}/customer/activate/${activationToken}`
      const { sendEmail } = await import('../../services/email.js')
      sendEmail({
        to: normalizedEmail,
        template: 'customer-activation' as any,
        props: {
          userName: data.name || '',
          companyName: customerRequest.customerAccount!.companyName,
          activationUrl,
        },
      }).catch(() => {})

      return {
        success: true,
        message: 'User addition request approved. Invite email will be sent.',
        user: { id: result.id, name: result.name, email: result.email },
      }
    }

    if (customerRequest.type === 'POC_CHANGE') {
      const newPocUser = await prisma.customerUser.findFirst({
        where: {
          id: data.newPocUserId || '',
          customerAccountId: customerRequest.customerAccount!.id,
        },
      })
      if (!newPocUser) {
        return reply.status(400).send({ error: 'New POC user not found or does not belong to this account' })
      }

      const oldPocId = customerRequest.customerAccount!.primaryPocId

      await prisma.$transaction(async (tx) => {
        if (oldPocId) {
          await tx.customerUser.update({
            where: { id: oldPocId },
            data: { isPoc: false },
          })
        }
        await tx.customerUser.update({
          where: { id: data.newPocUserId },
          data: { isPoc: true },
        })
        await tx.customerAccount.update({
          where: { id: customerRequest.customerAccount!.id },
          data: { primaryPocId: data.newPocUserId },
        })
        await tx.customerRequest.update({
          where: { id: customerRequest.id },
          data: {
            status: 'APPROVED',
            reviewedById: adminId,
            reviewedAt: new Date(),
          },
        })
      })

      return {
        success: true,
        message: 'POC change request approved. Both parties will be notified.',
        newPoc: { id: newPocUser.id, name: newPocUser.name, email: newPocUser.email },
      }
    }

    return reply.status(400).send({ error: 'Unknown request type' })
  })

  // POST /api/admin/customers/requests/:id/reject - Reject a customer request
  fastify.post<{ Params: { id: string } }>('/customers/requests/:id/reject', {
    preHandler: [requireMasterAdmin],
  }, async (request, reply) => {
    const { id } = request.params
    const adminId = request.user!.sub
    const body = request.body as { reason?: string }

    if (!body.reason?.trim()) {
      return reply.status(400).send({ error: 'Rejection reason is required' })
    }

    const customerRequest = await prisma.customerRequest.findUnique({
      where: { id },
      include: {
        customerAccount: { select: { id: true, companyName: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    })

    if (!customerRequest) {
      return reply.status(404).send({ error: 'Request not found' })
    }
    if (customerRequest.status !== 'PENDING') {
      return reply.status(400).send({ error: 'Request has already been processed' })
    }

    await prisma.customerRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: body.reason!.trim(),
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    })

    return {
      success: true,
      message: 'Request rejected. The requester will be notified.',
    }
  })

  // GET /api/admin/instruments/export - Export instruments as JSON
  fastify.get('/instruments/export', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const query = request.query as { format?: string; includeInactive?: string }
    const includeInactive = query.includeInactive === 'true'

    const where: Record<string, unknown> = { tenantId, isLatest: true }
    if (!includeInactive) {
      where.isActive = true
    }

    const instruments = await prisma.masterInstrument.findMany({
      where,
      orderBy: [{ category: 'asc' }, { description: 'asc' }],
    })

    const jsonData = instruments.map((inst: any) => ({
      id: inst.legacyId || null,
      type: inst.category,
      instrument_desc: inst.description,
      make: inst.make,
      model: inst.model,
      asset_no: inst.assetNumber,
      instrument_sl_no: inst.serialNumber,
      usage: inst.usage || '',
      calibrated_at: inst.calibratedAtLocation || '',
      report_no: inst.reportNo || '',
      next_due_on: inst.calibrationDueDate
        ? `${(inst.calibrationDueDate.getMonth() + 1).toString().padStart(2, '0')}/${inst.calibrationDueDate.getDate().toString().padStart(2, '0')}/${inst.calibrationDueDate.getFullYear()}`
        : '',
      range: safeJsonParse<unknown[]>(inst.rangeData, []),
      remarks: inst.remarks || '',
    }))

    const now = new Date()
    const dateStamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`

    reply.header('Content-Type', 'application/json')
    reply.header('Content-Disposition', `attachment; filename="master-instruments-${dateStamp}.json"`)
    return reply.send(JSON.stringify(jsonData, null, 2))
  })

  // POST /api/admin/instruments/import - Import instruments from JSON
  fastify.post('/instruments/import', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userName = request.user!.name
    const query = request.query as { mode?: string }
    const mode = query.mode || 'preview'
    const body = request.body as { instruments: Array<Record<string, unknown>> }

    if (!body.instruments || !Array.isArray(body.instruments)) {
      return reply.status(400).send({ error: 'instruments array is required' })
    }

    const results: Array<{ row: number; assetNumber: string; description: string; action: string; notes: string }> = []

    for (let i = 0; i < body.instruments.length; i++) {
      const record = body.instruments[i]
      const assetNumber = String(record.asset_no || record.asset_number || '').trim()
      const description = String(record.instrument_desc || record.description || '').trim()

      if (!assetNumber) {
        results.push({ row: i + 1, assetNumber: '', description, action: 'SKIP', notes: 'Missing asset number' })
        continue
      }

      // Check if instrument exists
      const existing = await prisma.masterInstrument.findFirst({
        where: { tenantId, assetNumber, isLatest: true },
      })

      if (mode === 'preview') {
        results.push({
          row: i + 1,
          assetNumber,
          description,
          action: existing ? 'UPDATE' : 'CREATE',
          notes: existing ? 'Will update existing' : 'Will create new',
        })
      } else {
        // Actually import
        try {
          if (existing) {
            // Create new version
            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
              await tx.masterInstrument.update({
                where: { id: existing.id },
                data: { isLatest: false },
              })
              await tx.masterInstrument.create({
                data: {
                  tenantId,
                  instrumentId: existing.instrumentId,
                  category: String(record.type || record.category || existing.category),
                  description: description || existing.description,
                  make: String(record.make || existing.make),
                  model: String(record.model || existing.model),
                  assetNumber,
                  serialNumber: String(record.instrument_sl_no || record.serial_number || existing.serialNumber),
                  version: existing.version + 1,
                  isLatest: true,
                  isActive: true,
                  createdById: userId,
                },
              })
            })
            results.push({ row: i + 1, assetNumber, description, action: 'UPDATE', notes: 'Updated successfully' })
          } else {
            await prisma.masterInstrument.create({
              data: {
                tenantId,
                instrumentId: crypto.randomUUID(),
                category: String(record.type || record.category || ''),
                description,
                make: String(record.make || ''),
                model: String(record.model || ''),
                assetNumber,
                serialNumber: String(record.instrument_sl_no || record.serial_number || ''),
                version: 1,
                isLatest: true,
                isActive: true,
                createdById: userId,
              },
            })
            results.push({ row: i + 1, assetNumber, description, action: 'CREATE', notes: 'Created successfully' })
          }
        } catch (err) {
          results.push({ row: i + 1, assetNumber, description, action: 'ERROR', notes: String(err) })
        }
      }
    }

    // Alert other admins if actual import
    if (mode === 'import') {
      const createdCount = results.filter(r => r.action === 'CREATE').length
      const updatedCount = results.filter(r => r.action === 'UPDATE').length
      if (createdCount + updatedCount > 0) {
        alertAdminsOnInstrumentChange(tenantId, userId, userName, 'CREATED', {
          assetNumber: 'BULK_IMPORT',
          description: `Imported ${createdCount} new, ${updatedCount} updated instruments`,
        }).catch(() => {})
      }
    }

    return {
      mode,
      total: body.instruments.length,
      created: results.filter(r => r.action === 'CREATE').length,
      updated: results.filter(r => r.action === 'UPDATE').length,
      skipped: results.filter(r => r.action === 'SKIP').length,
      errors: results.filter(r => r.action === 'ERROR').length,
      results,
    }
  })
}

// Helper to get instrument statistics
async function getInstrumentStats(tenantId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const thirtyDaysFromNow = new Date(today)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

  const [total, expired, expiring, valid, underRecal] = await Promise.all([
    prisma.masterInstrument.count({ where: { tenantId, isActive: true, isLatest: true } }),
    prisma.masterInstrument.count({
      where: {
        tenantId,
        isActive: true,
        isLatest: true,
        calibrationDueDate: { lt: today },
      },
    }),
    prisma.masterInstrument.count({
      where: {
        tenantId,
        isActive: true,
        isLatest: true,
        calibrationDueDate: { gte: today, lte: thirtyDaysFromNow },
      },
    }),
    prisma.masterInstrument.count({
      where: {
        tenantId,
        isActive: true,
        isLatest: true,
        calibrationDueDate: { gt: thirtyDaysFromNow },
      },
    }),
    prisma.masterInstrument.count({
      where: {
        tenantId,
        isActive: true,
        isLatest: true,
        status: 'UNDER_RECAL',
      },
    }),
  ])

  return { total, expired, expiring, valid, underRecal }
}

// Helper to get certificate statistics
async function getCertificateStats(tenantId: string) {
  const [
    total,
    draft,
    pendingReview,
    revisionRequired,
    pendingCustomerApproval,
    customerRevisionRequired,
    pendingAdminAuthorization,
    authorized,
    rejected,
  ] = await Promise.all([
    prisma.certificate.count({ where: { tenantId } }),
    prisma.certificate.count({ where: { tenantId, status: 'DRAFT' } }),
    prisma.certificate.count({ where: { tenantId, status: 'PENDING_REVIEW' } }),
    prisma.certificate.count({ where: { tenantId, status: 'REVISION_REQUIRED' } }),
    prisma.certificate.count({ where: { tenantId, status: 'PENDING_CUSTOMER_APPROVAL' } }),
    prisma.certificate.count({ where: { tenantId, status: 'CUSTOMER_REVISION_REQUIRED' } }),
    prisma.certificate.count({ where: { tenantId, status: 'PENDING_ADMIN_AUTHORIZATION' } }),
    prisma.certificate.count({ where: { tenantId, status: 'AUTHORIZED' } }),
    prisma.certificate.count({ where: { tenantId, status: 'REJECTED' } }),
  ])

  return {
    total,
    draft,
    pendingReview,
    revisionRequired,
    pendingCustomerApproval,
    customerRevisionRequired,
    pendingAdminAuthorization,
    authorized,
    rejected,
  }
}

export default adminRoutes
