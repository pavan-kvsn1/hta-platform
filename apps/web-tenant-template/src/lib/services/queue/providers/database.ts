/**
 * Database Queue Provider
 *
 * Implements job queue using the database (SQLite/PostgreSQL).
 * Jobs are stored in the JobQueue table and processed via polling.
 *
 * Best for: Development, low-medium volume production
 * Limitations: Polling latency (~100-500ms), single-process workers
 */

import { prisma } from '@/lib/prisma'
import {
  QueueService,
  JobType,
  JobPayloads,
  JobOptions,
  Job,
  JobStatus,
} from '../types'

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_PRIORITY = 0

export class DatabaseQueueService implements QueueService {
  async enqueue<T extends JobType>(
    type: T,
    payload: JobPayloads[T],
    options?: JobOptions
  ): Promise<string> {
    const job = await prisma.jobQueue.create({
      data: {
        type,
        payload: JSON.stringify(payload),
        status: 'pending',
        priority: options?.priority ?? DEFAULT_PRIORITY,
        maxRetries: options?.retries ?? DEFAULT_MAX_RETRIES,
        scheduledFor: options?.delay
          ? new Date(Date.now() + options.delay)
          : new Date(),
      },
    })

    return job.id
  }

  async enqueueBatch<T extends JobType>(
    jobs: Array<{ type: T; payload: JobPayloads[T]; options?: JobOptions }>
  ): Promise<string[]> {
    const results = await Promise.all(
      jobs.map((job) => this.enqueue(job.type, job.payload, job.options))
    )
    return results
  }

  async getJob(jobId: string): Promise<Job | null> {
    const job = await prisma.jobQueue.findUnique({
      where: { id: jobId },
    })

    if (!job) return null

    return this.mapToJob(job)
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const result = await prisma.jobQueue.updateMany({
      where: {
        id: jobId,
        status: 'pending',
      },
      data: {
        status: 'cancelled',
      },
    })

    return result.count > 0
  }

  async getJobsByStatus(status: JobStatus, limit = 100): Promise<Job[]> {
    const jobs = await prisma.jobQueue.findMany({
      where: { status },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    })

    return jobs.map(this.mapToJob)
  }

  async getJobCounts(): Promise<Record<JobStatus, number>> {
    const counts = await prisma.jobQueue.groupBy({
      by: ['status'],
      _count: { status: true },
    })

    const result: Record<JobStatus, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    }

    for (const count of counts) {
      result[count.status as JobStatus] = count._count.status
    }

    return result
  }

  /**
   * Claim jobs for processing (used by workers)
   * Atomically marks jobs as 'processing' and returns them
   */
  async claimJobs(limit = 10): Promise<Job[]> {
    const now = new Date()

    // Find pending jobs that are ready to process
    const pendingJobs = await prisma.jobQueue.findMany({
      where: {
        status: 'pending',
        scheduledFor: { lte: now },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true },
    })

    if (pendingJobs.length === 0) {
      return []
    }

    const jobIds = pendingJobs.map((j) => j.id)

    // Mark as processing (atomic update)
    await prisma.jobQueue.updateMany({
      where: {
        id: { in: jobIds },
        status: 'pending', // Re-check status to avoid race conditions
      },
      data: {
        status: 'processing',
        attempts: { increment: 1 },
      },
    })

    // Fetch the updated jobs
    const jobs = await prisma.jobQueue.findMany({
      where: {
        id: { in: jobIds },
        status: 'processing',
      },
    })

    return jobs.map(this.mapToJob)
  }

  /**
   * Mark a job as completed
   */
  async completeJob(jobId: string): Promise<void> {
    await prisma.jobQueue.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
    })
  }

  /**
   * Mark a job as failed
   * Will retry if attempts < maxRetries
   */
  async failJob(jobId: string, error: string): Promise<void> {
    const job = await prisma.jobQueue.findUnique({
      where: { id: jobId },
    })

    if (!job) return

    const shouldRetry = job.attempts < job.maxRetries

    if (shouldRetry) {
      // Exponential backoff: 2^attempts seconds
      const backoffMs = Math.pow(2, job.attempts) * 1000
      const nextRetry = new Date(Date.now() + backoffMs)

      await prisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'pending',
          error,
          scheduledFor: nextRetry,
        },
      })
    } else {
      await prisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error,
          processedAt: new Date(),
        },
      })
    }
  }

  /**
   * Clean up old completed/failed jobs
   * @param olderThanDays Jobs older than this will be deleted
   */
  async cleanup(olderThanDays = 7): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const result = await prisma.jobQueue.deleteMany({
      where: {
        status: { in: ['completed', 'failed', 'cancelled'] },
        processedAt: { lt: cutoffDate },
      },
    })

    return result.count
  }

  /**
   * Reset stuck jobs (processing for too long)
   * @param stuckMinutes Jobs processing longer than this will be reset
   */
  async resetStuckJobs(stuckMinutes = 30): Promise<number> {
    const cutoffTime = new Date()
    cutoffTime.setMinutes(cutoffTime.getMinutes() - stuckMinutes)

    // Find jobs that have been processing too long
    // Using createdAt as a proxy since we don't track when processing started
    const stuckJobs = await prisma.jobQueue.findMany({
      where: {
        status: 'processing',
        createdAt: { lt: cutoffTime },
      },
      select: { id: true, attempts: true, maxRetries: true },
    })

    let resetCount = 0

    for (const job of stuckJobs) {
      if (job.attempts < job.maxRetries) {
        await prisma.jobQueue.update({
          where: { id: job.id },
          data: {
            status: 'pending',
            error: 'Job timed out - retrying',
          },
        })
        resetCount++
      } else {
        await prisma.jobQueue.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: 'Job timed out after max retries',
            processedAt: new Date(),
          },
        })
      }
    }

    return resetCount
  }

  private mapToJob(dbJob: {
    id: string
    type: string
    payload: unknown
    status: string
    priority: number
    attempts: number
    maxRetries: number
    error: string | null
    scheduledFor: Date
    createdAt: Date
    processedAt: Date | null
  }): Job {
    // Handle payload - may be string (SQLite legacy) or object (PostgreSQL native JSON)
    const payload = typeof dbJob.payload === 'string'
      ? JSON.parse(dbJob.payload)
      : dbJob.payload
    return {
      id: dbJob.id,
      type: dbJob.type as JobType,
      payload,
      status: dbJob.status as JobStatus,
      priority: dbJob.priority,
      attempts: dbJob.attempts,
      maxRetries: dbJob.maxRetries,
      error: dbJob.error ?? undefined,
      scheduledFor: dbJob.scheduledFor,
      createdAt: dbJob.createdAt,
      processedAt: dbJob.processedAt ?? undefined,
    }
  }
}

// Singleton instance
let instance: DatabaseQueueService | null = null

export function getDatabaseQueueService(): DatabaseQueueService {
  if (!instance) {
    instance = new DatabaseQueueService()
  }
  return instance
}
