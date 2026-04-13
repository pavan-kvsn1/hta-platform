import type { Prisma } from '@hta/database'
import { prisma } from '@/lib/prisma'
import { enqueue } from '@/lib/services/queue'

// Notification types
export type NotificationType =
  // Engineer (Assignee) notifications
  | 'REVISION_REQUESTED'        // Reviewer requested revision
  | 'CERTIFICATE_APPROVED'      // Reviewer approved certificate
  | 'SENT_TO_CUSTOMER'          // Certificate sent to customer
  | 'CERTIFICATE_FINALIZED'     // Customer approved certificate
  // Reviewer notifications
  | 'SUBMITTED_FOR_REVIEW'      // Assignee submitted for review
  | 'ENGINEER_RESPONDED'        // Assignee responded to revision
  | 'CUSTOMER_REVISION_REQUEST' // Customer requested revision
  | 'CUSTOMER_APPROVED'         // Customer approved certificate
  // Customer notifications
  | 'CERTIFICATE_READY'         // Certificate sent for approval
  | 'REVIEWER_REPLIED'          // Reviewer replied to feedback
  // Chat notifications
  | 'NEW_CHAT_MESSAGE'          // New chat message received
  // Registration notifications
  | 'REGISTRATION_SUBMITTED'    // Customer submitted registration (to Admin)
  | 'REGISTRATION_APPROVED'     // Admin approved registration (to Customer)
  | 'REGISTRATION_REJECTED'     // Admin rejected registration (to Customer)

// Notification templates for generating title and message
const notificationTemplates: Record<NotificationType, { title: string; message: (data: Record<string, string>) => string }> = {
  REVISION_REQUESTED: {
    title: 'Revision Requested',
    message: (data) => `${data.reviewerName || 'Reviewer'} requested revision on ${data.certificateNumber}`,
  },
  CERTIFICATE_APPROVED: {
    title: 'Certificate Approved',
    message: (data) => `Your certificate ${data.certificateNumber} has been approved`,
  },
  SENT_TO_CUSTOMER: {
    title: 'Sent to Customer',
    message: (data) => `Certificate ${data.certificateNumber} has been sent to customer`,
  },
  CERTIFICATE_FINALIZED: {
    title: 'Certificate Finalized',
    message: (data) => `Customer approved certificate ${data.certificateNumber}`,
  },
  SUBMITTED_FOR_REVIEW: {
    title: 'Certificate Submitted',
    message: (data) => `${data.assigneeName || 'Engineer'} submitted ${data.certificateNumber} for review`,
  },
  ENGINEER_RESPONDED: {
    title: 'Assignee Responded',
    message: (data) => `${data.assigneeName || 'Engineer'} responded to revision request on ${data.certificateNumber}`,
  },
  CUSTOMER_REVISION_REQUEST: {
    title: 'Customer Revision Request',
    message: (data) => `Customer requested revision on ${data.certificateNumber}`,
  },
  CUSTOMER_APPROVED: {
    title: 'Customer Approved',
    message: (data) => `Customer approved certificate ${data.certificateNumber}`,
  },
  CERTIFICATE_READY: {
    title: 'Certificate Ready for Review',
    message: (data) => `Certificate ${data.certificateNumber} is ready for your review`,
  },
  REVIEWER_REPLIED: {
    title: 'Response to Your Feedback',
    message: (data) => `HTA has responded to your feedback on ${data.certificateNumber}`,
  },
  NEW_CHAT_MESSAGE: {
    title: 'New Message',
    message: (data) => `${data.senderName || 'Someone'} sent a message on ${data.certificateNumber}`,
  },
  REGISTRATION_SUBMITTED: {
    title: 'New Registration Request',
    message: (data) => `${data.name} (${data.email}) registered for ${data.companyName}`,
  },
  REGISTRATION_APPROVED: {
    title: 'Registration Approved',
    message: (data) => `Your account for ${data.companyName} has been approved. You can now login.`,
  },
  REGISTRATION_REJECTED: {
    title: 'Registration Update',
    message: (data) => `Your registration was not approved. Reason: ${data.reason || 'Not specified'}`,
  },
}

interface CreateNotificationParams {
  userId?: string
  customerId?: string
  type: NotificationType
  certificateId?: string
  data?: Record<string, string>
  // Optional custom title/message overrides
  title?: string
  message?: string
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
      data: Object.keys(data).length > 0 ? data : undefined,
    },
  })
}

/**
 * Get notifications for a user or customer
 * For engineers, can optionally filter to only show notifications for certificates they're involved with
 */
