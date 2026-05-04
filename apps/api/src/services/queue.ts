/**
 * Queue Client Service
 *
 * Connects the API to the worker's BullMQ queues via Redis.
 * Matches the worker's Redis/TLS connection pattern for Google Cloud Memorystore.
 */

import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

// =============================================================================
// TYPES (mirror worker/src/types.ts — keep in sync)
// =============================================================================

export type EmailJobData =
  | {
      type: 'password-reset'
      to: string
      tenantName?: string
      userName: string
      resetUrl: string
      expiryMinutes?: number
    }
  | {
      type: 'staff-activation'
      to: string
      tenantName?: string
      userName: string
      activationUrl: string
    }
  | {
      type: 'certificate-submitted'
      to: string
      tenantName?: string
      reviewerName: string
      certificateNumber: string
      assigneeName: string
      customerName?: string
      dashboardUrl: string
    }
  | {
      type: 'certificate-reviewed'
      to: string
      tenantName?: string
      assigneeName: string
      certificateNumber: string
      reviewerName: string
      approved: boolean
      revisionNote?: string
      dashboardUrl: string
    }
  | {
      type: 'customer-approval'
      to: string
      tenantName?: string
      recipientName: string
      certificateNumber: string
      customerName: string
      approverName: string
      status: 'approved' | 'rejected'
      rejectionNote?: string
      dashboardUrl: string
    }
  | {
      type: 'customer-review'
      to: string
      tenantName?: string
      customerName: string
      certificateNumber: string
      instrumentDescription: string
      reviewUrl: string
    }
  | {
      type: 'customer-review-registered'
      to: string
      tenantName?: string
      customerName: string
      certificateNumber: string
      instrumentDescription: string
      loginUrl: string
    }
  | {
      type: 'customer-authorized-registered'
      to: string
      tenantName?: string
      customerName: string
      certificateNumber: string
      instrumentDescription: string
      loginUrl: string
    }
  | {
      type: 'customer-authorized-token'
      to: string
      tenantName?: string
      customerName: string
      certificateNumber: string
      instrumentDescription: string
      downloadUrl: string
    }
  | {
      type: 'reviewer-customer-expired'
      to: string
      tenantName?: string
      reviewerName: string
      certificateNumber: string
      customerName: string
      instrumentDescription: string
      dashboardUrl: string
    }
  | {
      type: 'offline-codes-expiry'
      to: string
      tenantName?: string
      engineerName: string
      loginUrl: string
    }

export interface NotificationJobData {
  type: 'create-notification'
  userId?: string
  customerId?: string
  notificationType: string
  certificateId?: string
  data: Record<string, string>
}

// =============================================================================
// CONNECTION
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || ''

let connection: Redis | null = null
let emailQueue: Queue<EmailJobData> | null = null
let notificationQueue: Queue<NotificationJobData> | null = null

function getConnection(): Redis | null {
  if (!REDIS_URL) return null
  if (connection) return connection

  const isTls = REDIS_URL.startsWith('rediss://')
  connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    ...(isTls && {
      tls: {
        rejectUnauthorized: false, // Memorystore uses Google-managed certs
      },
    }),
  })

  connection.on('error', (err) => {
    console.error('[Queue] Redis connection error:', err.message)
  })

  return connection
}

function getEmailQueue(): Queue<EmailJobData> | null {
  if (emailQueue) return emailQueue
  const conn = getConnection()
  if (!conn) return null
  emailQueue = new Queue<EmailJobData>('email', { connection: conn })
  return emailQueue
}

function getNotificationQueue(): Queue<NotificationJobData> | null {
  if (notificationQueue) return notificationQueue
  const conn = getConnection()
  if (!conn) return null
  notificationQueue = new Queue<NotificationJobData>('notifications', { connection: conn })
  return notificationQueue
}

// =============================================================================
// PUBLIC API
// =============================================================================

const APP_URL = () => process.env.APP_URL || 'https://app.hta-calibration.com'
const TENANT_NAME = () => process.env.TENANT_NAME || 'HTA Calibration'

/**
 * Enqueue an email job. No-op if REDIS_URL is not configured.
 */
export async function enqueueEmail(data: EmailJobData): Promise<void> {
  const queue = getEmailQueue()
  if (!queue) {
    console.warn(`[Queue] Email not queued (no REDIS_URL): ${data.type} -> ${data.to}`)
    return
  }
  await queue.add(data.type, data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  })
  console.log(`[Queue] Email queued: ${data.type} -> ${data.to}`)
}

/**
 * Enqueue a notification job. No-op if REDIS_URL is not configured.
 */
export async function enqueueNotification(data: NotificationJobData): Promise<void> {
  const queue = getNotificationQueue()
  if (!queue) {
    console.warn(`[Queue] Notification not queued (no REDIS_URL): ${data.notificationType}`)
    return
  }
  await queue.add(data.type, data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  })
}

// =============================================================================
// CONVENIENCE HELPERS
// =============================================================================

export async function queuePasswordResetEmail(opts: {
  to: string
  userName: string
  token: string
  isCustomer?: boolean
}): Promise<void> {
  const resetPath = opts.isCustomer ? '/customer/reset-password' : '/reset-password'
  await enqueueEmail({
    type: 'password-reset',
    to: opts.to,
    tenantName: TENANT_NAME(),
    userName: opts.userName,
    resetUrl: `${APP_URL()}${resetPath}?token=${opts.token}`,
    expiryMinutes: 60,
  })
}

