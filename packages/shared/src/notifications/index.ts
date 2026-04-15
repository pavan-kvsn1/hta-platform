/**
 * Notifications Service
 *
 * Handles in-app notifications for users and customers.
 */

import { Prisma } from '@hta/database'
import { prisma } from '@hta/database'
import type {
  NotificationType,
  NotificationTemplate,
  CreateNotificationParams,
  GetNotificationsParams,
} from './types.js'

export * from './types.js'

// Notification templates for generating title and message
const notificationTemplates: Record<NotificationType, NotificationTemplate> = {
  REVISION_REQUESTED: {
    title: 'Revision Requested',
    message: (data: Record<string, string>) => `${data.reviewerName || 'Reviewer'} requested revision on ${data.certificateNumber}`,
  },
  CERTIFICATE_APPROVED: {
    title: 'Certificate Approved',
    message: (data: Record<string, string>) => `Your certificate ${data.certificateNumber} has been approved`,
  },
  SENT_TO_CUSTOMER: {
    title: 'Sent to Customer',
    message: (data: Record<string, string>) => `Certificate ${data.certificateNumber} has been sent to customer`,
  },
  CERTIFICATE_FINALIZED: {
    title: 'Certificate Finalized',
    message: (data: Record<string, string>) => `Customer approved certificate ${data.certificateNumber}`,
  },
  SUBMITTED_FOR_REVIEW: {
    title: 'Certificate Submitted',
    message: (data: Record<string, string>) => `${data.assigneeName || 'Engineer'} submitted ${data.certificateNumber} for review`,
  },
  ENGINEER_RESPONDED: {
    title: 'Assignee Responded',
    message: (data: Record<string, string>) => `${data.assigneeName || 'Engineer'} responded to revision request on ${data.certificateNumber}`,
  },
  CUSTOMER_REVISION_REQUEST: {
    title: 'Customer Revision Request',
    message: (data: Record<string, string>) => `Customer requested revision on ${data.certificateNumber}`,
  },
  CUSTOMER_APPROVED: {
    title: 'Customer Approved',
    message: (data: Record<string, string>) => `Customer approved certificate ${data.certificateNumber}`,
  },
  CERTIFICATE_READY: {
    title: 'Certificate Ready for Review',
    message: (data: Record<string, string>) => `Certificate ${data.certificateNumber} is ready for your review`,
  },
  REVIEWER_REPLIED: {
    title: 'Response to Your Feedback',
    message: (data: Record<string, string>) => `HTA has responded to your feedback on ${data.certificateNumber}`,
  },
  NEW_CHAT_MESSAGE: {
    title: 'New Message',
    message: (data: Record<string, string>) => `${data.senderName || 'Someone'} sent a message on ${data.certificateNumber}`,
  },
  REGISTRATION_SUBMITTED: {
    title: 'New Registration Request',
    message: (data: Record<string, string>) => `${data.name} (${data.email}) registered for ${data.companyName}`,
  },
  REGISTRATION_APPROVED: {
    title: 'Registration Approved',
    message: (data: Record<string, string>) => `Your account for ${data.companyName} has been approved. You can now login.`,
  },
  REGISTRATION_REJECTED: {
    title: 'Registration Update',
    message: (data: Record<string, string>) => `Your registration was not approved. Reason: ${data.reason || 'Not specified'}`,
  },
}

/**
 * Create a notification for a user or customer
 */
export async function createNotification({
  userId,
  customerId,
  type,
  certificateId,
  data = {},
  title,
  message,
}: CreateNotificationParams) {
  if (!userId && !customerId) {
    throw new Error('Either userId or customerId must be provided')
  }

  const template = notificationTemplates[type]
  const finalTitle = title || template.title
  const finalMessage = message || template.message(data)

  return prisma.notification.create({
    data: {
      userId,
      customerId,
      type,
      title: finalTitle,
      message: finalMessage,
      certificateId,
      data: Object.keys(data).length > 0 ? data : Prisma.DbNull,
    },
  })
}

/**
 * Get notifications for a user or customer
 */
