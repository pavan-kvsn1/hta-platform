/**
 * Chat Service
 * Business logic for the chat system.
 */

import { prisma } from '@hta/database'

// Types
export type ThreadType = 'ASSIGNEE_REVIEWER' | 'REVIEWER_CUSTOMER'

export interface ChatThreadInfo {
  id: string
  certificateId: string
  threadType: ThreadType
  createdAt: Date
  lastMessageAt: Date | null
  unreadCount: number
  participants: {
    id: string
    name: string | null
    role: string
  }[]
}

export interface ChatMessageInfo {
  id: string
  threadId: string
  senderId: string
  senderName: string | null
  senderRole: string
  content: string
  createdAt: Date
  readAt: Date | null
  attachments: {
    id: string
    fileName: string
    fileType: string
    fileSize: number
    url: string
  }[]
}

export interface SendMessageInput {
  threadId: string
  senderId: string
  senderRole?: string
  content: string
  attachments?: {
    fileName: string
    mimeType: string
    fileSize: number
    storagePath: string
  }[]
}

// Get or create a chat thread for a certificate
export async function getOrCreateThread(input: {
  certificateId: string
  threadType: ThreadType
}): Promise<ChatThreadInfo> {
  const { certificateId, threadType } = input

  // Try to find existing thread
  let thread = await prisma.chatThread.findUnique({
    where: {
      certificateId_threadType: {
        certificateId,
        threadType,
      },
    },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      certificate: {
        include: {
          createdBy: { select: { id: true, name: true, role: true } },
          reviewer: { select: { id: true, name: true, role: true } },
        },
      },
    },
  })

  // Create if doesn't exist
  if (!thread) {
    thread = await prisma.chatThread.create({
      data: {
        certificateId,
        threadType,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        certificate: {
          include: {
            createdBy: { select: { id: true, name: true, role: true } },
            reviewer: { select: { id: true, name: true, role: true } },
          },
        },
      },
    })
  }

  return mapThreadToInfo(thread)
}

// Get thread with certificate data for access check
export async function getThreadWithCertificate(threadId: string) {
  return prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      certificate: {
        select: {
          id: true,
          tenantId: true,
          createdById: true,
          reviewerId: true,
          certificateNumber: true,
          customerName: true,
        },
      },
    },
  })
}

