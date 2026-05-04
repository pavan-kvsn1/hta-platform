import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { requireAuth } from '../../middleware/auth.js'
import {
  getOrCreateThread,
  getThreadWithCertificate,
  getThreadsForUser,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  getUnreadMessageCount,
  getUnreadCountsByThread,
  canAccessChatThread,
  type ThreadType,
} from '../../services/chat.js'
import { enqueueNotification } from '../../services/queue.js'

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/chat/threads - Get threads for current user
  fastify.get('/threads', {
    preHandler: [requireAuth],
  }, async (request) => {
    const userId = request.user!.sub
    const tenantId = request.tenantId

    const threads = await getThreadsForUser(userId, tenantId)
    const unreadCounts = await getUnreadCountsByThread(userId, tenantId)

    // Add unread counts to threads
    const threadsWithUnread = threads.map((thread) => ({
      ...thread,
      unreadCount: unreadCounts[thread.id] || 0,
    }))

    return { threads: threadsWithUnread }
  })

  // POST /api/chat/threads - Create or get a thread
  fastify.post('/threads', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as {
      certificateId: string
      threadType: string
    }

    if (!body.certificateId || !body.threadType) {
      return reply.status(400).send({
        error: 'certificateId and threadType are required',
      })
    }

    // Validate threadType
    if (!['ASSIGNEE_REVIEWER', 'REVIEWER_CUSTOMER'].includes(body.threadType)) {
      return reply.status(400).send({ error: 'Invalid threadType' })
    }

    const thread = await getOrCreateThread({
      certificateId: body.certificateId,
      threadType: body.threadType as ThreadType,
    })

    return { thread }
  })

  // GET /api/chat/threads/:threadId/messages - Get messages for a thread
  fastify.get<{ Params: { threadId: string } }>('/threads/:threadId/messages', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { threadId } = request.params
    const query = request.query as { limit?: string; cursor?: string }

    // Get thread with certificate for access check
    const threadData = await getThreadWithCertificate(threadId)

    if (!threadData) {
      return reply.status(404).send({ error: 'Thread not found' })
    }

    // Verify tenant
    if (threadData.certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Check access
    let hasAccess = canAccessChatThread(
      { id: userId, role: userRole },
      { createdById: threadData.certificate.createdById, reviewerId: threadData.certificate.reviewerId },
      threadData.threadType as ThreadType
    )

    // For customers, verify they belong to the certificate's company
    if (hasAccess && userRole === 'CUSTOMER' && threadData.threadType === 'REVIEWER_CUSTOMER') {
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: request.user!.email } },
        include: { customerAccount: true },
      })
      if (customer) {
        const companyName = customer.customerAccount?.companyName || customer.companyName || ''
        hasAccess = companyName.toLowerCase() === threadData.certificate.customerName?.toLowerCase()
      } else {
        hasAccess = false
      }
    }

    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const limit = Math.max(1, Math.min(parseInt(query.limit || '50', 10), 50))
    const cursor = query.cursor

    const result = await getMessages(threadId, { limit, cursor })

    return result
  })

  // POST /api/chat/threads/:threadId/messages - Send a message
  fastify.post<{ Params: { threadId: string } }>('/threads/:threadId/messages', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { threadId } = request.params
    const body = request.body as {
      content: string
      attachments?: {
        fileName: string
        mimeType: string
        fileSize: number
        storagePath: string
      }[]
    }

    // Get thread with certificate for access check
    const threadData = await getThreadWithCertificate(threadId)

    if (!threadData) {
      return reply.status(404).send({ error: 'Thread not found' })
    }

    // Verify tenant
    if (threadData.certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Check access
    let hasAccess = canAccessChatThread(
      { id: userId, role: userRole },
      { createdById: threadData.certificate.createdById, reviewerId: threadData.certificate.reviewerId },
      threadData.threadType as ThreadType
    )

    // For customers, verify they belong to the certificate's company
    if (hasAccess && userRole === 'CUSTOMER' && threadData.threadType === 'REVIEWER_CUSTOMER') {
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: request.user!.email } },
        include: { customerAccount: true },
      })
      if (customer) {
        const companyName = customer.customerAccount?.companyName || customer.companyName || ''
        hasAccess = companyName.toLowerCase() === threadData.certificate.customerName?.toLowerCase()
      } else {
        hasAccess = false
      }
    }

    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    if (!body.content || typeof body.content !== 'string' || body.content.trim().length === 0) {
      return reply.status(400).send({ error: 'Message content is required' })
    }

    if (body.attachments && !Array.isArray(body.attachments)) {
      return reply.status(400).send({ error: 'Attachments must be an array' })
    }

    const message = await sendMessage({
      threadId,
      senderId: userId,
      senderRole: userRole,
      content: body.content.trim(),
      attachments: body.attachments,
    })

    // Notify other participants in the thread (non-blocking)
    const cert = threadData.certificate
    const otherParticipants: string[] = []
    if (threadData.threadType === 'ASSIGNEE_REVIEWER') {
      if (cert.createdById && cert.createdById !== userId) otherParticipants.push(cert.createdById)
      if (cert.reviewerId && cert.reviewerId !== userId) otherParticipants.push(cert.reviewerId)
    } else if (threadData.threadType === 'REVIEWER_CUSTOMER') {
      if (cert.reviewerId && cert.reviewerId !== userId) otherParticipants.push(cert.reviewerId)
    }

    for (const participantId of otherParticipants) {
      enqueueNotification({
        type: 'create-notification',
        userId: participantId,
        notificationType: 'NEW_CHAT_MESSAGE',
        certificateId: cert.id,
        data: {
          threadId,
          senderName: request.user!.name || 'Unknown',
          certificateNumber: cert.certificateNumber,
          preview: body.content.trim().substring(0, 100),
        },
      }).catch((err) => {
        request.log.error({ err, participantId }, 'Failed to enqueue chat notification')
      })
    }

    return reply.status(201).send({ message })
  })

  // POST /api/chat/threads/:threadId/read - Mark messages as read
  fastify.post<{ Params: { threadId: string } }>('/threads/:threadId/read', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { threadId } = request.params

    // Get thread with certificate for access check
    const threadData = await getThreadWithCertificate(threadId)

    if (!threadData) {
      return reply.status(404).send({ error: 'Thread not found' })
    }

    // Verify tenant
    if (threadData.certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Check access
    let hasAccess = canAccessChatThread(
      { id: userId, role: userRole },
      { createdById: threadData.certificate.createdById, reviewerId: threadData.certificate.reviewerId },
      threadData.threadType as ThreadType
    )

    // For customers, verify they belong to the certificate's company
    if (hasAccess && userRole === 'CUSTOMER' && threadData.threadType === 'REVIEWER_CUSTOMER') {
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: request.user!.email } },
        include: { customerAccount: true },
      })
      if (customer) {
        const companyName = customer.customerAccount?.companyName || customer.companyName || ''
        hasAccess = companyName.toLowerCase() === threadData.certificate.customerName?.toLowerCase()
      } else {
        hasAccess = false
      }
    }

    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const count = await markMessagesAsRead(threadId, userId)

    return { markedAsRead: count }
  })

  // GET /api/chat/unread - Get unread message count
  fastify.get('/unread', {
    preHandler: [requireAuth],
  }, async (request) => {
    const userId = request.user!.sub
    const tenantId = request.tenantId
    const query = request.query as { detailed?: string }
    const detailed = query.detailed === 'true'

    if (detailed) {
      const countsByThread = await getUnreadCountsByThread(userId, tenantId)
      const total = Object.values(countsByThread).reduce((a, b) => a + b, 0)

      return {
        total,
        byThread: countsByThread,
      }
    }

    const count = await getUnreadMessageCount(userId, tenantId)

    return { count }
  })

  // GET /api/chat/attachments/:id - Get attachment (download)
  fastify.get<{ Params: { id: string } }>('/attachments/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { id } = request.params

    // Get attachment with thread info
    const attachment = await prisma.chatAttachment.findUnique({
      where: { id },
      include: {
        message: {
          include: {
            thread: {
              include: {
                certificate: {
                  select: {
                    tenantId: true,
                    createdById: true,
                    reviewerId: true,
                    customerName: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!attachment) {
      return reply.status(404).send({ error: 'Attachment not found' })
    }

    const threadData = attachment.message.thread

    // Verify tenant
    if (threadData.certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Check access
    let hasAccess = canAccessChatThread(
      { id: userId, role: userRole },
      { createdById: threadData.certificate.createdById, reviewerId: threadData.certificate.reviewerId },
      threadData.threadType as ThreadType
    )

    // For customers, verify they belong to the certificate's company
    if (hasAccess && userRole === 'CUSTOMER' && threadData.threadType === 'REVIEWER_CUSTOMER') {
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: request.user!.email } },
        include: { customerAccount: true },
      })
      if (customer) {
        const companyName = customer.customerAccount?.companyName || customer.companyName || ''
        hasAccess = companyName.toLowerCase() === threadData.certificate.customerName?.toLowerCase()
      } else {
        hasAccess = false
      }
    }

    if (!hasAccess) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Read and serve the file
    const fs = await import('fs/promises')
    const path = await import('path')

    try {
      const filePath = attachment.storagePath.startsWith('/')
        ? attachment.storagePath
        : path.join(process.cwd(), attachment.storagePath)

      const fileBuffer = await fs.readFile(filePath)

      reply.header('Content-Type', attachment.mimeType)
      reply.header('Content-Disposition', `attachment; filename="${attachment.fileName}"`)
      reply.header('Content-Length', fileBuffer.length.toString())

      return reply.send(fileBuffer)
    } catch {
      return reply.status(404).send({ error: 'File not found' })
    }
  })
}

export default chatRoutes
