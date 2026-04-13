/**
 * Queue Service
 *
 * Main entry point for the job queue system.
 * Provides a unified API for enqueueing and processing background jobs.
 *
 * Usage:
 * ```typescript
 * import { enqueue, processJobs } from '@/lib/services/queue'
 *
 * // Enqueue a job
 * await enqueue('notification:send', {
 *   userId: '123',
 *   type: 'CERTIFICATE_APPROVED',
 *   title: 'Approved',
 *   message: 'Your certificate was approved',
 * })
 *
 * // Process pending jobs (called by cron/API route)
 * await processJobs()
 * ```
 */

import { QueueService, JobType, JobPayloads, JobOptions, Job, WorkerRegistry } from './types'
import { DatabaseQueueService, getDatabaseQueueService } from './providers/database'

// Import workers
import { chatWorkers } from './workers/chat.worker'
import { notificationWorkers } from './workers/notification.worker'
import { emailWorkers } from './workers/email.worker'
import { realtimeWorkers } from './workers/realtime.worker'

// Combine all workers into registry
const workerRegistry: WorkerRegistry = {
  ...chatWorkers,
  ...notificationWorkers,
  ...emailWorkers,
  ...realtimeWorkers,
}

// Get the queue service based on provider
function getQueueService(): QueueService & DatabaseQueueService {
  const provider = process.env.QUEUE_PROVIDER || 'database'

  switch (provider) {
    case 'database':
    default:
      return getDatabaseQueueService()
    // Future: add cloud-tasks provider
    // case 'cloud-tasks':
    //   return getCloudTasksService()
  }
}

// Singleton queue service
let queueService: (QueueService & DatabaseQueueService) | null = null

function getQueue(): QueueService & DatabaseQueueService {
  if (!queueService) {
    queueService = getQueueService()
  }
  return queueService
}

/**
 * Enqueue a job for background processing
 */
export async function enqueue<T extends JobType>(
  type: T,
  payload: JobPayloads[T],
  options?: JobOptions
): Promise<string> {
  return getQueue().enqueue(type, payload, options)
}

/**
 * Enqueue multiple jobs
 */
export async function enqueueBatch<T extends JobType>(
  jobs: Array<{ type: T; payload: JobPayloads[T]; options?: JobOptions }>
): Promise<string[]> {
  return getQueue().enqueueBatch(jobs)
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<Job | null> {
  return getQueue().getJob(jobId)
}

/**
 * Cancel a pending job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  return getQueue().cancelJob(jobId)
}

/**
 * Get job counts by status
 */
export async function getJobCounts() {
  return getQueue().getJobCounts()
}

/**
 * Process pending jobs
 * This should be called periodically (via cron, setInterval, or API route)
 *
 * @param limit Maximum number of jobs to process in this batch
 * @returns Number of jobs processed
 */
export async function processJobs(limit = 10): Promise<{
  processed: number
  succeeded: number
  failed: number
  errors: Array<{ jobId: string; error: string }>
}> {
  const queue = getQueue()

  // Claim jobs for processing
  const jobs = await queue.claimJobs(limit)

  if (jobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0, errors: [] }
  }

  let succeeded = 0
  let failed = 0
  const errors: Array<{ jobId: string; error: string }> = []

  // Process each job
  for (const job of jobs) {
    const worker = workerRegistry[job.type]

    if (!worker) {
      const error = `No worker registered for job type: ${job.type}`
      console.error(`[Queue] ${error}`)
      await queue.failJob(job.id, error)
      failed++
      errors.push({ jobId: job.id, error })
      continue
    }

    try {
      // Execute the worker
      await worker(job as any)
      await queue.completeJob(job.id)
      succeeded++
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[Queue] Job ${job.id} failed:`, error)
      await queue.failJob(job.id, error)
      failed++
      errors.push({ jobId: job.id, error })
    }
  }

  console.log(`[Queue] Processed ${jobs.length} jobs: ${succeeded} succeeded, ${failed} failed`)

  return {
    processed: jobs.length,
    succeeded,
    failed,
    errors,
  }
}

/**
 * Clean up old completed/failed jobs
 */
export async function cleanupJobs(olderThanDays = 7): Promise<number> {
  return getQueue().cleanup(olderThanDays)
}

/**
 * Reset stuck jobs (processing for too long)
 */
export async function resetStuckJobs(stuckMinutes = 30): Promise<number> {
  return getQueue().resetStuckJobs(stuckMinutes)
}

// Re-export types
export type { JobType, JobPayloads, JobOptions, Job, JobStatus } from './types'