export async function queueStaffActivationEmail(opts: {
  to: string
  userName: string
  token: string
}): Promise<void> {
  await enqueueEmail({
    type: 'staff-activation',
    to: opts.to,
    tenantName: TENANT_NAME(),
    userName: opts.userName,
    activationUrl: `${APP_URL()}/activate?token=${opts.token}`,
  })
}

export async function queueCertificateSubmittedEmail(opts: {
  reviewerEmail: string
  reviewerName: string
  certificateNumber: string
  assigneeName: string
  customerName?: string
}): Promise<void> {
  await enqueueEmail({
    type: 'certificate-submitted',
    to: opts.reviewerEmail,
    tenantName: TENANT_NAME(),
    reviewerName: opts.reviewerName,
    certificateNumber: opts.certificateNumber,
    assigneeName: opts.assigneeName,
    customerName: opts.customerName,
    dashboardUrl: `${APP_URL()}/dashboard/certificates`,
  })
}

export async function queueCertificateReviewedEmail(opts: {
  assigneeEmail: string
  assigneeName: string
  certificateNumber: string
  reviewerName: string
  approved: boolean
  revisionNote?: string
}): Promise<void> {
  await enqueueEmail({
    type: 'certificate-reviewed',
    to: opts.assigneeEmail,
    tenantName: TENANT_NAME(),
    assigneeName: opts.assigneeName,
    certificateNumber: opts.certificateNumber,
    reviewerName: opts.reviewerName,
    approved: opts.approved,
    revisionNote: opts.revisionNote,
    dashboardUrl: `${APP_URL()}/dashboard/certificates`,
  })
}

export async function queueCustomerReviewEmail(opts: {
  customerEmail: string
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  token: string
}): Promise<void> {
  await enqueueEmail({
    type: 'customer-review',
    to: opts.customerEmail,
    tenantName: TENANT_NAME(),
    customerName: opts.customerName,
    certificateNumber: opts.certificateNumber,
    instrumentDescription: opts.instrumentDescription,
    reviewUrl: `${APP_URL()}/review/${opts.token}`,
  })
}

export async function queueCustomerReviewRegisteredEmail(opts: {
  customerEmail: string
  customerName: string
  certificateNumber: string
  instrumentDescription: string
}): Promise<void> {
  await enqueueEmail({
    type: 'customer-review-registered',
    to: opts.customerEmail,
    tenantName: TENANT_NAME(),
    customerName: opts.customerName,
    certificateNumber: opts.certificateNumber,
    instrumentDescription: opts.instrumentDescription,
    loginUrl: `${APP_URL()}/customer/login`,
  })
}

export async function queueCustomerAuthorizedRegisteredEmail(opts: {
  customerEmail: string
  customerName: string
  certificateNumber: string
  instrumentDescription: string
}): Promise<void> {
  await enqueueEmail({
    type: 'customer-authorized-registered',
    to: opts.customerEmail,
    tenantName: TENANT_NAME(),
    customerName: opts.customerName,
    certificateNumber: opts.certificateNumber,
    instrumentDescription: opts.instrumentDescription,
    loginUrl: `${APP_URL()}/customer/login`,
  })
}

export async function queueCustomerAuthorizedTokenEmail(opts: {
  customerEmail: string
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  token: string
}): Promise<void> {
  await enqueueEmail({
    type: 'customer-authorized-token',
    to: opts.customerEmail,
    tenantName: TENANT_NAME(),
    customerName: opts.customerName,
    certificateNumber: opts.certificateNumber,
    instrumentDescription: opts.instrumentDescription,
    downloadUrl: `${APP_URL()}/download/${opts.token}`,
  })
}

export async function queueCustomerApprovalNotificationEmail(opts: {
  staffEmail: string
  staffName: string
  certificateNumber: string
  customerName: string
  approved: boolean
  rejectionNote?: string
}): Promise<void> {
  await enqueueEmail({
    type: 'customer-approval',
    to: opts.staffEmail,
    tenantName: TENANT_NAME(),
    recipientName: opts.staffName,
    certificateNumber: opts.certificateNumber,
    customerName: opts.customerName,
    approverName: opts.customerName,
    status: opts.approved ? 'approved' : 'rejected',
    rejectionNote: opts.rejectionNote,
    dashboardUrl: `${APP_URL()}/dashboard/certificates`,
  })
}

export async function queueReviewerCustomerExpiredEmail(opts: {
  reviewerEmail: string
  reviewerName: string
  certificateNumber: string
  customerName: string
  instrumentDescription: string
}): Promise<void> {
  await enqueueEmail({
    type: 'reviewer-customer-expired',
    to: opts.reviewerEmail,
    tenantName: TENANT_NAME(),
    reviewerName: opts.reviewerName,
    certificateNumber: opts.certificateNumber,
    customerName: opts.customerName,
    instrumentDescription: opts.instrumentDescription,
    dashboardUrl: `${APP_URL()}/dashboard/certificates`,
  })
}

export async function queueOfflineCodesExpiryEmail(opts: {
  to: string
  engineerName: string
}): Promise<void> {
  await enqueueEmail({
    type: 'offline-codes-expiry',
    to: opts.to,
    tenantName: TENANT_NAME(),
    engineerName: opts.engineerName,
    loginUrl: `${APP_URL()}/dashboard/offline-codes`,
  })
}

/**
 * Graceful shutdown — close queues and connection
 */
export async function closeQueues(): Promise<void> {
  await emailQueue?.close()
  await notificationQueue?.close()
  connection?.disconnect()
  emailQueue = null
  notificationQueue = null
  connection = null
}
