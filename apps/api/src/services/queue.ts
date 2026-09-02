/**
 * Queue Client Service
 *
 * Connects the API to the worker's BullMQ queues via Redis.
 * Matches the worker's Redis/TLS connection pattern for Google Cloud Memorystore.
 */

import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import type {
  CustomerRequestDecisionProps,
  InternalRequestDecisionProps,
  UucDetails,
} from '@hta/emails'
import type { TrackedEmailJobFields } from '@hta/shared'
import { enqueueTrackedCertificateEmail } from './tracked-email.js'

// =============================================================================
// TYPES (mirror worker/src/types.ts — keep in sync)
// =============================================================================

export type InternalRequestDecisionEmailJob = InternalRequestDecisionProps & {
  type: 'internal-request-decision'
  to: string
  tenantName?: string
}

export type CustomerRequestDecisionEmailJob = CustomerRequestDecisionProps & {
  type: 'customer-request-decision'
  to: string
  tenantName?: string
}

export type EmailJobData = (
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
      uucDetails?: UucDetails
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
      uucDetails?: UucDetails
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
      uucDetails?: UucDetails
      dashboardUrl: string
    }
  | {
      type: 'customer-review'
      to: string
      tenantName?: string
      customerName: string
      certificateNumber: string
      instrumentDescription: string
      uucDetails?: UucDetails
      reviewUrl: string
    }
  | {
      type: 'customer-review-registered'
      to: string
      tenantName?: string
      customerName: string
      certificateNumber: string
      instrumentDescription: string
      uucDetails?: UucDetails
      loginUrl: string
    }
  | {
      type: 'customer-authorized-registered'
      to: string
      tenantName?: string
      customerName: string
      certificateNumber: string
      instrumentDescription: string
      uucDetails?: UucDetails
      loginUrl: string
    }
  | {
      type: 'customer-authorized-token'
      to: string
      tenantName?: string
      customerName: string
      certificateNumber: string
      instrumentDescription: string
      uucDetails?: UucDetails
      downloadUrl: string
      maxDownloads?: number
      expiresInDays?: number
    }
  | {
      type: 'reviewer-customer-expired'
      to: string
      tenantName?: string
      reviewerName: string
      certificateNumber: string
      customerName: string
      instrumentDescription: string
      uucDetails?: UucDetails
      dashboardUrl: string
    }
  | {
      type: 'offline-codes-expiry'
      to: string
      tenantName?: string
      engineerName: string
      loginUrl: string
    }
  | InternalRequestDecisionEmailJob
  | CustomerRequestDecisionEmailJob
) & Partial<TrackedEmailJobFields>

export interface NotificationJobData {
  type: 'create-notification'
  userId?: string
  customerId?: string
  notificationType: string
  certificateId?: string
  data: Record<string, string>
}

export interface ImageProcessingJobData {
  type: 'process-certificate-image'
  imageId: string
}

// =============================================================================
// CONNECTION
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || ''

let connection: Redis | null = null
let emailQueue: Queue<EmailJobData> | null = null
let notificationQueue: Queue<NotificationJobData> | null = null
let imageProcessingQueue: Queue<ImageProcessingJobData> | null = null

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

function getImageProcessingQueue(): Queue<ImageProcessingJobData> | null {
  if (imageProcessingQueue) return imageProcessingQueue
  const conn = getConnection()
  if (!conn) return null
  imageProcessingQueue = new Queue<ImageProcessingJobData>('image-processing', { connection: conn })
  return imageProcessingQueue
}

// =============================================================================
// PUBLIC API
// =============================================================================

const APP_URL = () => (process.env.APP_URL || 'https://hta-calibration.com').replace(/\/+$/, '')
const TENANT_NAME = () => process.env.TENANT_NAME || 'HTA Calibration'

/**
 * Enqueue an email job. Optional jobs remain a no-op without Redis; required jobs reject.
 */
export async function enqueueEmail(
  data: EmailJobData,
  options: { required?: boolean } = {},
): Promise<string | null> {
  const queue = getEmailQueue()
  if (!queue) {
    const message = `[Queue] Email not queued (no REDIS_URL): ${data.type} -> ${data.to}`
    if (options.required) throw new Error(message)
    console.warn(message)
    return null
  }
  const job = await queue.add(data.type, data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  })
  console.log(`[Queue] Email queued: ${data.type} -> ${data.to}`)
  return job.id ?? null
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

export async function enqueueImageProcessing(data: ImageProcessingJobData): Promise<void> {
  const queue = getImageProcessingQueue()
  if (!queue) {
    console.warn(`[Queue] Image processing not queued (no REDIS_URL): ${data.imageId}`)
    return
  }
  await queue.add(data.type, data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  })
}

// =============================================================================
// CONVENIENCE HELPERS
// =============================================================================

interface CertificateEmailContext {
  tenantId: string
  certificateId: string
  uucDetails: UucDetails
}

