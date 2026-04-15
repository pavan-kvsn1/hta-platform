import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { requireAuth } from '../../middleware/auth.js'

const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/notifications - Get notifications for current user
  fastify.get('/', {
    preHandler: [requireAuth],
  }, async (request) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const query = request.query as {
      limit?: string
      offset?: string
      unreadOnly?: string
    }

    const limit = parseInt(query.limit || '10', 10)
    const offset = parseInt(query.offset || '0', 10)
    const unreadOnly = query.unreadOnly === 'true'

    const isCustomer = userRole === 'CUSTOMER'

    // Build where clause
    const where: Record<string, unknown> = {}

    if (isCustomer) {
      where.customerId = userId
    } else {
      where.userId = userId
    }

    if (unreadOnly) {
      where.readAt = null
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          certificate: {
            select: {
              id: true,
              certificateNumber: true,
              status: true,
            },
          },
        },
      }),
      prisma.notification.count({ where }),
    ])

    return {
      notifications: notifications.map((n: (typeof notifications)[number]) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() || null,
        data: n.data ? (typeof n.data === 'string' ? JSON.parse(n.data) : n.data) : null,
        certificate: n.certificate,
      })),
      total,
      hasMore: offset + limit < total,
    }
  })

  // GET /api/notifications/unread-count - Get unread notification count
  fastify.get('/unread-count', {
    preHandler: [requireAuth],
  }, async (request) => {
    const userId = request.user!.sub
    const userRole = request.user!.role

    const isCustomer = userRole === 'CUSTOMER'

    const where: Record<string, unknown> = { readAt: null }

    if (isCustomer) {
      where.customerId = userId
    } else {
      where.userId = userId
    }

    const count = await prisma.notification.count({ where })

    return { count }
  })

  // POST /api/notifications/mark-read - Mark notifications as read
  fastify.post('/mark-read', {
    preHandler: [requireAuth],
  }, async (request) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const body = request.body as { notificationIds?: string[] | 'all' }

    const isCustomer = userRole === 'CUSTOMER'
    const markAll = body.notificationIds === 'all'

    const where: Record<string, unknown> = { readAt: null }

    if (isCustomer) {
      where.customerId = userId
    } else {
      where.userId = userId
    }

    if (!markAll && Array.isArray(body.notificationIds)) {
      where.id = { in: body.notificationIds }
    }

    await prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    })

    return { success: true }
  })
}

export default notificationRoutes
