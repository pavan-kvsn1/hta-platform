import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { requireStaff } from '../../middleware/auth.js'

const userRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/users/reviewers - Get list of engineers available as reviewers
  fastify.get('/reviewers', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId
    const userId = request.user!.sub

    // Get all active engineers except the current user
    const engineers = await prisma.user.findMany({
      where: {
        tenantId,
        role: 'ENGINEER',
        isActive: true,
        id: { not: userId },
      },
      select: {
        id: true,
        name: true,
        email: true,
        signatureUrl: true,
        _count: {
          select: {
            reviewedCertificates: {
              where: {
                status: { in: ['PENDING_REVIEW', 'REVISION_REQUIRED'] },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Also include admins as potential reviewers
    const admins = await prisma.user.findMany({
      where: {
        tenantId,
        role: 'ADMIN',
        isActive: true,
        id: { not: userId },
      },
      select: {
        id: true,
        name: true,
        email: true,
        adminType: true,
        signatureUrl: true,
        _count: {
          select: {
            reviewedCertificates: {
              where: {
                status: { in: ['PENDING_REVIEW', 'REVISION_REQUIRED'] },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const reviewers = [
      ...engineers.map((r: typeof engineers[number]) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: 'ENGINEER' as const,
        hasSignature: !!r.signatureUrl,
        pendingReviews: r._count.reviewedCertificates,
      })),
      ...admins.map((a: typeof admins[number]) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        role: 'ADMIN' as const,
        adminType: a.adminType,
        hasSignature: !!a.signatureUrl,
        pendingReviews: a._count.reviewedCertificates,
      })),
    ]

    return { reviewers }
  })

  // GET /api/users/me - Get current user profile (detailed)
  fastify.get('/me', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userType = request.user!.userType

    if (userType === 'STAFF') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isAdmin: true,
          adminType: true,
          profileImageUrl: true,
          signatureUrl: true,
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
      })

      if (!user) {
        return reply.status(404).send({ error: 'User not found' })
      }

      return { user }
    }

    return reply.status(400).send({ error: 'Invalid user type' })
  })

  // GET /api/users/engineers - Get list of all engineers (for admin)
  fastify.get('/engineers', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId

    const engineers = await prisma.user.findMany({
      where: {
        tenantId,
        role: 'ENGINEER',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        signatureUrl: true,
        assignedAdmin: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    return { engineers }
  })
}

export default userRoutes
