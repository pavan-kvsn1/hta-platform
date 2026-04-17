import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma, Prisma } from '@hta/database'
import { requireStaff, requireAuth, requireAdmin } from '../../middleware/auth.js'
import { enforceLimit, updateUsageTracking } from '../../services/index.js'
import certificateImagesRoutes from './images/index.js'

// Type for Prisma transaction client
type TransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>

// Helper to safely parse JSON
function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (!value) return fallback
  if (typeof value === 'object') return value as T
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return fallback
}

// Schema for creating a certificate
const createCertificateSchema = z.object({
  certificateNumber: z.string().min(1),
  calibratedAt: z.string().optional(),
  srfNumber: z.string().optional().nullable(),
  srfDate: z.string().optional().nullable(),
  dateOfCalibration: z.string().optional().nullable(),
  calibrationTenure: z.number().optional().default(12),
  dueDateAdjustment: z.number().optional().default(0),
  calibrationDueDate: z.string().optional().nullable(),
  dueDateNotApplicable: z.boolean().optional().default(false),
  customerName: z.string().min(1),
  customerAddress: z.string().optional(),
  customerContactName: z.string().optional(),
  customerContactEmail: z.string().email().optional().nullable(),
  uucDescription: z.string().min(1),
  uucMake: z.string().optional(),
  uucModel: z.string().optional(),
  uucSerialNumber: z.string().optional(),
  uucInstrumentId: z.string().optional().nullable(),
  uucLocationName: z.string().optional().nullable(),
  uucMachineName: z.string().optional().nullable(),
  ambientTemperature: z.string().optional().nullable(),
  relativeHumidity: z.string().optional().nullable(),
  calibrationStatus: z.array(z.unknown()).optional(),
  stickerOldRemoved: z.string().optional().nullable(),
  stickerNewAffixed: z.string().optional().nullable(),
  selectedConclusionStatements: z.array(z.unknown()).optional(),
  additionalConclusionStatement: z.string().optional().nullable(),
  parameters: z.array(z.object({
    parameterName: z.string(),
    parameterUnit: z.string().default(''),
    rangeMin: z.string().optional().nullable(),
    rangeMax: z.string().optional().nullable(),
    rangeUnit: z.string().optional().nullable(),
    operatingMin: z.string().optional().nullable(),
    operatingMax: z.string().optional().nullable(),
    operatingUnit: z.string().optional().nullable(),
    leastCountValue: z.string().optional().nullable(),
    leastCountUnit: z.string().optional().nullable(),
    accuracyValue: z.string().optional().nullable(),
    accuracyUnit: z.string().optional().nullable(),
    accuracyType: z.string().optional().default('ABSOLUTE'),
    errorFormula: z.string().optional().default('A-B'),
    showAfterAdjustment: z.boolean().optional().default(false),
    requiresBinning: z.boolean().optional().default(false),
    bins: z.array(z.unknown()).optional().nullable(),
    sopReference: z.string().optional().nullable(),
    masterInstrumentId: z.union([z.string(), z.number()]).optional().nullable(),
    results: z.array(z.object({
      pointNumber: z.number(),
      standardReading: z.string().optional().nullable(),
      beforeAdjustment: z.string().optional().nullable(),
      afterAdjustment: z.string().optional().nullable(),
      errorObserved: z.number().optional().nullable(),
      isOutOfLimit: z.boolean().optional().default(false),
    })).optional(),
  })).optional(),
  masterInstruments: z.array(z.object({
    masterInstrumentId: z.union([z.string(), z.number()]).optional(),
    category: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    make: z.string().optional().nullable(),
    model: z.string().optional().nullable(),
    assetNo: z.string().optional().nullable(),
    serialNumber: z.string().optional().nullable(),
    calibratedAt: z.string().optional().nullable(),
    reportNo: z.string().optional().nullable(),
    calibrationDueDate: z.string().optional().nullable(),
    sopReference: z.string().optional(),
  })).optional(),
})

const certificateRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/certificates - List certificates for the current user
  fastify.get('/', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub

    const certificates = await prisma.certificate.findMany({
      where: {
        tenantId,
        createdById: userId,
      },
      orderBy: { updatedAt: 'desc' },
    })

    return certificates
  })

  // GET /api/certificates/all - List all certificates (for admins/reviewers)
  fastify.get('/all', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId
    const user = request.user!

    // Build where clause based on user role
    const where: Record<string, unknown> = { tenantId }

    // Non-admins can only see their own or ones they're reviewing
    if (!user.isAdmin && user.role !== 'ADMIN') {
      where.OR = [
        { createdById: user.sub },
        { reviewerId: user.sub },
      ]
    }

    const certificates = await prisma.certificate.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        reviewer: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return certificates
  })

  // POST /api/certificates - Create a new certificate
  fastify.post('/', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userRole = request.user!.role

    const body = createCertificateSchema.parse(request.body)

    // Check subscription limit before creating
    await enforceLimit(tenantId, 'certificates')

    // Create certificate with transaction
    const certificate = await prisma.$transaction(async (tx: TransactionClient) => {
      // Create the certificate
      const cert = await tx.certificate.create({
        data: {
          tenantId,
          certificateNumber: body.certificateNumber,
          status: 'DRAFT',
          currentRevision: 1,
          calibratedAt: body.calibratedAt,
          srfNumber: body.srfNumber || null,
          srfDate: body.srfDate ? new Date(body.srfDate) : null,
          dateOfCalibration: body.dateOfCalibration ? new Date(body.dateOfCalibration) : null,
          calibrationTenure: body.calibrationTenure || 12,
          dueDateAdjustment: body.dueDateAdjustment || 0,
          calibrationDueDate: body.calibrationDueDate ? new Date(body.calibrationDueDate) : null,
          dueDateNotApplicable: body.dueDateNotApplicable || false,
          customerName: body.customerName,
          customerAddress: body.customerAddress,
          customerContactName: body.customerContactName,
          customerContactEmail: body.customerContactEmail,
          uucDescription: body.uucDescription,
          uucMake: body.uucMake,
          uucModel: body.uucModel,
          uucSerialNumber: body.uucSerialNumber,
          uucInstrumentId: body.uucInstrumentId || null,
          uucLocationName: body.uucLocationName || null,
          uucMachineName: body.uucMachineName || null,
          ambientTemperature: body.ambientTemperature || null,
          relativeHumidity: body.relativeHumidity || null,
          calibrationStatus: JSON.stringify(body.calibrationStatus || []),
          stickerOldRemoved: body.stickerOldRemoved || null,
          stickerNewAffixed: body.stickerNewAffixed || null,
          selectedConclusionStatements: JSON.stringify(body.selectedConclusionStatements || []),
          additionalConclusionStatement: body.additionalConclusionStatement || null,
          createdById: userId,
          lastModifiedById: userId,
        },
      })

      // Create parameters and results
      if (body.parameters && body.parameters.length > 0) {
        for (let i = 0; i < body.parameters.length; i++) {
          const param = body.parameters[i]
          const createdParam = await tx.parameter.create({
            data: {
              certificateId: cert.id,
              parameterName: param.parameterName,
              parameterUnit: param.parameterUnit,
              rangeMin: param.rangeMin || null,
              rangeMax: param.rangeMax || null,
              rangeUnit: param.rangeUnit || null,
              operatingMin: param.operatingMin || null,
              operatingMax: param.operatingMax || null,
              operatingUnit: param.operatingUnit || null,
              leastCountValue: param.leastCountValue || null,
              leastCountUnit: param.leastCountUnit || null,
              accuracyValue: param.accuracyValue || null,
              accuracyUnit: param.accuracyUnit || null,
              accuracyType: param.accuracyType || 'ABSOLUTE',
              errorFormula: param.errorFormula || 'A-B',
              showAfterAdjustment: param.showAfterAdjustment || false,
              requiresBinning: param.requiresBinning || false,
              bins: param.bins && param.bins.length > 0 ? (param.bins as Prisma.InputJsonValue) : undefined,
              sopReference: param.sopReference || null,
              masterInstrumentId: param.masterInstrumentId ? String(param.masterInstrumentId) : null,
              sortOrder: i,
            },
          })

          // Create calibration results
          if (param.results && param.results.length > 0) {
            await tx.calibrationResult.createMany({
              data: param.results.map((result) => ({
                parameterId: createdParam.id,
                pointNumber: result.pointNumber,
                standardReading: result.standardReading || null,
                beforeAdjustment: result.beforeAdjustment || null,
                afterAdjustment: result.afterAdjustment || null,
                errorObserved: result.errorObserved ?? null,
                isOutOfLimit: result.isOutOfLimit || false,
              })),
            })
          }
        }
      }

      // Create master instrument links
      if (body.masterInstruments && body.masterInstruments.length > 0) {
        for (const mi of body.masterInstruments) {
          if (mi.masterInstrumentId) {
            await tx.certificateMasterInstrument.create({
              data: {
                certificateId: cert.id,
                masterInstrumentId: String(mi.masterInstrumentId),
                category: mi.category || null,
                description: mi.description || null,
                make: mi.make || null,
                model: mi.model || null,
                assetNo: mi.assetNo || null,
                serialNumber: mi.serialNumber || null,
                calibratedAt: mi.calibratedAt || null,
                reportNo: mi.reportNo || null,
                calibrationDueDate: mi.calibrationDueDate || null,
                sopReference: mi.sopReference || '',
              },
            })
          }
        }
      }

      // Create initial event
      await tx.certificateEvent.create({
        data: {
          certificateId: cert.id,
          sequenceNumber: 1,
          revision: 1,
          eventType: 'CERTIFICATE_CREATED',
          eventData: JSON.stringify({
            certificateNumber: body.certificateNumber,
            initialData: {
              customerName: body.customerName,
              uucDescription: body.uucDescription,
              dateOfCalibration: body.dateOfCalibration,
            },
          }),
          userId,
          userRole,
        },
      })

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'Certificate',
          entityId: cert.id,
          action: 'CREATE',
          actorId: userId,
          actorType: 'USER',
          changes: JSON.stringify({ certificateNumber: body.certificateNumber }),
        },
      })

      return cert
    })

    // Update usage tracking (async, non-blocking)
    updateUsageTracking(tenantId).catch(() => {
      // Log error but don't fail the request
    })

    return {
      success: true,
      certificate: {
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
      },
    }
  })

  // GET /api/certificates/:id - Get single certificate
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params

    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        reviewer: {
          select: { id: true, name: true, email: true },
        },
        parameters: {
          include: {
            results: {
              orderBy: { pointNumber: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        masterInstruments: true,
        certificateImages: true,
        uucImages: true,
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    return certificate
  })

  // PUT /api/certificates/:id - Update certificate
  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { id } = request.params

    // Verify ownership or admin access
    const existing = await prisma.certificate.findFirst({
      where: { tenantId, id },
    })

    if (!existing) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    // Only creator or admin can update
    if (existing.createdById !== userId && !request.user!.isAdmin) {
      return reply.status(403).send({ error: 'Not authorized to update this certificate' })
    }

    // Only allow updates on DRAFT or REVISION_REQUIRED status
    if (!['DRAFT', 'REVISION_REQUIRED'].includes(existing.status)) {
      return reply.status(400).send({
        error: 'Cannot update certificate in current status',
        status: existing.status,
      })
    }

    const body = request.body as Record<string, unknown>

    const certificate = await prisma.certificate.update({
      where: { id },
      data: {
        ...body,
        lastModifiedById: userId,
        updatedAt: new Date(),
      },
    })

    return { success: true, certificate }
  })

  // DELETE /api/certificates/:id - Delete draft certificate
  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const { id } = request.params

    const existing = await prisma.certificate.findFirst({
      where: { tenantId, id },
    })

    if (!existing) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    // Only creator can delete, and only drafts
    if (existing.createdById !== userId) {
      return reply.status(403).send({ error: 'Not authorized to delete this certificate' })
    }

    if (existing.status !== 'DRAFT') {
      return reply.status(400).send({ error: 'Only draft certificates can be deleted' })
    }

    await prisma.certificate.delete({ where: { id } })

    return { success: true }
  })

  // POST /api/certificates/:id/submit - Submit for peer review
  fastify.post<{ Params: { id: string } }>('/:id/submit', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userRole = request.user!.role
    const userName = request.user!.name
    const userEmail = request.user!.email
    const { id } = request.params
    const body = request.body as {
      engineerNotes?: string
      signatureData?: string
      signerName?: string
      reviewerId?: string
      sectionResponses?: Record<string, string>
    }

    // Validate signature
    if (!body.signatureData || !body.signerName?.trim()) {
      return reply.status(400).send({ error: 'Signature and signer name are required' })
    }

    // Validate signer name matches profile
    if (userName && body.signerName.trim().toLowerCase() !== userName.toLowerCase()) {
      return reply.status(400).send({ error: 'Signer name must match your profile name' })
    }

    // Get certificate
    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
      include: {
        parameters: { include: { results: true } },
        masterInstruments: true,
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    // Check ownership
    if (certificate.createdById !== userId && !request.user!.isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    // Check status
    if (certificate.status !== 'DRAFT' && certificate.status !== 'REVISION_REQUIRED') {
      return reply.status(400).send({ error: `Cannot submit certificate with status: ${certificate.status}` })
    }

    const isResubmission = certificate.status === 'REVISION_REQUIRED'
    const effectiveReviewerId = certificate.reviewerId || body.reviewerId

    // Validate reviewer
    if (!effectiveReviewerId) {
      return reply.status(400).send({ error: 'Please select a reviewer for the certificate' })
    }

    // Validate required fields
    const validationErrors: string[] = []
    if (!certificate.dateOfCalibration) validationErrors.push('Date of calibration is required')
    if (!certificate.customerName) validationErrors.push('Customer name is required')
    if (!certificate.uucDescription) validationErrors.push('UUC description is required')
    if (certificate.masterInstruments.length === 0) validationErrors.push('At least one master instrument is required')
    if (!certificate.ambientTemperature) validationErrors.push('Ambient temperature is required')

    if (validationErrors.length > 0) {
      return reply.status(400).send({ error: 'Validation failed', validationErrors })
    }

    // Submit in transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const lastEvent = await tx.certificateEvent.findFirst({
        where: { certificateId: id },
        orderBy: { sequenceNumber: 'desc' },
      })
      const nextSequence = (lastEvent?.sequenceNumber ?? 0) + 1
      const newRevision = isResubmission ? certificate.currentRevision + 1 : certificate.currentRevision

      // Update certificate
      const cert = await tx.certificate.update({
        where: { id },
        data: {
          status: 'PENDING_REVIEW',
          currentRevision: newRevision,
          lastModifiedById: userId,
          ...(body.reviewerId && !certificate.reviewerId ? { reviewerId: body.reviewerId } : {}),
        },
      })

      // Create event
      await tx.certificateEvent.create({
        data: {
          certificateId: id,
          sequenceNumber: nextSequence,
          revision: newRevision,
          eventType: isResubmission ? 'RESUBMITTED_FOR_REVIEW' : 'SUBMITTED_FOR_REVIEW',
          eventData: JSON.stringify({
            previousStatus: certificate.status,
            newStatus: 'PENDING_REVIEW',
            submittedAt: new Date().toISOString(),
            isResubmission,
            engineerNotes: body.engineerNotes || null,
            hasSignature: true,
          }),
          userId,
          userRole,
        },
      })

      // Delete existing signatures and create new
      await tx.signature.deleteMany({ where: { certificateId: id } })
      await tx.signature.create({
        data: {
          certificateId: id,
          signerType: 'ASSIGNEE',
          signerName: body.signerName!,
          signerEmail: userEmail,
          signatureData: body.signatureData!,
          signerId: userId,
        },
      })

      // Audit log
      await tx.auditLog.create({
        data: {
          entityType: 'Certificate',
          entityId: cert.id,
          action: isResubmission ? 'RESUBMIT_FOR_REVIEW' : 'SUBMIT_FOR_REVIEW',
          actorId: userId,
          actorType: 'USER',
          changes: JSON.stringify({
            previousStatus: certificate.status,
            newStatus: 'PENDING_REVIEW',
          }),
        },
      })

      return cert
    })

    return {
      success: true,
      message: isResubmission ? 'Certificate resubmitted for peer review' : 'Certificate submitted for peer review',
      certificate: {
        id: result.id,
        certificateNumber: result.certificateNumber,
        status: result.status,
        revision: result.currentRevision,
      },
    }
  })

  // POST /api/certificates/:id/review - Review certificate (approve/reject/request revision)
  fastify.post<{ Params: { id: string } }>('/:id/review', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userEmail = request.user!.email
    const { id } = request.params
    const body = request.body as {
      action: 'approve' | 'request_revision' | 'reject'
      comment?: string
      sectionFeedbacks?: { section: string; comment: string }[]
      generalNotes?: string
      signatureData?: string
      signerName?: string
      sendToCustomer?: { email: string; name: string; message?: string }
    }

    // Get certificate
    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    // Verify reviewer
    if (certificate.reviewerId !== userId) {
      return reply.status(403).send({ error: 'You are not the reviewer for this certificate' })
    }

    // Check status
    const reviewableStatuses = ['PENDING_REVIEW', 'CUSTOMER_REVISION_REQUIRED']
    if (!reviewableStatuses.includes(certificate.status)) {
      return reply.status(400).send({ error: `Certificate is not in a reviewable state: ${certificate.status}` })
    }

    // Validate action
    if (!['approve', 'request_revision', 'reject'].includes(body.action)) {
      return reply.status(400).send({ error: 'Invalid action' })
    }

    // Validate based on action
    if (body.action === 'request_revision') {
      const hasFeedback = body.sectionFeedbacks?.some(sf => sf.comment?.trim()) || body.comment?.trim()
      if (!hasFeedback) {
        return reply.status(400).send({ error: 'Feedback is required for revision requests' })
      }
    }

    if (body.action === 'reject' && !body.comment?.trim()) {
      return reply.status(400).send({ error: 'Comment is required for rejections' })
    }

    if (body.action === 'approve') {
      if (!body.signatureData || !body.signerName?.trim()) {
        return reply.status(400).send({ error: 'Signature and signer name are required for approval' })
      }
    }

    // Process action
    if (body.action === 'approve') {
      const newStatus = body.sendToCustomer ? 'PENDING_CUSTOMER_APPROVAL' : 'APPROVED'

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const lastEvent = await tx.certificateEvent.findFirst({
          where: { certificateId: id },
          orderBy: { sequenceNumber: 'desc' },
        })
        const nextSequence = (lastEvent?.sequenceNumber ?? 0) + 1

        // Update certificate
        await tx.certificate.update({
          where: { id },
          data: {
            status: newStatus,
            lastModifiedById: userId,
          },
        })

        // Create event
        await tx.certificateEvent.create({
          data: {
            certificateId: id,
            sequenceNumber: nextSequence,
            revision: certificate.currentRevision,
            userId,
            userRole: 'ENGINEER',
            eventType: body.sendToCustomer ? 'REVIEWER_APPROVED_SENT_TO_CUSTOMER' : 'APPROVED',
            eventData: JSON.stringify({
              comment: body.comment || 'Certificate approved by peer reviewer.',
              reviewerId: userId,
              signerName: body.signerName,
              signerEmail: userEmail,
              sentToCustomer: !!body.sendToCustomer,
            }),
          },
        })

        // Store reviewer signature
        await tx.signature.deleteMany({ where: { certificateId: id, signerType: 'REVIEWER' } })
        await tx.signature.create({
          data: {
            certificateId: id,
            signerType: 'REVIEWER',
            signerName: body.signerName!,
            signerEmail: userEmail,
            signatureData: body.signatureData!,
            signerId: userId,
          },
        })

        // Create approval token if sending to customer
        let tokenResult = null
        if (body.sendToCustomer) {
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          const token = crypto.randomUUID()

          // Find or create customer
          let customer = await tx.customerUser.findUnique({
            where: { tenantId_email: { tenantId, email: body.sendToCustomer.email.toLowerCase() } },
          })

          if (!customer) {
            const tempPasswordHash = crypto.randomBytes(32).toString('hex')
            customer = await tx.customerUser.create({
              data: {
                tenantId,
                email: body.sendToCustomer.email.toLowerCase(),
                name: body.sendToCustomer.name,
                passwordHash: tempPasswordHash,
                companyName: certificate.customerName || 'Unknown Company',
                isActive: true,
              },
            })
          }

          await tx.approvalToken.create({
            data: {
              token,
              certificateId: id,
              customerId: customer.id,
              expiresAt,
            },
          })

          tokenResult = { token, customerId: customer.id, expiresAt }
        }

        return { tokenResult }
      })

      return {
        success: true,
        message: body.sendToCustomer ? 'Certificate approved and sent to customer' : 'Certificate approved',
        ...(result.tokenResult && {
          customerToken: {
            token: result.tokenResult.token,
            expiresAt: result.tokenResult.expiresAt.toISOString(),
          },
        }),
      }
    }

    if (body.action === 'request_revision') {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const lastEvent = await tx.certificateEvent.findFirst({
          where: { certificateId: id },
          orderBy: { sequenceNumber: 'desc' },
        })
        const nextSequence = (lastEvent?.sequenceNumber ?? 0) + 1

        await tx.certificate.update({
          where: { id },
          data: { status: 'REVISION_REQUIRED', lastModifiedById: userId },
        })

        const event = await tx.certificateEvent.create({
          data: {
            certificateId: id,
            sequenceNumber: nextSequence,
            revision: certificate.currentRevision,
            userId,
            userRole: 'ENGINEER',
            eventType: 'REVISION_REQUESTED',
            eventData: JSON.stringify({
              feedbackCount: (body.sectionFeedbacks?.length || 0) + (body.generalNotes ? 1 : 0),
              reviewerId: userId,
            }),
          },
        })

        // Create feedback records
        if (body.sectionFeedbacks) {
          for (const sf of body.sectionFeedbacks) {
            if (sf.comment?.trim()) {
              await tx.reviewFeedback.create({
                data: {
                  certificateId: id,
                  userId,
                  feedbackType: 'REVISION_REQUESTED',
                  comment: sf.comment.trim(),
                  targetSection: sf.section,
                  revisionNumber: certificate.currentRevision,
                  eventId: event.id,
                },
              })
            }
          }
        }

        if (body.generalNotes?.trim() || body.comment?.trim()) {
          await tx.reviewFeedback.create({
            data: {
              certificateId: id,
              userId,
              feedbackType: 'REVISION_REQUESTED',
              comment: body.generalNotes?.trim() || body.comment!.trim(),
              revisionNumber: certificate.currentRevision,
              eventId: event.id,
            },
          })
        }
      })

      return { success: true, message: 'Revision requested' }
    }

    if (body.action === 'reject') {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const lastEvent = await tx.certificateEvent.findFirst({
          where: { certificateId: id },
          orderBy: { sequenceNumber: 'desc' },
        })
        const nextSequence = (lastEvent?.sequenceNumber ?? 0) + 1

        await tx.certificate.update({
          where: { id },
          data: { status: 'REJECTED', lastModifiedById: userId },
        })

        await tx.reviewFeedback.create({
          data: {
            certificateId: id,
            userId,
            feedbackType: 'REJECTED',
            comment: body.comment!.trim(),
            revisionNumber: certificate.currentRevision,
          },
        })

        await tx.certificateEvent.create({
          data: {
            certificateId: id,
            sequenceNumber: nextSequence,
            revision: certificate.currentRevision,
            userId,
            userRole: 'ENGINEER',
            eventType: 'REJECTED',
            eventData: JSON.stringify({ comment: body.comment!.trim(), reviewerId: userId }),
          },
        })
      })

      return { success: true, message: 'Certificate rejected' }
    }

    return reply.status(400).send({ error: 'Invalid action' })
  })

  // POST /api/certificates/:id/assign-revision - Admin assigns customer revision to engineer
  fastify.post<{ Params: { id: string } }>('/:id/assign-revision', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userRole = request.user!.role
    const userName = request.user!.name
    const { id } = request.params
    const body = request.body as {
      customerFeedback?: string
      additionalNotes?: string
      sectionFeedbacks?: { section: string; comment: string }[]
      generalNotes?: string
    }

    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
      include: { createdBy: { select: { id: true, name: true } } },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.status !== 'CUSTOMER_REVISION_REQUIRED') {
      return reply.status(400).send({ error: 'Certificate is not in customer revision required status' })
    }

    const now = new Date()

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.certificate.update({
        where: { id },
        data: { status: 'REVISION_REQUIRED', updatedAt: now },
      })

      // Create feedback records
      if (body.sectionFeedbacks) {
        for (const sf of body.sectionFeedbacks) {
          if (sf.comment?.trim()) {
            await tx.reviewFeedback.create({
              data: {
                certificateId: id,
                revisionNumber: certificate.currentRevision,
                feedbackType: 'CUSTOMER_REVISION_FORWARDED',
                comment: sf.comment.trim(),
                targetSection: sf.section,
                userId,
              },
            })
          }
        }
      }

      if (body.generalNotes?.trim()) {
        await tx.reviewFeedback.create({
          data: {
            certificateId: id,
            revisionNumber: certificate.currentRevision,
            feedbackType: 'CUSTOMER_REVISION_FORWARDED',
            comment: body.generalNotes.trim(),
            userId,
          },
        })
      }

      const lastEvent = await tx.certificateEvent.findFirst({
        where: { certificateId: id },
        orderBy: { sequenceNumber: 'desc' },
      })

      await tx.certificateEvent.create({
        data: {
          certificateId: id,
          sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
          revision: certificate.currentRevision,
          eventType: 'CUSTOMER_REVISION_FORWARDED',
          eventData: JSON.stringify({
            customerFeedback: body.customerFeedback,
            additionalNotes: body.additionalNotes,
            sectionFeedbacks: body.sectionFeedbacks,
            forwardedAt: now.toISOString(),
            forwardedBy: userName,
            engineerId: certificate.createdById,
          }),
          userId,
          userRole,
        },
      })
    })

    return { success: true, message: 'Certificate assigned to engineer for revision' }
  })

  // POST /api/certificates/:id/send-to-customer - Send certificate to customer for approval
  fastify.post<{ Params: { id: string } }>('/:id/send-to-customer', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userRole = request.user!.role
    const userName = request.user!.name
    const { id } = request.params
    const body = request.body as {
      customerEmail: string
      customerName: string
      message?: string
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

    if (certificate.status !== 'PENDING_CUSTOMER_APPROVAL') {
      return reply.status(400).send({ error: 'Certificate must be approved by Reviewer before sending to customer' })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days
    const token = crypto.randomUUID()

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Find or create customer
      let customer = await tx.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: body.customerEmail.toLowerCase() } },
      })

      if (!customer) {
        const tempPasswordHash = crypto.randomBytes(32).toString('hex')
        customer = await tx.customerUser.create({
          data: {
            tenantId,
            email: body.customerEmail.toLowerCase(),
            name: body.customerName,
            passwordHash: tempPasswordHash,
            companyName: certificate.customerName || 'Unknown Company',
            isActive: true,
          },
        })
      }

      // Revoke existing tokens
      await tx.approvalToken.updateMany({
        where: { certificateId: id, usedAt: null },
        data: { usedAt: now },
      })

      // Create new token
      const approvalToken = await tx.approvalToken.create({
        data: {
          token,
          certificateId: id,
          customerId: customer.id,
          expiresAt,
        },
      })

      // Update certificate
      await tx.certificate.update({
        where: { id },
        data: {
          customerName: certificate.customerName || body.customerName,
          updatedAt: now,
        },
      })

      // Log event
      const lastEvent = await tx.certificateEvent.findFirst({
        where: { certificateId: id },
        orderBy: { sequenceNumber: 'desc' },
      })

      await tx.certificateEvent.create({
        data: {
          certificateId: id,
          sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
          revision: certificate.currentRevision,
          eventType: 'SENT_TO_CUSTOMER',
          eventData: JSON.stringify({
            customerEmail: body.customerEmail.toLowerCase(),
            customerName: body.customerName,
            message: body.message || null,
            tokenId: approvalToken.id,
            expiresAt: expiresAt.toISOString(),
            sentBy: userName,
          }),
          userId,
          userRole,
        },
      })

      return { token: approvalToken.token, customerId: customer.id, expiresAt: approvalToken.expiresAt }
    })

    return {
      success: true,
      token: result.token,
      tokenExpiry: result.expiresAt.toISOString(),
      customerId: result.customerId,
    }
  })

  // GET /api/certificates/:id/send-to-customer - Get customer status
  fastify.get<{ Params: { id: string } }>('/:id/send-to-customer', {
    preHandler: [requireStaff],
  }, async (request) => {
    const { id } = request.params

    const activeToken = await prisma.approvalToken.findFirst({
      where: {
        certificateId: id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    })

    const sentEvent = await prisma.certificateEvent.findFirst({
      where: { certificateId: id, eventType: 'SENT_TO_CUSTOMER' },
      orderBy: { createdAt: 'desc' },
    })

    if (!activeToken) {
      return { sent: false, sentTo: null, token: null, canResend: true }
    }

    let eventData: Record<string, string> = {}
    if (sentEvent?.eventData) {
      try {
        eventData = typeof sentEvent.eventData === 'string'
          ? JSON.parse(sentEvent.eventData)
          : sentEvent.eventData as Record<string, string>
      } catch { /* ignore */ }
    }

    return {
      sent: true,
      sentTo: {
        email: activeToken.customer.email,
        name: activeToken.customer.name,
        sentAt: sentEvent?.createdAt.toISOString() || activeToken.createdAt.toISOString(),
      },
      token: {
        token: activeToken.token,
        expiresAt: activeToken.expiresAt.toISOString(),
      },
      message: eventData?.message || null,
      canResend: true,
    }
  })

  // POST /api/certificates/:id/reply-to-customer - Admin replies to customer feedback
  fastify.post<{ Params: { id: string } }>('/:id/reply-to-customer', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userRole = request.user!.role
    const userName = request.user!.name
    const { id } = request.params
    const body = request.body as {
      response: string
      resendCertificate?: boolean
    }

    if (!body.response?.trim()) {
      return reply.status(400).send({ error: 'Response message is required' })
    }

    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.status !== 'CUSTOMER_REVISION_REQUIRED') {
      return reply.status(400).send({ error: 'Certificate is not in customer revision required status' })
    }

    // Get customer info from latest revision event
    const latestCustomerEvent = await prisma.certificateEvent.findFirst({
      where: { certificateId: id, eventType: 'CUSTOMER_REVISION_REQUESTED' },
      orderBy: { createdAt: 'desc' },
    })

    let customerEmail: string | null = null
    let customerName: string | null = null

    if (latestCustomerEvent?.eventData) {
      try {
        const eventData = typeof latestCustomerEvent.eventData === 'string'
          ? JSON.parse(latestCustomerEvent.eventData)
          : latestCustomerEvent.eventData as Record<string, string>
        customerEmail = eventData.customerEmail
        customerName = eventData.customerName
      } catch { /* ignore */ }
    }

    // Fallback to latest token
    if (!customerEmail) {
      const latestToken = await prisma.approvalToken.findFirst({
        where: { certificateId: id },
        include: { customer: true },
        orderBy: { createdAt: 'desc' },
      })
      if (latestToken?.customer) {
        customerEmail = latestToken.customer.email
        customerName = latestToken.customer.name
      }
    }

    const now = new Date()

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const lastEvent = await tx.certificateEvent.findFirst({
        where: { certificateId: id },
        orderBy: { sequenceNumber: 'desc' },
      })
      let nextSeq = (lastEvent?.sequenceNumber || 0) + 1

      // Create reply event
      await tx.certificateEvent.create({
        data: {
          certificateId: id,
          sequenceNumber: nextSeq,
          revision: certificate.currentRevision,
          eventType: 'ADMIN_REPLIED_TO_CUSTOMER',
          eventData: JSON.stringify({
            response: body.response.trim(),
            adminId: userId,
            adminName: userName,
            timestamp: now.toISOString(),
            resendCertificate: !!body.resendCertificate,
          }),
          userId,
          userRole,
        },
      })
      nextSeq++

      let tokenResult = null

      // Resend certificate if requested
      if (body.resendCertificate && customerEmail) {
        let customer = await tx.customerUser.findUnique({
          where: { tenantId_email: { tenantId, email: customerEmail.toLowerCase() } },
        })

        if (!customer) {
          const tempPasswordHash = crypto.randomBytes(32).toString('hex')
          customer = await tx.customerUser.create({
            data: {
              tenantId,
              email: customerEmail.toLowerCase(),
              name: customerName || 'Customer',
              passwordHash: tempPasswordHash,
              companyName: certificate.customerName || 'Unknown Company',
              isActive: true,
            },
          })
        }

        // Revoke existing tokens
        await tx.approvalToken.updateMany({
          where: { certificateId: id, usedAt: null },
          data: { usedAt: now },
        })

        // Create new token
        const token = crypto.randomUUID()
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

        await tx.approvalToken.create({
          data: { token, certificateId: id, customerId: customer.id, expiresAt },
        })

        // Update status
        await tx.certificate.update({
          where: { id },
          data: { status: 'PENDING_CUSTOMER_APPROVAL', updatedAt: now },
        })

        // Create sent event
        await tx.certificateEvent.create({
          data: {
            certificateId: id,
            sequenceNumber: nextSeq,
            revision: certificate.currentRevision,
            eventType: 'SENT_TO_CUSTOMER',
            eventData: JSON.stringify({
              customerEmail: customerEmail.toLowerCase(),
              customerName: customerName || 'Customer',
              responseToFeedback: body.response.trim(),
              expiresAt: expiresAt.toISOString(),
              sentBy: userName,
            }),
            userId,
            userRole,
          },
        })

        tokenResult = { token, expiresAt }
      }

      return { resent: !!body.resendCertificate && !!customerEmail, tokenResult }
    })

    return {
      success: true,
      message: result.resent ? 'Response sent and certificate resent to customer' : 'Response recorded',
      resent: result.resent,
      ...(result.tokenResult && {
        token: result.tokenResult.token,
        tokenExpiry: result.tokenResult.expiresAt.toISOString(),
      }),
    }
  })

  // GET /api/certificates/:id/pdf-data - Get certificate data formatted for PDF generation
  fastify.get<{ Params: { id: string } }>('/:id/pdf-data', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userRole = request.user!.role
    const userEmail = request.user!.email
    const { id } = request.params

    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
      include: {
        parameters: {
          include: { results: { orderBy: { pointNumber: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        masterInstruments: true,
        createdBy: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true } },
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    // Check access
    const isCreator = certificate.createdBy.id === userId
    const isReviewer = certificate.reviewer?.id === userId
    const isAdmin = userRole === 'ADMIN'
    const isCustomer = userRole === 'CUSTOMER'

    let hasCustomerAccess = false
    if (isCustomer) {
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: userEmail } },
        include: { customerAccount: true },
      })
      if (customer) {
        const companyName = customer.customerAccount?.companyName || customer.companyName || ''
        hasCustomerAccess = companyName.toLowerCase() === certificate.customerName?.toLowerCase()
      }
    }

    if (!isCreator && !isReviewer && !isAdmin && !hasCustomerAccess) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    // Fetch signatures
    const dbSignatures = await prisma.signature.findMany({
      where: { certificateId: id },
      orderBy: { signedAt: 'desc' },
    })

    // Fetch signing evidence
    const signingEvidence = await prisma.signingEvidence.findMany({
      where: { certificateId: id, revision: certificate.currentRevision },
      orderBy: { sequenceNumber: 'asc' },
    })

    // Helper to check if signature has evidence for current revision
    const hasEvidenceForCurrentRevision = (signatureId: string, signerType: string): boolean => {
      const eventTypeMap: Record<string, string> = {
        'ASSIGNEE': 'ASSIGNEE_SIGNED',
        'REVIEWER': 'REVIEWER_SIGNED',
        'ADMIN': 'ADMIN_SIGNED',
        'CUSTOMER': 'CUSTOMER_SIGNED',
      }
      return signingEvidence.some(e => e.signatureId === signatureId || e.eventType === eventTypeMap[signerType])
    }

    const assigneeSig = dbSignatures.find((s: (typeof dbSignatures)[number]) => s.signerType === 'ASSIGNEE')
    const reviewerSig = dbSignatures.find((s: (typeof dbSignatures)[number]) => s.signerType === 'REVIEWER')
    const adminSig = dbSignatures.find((s: (typeof dbSignatures)[number]) => s.signerType === 'ADMIN')
    const customerSig = dbSignatures.find((s: (typeof dbSignatures)[number]) => s.signerType === 'CUSTOMER')

    const validAssigneeSig = assigneeSig && hasEvidenceForCurrentRevision(assigneeSig.id, 'ASSIGNEE') ? assigneeSig : null
    const validReviewerSig = reviewerSig && hasEvidenceForCurrentRevision(reviewerSig.id, 'REVIEWER') ? reviewerSig : null
    const validAdminSig = adminSig && hasEvidenceForCurrentRevision(adminSig.id, 'ADMIN') ? adminSig : null
    const validCustomerSig = customerSig && hasEvidenceForCurrentRevision(customerSig.id, 'CUSTOMER') ? customerSig : null

    const signatures = (validAssigneeSig || validReviewerSig || validAdminSig || validCustomerSig) ? {
      ...(validAssigneeSig ? {
        engineer: {
          name: validAssigneeSig.signerName.toUpperCase(),
          image: validAssigneeSig.signatureData,
          signatureId: validAssigneeSig.id,
        }
      } : {}),
      ...(validReviewerSig ? {
        hod: {
          name: validReviewerSig.signerName.toUpperCase(),
          image: validReviewerSig.signatureData,
          signatureId: validReviewerSig.id,
        }
      } : {}),
      ...(validAdminSig ? {
        admin: {
          name: validAdminSig.signerName.toUpperCase(),
          image: validAdminSig.signatureData,
          signatureId: validAdminSig.id,
        }
      } : {}),
      ...(validCustomerSig ? {
        customer: {
          name: validCustomerSig.signerName.toUpperCase(),
          companyName: certificate.customerName || '',
          email: validCustomerSig.signerEmail,
          image: validCustomerSig.signatureData,
          signedAt: validCustomerSig.signedAt.toISOString(),
          signatureId: validCustomerSig.id,
        }
      } : {}),
    } : undefined

    return {
      signatures,
      certificateNumber: certificate.certificateNumber,
      status: certificate.status,
      lastSaved: certificate.updatedAt,
      calibratedAt: certificate.calibratedAt || 'LAB',
      srfNumber: certificate.srfNumber || '',
      srfDate: certificate.srfDate?.toISOString().split('T')[0] || '',
      dateOfCalibration: certificate.dateOfCalibration?.toISOString().split('T')[0] || '',
      calibrationTenure: certificate.calibrationTenure || 12,
      dueDateAdjustment: certificate.dueDateAdjustment || 0,
      calibrationDueDate: certificate.calibrationDueDate?.toISOString().split('T')[0] || '',
      dueDateNotApplicable: certificate.dueDateNotApplicable || false,
      customerName: certificate.customerName || '',
      customerAddress: certificate.customerAddress || '',
      customerContactName: certificate.customerContactName || '',
      uucDescription: certificate.uucDescription || '',
      uucMake: certificate.uucMake || '',
      uucModel: certificate.uucModel || '',
      uucSerialNumber: certificate.uucSerialNumber || '',
      uucInstrumentId: certificate.uucInstrumentId || '',
      uucLocationName: certificate.uucLocationName || '',
      uucMachineName: certificate.uucMachineName || '',
      parameters: certificate.parameters.map((param: (typeof certificate.parameters)[number]) => ({
        id: param.id,
        parameterName: param.parameterName || '',
        parameterUnit: param.parameterUnit || '',
        rangeMin: param.rangeMin || '',
        rangeMax: param.rangeMax || '',
        rangeUnit: param.rangeUnit || '',
        operatingMin: param.operatingMin || '',
        operatingMax: param.operatingMax || '',
        operatingUnit: param.operatingUnit || '',
        leastCountValue: param.leastCountValue || '',
        leastCountUnit: param.leastCountUnit || '',
        accuracyValue: param.accuracyValue || '',
        accuracyUnit: param.accuracyUnit || '',
        accuracyType: param.accuracyType || 'ABSOLUTE',
        requiresBinning: param.requiresBinning || false,
        bins: safeJsonParse<unknown[]>(param.bins, []),
        errorFormula: param.errorFormula || 'A-B',
        showAfterAdjustment: param.showAfterAdjustment || false,
        masterInstrumentId: param.masterInstrumentId ? parseInt(param.masterInstrumentId) : null,
        sopReference: param.sopReference || '',
        results: param.results.map((result: (typeof param.results)[number]) => ({
          id: result.id,
          pointNumber: result.pointNumber,
          standardReading: result.standardReading || '',
          beforeAdjustment: result.beforeAdjustment || '',
          afterAdjustment: result.afterAdjustment || '',
          errorObserved: result.errorObserved,
          isOutOfLimit: result.isOutOfLimit || false,
        })),
      })),
      masterInstruments: certificate.masterInstruments.map((mi: (typeof certificate.masterInstruments)[number]) => ({
        id: mi.id,
        masterInstrumentId: parseInt(mi.masterInstrumentId) || 0,
        category: mi.category || '',
        description: mi.description || '',
        make: mi.make || '',
        model: mi.model || '',
        assetNo: mi.assetNo || '',
        serialNumber: mi.serialNumber || '',
        calibratedAt: mi.calibratedAt || '',
        reportNo: mi.reportNo || '',
        calibrationDueDate: mi.calibrationDueDate || '',
        isExpired: false,
        isExpiringSoon: false,
      })),
      ambientTemperature: certificate.ambientTemperature || '',
      relativeHumidity: certificate.relativeHumidity || '',
      calibrationStatus: safeJsonParse<string[]>(certificate.calibrationStatus, []),
      stickerOldRemoved: certificate.stickerOldRemoved || null,
      stickerNewAffixed: certificate.stickerNewAffixed || null,
      statusNotes: certificate.statusNotes || '',
      selectedConclusionStatements: safeJsonParse<string[]>(certificate.selectedConclusionStatements, []),
      additionalConclusionStatement: certificate.additionalConclusionStatement || '',
      engineerNotes: '',
    }
  })

  // GET /api/certificates/check-number - Check if certificate number exists
  fastify.get('/check-number', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as { number?: string; excludeId?: string }

    if (!query.number) {
      return { error: 'Certificate number is required', exists: false }
    }

    const where: Record<string, unknown> = {
      tenantId,
      certificateNumber: query.number,
    }

    // Exclude current certificate when editing
    if (query.excludeId) {
      where.NOT = { id: query.excludeId }
    }

    const existingCertificate = await prisma.certificate.findFirst({
      where,
      select: { id: true, certificateNumber: true },
    })

    return {
      exists: !!existingCertificate,
      certificateNumber: query.number,
    }
  })

  // POST /api/certificates/:id/change-reviewer - Change the assigned reviewer
  fastify.post<{ Params: { id: string } }>('/:id/change-reviewer', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userRole = request.user!.role
    const { id } = request.params
    const body = request.body as {
      newReviewerId: string
      reason: string
    }

    if (!body.newReviewerId) {
      return reply.status(400).send({ error: 'New reviewer ID is required' })
    }

    if (!body.reason?.trim()) {
      return reply.status(400).send({ error: 'Reason for changing reviewer is required' })
    }

    // Get the certificate
    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id },
      include: {
        reviewer: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    // Check ownership - only the certificate creator or admin can change reviewer
    const isAdmin = userRole === 'ADMIN' || request.user!.isAdmin
    if (certificate.createdById !== userId && !isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    // Check if certificate is in a status that allows reviewer change
    if (certificate.status !== 'PENDING_REVIEW') {
      return reply.status(400).send({
        error: `Cannot change reviewer for certificate with status: ${certificate.status}`,
      })
    }

    // Check if new reviewer is same as current
    if (certificate.reviewerId === body.newReviewerId) {
      return reply.status(400).send({
        error: 'New reviewer must be different from current reviewer',
      })
    }

    // Cannot assign to self
    if (body.newReviewerId === userId) {
      return reply.status(400).send({
        error: 'You cannot assign yourself as reviewer',
      })
    }

    // Validate new reviewer exists and is active
    const newReviewer = await prisma.user.findFirst({
      where: { tenantId, id: body.newReviewerId, isActive: true },
      select: { id: true, name: true, email: true, role: true },
    })

    if (!newReviewer) {
      return reply.status(400).send({ error: 'Selected reviewer is not available' })
    }

    // Perform the update in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get next event sequence
      const lastEvent = await tx.certificateEvent.findFirst({
        where: { certificateId: id },
        orderBy: { sequenceNumber: 'desc' },
      })
      const nextSequence = (lastEvent?.sequenceNumber ?? 0) + 1

      // Update the certificate with new reviewer
      const updatedCertificate = await tx.certificate.update({
        where: { id },
        data: {
          reviewerId: body.newReviewerId,
          lastModifiedById: userId,
        },
        include: {
          reviewer: {
            select: { id: true, name: true, email: true },
          },
        },
      })

      // Create event for reviewer change
      await tx.certificateEvent.create({
        data: {
          certificateId: id,
          sequenceNumber: nextSequence,
          revision: certificate.currentRevision,
          eventType: 'REVIEWER_CHANGED',
          eventData: JSON.stringify({
            previousReviewerId: certificate.reviewerId,
            previousReviewerName: certificate.reviewer?.name || null,
            newReviewerId: newReviewer.id,
            newReviewerName: newReviewer.name,
            reason: body.reason.trim(),
            changedAt: new Date().toISOString(),
          }),
          userId,
          userRole,
        },
      })

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'Certificate',
          entityId: id,
          action: 'REVIEWER_CHANGED',
          actorId: userId,
          actorType: 'USER',
          changes: JSON.stringify({
            previousReviewerId: certificate.reviewerId,
            previousReviewerName: certificate.reviewer?.name,
            newReviewerId: newReviewer.id,
            newReviewerName: newReviewer.name,
            reason: body.reason.trim(),
          }),
        },
      })

      return updatedCertificate
    })

    return {
      success: true,
      message: 'Reviewer changed successfully',
      certificate: {
        id: result.id,
        certificateNumber: result.certificateNumber,
        reviewer: result.reviewer,
      },
    }
  })

  // GET /api/certificates/:id/unlock-requests - Get section unlock requests for a certificate
  fastify.get<{ Params: { id: string } }>('/:id/unlock-requests', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub
    const userRole = request.user!.role
    const { id: certificateId } = request.params

    // Check certificate exists and user has access
    const certificate = await prisma.certificate.findFirst({
      where: { tenantId, id: certificateId },
      select: {
        id: true,
        createdById: true,
        reviewerId: true,
        status: true,
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    // Only assignee, reviewer, or admin can view unlock requests
    const isAssignee = certificate.createdById === userId
    const isReviewer = certificate.reviewerId === userId
    const isAdmin = userRole === 'ADMIN' || request.user!.isAdmin

    if (!isAssignee && !isReviewer && !isAdmin) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    // Fetch all section unlock requests for this certificate
    const unlockRequests = await prisma.internalRequest.findMany({
      where: {
        certificateId,
        type: 'SECTION_UNLOCK',
      },
      include: {
        requestedBy: {
          select: { id: true, name: true },
        },
        reviewedBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Get sections that are unlocked from feedback (reviewer comments)
    const feedbacks = await prisma.reviewFeedback.findMany({
      where: {
        certificateId,
        feedbackType: { in: ['REVISION_REQUESTED', 'CUSTOMER_REVISION_FORWARDED'] },
        targetSection: { not: null },
      },
      select: { targetSection: true },
    })

    const feedbackUnlockedSections = [...new Set(feedbacks.map((f: (typeof feedbacks)[number]) => f.targetSection).filter(Boolean))] as string[]

    // Get sections from approved unlock requests
    const approvedUnlockedSections: string[] = []
    unlockRequests
      .filter((r: (typeof unlockRequests)[number]) => r.status === 'APPROVED')
      .forEach((r: (typeof unlockRequests)[number]) => {
        const data = safeJsonParse<Record<string, unknown>>(r.data, {})
        if (data.sections && Array.isArray(data.sections)) {
          approvedUnlockedSections.push(...(data.sections as string[]))
        }
      })

    // Combine all unlocked sections
    const allUnlockedSections = [...new Set([...feedbackUnlockedSections, ...approvedUnlockedSections])]

    return {
      requests: unlockRequests.map((r: (typeof unlockRequests)[number]) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        data: safeJsonParse<Record<string, unknown>>(r.data, {}),
        requestedBy: r.requestedBy,
        reviewedBy: r.reviewedBy,
        reviewedAt: r.reviewedAt?.toISOString() || null,
        adminNote: r.adminNote,
        createdAt: r.createdAt.toISOString(),
      })),
      unlockedSections: {
        fromFeedback: feedbackUnlockedSections,
        fromApprovedRequests: [...new Set(approvedUnlockedSections)],
        all: allUnlockedSections,
      },
    }
  })

  // Register certificate images sub-routes
  await fastify.register(certificateImagesRoutes, { prefix: '/:id/images' })
}

export default certificateRoutes
