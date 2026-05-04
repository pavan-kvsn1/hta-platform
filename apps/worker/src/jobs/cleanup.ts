/**
 * Cleanup Job Processor
 *
 * Handles periodic cleanup tasks like removing expired tokens,
 * old notifications, and orphaned files.
 */

import { Job, Queue } from 'bullmq'
import { prisma } from '@hta/database'
import type { CleanupJobData, EmailJobData } from '../types.js'

// Email queue reference — set by index.ts so cleanup can enqueue emails
let emailQueueRef: Queue<EmailJobData> | null = null

export function setEmailQueue(queue: Queue<EmailJobData>): void {
  emailQueueRef = queue
}

/**
 * Process a cleanup job
 */
export async function processCleanupJob(job: Job<CleanupJobData>): Promise<void> {
  const { data } = job

  console.log(`[Cleanup] Processing job ${job.id}: ${data.type}`)

  try {
    let result: { deleted: number }

    switch (data.type) {
      case 'expired-tokens':
        result = await cleanupExpiredTokens(data.olderThan)
        break

      case 'expired-sessions':
        // No session table in this schema - skip
        console.log('[Cleanup] Session cleanup skipped (no session table)')
        result = { deleted: 0 }
        break

      case 'old-notifications':
        result = await cleanupOldNotifications(data.olderThanDays, data.onlyRead)
        break

      case 'orphaned-files':
        result = await cleanupOrphanedFiles(data.dryRun)
        break

      case 'expired-reviews':
        result = await cleanupExpiredReviews()
        break

      case 'offline-codes':
        result = await cleanupExpiredOfflineCodes()
        break

      default:
        throw new Error(`Unknown cleanup type: ${(data as { type: string }).type}`)
    }

    console.log(`[Cleanup] Completed job ${job.id}: deleted ${result.deleted} items`)
  } catch (error) {
    console.error(`[Cleanup] Failed to process job ${job.id}:`, error)
    throw error
  }
}

/**
 * Remove expired password reset tokens
 */
async function cleanupExpiredTokens(olderThan?: Date): Promise<{ deleted: number }> {
  const cutoff = olderThan || new Date()

  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      expiresAt: { lt: cutoff },
    },
  })

  console.log(`[Cleanup] Deleted ${result.count} expired password reset tokens`)
  return { deleted: result.count }
}

/**
 * Remove old notifications
 */
async function cleanupOldNotifications(
  olderThanDays: number,
  onlyRead?: boolean
): Promise<{ deleted: number }> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)

  const result = await prisma.notification.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      ...(onlyRead ? { read: true } : {}),
    },
  })

  console.log(`[Cleanup] Deleted ${result.count} old notifications (>${olderThanDays} days${onlyRead ? ', read only' : ''})`)
  return { deleted: result.count }
}

/**
 * Find and optionally remove orphaned files
 * (files in storage that aren't referenced by any certificate)
 */
async function cleanupOrphanedFiles(dryRun?: boolean): Promise<{ deleted: number }> {
  // Get all image storage keys from certificate images
  const images = await prisma.certificateImage.findMany({
    where: { isLatest: true },
    select: {
      storageKey: true,
      optimizedKey: true,
      thumbnailKey: true,
    },
  })

  // Collect all referenced storage keys
  const referencedKeys = new Set<string>()
  for (const image of images) {
    if (image.storageKey) referencedKeys.add(image.storageKey)
    if (image.optimizedKey) referencedKeys.add(image.optimizedKey)
    if (image.thumbnailKey) referencedKeys.add(image.thumbnailKey)
  }

  console.log(`[Cleanup] Found ${referencedKeys.size} referenced images in database`)

  // In a real implementation, you would:
  // 1. List all files in GCS bucket
  // 2. Compare with referencedKeys
  // 3. Delete orphaned files (if not dryRun)

  if (dryRun) {
    console.log('[Cleanup] Dry run - no files deleted')
    return { deleted: 0 }
  }

  // Placeholder for actual GCS cleanup
  // const storage = new Storage()
  // const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!)
  // const [files] = await bucket.getFiles({ prefix: 'certificates/' })
  //
  // let deleted = 0
  // for (const file of files) {
  //   if (!referencedKeys.has(file.name)) {
  //     await file.delete()
  //     deleted++
  //   }
  // }

  console.log('[Cleanup] File cleanup not yet implemented for GCS')
  return { deleted: 0 }
}

/**
 * Expire customer reviews that have exceeded the 48-hour window.
 * Transitions PENDING_CUSTOMER_APPROVAL → CUSTOMER_REVIEW_EXPIRED
 * and notifies the reviewer.
 */