export function buildCertificateUucDetails(certificate: {
  uucDescription?: string | null
  uucMake?: string | null
  uucModel?: string | null
  uucSerialNumber?: string | null
  uucInstrumentId?: string | null
  uucLocationName?: string | null
  uucMachineName?: string | null
}): UucDetails {
  return {
    description: certificate.uucDescription,
    make: certificate.uucMake,
    model: certificate.uucModel,
    serialNumber: certificate.uucSerialNumber,
    instrumentId: certificate.uucInstrumentId,
    location: certificate.uucLocationName,
    machineName: certificate.uucMachineName,
  }
}

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
    resetUrl: `${APP_URL()}${resetPath}/${opts.token}`,
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
    activationUrl: `${APP_URL()}/activate/${opts.token}`,
  })
}

export async function queueCertificateSubmittedEmail(opts: CertificateEmailContext & {
  reviewerEmail: string
  reviewerName: string
  certificateNumber: string
  assigneeName: string
  customerName?: string
}): Promise<void> {
  await enqueueTrackedCertificateEmail({
    tenantId: opts.tenantId,
    certificateId: opts.certificateId,
    emailType: 'CERTIFICATE_SUBMITTED',
    recipientEmail: opts.reviewerEmail,
    recipientName: opts.reviewerName,
    required: true,
    data: {
      type: 'certificate-submitted',
      to: opts.reviewerEmail,
      tenantName: TENANT_NAME(),
      reviewerName: opts.reviewerName,
      certificateNumber: opts.certificateNumber,
      assigneeName: opts.assigneeName,
      customerName: opts.customerName,
      uucDetails: opts.uucDetails,
      dashboardUrl: `${APP_URL()}/dashboard/certificates`,
    },
  }, enqueueEmail)
}

export async function queueCertificateReviewedEmail(opts: CertificateEmailContext & {
  assigneeEmail: string
  assigneeName: string
  certificateNumber: string
  reviewerName: string
  approved: boolean
  revisionNote?: string
}): Promise<void> {
  await enqueueTrackedCertificateEmail({
    tenantId: opts.tenantId,
    certificateId: opts.certificateId,
    emailType: 'CERTIFICATE_REVIEWED',
    recipientEmail: opts.assigneeEmail,
    recipientName: opts.assigneeName,
    data: {
      type: 'certificate-reviewed',
      to: opts.assigneeEmail,
      tenantName: TENANT_NAME(),
      assigneeName: opts.assigneeName,
      certificateNumber: opts.certificateNumber,
      reviewerName: opts.reviewerName,
      approved: opts.approved,
      revisionNote: opts.revisionNote,
      uucDetails: opts.uucDetails,
      dashboardUrl: `${APP_URL()}/dashboard/certificates`,
    },
  }, enqueueEmail)
}

export async function queueCustomerReviewEmail(opts: CertificateEmailContext & {
  customerEmail: string
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  token: string
}): Promise<void> {
  await enqueueTrackedCertificateEmail({
    tenantId: opts.tenantId,
    certificateId: opts.certificateId,
    emailType: 'CUSTOMER_REVIEW',
    recipientEmail: opts.customerEmail,
    recipientName: opts.customerName,
    required: true,
    data: {
      type: 'customer-review',
      to: opts.customerEmail,
      tenantName: TENANT_NAME(),
      customerName: opts.customerName,
      certificateNumber: opts.certificateNumber,
      instrumentDescription: opts.instrumentDescription,
      uucDetails: opts.uucDetails,
      reviewUrl: `${APP_URL()}/customer/review/${opts.token}`,
    },
  }, enqueueEmail)
}

export async function queueCustomerReviewRegisteredEmail(opts: CertificateEmailContext & {
  customerEmail: string
  customerName: string
  certificateNumber: string
  instrumentDescription: string
}): Promise<void> {
  await enqueueTrackedCertificateEmail({
    tenantId: opts.tenantId,
    certificateId: opts.certificateId,
    emailType: 'CUSTOMER_REVIEW_REGISTERED',
    recipientEmail: opts.customerEmail,
    recipientName: opts.customerName,
    required: true,
    data: {
      type: 'customer-review-registered',
      to: opts.customerEmail,
      tenantName: TENANT_NAME(),
      customerName: opts.customerName,
      certificateNumber: opts.certificateNumber,
      instrumentDescription: opts.instrumentDescription,
      uucDetails: opts.uucDetails,
      loginUrl: `${APP_URL()}/customer/login`,
    },
  }, enqueueEmail)
}

export async function queueCustomerAuthorizedRegisteredEmail(opts: CertificateEmailContext & {
  customerEmail: string
  customerName: string
  certificateNumber: string
  instrumentDescription: string
}): Promise<void> {
  await enqueueTrackedCertificateEmail({
    tenantId: opts.tenantId,
    certificateId: opts.certificateId,
    emailType: 'CUSTOMER_AUTHORIZED_REGISTERED',
    recipientEmail: opts.customerEmail,
    recipientName: opts.customerName,
    required: true,
    data: {
      type: 'customer-authorized-registered',
      to: opts.customerEmail,
      tenantName: TENANT_NAME(),
      customerName: opts.customerName,
      certificateNumber: opts.certificateNumber,
      instrumentDescription: opts.instrumentDescription,
      uucDetails: opts.uucDetails,
      loginUrl: `${APP_URL()}/customer/login`,
    },
  }, enqueueEmail)
}

