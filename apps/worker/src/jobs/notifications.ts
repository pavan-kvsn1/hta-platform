/**
 * Notification Job Processor
 *
 * Processes notification jobs - creates in-app notifications
 * and can trigger push notifications if configured.
 */

import { Job } from 'bullmq'
import { createNotification } from '@hta/shared/notifications'
import type { NotificationType } from '@hta/shared/notifications'
import type { NotificationJobData } from '../types.js'

/**
 * Process a notification job
 */
export async function processNotificationJob(job: Job<NotificationJobData>): Promise<void> {
  const { data } = job

  console.log(`[Notification] Processing job ${job.id}: ${data.type}`)

  try {
    switch (data.type) {
      case 'create-notification':
        await handleCreateNotification(data)
        break

      case 'send-push':
        await handlePushNotification(data)
        break

      case 'batch-notifications':
        await handleBatchNotifications(data)
        break

      default:
        throw new Error(`Unknown notification type: ${(data as { type: string }).type}`)
    }

    console.log(`[Notification] Completed job ${job.id}`)
  } catch (error) {
    console.error(`[Notification] Failed to process job ${job.id}:`, error)
    throw error
  }
}

/**
 * Create a single in-app notification
 */
async function handleCreateNotification(data: {
  userId?: string
  customerId?: string
  notificationType: string
  certificateId?: string
  data: Record<string, string>
}): Promise<void> {
  await createNotification({
    userId: data.userId,
    customerId: data.customerId,
    type: data.notificationType as NotificationType,
    certificateId: data.certificateId,
    data: data.data,
  })
}

/**
 * Send a push notification (placeholder for future implementation)
 */
async function handlePushNotification(data: {
  userId?: string
  customerId?: string
  title: string
  body: string
  data?: Record<string, string>
}): Promise<void> {
  // Push notifications can be implemented later with:
  // - Firebase Cloud Messaging (FCM)
  // - Web Push API
  // - Apple Push Notification Service (APNS)

  console.log(`[Notification] Push notification (not implemented):`, {
    recipient: data.userId || data.customerId,
    title: data.title,
    body: data.body,
  })

  // For now, just log - actual push implementation would go here
  // Example with FCM:
  // await admin.messaging().send({
  //   token: userPushToken,
  //   notification: { title: data.title, body: data.body },
  //   data: data.data,
  // })
}

/**
 * Create multiple notifications in batch
 */
async function handleBatchNotifications(data: {
  notifications: Array<{
    userId?: string
    customerId?: string
    notificationType: string
    certificateId?: string
    data: Record<string, string>
  }>
}): Promise<void> {
  const results = await Promise.allSettled(
    data.notifications.map((notification) =>
      createNotification({
        userId: notification.userId,
        customerId: notification.customerId,
        type: notification.notificationType as NotificationType,
        certificateId: notification.certificateId,
        data: notification.data,
      })
    )
  )

  const failed = results.filter((r) => r.status === 'rejected')
  if (failed.length > 0) {
    console.warn(`[Notification] ${failed.length}/${data.notifications.length} notifications failed`)
  }
}
