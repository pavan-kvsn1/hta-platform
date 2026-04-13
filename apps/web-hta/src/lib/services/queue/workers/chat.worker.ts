/**
 * Chat Message Worker
 *
 * Handles background processing of chat-related jobs:
 * - chat:message:deliver - Mark messages as delivered, update read status
 * - chat:message:notify - Send notifications to chat participants
 */

import { prisma } from '@/lib/prisma'
import { Job, JobWorker, JobPayloads } from '../types'
import { createNotification } from '../../notifications'

/**
 * Process chat message delivery
 * Updates delivery status and creates realtime events for recipients
 */
export const chatMessageDeliverWorker: JobWorker<'chat:message:deliver'> = async (job) => {
  const { threadId, messageId, recipientIds, recipientType } = job.payload

  // Verify the message exists
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: {
      thread: {
        include: {
          certificate: {
            select: { id: true, certificateNumber: true },
          },
        },
      },
    },
  })

  if (!message) {
    throw new Error(`Message ${messageId} not found`)
  }

  // Create realtime events for each recipient
  const realtimeEvents = recipientIds.map((recipientId) => ({
    userId: recipientType === 'USER' ? recipientId : null,
    customerId: recipientType === 'CUSTOMER' ? recipientId : null,
    channel: `thread:${threadId}`,
    type: 'chat:message',
    data: JSON.stringify({
      messageId,
      threadId,
      content: message.content,
      senderType: message.senderType,
      createdAt: message.createdAt.toISOString(),
    }),
    delivered: false,
  }))

  // Batch insert realtime events
  if (realtimeEvents.length > 0) {
    await prisma.realtimeEvent.createMany({
      data: realtimeEvents.filter(e => e.userId || e.customerId),
    })
  }

  console.log(`[ChatWorker] Delivered message ${messageId} to ${recipientIds.length} recipients`)
}

/**
 * Process chat message notification
 * Creates notification records for chat participants
 */
export const chatMessageNotifyWorker: JobWorker<'chat:message:notify'> = async (job) => {
  const {
    threadId,
    messageId,
    senderId,
    senderName,
    senderType,
    certificateId,
    certificateNumber,
  } = job.payload

  // Get thread to determine participants
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    include: {
      certificate: {
        select: {
          createdById: true,
          reviewerId: true,
        },
      },
    },
  })

  if (!thread) {
    throw new Error(`Thread ${threadId} not found`)
  }

  const cert = thread.certificate
  const recipientsToNotify: Array<{ userId?: string; customerId?: string }> = []

  // Determine who to notify based on thread type and sender
  if (thread.threadType === 'ASSIGNEE_REVIEWER') {
    // Assignee <-> Reviewer thread
    if (senderType === 'ASSIGNEE' && cert.reviewerId) {
      // Notify reviewer
      recipientsToNotify.push({ userId: cert.reviewerId })
    } else if (senderType === 'REVIEWER') {
      // Notify assignee
      recipientsToNotify.push({ userId: cert.createdById })
    } else if (senderType === 'ADMIN') {
      // Notify both
      recipientsToNotify.push({ userId: cert.createdById })
      if (cert.reviewerId) {
        recipientsToNotify.push({ userId: cert.reviewerId })
      }
    }
  } else if (thread.threadType === 'REVIEWER_CUSTOMER') {
    // Reviewer <-> Customer thread
    // For customer notifications, we need to find the customer
    // This would typically come from the approval token or certificate context
    if (senderType === 'CUSTOMER' && cert.reviewerId) {
      // Notify reviewer
      recipientsToNotify.push({ userId: cert.reviewerId })
    }
    // Customer notifications handled separately (they access via token)
  }

  // Filter out the sender from recipients
  const filteredRecipients = recipientsToNotify.filter(
    (r) => r.userId !== senderId
  )

  // Create notifications
  await Promise.all(
    filteredRecipients.map((recipient) =>
      createNotification({
        userId: recipient.userId,
        customerId: recipient.customerId,
        type: 'NEW_CHAT_MESSAGE',
        certificateId,
        data: {
          certificateNumber,
          senderName,
          threadType: thread.threadType,
        },
      })
    )
  )

  console.log(
    `[ChatWorker] Created ${filteredRecipients.length} notifications for message ${messageId}`
  )
}

// Export workers map
export const chatWorkers = {
  'chat:message:deliver': chatMessageDeliverWorker,
  'chat:message:notify': chatMessageNotifyWorker,
}
