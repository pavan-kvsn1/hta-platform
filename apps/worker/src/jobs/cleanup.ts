/**
 * Cleanup Job Processor
 *
 * Handles periodic cleanup tasks like removing expired tokens,
 * old notifications, and orphaned files.
 */

import { Job } from 'bullmq'
import { prisma } from '@hta/database'
import type { CleanupJobData } from '../types.js'

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
 * Run all standard cleanup tasks
 * Called by scheduled job
 */
export async function runScheduledCleanup(): Promise<void> {
  console.log('[Cleanup] Running scheduled cleanup...')

  const results = await Promise.allSettled([
    cleanupExpiredTokens(),
    cleanupOldNotifications(90, true), // Delete read notifications older than 90 days
  ])

  const summary = results.map((r, i) => {
    const tasks = ['tokens', 'notifications']
    if (r.status === 'fulfilled') {
      return `${tasks[i]}: ${r.value.deleted} deleted`
    }
    return `${tasks[i]}: failed`
  })

  console.log(`[Cleanup] Scheduled cleanup complete: ${summary.join(', ')}`)
}
