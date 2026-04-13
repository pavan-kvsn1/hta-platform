/**
 * Notification Worker
 *
 * Handles background processing of notification jobs:
 * - notification:send - Create a single notification
 * - notification:batch - Create multiple notifications
 */

// Prisma types imported for type definitions only
import { prisma } from '@/lib/prisma'
import { Job, JobWorker } from '../types'

/**
 * Process single notification
 */
export const notificationSendWorker: JobWorker<'notification:send'> = async (job) => {
  const { userId, customerId, type, title, message, certificateId, data } = job.payload

  if (!userId && !customerId) {
    throw new Error('Either userId or customerId must be provided')
  }

  await prisma.notification.create({
    data: {
      userId,
      customerId,
      type,
      title,
      message,
      certificateId,
      data: data || undefined,
    },
  })

  console.log(`[NotificationWorker] Created notification: ${type} for ${userId || customerId}`)
}

/**
 * Process batch notifications
 */
export const notificationBatchWorker: JobWorker<'notification:batch'> = async (job) => {
  const { notifications } = job.payload

  if (notifications.length === 0) {
    return
  }

  // Create all notifications in a transaction
  await prisma.$transaction(
    notifications.map((n) =>
      prisma.notification.create({
        data: {
          userId: n.userId,
          customerId: n.customerId,
          type: n.type,
          title: n.title,
          message: n.message,
          certificateId: n.certificateId,
          data: n.data || undefined,
        },
      })
    )
  )

  console.log(`[NotificationWorker] Created ${notifications.length} notifications in batch`)
}

// Export workers map
export const notificationWorkers = {
  'notification:send': notificationSendWorker,
  'notification:batch': notificationBatchWorker,
}