export async function getNotifications({
  userId,
  customerId,
  limit = 10,
  offset = 0,
  unreadOnly = false,
  filterByInvolvement = false,
}: GetNotificationsParams) {
  if (!userId && !customerId) {
    throw new Error('Either userId or customerId must be provided')
  }

  const baseWhere = {
    ...(userId ? { userId } : { customerId }),
    ...(unreadOnly ? { read: false } : {}),
  }

  const where = filterByInvolvement && userId
    ? {
        ...baseWhere,
        OR: [
          { certificateId: null },
          { certificate: { createdById: userId } },
          { certificate: { reviewerId: userId } },
        ],
      }
    : baseWhere

  const [notifications, total, unreadCount] = await Promise.all([
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
    prisma.notification.count({
      where: {
        ...baseWhere,
        ...(filterByInvolvement && userId
          ? {
              OR: [
                { certificateId: null },
                { certificate: { createdById: userId } },
                { certificate: { reviewerId: userId } },
              ],
            }
          : {}),
        read: false,
      },
    }),
  ])

  return { notifications, total, unreadCount }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount({
  userId,
  customerId,
  filterByInvolvement = false,
}: {
  userId?: string
  customerId?: string
  filterByInvolvement?: boolean
}) {
  if (!userId && !customerId) {
    throw new Error('Either userId or customerId must be provided')
  }

  const baseWhere = {
    ...(userId ? { userId } : { customerId }),
    read: false,
  }

  const where = filterByInvolvement && userId
    ? {
        ...baseWhere,
        OR: [
          { certificateId: null },
          { certificate: { createdById: userId } },
          { certificate: { reviewerId: userId } },
        ],
      }
    : baseWhere

  return prisma.notification.count({ where })
}

/**
 * Mark notifications as read
 */
export async function markNotificationsAsRead({
  notificationIds,
  userId,
  customerId,
  markAll = false,
}: {
  notificationIds?: string[]
  userId?: string
  customerId?: string
  markAll?: boolean
}) {
  if (!userId && !customerId) {
    throw new Error('Either userId or customerId must be provided')
  }

  const where = {
    ...(userId ? { userId } : { customerId }),
    read: false,
    ...(markAll ? {} : { id: { in: notificationIds || [] } }),
  }

  return prisma.notification.updateMany({
    where,
    data: {
      read: true,
      readAt: new Date(),
    },
  })
}

// =============================================================================
// Convenience notification creators
// =============================================================================

export async function notifyReviewerOnSubmit({
  certificateId,
  certificateNumber,
  assigneeName,
  reviewerId,
}: {
  certificateId: string
  certificateNumber: string
  assigneeName: string
  reviewerId: string
}) {
  await createNotification({
    userId: reviewerId,
    type: 'SUBMITTED_FOR_REVIEW',
    certificateId,
    data: { certificateNumber, assigneeName },
  })
}

export async function notifyAssigneeOnReview({
  certificateId,
  certificateNumber,
  assigneeId,
  approved,
  reviewerName,
}: {
  certificateId: string
  certificateNumber: string
  assigneeId: string
  approved: boolean
  reviewerName?: string
}) {
  await createNotification({
    userId: assigneeId,
    type: approved ? 'CERTIFICATE_APPROVED' : 'REVISION_REQUESTED',
    certificateId,
    data: { certificateNumber, reviewerName: reviewerName || 'Reviewer' },
  })
}

export async function notifyReviewerOnAssigneeResponse({
  certificateId,
  certificateNumber,
  assigneeName,
  reviewerId,
}: {
  certificateId: string
  certificateNumber: string
  assigneeName: string
  reviewerId: string
}) {
  await createNotification({
    userId: reviewerId,
    type: 'ENGINEER_RESPONDED',
    certificateId,
    data: { certificateNumber, assigneeName },
  })
}

export async function notifyOnSentToCustomer({
  certificateId,
  certificateNumber,
  assigneeId,
  customerId,
}: {
  certificateId: string
  certificateNumber: string
  assigneeId: string
  customerId?: string
}) {
  await createNotification({
    userId: assigneeId,
    type: 'SENT_TO_CUSTOMER',
    certificateId,
    data: { certificateNumber },
  })

  if (customerId) {
    await createNotification({
      customerId,
      type: 'CERTIFICATE_READY',
      certificateId,
      data: { certificateNumber },
    })
  }
}

export async function notifyReviewerOnCustomerRevision({
  certificateId,
  certificateNumber,
  reviewerId,
}: {
  certificateId: string
  certificateNumber: string
  reviewerId: string
}) {
  await createNotification({
    userId: reviewerId,
    type: 'CUSTOMER_REVISION_REQUEST',
    certificateId,
    data: { certificateNumber },
  })
}

export async function notifyCustomerOnReviewerReply({
  certificateId,
  certificateNumber,
  customerId,
}: {
  certificateId: string
  certificateNumber: string
  customerId: string
}) {
  await createNotification({
    customerId,
    type: 'REVIEWER_REPLIED',
    certificateId,
    data: { certificateNumber },
  })
}

export async function notifyOnCustomerApproval({
  certificateId,
  certificateNumber,
  assigneeId,
  reviewerId,
}: {
  certificateId: string
  certificateNumber: string
  assigneeId: string
  reviewerId?: string | null
}) {
  const promises: Promise<unknown>[] = []

  if (reviewerId) {
    promises.push(
      createNotification({
        userId: reviewerId,
        type: 'CUSTOMER_APPROVED',
        certificateId,
        data: { certificateNumber },
      })
    )
  }

  promises.push(
    createNotification({
      userId: assigneeId,
      type: 'CERTIFICATE_FINALIZED',
      certificateId,
      data: { certificateNumber },
    })
  )

  await Promise.all(promises)
}

export async function notifyAdminsOnRegistration({
  name,
  email,
  companyName,
}: {
  name: string
  email: string
  companyName: string
}) {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  })

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: 'REGISTRATION_SUBMITTED',
        data: { name, email, companyName },
      })
    )
  )
}

export async function notifyCustomerOnRegistrationApproved({
  customerId,
  companyName,
}: {
  customerId: string
  companyName: string
}) {
  await createNotification({
    customerId,
    type: 'REGISTRATION_APPROVED',
    data: { companyName },
  })
}

export async function notifyOnChatMessage({
  recipientId,
  recipientType,
  certificateId,
  certificateNumber,
  senderName,
  threadType,
}: {
  recipientId: string
  recipientType: 'USER' | 'CUSTOMER'
  certificateId: string
  certificateNumber: string
  senderName: string
  threadType: string
}) {
  if (recipientType === 'USER') {
    await createNotification({
      userId: recipientId,
      type: 'NEW_CHAT_MESSAGE',
      certificateId,
      data: { certificateNumber, senderName, threadType },
    })
  } else {
    await createNotification({
      customerId: recipientId,
      type: 'NEW_CHAT_MESSAGE',
      certificateId,
      data: { certificateNumber, senderName, threadType },
    })
  }
}
