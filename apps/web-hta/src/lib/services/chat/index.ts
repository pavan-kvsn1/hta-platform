/**
 * Chat Service
 *
 * Business logic for the chat system.
 * Handles thread creation, message sending, and real-time updates.
 */

import { prisma } from '@/lib/prisma'
import { enqueue } from '@/lib/services/queue'
import {
  ThreadType,
  ChatThreadInfo,
  ChatMessageInfo,
  SendMessageInput,
  CreateThreadInput,
  GetMessagesOptions,
} from './types'

/**
 * Get or create a chat thread for a certificate
 */
export async function getOrCreateThread(
  input: CreateThreadInput
): Promise<ChatThreadInfo> {
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

/**
 * Get a thread by ID
 */
export async function getThread(threadId: string): Promise<ChatThreadInfo | null> {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
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

  if (!thread) return null

  return mapThreadToInfo(thread)
}

/**
 * Get thread with certificate data for access check
 */
export async function getThreadWithCertificate(threadId: string) {
  return prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      certificate: {
        select: {
          id: true,
          createdById: true,
          reviewerId: true,
          certificateNumber: true,
          customerName: true,
        },
      },
    },
  })
}

/**
 * Get threads for a certificate
 */
export async function getThreadsForCertificate(
  certificateId: string
): Promise<ChatThreadInfo[]> {
  const threads = await prisma.chatThread.findMany({
    where: { certificateId },
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

  return threads.map(mapThreadToInfo)
}

/**
 * Get threads for a user (where they are a participant)
 */
export async function getThreadsForUser(userId: string): Promise<ChatThreadInfo[]> {
  const threads = await prisma.chatThread.findMany({
    where: {
      OR: [
        { certificate: { createdById: userId } },
        { certificate: { reviewerId: userId } },
      ],
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

/**
 * Send a message to a thread
 */
export async function sendMessage(input: SendMessageInput): Promise<ChatMessageInfo> {
  const { threadId, senderId, content, attachments } = input

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

  // Get sender info
  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { id: true, name: true, role: true },
  })

  if (!sender) {
    throw new Error('Sender not found')
  }

  // Determine sender type based on certificate role
  let senderType: string = 'ADMIN'
  if (senderId === thread.certificate.createdById) {
    senderType = 'ASSIGNEE'
  } else if (senderId === thread.certificate.reviewerId) {
    senderType = 'REVIEWER'
  }

  // Create message with attachments
  const message = await prisma.chatMessage.create({
    data: {
      threadId,
      senderId,
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
      attachments: true,
    },
  })

  // Determine recipient(s) for notification
  const recipients = getRecipients(thread, senderId)

  // Enqueue notification job for each recipient
  for (const recipientId of recipients) {
    await enqueue('chat:message:notify', {
      messageId: message.id,
      threadId,
      senderId,
      senderName: sender.name || 'Unknown',
      senderType: senderType as 'ASSIGNEE' | 'REVIEWER' | 'CUSTOMER' | 'ADMIN',
      recipientId,
      certificateId: thread.certificate.id,
      certificateNumber: thread.certificate.certificateNumber,
    })
  }

  // Enqueue realtime event
  await enqueue('realtime:publish', {
    channel: `thread:${threadId}`,
    event: {
      type: 'message:new',
      data: {
        messageId: message.id,
        threadId,
        senderId,
        senderName: sender.name,
        content,
        createdAt: message.createdAt.toISOString(),
      },
    },
  })

  return {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId || '',
    senderName: message.sender?.name || null,
    senderRole: message.sender?.role || 'ENGINEER',
    content: message.content,
    createdAt: message.createdAt,
    readAt: message.readAt,
    attachments: message.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileType: a.mimeType,
      fileSize: a.fileSize,
      url: `/api/chat/attachments/${a.id}`,
    })),
  }
}

/**
 * Get messages for a thread
 */
export async function getMessages(
  threadId: string,
  options: GetMessagesOptions = {}
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
      attachments: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // Fetch one extra to check if there's more
  })

  const hasMore = messages.length > limit
  const resultMessages = hasMore ? messages.slice(0, -1) : messages

  return {
    messages: resultMessages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      senderId: m.senderId || '',
      senderName: m.sender?.name || null,
      senderRole: m.sender?.role || 'ENGINEER',
      content: m.content,
      createdAt: m.createdAt,
      readAt: m.readAt,
      attachments: m.attachments.map((a) => ({
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

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  threadId: string,
  userId: string
): Promise<number> {
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

/**
 * Get unread message count for a user
 */
export async function getUnreadMessageCount(userId: string): Promise<number> {
  const count = await prisma.chatMessage.count({
    where: {
      thread: {
        OR: [
          { certificate: { createdById: userId } },
          { certificate: { reviewerId: userId } },
        ],
      },
      senderId: { not: userId },
      readAt: null,
    },
  })

  return count
}

/**
 * Get unread count per thread for a user
 */
export async function getUnreadCountsByThread(
  userId: string
): Promise<Record<string, number>> {
  // First get all threads the user is part of
  const threads = await prisma.chatThread.findMany({
    where: {
      OR: [
        { certificate: { createdById: userId } },
        { certificate: { reviewerId: userId } },
      ],
    },
    select: { id: true },
  })

  const result: Record<string, number> = {}

  // Count unread messages for each thread
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

  // Add assignee (certificate creator)
  participants.push({
    id: thread.certificate.createdBy.id,
    name: thread.certificate.createdBy.name,
    role: thread.certificate.createdBy.role,
  })

  // Add reviewer if exists
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
    unreadCount: 0, // Calculated separately per user
    participants,
  }
}

// Helper: Get recipients for a message notification
function getRecipients(
  thread: {
    threadType: string
    certificate: {
      createdById: string
      reviewerId: string | null
    }
  },
  senderId: string
): string[] {
  const recipients: string[] = []

  if (thread.threadType === 'ASSIGNEE_REVIEWER') {
    // Between assignee and reviewer
    if (thread.certificate.createdById !== senderId) {
      recipients.push(thread.certificate.createdById)
    }
    if (thread.certificate.reviewerId && thread.certificate.reviewerId !== senderId) {
      recipients.push(thread.certificate.reviewerId)
    }
  } else if (thread.threadType === 'REVIEWER_CUSTOMER') {
    // Between reviewer and customer - for now just notify reviewer
    if (thread.certificate.reviewerId && thread.certificate.reviewerId !== senderId) {
      recipients.push(thread.certificate.reviewerId)
    }
  }

  return recipients
}

// Re-export types
export type {
  ThreadType,
  ChatThreadInfo,
  ChatMessageInfo,
  SendMessageInput,
  CreateThreadInput,
  GetMessagesOptions,
} from './types'