export async function queueCustomerAuthorizedTokenEmail(opts: CertificateEmailContext & {
  customerEmail: string
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  token: string
  maxDownloads?: number
  expiresInDays?: number
}): Promise<void> {
  await enqueueTrackedCertificateEmail({
    tenantId: opts.tenantId,
    certificateId: opts.certificateId,
    emailType: 'CUSTOMER_AUTHORIZED_TOKEN',
    recipientEmail: opts.customerEmail,
    recipientName: opts.customerName,
    required: true,
    data: {
      type: 'customer-authorized-token',
      to: opts.customerEmail,
      tenantName: TENANT_NAME(),
      customerName: opts.customerName,
      certificateNumber: opts.certificateNumber,
      instrumentDescription: opts.instrumentDescription,
      uucDetails: opts.uucDetails,
      downloadUrl: `${APP_URL()}/customer/download/${opts.token}`,
      maxDownloads: opts.maxDownloads ?? 10,
      expiresInDays: opts.expiresInDays ?? 30,
    },
  }, enqueueEmail)
}

export async function queueCustomerApprovalNotificationEmail(opts: CertificateEmailContext & {
  staffEmail: string
  staffName: string
  certificateNumber: string
  customerName: string
  approved: boolean
  rejectionNote?: string
}): Promise<void> {
  await enqueueTrackedCertificateEmail({
    tenantId: opts.tenantId,
    certificateId: opts.certificateId,
    emailType: 'CUSTOMER_APPROVAL',
    recipientEmail: opts.staffEmail,
    recipientName: opts.staffName,
    data: {
      type: 'customer-approval',
      to: opts.staffEmail,
      tenantName: TENANT_NAME(),
      recipientName: opts.staffName,
      certificateNumber: opts.certificateNumber,
      customerName: opts.customerName,
      approverName: opts.customerName,
      status: opts.approved ? 'approved' : 'rejected',
      rejectionNote: opts.rejectionNote,
      uucDetails: opts.uucDetails,
      dashboardUrl: `${APP_URL()}/dashboard/certificates`,
    },
  }, enqueueEmail)
}

export async function queueReviewerCustomerExpiredEmail(opts: CertificateEmailContext & {
  reviewerEmail: string
  reviewerName: string
  certificateNumber: string
  customerName: string
  instrumentDescription: string
}): Promise<void> {
  await enqueueTrackedCertificateEmail({
    tenantId: opts.tenantId,
    certificateId: opts.certificateId,
    emailType: 'CUSTOMER_REVIEW_EXPIRED',
    recipientEmail: opts.reviewerEmail,
    recipientName: opts.reviewerName,
    data: {
      type: 'reviewer-customer-expired',
      to: opts.reviewerEmail,
      tenantName: TENANT_NAME(),
      reviewerName: opts.reviewerName,
      certificateNumber: opts.certificateNumber,
      customerName: opts.customerName,
      instrumentDescription: opts.instrumentDescription,
      uucDetails: opts.uucDetails,
      dashboardUrl: `${APP_URL()}/dashboard/certificates`,
    },
  }, enqueueEmail)
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

type WithoutPortalUrl<T> = T extends unknown ? Omit<T, 'portalUrl'> : never

export type QueueInternalRequestDecisionEmailOptions =
  WithoutPortalUrl<InternalRequestDecisionProps> & { to: string }

export type QueueCustomerRequestDecisionEmailOptions =
  WithoutPortalUrl<CustomerRequestDecisionProps> & { to: string }

export async function queueInternalRequestDecisionEmail(
  opts: QueueInternalRequestDecisionEmailOptions,
): Promise<void> {
  const data = {
    ...opts,
    type: 'internal-request-decision' as const,
    tenantName: TENANT_NAME(),
    portalUrl: APP_URL(),
  } as InternalRequestDecisionEmailJob
  await enqueueEmail(data, { required: true })
}

export async function queueCustomerRequestDecisionEmail(
  opts: QueueCustomerRequestDecisionEmailOptions,
): Promise<void> {
  const data = {
    ...opts,
    type: 'customer-request-decision' as const,
    tenantName: TENANT_NAME(),
    portalUrl: APP_URL(),
  } as CustomerRequestDecisionEmailJob
  await enqueueEmail(data, { required: true })
}

/**
 * Graceful shutdown — close queues and connection
 */
export async function closeQueues(): Promise<void> {
  await emailQueue?.close()
  await notificationQueue?.close()
  await imageProcessingQueue?.close()
  connection?.disconnect()
  emailQueue = null
  notificationQueue = null
  imageProcessingQueue = null
  connection = null
}
