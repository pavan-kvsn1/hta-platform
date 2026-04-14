import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { requireStaff } from '../../middleware/auth.js'

const internalRequestRoutes: FastifyPluginAsync = async (fastify) => {
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
      sections: string[]
      reason: string
    }

    // Validate request type
    if (body.type !== 'SECTION_UNLOCK') {
      return reply.status(400).send({ error: 'Invalid request type' })
    }

    // Validate required fields for SECTION_UNLOCK
    if (!body.certificateId || !body.sections || !Array.isArray(body.sections) || body.sections.length === 0 || !body.reason) {
      return reply.status(400).send({
        error: 'Missing required fields: certificateId, sections (array), and reason are required',
      })
    }

    // Check certificate exists and is in REVISION_REQUIRED status
    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id: body.certificateId },
      select: {
        id: true,
        status: true,
        certificateNumber: true,
        createdById: true,
        currentRevision: true,
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    // Only allow section unlock requests for REVISION_REQUIRED certificates
    if (certificate.status !== 'REVISION_REQUIRED') {
      return reply.status(400).send({
        error: 'Section unlock requests can only be made for certificates in REVISION_REQUIRED status',
      })
    }

    // Only the certificate creator (assignee) can request section unlocks
    const isAdmin = userRole === 'ADMIN' || request.user!.isAdmin
    if (certificate.createdById !== userId && !isAdmin) {
      return reply.status(403).send({
        error: 'Only the certificate assignee can request section unlocks',
      })
    }

    // Check for existing pending request for the same certificate
    const existingPendingRequest = await prisma.internalRequest.findFirst({
      where: {
        type: 'SECTION_UNLOCK',
        certificateId: body.certificateId,
        status: 'PENDING',
      },
    })

    if (existingPendingRequest) {
      return reply.status(400).send({
        error: 'A pending section unlock request already exists for this certificate',
      })
    }

    // Create the internal request
    const internalRequest = await prisma.internalRequest.create({
      data: {
        type: 'SECTION_UNLOCK',
        status: 'PENDING',
        requestedById: userId,
        certificateId: body.certificateId,
        data: JSON.stringify({ sections: body.sections, reason: body.reason }),
      },
      include: {
        requestedBy: {
          select: { id: true, name: true, email: true },
        },
        certificate: {
          select: { id: true, certificateNumber: true },
        },
      },
    })

    // Create certificate event for the unlock request
    const latestEvent = await prisma.certificateEvent.findFirst({
      where: { certificateId: body.certificateId },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    })
    const nextSequence = (latestEvent?.sequenceNumber || 0) + 1

    await prisma.certificateEvent.create({
      data: {
        certificateId: body.certificateId,
        eventType: 'SECTION_UNLOCK_REQUESTED',
        eventData: JSON.stringify({
          sections: body.sections,
          reason: body.reason,
          requestId: internalRequest.id,
        }),
        userId,
        userRole: userRole || 'ENGINEER',
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
        data: { sections: body.sections, reason: body.reason },
        certificate: internalRequest.certificate,
        requestedBy: internalRequest.requestedBy,
        createdAt: internalRequest.createdAt.toISOString(),
      },
    }
  })
}

export default internalRequestRoutes
