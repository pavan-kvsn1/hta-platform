import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { requireAdmin } from '../../middleware/auth.js'

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
    const page = parseInt(query.page || '1')
    const limit = parseInt(query.limit || '20')

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
      certificates: certificates.map((cert) => ({
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

    const users = await prisma.user.findMany({
      where: { tenantId },
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
    })

    return { users }
  })

  // GET /api/admin/customers - List all customer accounts
  fastify.get('/customers', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId

    const accounts = await prisma.customerAccount.findMany({
      where: { tenantId },
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
    })

    return { accounts }
  })

  // GET /api/admin/registrations - List pending customer registrations
  fastify.get('/registrations', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const query = request.query as { status?: string }
    const status = query.status || 'PENDING'

    const registrations = await prisma.customerRegistration.findMany({
      where: { status },
      include: {
        customerAccount: {
          select: { id: true, companyName: true },
        },
        reviewedBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return { registrations }
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

    // Create customer user from registration
    await prisma.$transaction(async (tx) => {
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

  // GET /api/admin/analytics - Dashboard analytics
  fastify.get('/analytics', {
    preHandler: [requireAdmin],
  }, async (request) => {
    const tenantId = request.tenantId

    const [
      totalCertificates,
      totalUsers,
      totalCustomers,
      certificatesByStatus,
      recentCertificates,
    ] = await Promise.all([
      prisma.certificate.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId, isActive: true } }),
      prisma.customerAccount.count({ where: { tenantId, isActive: true } }),
      prisma.certificate.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      prisma.certificate.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          certificateNumber: true,
          status: true,
          customerName: true,
          createdAt: true,
        },
      }),
    ])

    const statusCounts = certificatesByStatus.reduce((acc, item) => {
      acc[item.status] = item._count
      return acc
    }, {} as Record<string, number>)

    return {
      summary: {
        totalCertificates,
        totalUsers,
        totalCustomers,
      },
      certificatesByStatus: statusCounts,
      recentCertificates,
    }
  })
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