export async function cleanupExpiredReviews(): Promise<{ deleted: number }> {
  const now = new Date()

  // Find certificates in PENDING_CUSTOMER_APPROVAL where all approval tokens are expired or used
  const expiredCerts = await prisma.certificate.findMany({
    where: {
      status: 'PENDING_CUSTOMER_APPROVAL',
      approvalTokens: {
        // Every token is either expired or used — none are still valid
        every: {
          OR: [
            { expiresAt: { lt: now } },
            { usedAt: { not: null } },
          ],
        },
        // Must have at least one token (to confirm it was actually sent to customer)
        some: {},
      },
    },
    include: {
      reviewer: { select: { id: true, email: true, name: true } },
      createdBy: { select: { id: true, email: true, name: true } },
      approvalTokens: {
        where: { usedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { customer: { select: { name: true } } },
      },
    },
  })

  if (expiredCerts.length === 0) {
    console.log('[Cleanup] No expired customer reviews found')
    return { deleted: 0 }
  }

  console.log(`[Cleanup] Found ${expiredCerts.length} expired customer reviews`)

  let expired = 0
  const APP_URL = process.env.APP_URL || 'https://app.hta-calibration.com'
  const TENANT_NAME = process.env.TENANT_NAME || 'HTA Calibration'

  for (const cert of expiredCerts) {
    try {
      // Transition to CUSTOMER_REVIEW_EXPIRED
      const lastEvent = await prisma.certificateEvent.findFirst({
        where: { certificateId: cert.id },
        orderBy: { sequenceNumber: 'desc' },
      })

      await prisma.$transaction([
        prisma.certificate.update({
          where: { id: cert.id },
          data: { status: 'CUSTOMER_REVIEW_EXPIRED', updatedAt: now },
        }),
        prisma.certificateEvent.create({
          data: {
            certificateId: cert.id,
            sequenceNumber: (lastEvent?.sequenceNumber || 0) + 1,
            revision: cert.currentRevision,
            eventType: 'CUSTOMER_REVIEW_EXPIRED',
            eventData: JSON.stringify({
              reason: 'Customer did not respond within 48-hour window',
              expiredAt: now.toISOString(),
            }),
            userRole: 'SYSTEM',
          },
        }),
      ])

      // Determine who to notify — reviewer if assigned, otherwise the engineer
      const notifyUser = cert.reviewer || cert.createdBy
      const customerName = cert.approvalTokens[0]?.customer?.name || cert.customerName || 'Customer'
      const certNum = cert.certificateNumber || `CERT-${cert.id.substring(0, 8)}`

      if (notifyUser && emailQueueRef) {
        await emailQueueRef.add('reviewer-customer-expired', {
          type: 'reviewer-customer-expired' as const,
          to: notifyUser.email,
          tenantName: TENANT_NAME,
          reviewerName: notifyUser.name,
          certificateNumber: certNum,
          customerName,
          instrumentDescription: cert.uucDescription || 'Calibration Certificate',
          dashboardUrl: `${APP_URL}/dashboard/certificates`,
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        })
      }

      expired++
      console.log(`[Cleanup] Expired review for certificate ${certNum}`)
    } catch (error) {
      console.error(`[Cleanup] Failed to expire review for cert ${cert.id}:`, error)
    }
  }

  console.log(`[Cleanup] Expired ${expired} customer reviews`)
  return { deleted: expired }
}

/**
 * Expire offline code batches that have passed their expiresAt date.
 * Deactivates the batch and queues a notification email to the engineer.
 */
export async function cleanupExpiredOfflineCodes(): Promise<{ deleted: number }> {
  const now = new Date()

  const expiredBatches = await prisma.offlineCodeBatch.findMany({
    where: {
      isActive: true,
      expiresAt: { lt: now },
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  })

  if (expiredBatches.length === 0) {
    console.log('[Cleanup] No expired offline code batches found')
    return { deleted: 0 }
  }

  const APP_URL = process.env.APP_URL || 'https://app.hta-calibration.com'
  const TENANT_NAME = process.env.TENANT_NAME || 'HTA Calibration'
  let expired = 0

  for (const batch of expiredBatches) {
    try {
      await prisma.offlineCodeBatch.update({
        where: { id: batch.id },
        data: { isActive: false },
      })

      // Notify the engineer
      if (batch.user && emailQueueRef) {
        await emailQueueRef.add('offline-codes-expiry', {
          type: 'offline-codes-expiry' as const,
          to: batch.user.email,
          tenantName: TENANT_NAME,
          engineerName: batch.user.name,
          loginUrl: `${APP_URL}/dashboard/offline-codes`,
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        })
      }

      expired++
      console.log(`[Cleanup] Expired offline code batch ${batch.id} for user ${batch.userId}`)
    } catch (error) {
      console.error(`[Cleanup] Failed to expire batch ${batch.id}:`, error)
    }
  }

  console.log(`[Cleanup] Expired ${expired} offline code batches`)
  return { deleted: expired }
}

/**
 * Run all standard cleanup tasks
 * Called by scheduled job
 */
export async function runScheduledCleanup(): Promise<void> {
  console.log('[Cleanup] Running scheduled cleanup...')

  const results = await Promise.allSettled([
    cleanupExpiredTokens(),
    cleanupOldNotifications(90, true), // Delete read notifications older than 90 days
    cleanupExpiredReviews(),
    cleanupExpiredOfflineCodes(),
  ])

  const summary = results.map((r, i) => {
    const tasks = ['tokens', 'notifications', 'expired-reviews', 'offline-codes']
    if (r.status === 'fulfilled') {
      return `${tasks[i]}: ${r.value.deleted} deleted`
    }
    return `${tasks[i]}: failed`
  })

  console.log(`[Cleanup] Scheduled cleanup complete: ${summary.join(', ')}`)
}