// Get threads for a user
export async function getThreadsForUser(userId: string, tenantId: string): Promise<ChatThreadInfo[]> {
  const threads = await prisma.chatThread.findMany({
    where: {
      certificate: {
        tenantId,
        OR: [
          { createdById: userId },
          { reviewerId: userId },
        ],
      },
    },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      certificate: {
        include: {
          createdBy: { select: { id: true, name: true, role: true } },
          reviewer: { select: { id: true, name: true, role: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return threads.map(mapThreadToInfo)
}

// Send a message to a thread
export async function sendMessage(input: SendMessageInput): Promise<ChatMessageInfo> {
  const { threadId, senderId, senderRole, content, attachments } = input

  // Get thread to verify access and get participant info
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      certificate: {
        select: {
          id: true,
          certificateNumber: true,
          createdById: true,
          reviewerId: true,
        },
      },
    },
  })

  if (!thread) {
    throw new Error('Thread not found')
  }

  const isCustomer = senderRole === 'CUSTOMER'

  // Get sender info from the appropriate table
  let senderName: string | null = null
  if (isCustomer) {
    const customer = await prisma.customerUser.findUnique({
      where: { id: senderId },
      select: { name: true },
    })
    if (!customer) throw new Error('Sender not found')
    senderName = customer.name
  } else {
    const user = await prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    })
    if (!user) throw new Error('Sender not found')
    senderName = user.name
  }

  // Determine sender type based on certificate role
  let senderType: string
  if (isCustomer) {
    senderType = 'CUSTOMER'
  } else if (senderId === thread.certificate.createdById) {
    senderType = 'ASSIGNEE'
  } else if (senderId === thread.certificate.reviewerId) {
    senderType = 'REVIEWER'
  } else {
    senderType = 'ADMIN'
  }

  // Create message with attachments — use customerId for customer senders
  const message = await prisma.chatMessage.create({
    data: {
      threadId,
      senderId: isCustomer ? undefined : senderId,
      customerId: isCustomer ? senderId : undefined,
      senderType,
      content,
      attachments: attachments
        ? {
            create: attachments.map((a) => ({
              fileName: a.fileName,
              mimeType: a.mimeType,
              fileSize: a.fileSize,
              storagePath: a.storagePath,
            })),
          }
        : undefined,
    },
    include: {
      sender: { select: { id: true, name: true, role: true } },
      customer: { select: { id: true, name: true } },
      attachments: true,
    },
  })

  return {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId || message.customerId || '',
    senderName: message.sender?.name || message.customer?.name || senderName,
    senderRole: message.sender?.role || (message.customerId ? 'CUSTOMER' : 'ENGINEER'),
    content: message.content,
    createdAt: message.createdAt,
    readAt: message.readAt,
    attachments: message.attachments.map((a: (typeof message.attachments)[number]) => ({
      id: a.id,
      fileName: a.fileName,
      fileType: a.mimeType,
      fileSize: a.fileSize,
      url: `/api/chat/attachments/${a.id}`,
    })),
  }
}

// Get messages for a thread
export async function getMessages(
  threadId: string,
  options: { limit?: number; cursor?: string } = {}
): Promise<{ messages: ChatMessageInfo[]; hasMore: boolean }> {
  const { limit = 50, cursor } = options

  // Build cursor filter if provided
  let cursorFilter = {}
  if (cursor) {
    const cursorMessage = await prisma.chatMessage.findUnique({ where: { id: cursor } })
    if (cursorMessage) {
      cursorFilter = { createdAt: { lt: cursorMessage.createdAt } }
    }
  }

  const messages = await prisma.chatMessage.findMany({
    where: {
      threadId,
      ...cursorFilter,
    },
    include: {
      sender: { select: { id: true, name: true, role: true } },
      customer: { select: { id: true, name: true } },
      attachments: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })

  const hasMore = messages.length > limit
  const resultMessages = hasMore ? messages.slice(0, -1) : messages

  return {
    messages: resultMessages.map((m: (typeof resultMessages)[number]) => ({
      id: m.id,
      threadId: m.threadId,
      senderId: m.senderId || m.customerId || '',
      senderName: m.sender?.name || m.customer?.name || null,
      senderRole: m.sender?.role || (m.customerId ? 'CUSTOMER' : 'ENGINEER'),
      content: m.content,
      createdAt: m.createdAt,
      readAt: m.readAt,
      attachments: m.attachments.map((a: (typeof m.attachments)[number]) => ({
        id: a.id,
        fileName: a.fileName,
        fileType: a.mimeType,
        fileSize: a.fileSize,
        url: `/api/chat/attachments/${a.id}`,
      })),
    })),
    hasMore,
  }
}

// Mark messages as read
export async function markMessagesAsRead(threadId: string, userId: string): Promise<number> {
  const result = await prisma.chatMessage.updateMany({
    where: {
      threadId,
      senderId: { not: userId },
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  })

  return result.count
}

// Get unread message count for a user
export async function getUnreadMessageCount(userId: string, tenantId: string): Promise<number> {
  const count = await prisma.chatMessage.count({
    where: {
      thread: {
        certificate: {
          tenantId,
          OR: [
            { createdById: userId },
            { reviewerId: userId },
          ],
        },
      },
      senderId: { not: userId },
      readAt: null,
    },
  })

  return count
}

// Get unread count per thread for a user
export async function getUnreadCountsByThread(
  userId: string,
  tenantId: string
): Promise<Record<string, number>> {
  const threads = await prisma.chatThread.findMany({
    where: {
      certificate: {
        tenantId,
        OR: [
          { createdById: userId },
          { reviewerId: userId },
        ],
      },
    },
    select: { id: true },
  })

  const result: Record<string, number> = {}

  for (const thread of threads) {
    const count = await prisma.chatMessage.count({
      where: {
        threadId: thread.id,
        senderId: { not: userId },
        readAt: null,
      },
    })
    if (count > 0) {
      result[thread.id] = count
    }
  }

  return result
}

// Helper: Map database thread to ChatThreadInfo
function mapThreadToInfo(thread: {
  id: string
  certificateId: string
  threadType: string
  createdAt: Date
  messages: { createdAt: Date }[]
  certificate: {
    createdBy: { id: string; name: string | null; role: string }
    reviewer: { id: string; name: string | null; role: string } | null
  }
}): ChatThreadInfo {
  const participants: ChatThreadInfo['participants'] = []

  participants.push({
    id: thread.certificate.createdBy.id,
    name: thread.certificate.createdBy.name,
    role: thread.certificate.createdBy.role,
  })

  if (thread.certificate.reviewer) {
    participants.push({
      id: thread.certificate.reviewer.id,
      name: thread.certificate.reviewer.name,
      role: thread.certificate.reviewer.role,
    })
  }

  return {
    id: thread.id,
    certificateId: thread.certificateId,
    threadType: thread.threadType as ThreadType,
    createdAt: thread.createdAt,
    lastMessageAt: thread.messages[0]?.createdAt || null,
    unreadCount: 0,
    participants,
  }
}

// Check if user can access a chat thread
export function canAccessChatThread(
  user: { id: string; role: string },
  certificate: { createdById: string; reviewerId: string | null },
  threadType: ThreadType
): boolean {
  // Admins can access any thread
  if (user.role === 'ADMIN') return true

  if (threadType === 'ASSIGNEE_REVIEWER') {
    // Only assignee and reviewer can access
    return user.id === certificate.createdById || user.id === certificate.reviewerId
  }

  if (threadType === 'REVIEWER_CUSTOMER') {
    // Reviewer, customer, or admin can access
    return user.id === certificate.reviewerId || user.role === 'CUSTOMER'
  }

  return false
}