export async function getNotifications({
  userId,
  customerId,
  limit = 10,
  offset = 0,
  unreadOnly = false,
  filterByInvolvement = false,
}: {
  userId?: string
  customerId?: string
  limit?: number
  offset?: number
  unreadOnly?: boolean
  filterByInvolvement?: boolean // If true, only show notifications for certificates user created or is reviewer of
}) {
  if (!userId && !customerId) {
    throw new Error('Either userId or customerId must be provided')
  }

  // Base where clause
  const baseWhere = {
    ...(userId ? { userId } : { customerId }),
    ...(unreadOnly ? { read: false } : {}),
  }

  // For engineers with filterByInvolvement, add certificate relationship filter
  const where = filterByInvolvement && userId
    ? {
        ...baseWhere,
        OR: [
          // Notifications without a certificate (system notifications)
          { certificateId: null },
          // Notifications for certificates user created
          { certificate: { createdById: userId } },
          // Notifications for certificates user is reviewer of
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

  return {
    notifications,
    total,
    unreadCount,
  }
}

/**
 * Get unread notification count for a user or customer
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

/**
 * Create notification for reviewer when certificate is submitted for review
 */
export async function notifyReviewerOnSubmit({
  certificateId,
  certificateNumber,
  assigneeName,
  reviewerId,
  customerName,
}: {
  certificateId: string
  certificateNumber: string
  assigneeName: string
  reviewerId: string
  customerName?: string
}) {
  // In-app notification
  await createNotification({
    userId: reviewerId,
    type: 'SUBMITTED_FOR_REVIEW',
    certificateId,
    data: { certificateNumber, assigneeName },
  })

  // Send email to reviewer
  const reviewer = await prisma.user.findUnique({
    where: { id: reviewerId },
    select: { email: true, name: true },
  })

  if (reviewer?.email) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    await enqueue('email:send', {
      to: reviewer.email,
      template: 'certificate-submitted',
      templateData: {
        reviewerName: reviewer.name || 'Reviewer',
        certificateNumber,
        assigneeName,
        customerName: customerName || 'Unknown',
        dashboardUrl: `${baseUrl}/dashboard/certificates/${certificateId}`,
      },
    })
  }
}

/**
 * Create notification for assignee when reviewer approves/requests revision
 */
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
  // In-app notification
  await createNotification({
    userId: assigneeId,
    type: approved ? 'CERTIFICATE_APPROVED' : 'REVISION_REQUESTED',
    certificateId,
    data: { certificateNumber, reviewerName: reviewerName || 'Reviewer' },
  })

  // Send email to assignee
  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { email: true, name: true },
  })

  if (assignee?.email) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    await enqueue('email:send', {
      to: assignee.email,
      template: approved ? 'certificate-approved' : 'revision-requested',
      templateData: {
        assigneeName: assignee.name || 'Engineer',
        certificateNumber,
        reviewerName: reviewerName || 'Reviewer',
        certificateUrl: `${baseUrl}/dashboard/certificates/${certificateId}`,
      },
    })
  }
}

/**
 * Create notification for reviewer when assignee responds to revision request
 */
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

/**
 * Create notifications when certificate is sent to customer
 */
export async function notifyOnSentToCustomer({
  certificateId,
  certificateNumber,
  assigneeId,
  customerId,
  customerEmail,
  customerName,
  reviewToken,
  instrumentDescription,
}: {
  certificateId: string
  certificateNumber: string
  assigneeId: string
  customerId?: string
  customerEmail?: string
  customerName?: string
  reviewToken?: string
  instrumentDescription?: string
}) {
  // Notify assignee (in-app only)
  await createNotification({
    userId: assigneeId,
    type: 'SENT_TO_CUSTOMER',
    certificateId,
    data: { certificateNumber },
  })

  // Notify customer if we have their ID (in-app)
  if (customerId) {
    await createNotification({
      customerId,
      type: 'CERTIFICATE_READY',
      certificateId,
      data: { certificateNumber },
    })
  }

  // Send email to customer with review link
  if (customerEmail && reviewToken) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    await enqueue('email:send', {
      to: customerEmail,
      template: 'customer-review',
      templateData: {
        customerName: customerName || 'Customer',
        certificateNumber,
        instrumentDescription: instrumentDescription || 'Calibration Certificate',
        reviewUrl: `${baseUrl}/customer/review/${reviewToken}`,
      },
    })
  }
}

/**
 * Notify reviewer when customer requests revision
 */
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

/**
 * Create notification for customer when reviewer replies to feedback
 */
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

/**
 * Notify reviewer and assignee when customer approves certificate
 */
export async function notifyOnCustomerApproval({
  certificateId,
  certificateNumber,
  assigneeId,
  reviewerId,
  customerName,
  approverName,
}: {
  certificateId: string
  certificateNumber: string
  assigneeId: string
  reviewerId?: string | null
  customerName?: string
  approverName?: string
}) {
  const promises: Promise<unknown>[] = []

  // Notify reviewer (in-app)
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

  // Notify assignee (in-app)
  promises.push(
    createNotification({
      userId: assigneeId,
      type: 'CERTIFICATE_FINALIZED',
      certificateId,
      data: { certificateNumber },
    })
  )

  await Promise.all(promises)

  // Send emails to both reviewer and assignee
  const userIds = reviewerId ? [reviewerId, assigneeId] : [assigneeId]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  })

  const emailPromises = users.map((user) =>
    enqueue('email:send', {
      to: user.email,
      template: 'certificate-customer-approved',
      templateData: {
        certificateNumber,
        customerName: customerName || 'Customer',
        approverName: approverName || 'Customer',
        approvedAt: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      },
    })
  )

  await Promise.all(emailPromises)
}

/**
 * Create notification for admins when a new registration is submitted
 */
export async function notifyAdminsOnRegistration({
  registrationId,
  name,
  email,
  companyName,
}: {
  registrationId: string
  name: string
  email: string
  companyName: string
}) {
  // Notify all admins
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true },
  })

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        userId: admin.id,
        type: 'REGISTRATION_SUBMITTED',
        data: { name, email, companyName, registrationId },
      })
    )
  )
}

/**
 * Create notification for customer when registration is approved
 */
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

/**
 * Create notification for customer when registration is rejected
 * Note: This creates a notification but the customer can't log in to see it
 * In practice, this would be sent via email instead
 */
export async function notifyCustomerOnRegistrationRejected({
  email,
  companyName,
  reason,
}: {
  email: string
  companyName: string
  reason: string
}) {
  // Since rejected customers can't log in, we would typically send an email
  // For now, we'll log this for potential email integration
  console.log(`Registration rejected for ${email} at ${companyName}. Reason: ${reason}`)
}

/**
 * Create notification for new chat message
 */
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
