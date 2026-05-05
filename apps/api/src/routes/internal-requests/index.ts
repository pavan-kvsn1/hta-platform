import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { requireStaff } from '../../middleware/auth.js'

const SECTION_LABELS: Record<string, string> = {
  'summary': 'Summary',
  'uuc-details': 'UUC Details',
  'master-inst': 'Master Instruments',
  'environment': 'Environmental',
  'results': 'Results',
  'remarks': 'Remarks',
  'conclusion': 'Conclusion',
}

const FIELD_LABELS: Record<string, string> = {
  'certificateNumber': 'Cert Number',
  'srfNumber': 'SRF Number',
  'srfDate': 'SRF Date',
  'customerName': 'Customer Name',
  'customerAddress': 'Customer Address',
  'customerContactName': 'Contact Name',
  'customerContactEmail': 'Contact Email',
  'calibratedAt': 'Calibrated At',
  'dateOfCalibration': 'Date of Calibration',
  'calibrationDueDate': 'Calibration Due Date',
}

const internalRequestRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/internal-requests - List current user's own requests
  fastify.get('/', {
    preHandler: [requireStaff],
  }, async (request) => {
    const userId = request.user!.sub
    const query = request.query as {
      status?: string
      page?: string
      limit?: string
    }
    const status = query.status || 'ALL'
    const page = Math.max(1, parseInt(query.page || '1'))
    const limit = Math.max(1, Math.min(parseInt(query.limit || '15'), 25))

    const where: Record<string, unknown> = { requestedById: userId }
    if (status !== 'ALL') {
      where.status = status
    }

    const [requests, total, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.internalRequest.findMany({
        where,
        include: {
          certificate: { select: { id: true, certificateNumber: true, status: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.internalRequest.count({ where }),
      prisma.internalRequest.count({ where: { requestedById: userId, status: 'PENDING' } }),
      prisma.internalRequest.count({ where: { requestedById: userId, status: 'APPROVED' } }),
      prisma.internalRequest.count({ where: { requestedById: userId, status: 'REJECTED' } }),
    ])

    const normalized = requests.map((r) => {
      const data = typeof r.data === 'string' ? JSON.parse(r.data as string) : r.data
      const dataObj = data as Record<string, unknown>

      let details = ''
      if (r.type === 'SECTION_UNLOCK') {
        const sections = (dataObj?.sections || []) as string[]
        details = sections.map((s: string) => SECTION_LABELS[s] || s).join(', ') || 'No sections specified'
      } else if (r.type === 'FIELD_CHANGE') {
        const fields = (dataObj?.fields || []) as string[]
        details = fields.map((f: string) => FIELD_LABELS[f] || f).join(', ') || 'No fields specified'
      } else if (r.type === 'OFFLINE_CODE_REQUEST') {
        details = (dataObj?.reason as string) || 'No reason provided'
      }

      return {
        id: r.id,
        type: r.type,
        status: r.status,
        title: r.type === 'OFFLINE_CODE_REQUEST'
          ? 'Offline Code Card Request'
          : r.certificate?.certificateNumber || 'Unknown Certificate',
        details,
        adminNote: r.adminNote,
        reviewedBy: r.reviewedBy?.name || null,
        reviewedAt: r.reviewedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      }
    })

    return {
      requests: normalized,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      counts: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount },
    }
  })

  // POST /api/internal-requests - Create a new internal request (e.g., section unlock)
  fastify.post('/', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userRole = request.user!.role
    const body = request.body as {
      type: string
      certificateId: string
      // SECTION_UNLOCK fields
      sections?: string[]
      reason?: string
      // FIELD_CHANGE fields
      fields?: string[]
      description?: string
    }

    // Validate request type
    if (!['SECTION_UNLOCK', 'FIELD_CHANGE', 'OFFLINE_CODE_REQUEST', 'DESKTOP_VPN_REQUEST'].includes(body.type)) {
      return reply.status(400).send({ error: 'Invalid request type' })
    }

    // OFFLINE_CODE_REQUEST — no certificate needed, handled separately
    if (body.type === 'OFFLINE_CODE_REQUEST') {
      // Check for existing pending request
      const existingPending = await prisma.internalRequest.findFirst({
        where: { requestedById: userId, type: 'OFFLINE_CODE_REQUEST', status: 'PENDING' },
      })
      if (existingPending) {
        return reply.status(400).send({
          error: 'You already have a pending offline code request',
        })
      }

      const requestData = JSON.stringify({ reason: body.reason || null })

      const created = await prisma.internalRequest.create({
        data: {
          type: 'OFFLINE_CODE_REQUEST',
          status: 'PENDING',
          requestedById: userId,
          certificateId: null,
          data: requestData,
        },
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
        },
      })

      // Notify all tenant admins
      const admins = await prisma.user.findMany({
        where: { tenantId, role: 'ADMIN', isActive: true },
        select: { id: true },
      })

      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: 'OFFLINE_CODE_REQUESTED',
            title: 'Offline Code Card Requested',
            message: `${created.requestedBy.name} has requested a new offline code card.${body.reason ? ` Reason: ${body.reason}` : ''}`,
            data: JSON.stringify({ requestId: created.id }),
          })),
        })
      }

      return {
        success: true,
        request: {
          id: created.id,
          type: created.type,
          status: created.status,
          data: { reason: body.reason || null },
          requestedBy: created.requestedBy,
          createdAt: created.createdAt.toISOString(),
        },
      }
    }

    // DESKTOP_VPN_REQUEST — no certificate needed, request desktop VPN access
    if (body.type === 'DESKTOP_VPN_REQUEST') {
      // Check for existing pending request
      const existingPending = await prisma.internalRequest.findFirst({
        where: { requestedById: userId, type: 'DESKTOP_VPN_REQUEST', status: 'PENDING' },
      })
      if (existingPending) {
        return reply.status(400).send({
          error: 'You already have a pending desktop VPN access request',
        })
      }

      const requestData = JSON.stringify({ reason: body.reason || null })

      const created = await prisma.internalRequest.create({
        data: {
          type: 'DESKTOP_VPN_REQUEST',
          status: 'PENDING',
          requestedById: userId,
          certificateId: null,
          data: requestData,
        },
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
        },
      })

      // Notify all tenant admins
      const admins = await prisma.user.findMany({
        where: { tenantId, role: 'ADMIN', isActive: true },
        select: { id: true },
      })

      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id,
            type: 'DESKTOP_VPN_REQUESTED',
            title: 'Desktop VPN Access Requested',
            message: `${created.requestedBy.name} has requested desktop VPN access.${body.reason ? ` Reason: ${body.reason}` : ''}`,
            data: JSON.stringify({ requestId: created.id }),
          })),
        })
      }

      return {
        success: true,
        request: {
          id: created.id,
          type: created.type,
          status: created.status,
          data: { reason: body.reason || null },
          requestedBy: created.requestedBy,
          createdAt: created.createdAt.toISOString(),
        },
      }
    }

    // Validate required fields based on type
    if (body.type === 'SECTION_UNLOCK') {
      if (!body.certificateId || !body.sections || !Array.isArray(body.sections) || body.sections.length === 0 || !body.reason) {
        return reply.status(400).send({
          error: 'Missing required fields: certificateId, sections (array), and reason are required',
        })
      }
    } else if (body.type === 'FIELD_CHANGE') {
      if (!body.certificateId || !body.fields || !Array.isArray(body.fields) || body.fields.length === 0 || !body.description) {
        return reply.status(400).send({
          error: 'Missing required fields: certificateId, fields (array), and description are required',
        })
      }
    }

    // Check certificate exists and is in REVISION_REQUIRED status
    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id: body.certificateId },
      select: {
        id: true,
        status: true,
        certificateNumber: true,
        createdById: true,
        reviewerId: true,
        currentRevision: true,
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    const isAdmin = userRole === 'ADMIN' || request.user!.isAdmin

    if (body.type === 'SECTION_UNLOCK') {
      // Only allow section unlock requests for REVISION_REQUIRED certificates
      if (certificate.status !== 'REVISION_REQUIRED') {
        return reply.status(400).send({
          error: 'Section unlock requests can only be made for certificates in REVISION_REQUIRED status',
        })
      }

      // Only the certificate creator (assignee) can request section unlocks
      if (certificate.createdById !== userId && !isAdmin) {
        return reply.status(403).send({
          error: 'Only the certificate assignee can request section unlocks',
        })
      }

      // Check for existing pending request for the same certificate
      const existingPendingRequest = await prisma.internalRequest.findFirst({
        where: { type: 'SECTION_UNLOCK', certificateId: body.certificateId, status: 'PENDING' },
      })
      if (existingPendingRequest) {
        return reply.status(400).send({
          error: 'A pending section unlock request already exists for this certificate',
        })
      }
    } else if (body.type === 'FIELD_CHANGE') {
      // Reviewers (and admins) can request field changes
      if (certificate.reviewerId !== userId && !isAdmin) {
        return reply.status(403).send({
          error: 'Only the assigned reviewer can request field changes',
        })
      }

      // Check for existing pending field change request for the same certificate
      const pendingRequests = await prisma.internalRequest.findMany({
        where: { certificateId: body.certificateId, status: 'PENDING' },
      })
      if (pendingRequests.some(r => (r.type as string) === 'FIELD_CHANGE')) {
        return reply.status(400).send({
          error: 'A pending field change request already exists for this certificate',
        })
      }
    }

    // Build data payload based on type
    const requestData = body.type === 'SECTION_UNLOCK'
      ? JSON.stringify({ sections: body.sections, reason: body.reason, revisionNumber: certificate.currentRevision })
      : JSON.stringify({ fields: body.fields, description: body.description })

    // Create the internal request
    // Use raw SQL for FIELD_CHANGE since generated Prisma client doesn't have the enum yet
    let internalRequest: { id: string; type: string; status: string; createdAt: Date; certificate: { id: string; certificateNumber: string } | null; requestedBy: { id: string; name: string; email: string } }

    if (body.type === 'FIELD_CHANGE') {
      const requestId = crypto.randomUUID()
      await prisma.$executeRawUnsafe(
        `INSERT INTO "InternalRequest" (id, type, status, "requestedById", "certificateId", data, "createdAt", "updatedAt")
         VALUES ($1, 'FIELD_CHANGE'::"InternalRequestType", 'PENDING'::"InternalRequestStatus", $2, $3, $4, NOW(), NOW())`,
        requestId, userId, body.certificateId, requestData
      )
      const requester = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } })
      internalRequest = {
        id: requestId,
        type: 'FIELD_CHANGE',
        status: 'PENDING',
        createdAt: new Date(),
        certificate: { id: certificate.id, certificateNumber: certificate.certificateNumber },
        requestedBy: requester || { id: userId, name: 'Unknown', email: '' },
      }
    } else {
      const created = await prisma.internalRequest.create({
        data: {
          type: 'SECTION_UNLOCK',
          status: 'PENDING',
          requestedById: userId,
          certificateId: body.certificateId,
          data: requestData,
        },
        include: {
          requestedBy: { select: { id: true, name: true, email: true } },
          certificate: { select: { id: true, certificateNumber: true } },
        },
      })
      internalRequest = { ...created, type: created.type as string }
    }

    // Create certificate event
    const latestEvent = await prisma.certificateEvent.findFirst({
      where: { certificateId: body.certificateId },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    })
    const nextSequence = (latestEvent?.sequenceNumber || 0) + 1

    const eventType = body.type === 'SECTION_UNLOCK' ? 'SECTION_UNLOCK_REQUESTED' : 'FIELD_CHANGE_REQUESTED'
    const eventData = body.type === 'SECTION_UNLOCK'
      ? { sections: body.sections, reason: body.reason, requestId: internalRequest.id }
      : { fields: body.fields, description: body.description, requestId: internalRequest.id }

    await prisma.certificateEvent.create({
      data: {
        certificateId: body.certificateId,
        eventType,
        eventData: JSON.stringify(eventData),
        userId,
        userRole: userRole || 'REVIEWER',
        sequenceNumber: nextSequence,
        revision: certificate.currentRevision,
      },
    })

    return {
      success: true,
      request: {
        id: internalRequest.id,
        type: internalRequest.type,
        status: internalRequest.status,
        data: body.type === 'SECTION_UNLOCK'
          ? { sections: body.sections, reason: body.reason }
          : { fields: body.fields, description: body.description },
        certificate: internalRequest.certificate,
        requestedBy: internalRequest.requestedBy,
        createdAt: internalRequest.createdAt.toISOString(),
      },
    }
  })
}

export default internalRequestRoutes
