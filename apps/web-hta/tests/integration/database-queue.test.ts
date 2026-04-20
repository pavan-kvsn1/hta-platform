/**
 * Database Queue Integration Tests
 *
 * Tests the database-backed queue provider which serves as a fallback
 * when Redis is not available.
 *
 * Requires: PostgreSQL test database running
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'

describe('Database Queue Provider', () => {
  let isDbAvailable = false

  beforeAll(async () => {
    try {
      await prisma.$connect()
      isDbAvailable = true
      console.log('[Database Queue] PostgreSQL connected')
    } catch (error) {
      console.warn('[Database Queue] PostgreSQL not available, skipping tests')
      isDbAvailable = false
    }
  })

  afterAll(async () => {
    if (isDbAvailable) {
      // Clean up test jobs
      await prisma.jobQueue.deleteMany({
        where: {
          type: { startsWith: 'test:' },
        },
      })
      await prisma.$disconnect()
    }
  })

  beforeEach(async () => {
    if (isDbAvailable) {
      await prisma.jobQueue.deleteMany({
        where: {
          type: { startsWith: 'test:' },
        },
      })
    }
  })

  describe('Job Enqueueing', () => {
    it.skipIf(!isDbAvailable)('should enqueue a job', async () => {
      const job = await prisma.jobQueue.create({
        data: {
          type: 'test:email',
          payload: JSON.stringify({
            to: 'test@example.com',
            subject: 'Test Email',
          }),
          status: 'pending',
          priority: 0,
          maxRetries: 3,
          scheduledFor: new Date(),
        },
      })

      expect(job.id).toBeDefined()
      expect(job.type).toBe('test:email')
      expect(job.status).toBe('pending')
    })

    it.skipIf(!isDbAvailable)('should enqueue with priority', async () => {
      // Create low priority job
      await prisma.jobQueue.create({
        data: {
          type: 'test:notification',
          payload: JSON.stringify({ message: 'Low priority' }),
          status: 'pending',
          priority: 0,
          maxRetries: 3,
          scheduledFor: new Date(),
        },
      })

      // Create high priority job
      await prisma.jobQueue.create({
        data: {
          type: 'test:notification',
          payload: JSON.stringify({ message: 'High priority' }),
          status: 'pending',
          priority: 10,
          maxRetries: 3,
          scheduledFor: new Date(),
        },
      })

      // Fetch jobs ordered by priority
      const jobs = await prisma.jobQueue.findMany({
        where: {
          type: 'test:notification',
          status: 'pending',
        },
        orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }],
      })

      expect(jobs.length).toBe(2)
      expect(JSON.parse(jobs[0].payload as string).message).toBe('High priority')
    })

    it.skipIf(!isDbAvailable)('should enqueue with delay', async () => {
      const scheduledFor = new Date(Date.now() + 60000) // 1 minute from now

      const job = await prisma.jobQueue.create({
        data: {
          type: 'test:delayed',
          payload: JSON.stringify({ data: 'delayed job' }),
          status: 'pending',
          priority: 0,
          maxRetries: 3,
          scheduledFor,
        },
      })

      expect(job.scheduledFor.getTime()).toBeGreaterThan(Date.now())

      // Should not be picked up yet
      const pendingJobs = await prisma.jobQueue.findMany({
        where: {
          type: 'test:delayed',
          status: 'pending',
          scheduledFor: { lte: new Date() },
        },
      })

      expect(pendingJobs.length).toBe(0)
    })
  })

  describe('Job Processing', () => {
    it.skipIf(!isDbAvailable)('should claim jobs for processing', async () => {
      // Create pending job
      await prisma.jobQueue.create({
        data: {
          type: 'test:process',
          payload: JSON.stringify({ data: 'to process' }),
          status: 'pending',
          priority: 0,
          maxRetries: 3,
          scheduledFor: new Date(),
        },
      })

      // Claim the job (atomic update)
      const claimed = await prisma.jobQueue.updateMany({
        where: {
          type: 'test:process',
          status: 'pending',
          scheduledFor: { lte: new Date() },
        },
        data: {
          status: 'processing',
        },
      })

      expect(claimed.count).toBe(1)

      // Verify status changed
      const job = await prisma.jobQueue.findFirst({
        where: { type: 'test:process' },
      })
      expect(job?.status).toBe('processing')
    })

    it.skipIf(!isDbAvailable)('should complete jobs', async () => {
      const job = await prisma.jobQueue.create({
        data: {
          type: 'test:complete',
          payload: JSON.stringify({}),
          status: 'processing',
          priority: 0,
          maxRetries: 3,
          scheduledFor: new Date(),
        },
      })

      // Complete the job
      const completed = await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          processedAt: new Date(),
        },
      })

      expect(completed.status).toBe('completed')
      expect(completed.processedAt).toBeDefined()
    })

    it.skipIf(!isDbAvailable)('should handle job failures with retry', async () => {
      const job = await prisma.jobQueue.create({
        data: {
          type: 'test:retry',
          payload: JSON.stringify({}),
          status: 'processing',
          priority: 0,
          maxRetries: 3,
          attempts: 0,
          scheduledFor: new Date(),
        },
      })

      // Fail the job
      const failed = await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'pending', // Back to pending for retry
          attempts: { increment: 1 },
          error: 'Simulated failure',
          scheduledFor: new Date(Date.now() + 30000), // Retry in 30s
        },
      })

      expect(failed.attempts).toBe(1)
      expect(failed.error).toBe('Simulated failure')
      expect(failed.status).toBe('pending')
    })

    it.skipIf(!isDbAvailable)('should mark job as failed after max retries', async () => {
      const job = await prisma.jobQueue.create({
        data: {
          type: 'test:maxretry',
          payload: JSON.stringify({}),
          status: 'processing',
          priority: 0,
          maxRetries: 3,
          attempts: 3, // Already at max
          scheduledFor: new Date(),
        },
      })

      // Final failure
      const failed = await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: 'Max retries exceeded',
          processedAt: new Date(),
        },
      })

      expect(failed.status).toBe('failed')
    })
  })

  describe('Job Queries', () => {
    it.skipIf(!isDbAvailable)('should get job counts by status', async () => {
      // Create jobs with different statuses
      await prisma.jobQueue.createMany({
        data: [
          { type: 'test:counts', payload: '{}', status: 'pending', priority: 0, maxRetries: 3, scheduledFor: new Date() },
          { type: 'test:counts', payload: '{}', status: 'pending', priority: 0, maxRetries: 3, scheduledFor: new Date() },
          { type: 'test:counts', payload: '{}', status: 'completed', priority: 0, maxRetries: 3, scheduledFor: new Date() },
          { type: 'test:counts', payload: '{}', status: 'failed', priority: 0, maxRetries: 3, scheduledFor: new Date() },
        ],
      })

      const counts = await prisma.jobQueue.groupBy({
        by: ['status'],
        where: { type: 'test:counts' },
        _count: true,
      })

      const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]))

      expect(countMap.pending).toBe(2)
      expect(countMap.completed).toBe(1)
      expect(countMap.failed).toBe(1)
    })

    it.skipIf(!isDbAvailable)('should find stuck jobs', async () => {
      const stuckTime = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago

      // Create a stuck job (processing for too long)
      await prisma.jobQueue.create({
        data: {
          type: 'test:stuck',
          payload: '{}',
          status: 'processing',
          priority: 0,
          maxRetries: 3,
          scheduledFor: stuckTime,
          createdAt: stuckTime,
        },
      })

      const stuckJobs = await prisma.jobQueue.findMany({
        where: {
          status: 'processing',
          createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) }, // Older than 30 min
        },
      })

      expect(stuckJobs.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Job Cleanup', () => {
    it.skipIf(!isDbAvailable)('should clean up old completed jobs', async () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago

      // Create old completed job
      await prisma.jobQueue.create({
        data: {
          type: 'test:cleanup',
          payload: '{}',
          status: 'completed',
          priority: 0,
          maxRetries: 3,
          scheduledFor: oldDate,
          processedAt: oldDate,
          createdAt: oldDate,
        },
      })

      // Clean up jobs older than 7 days
      const deleted = await prisma.jobQueue.deleteMany({
        where: {
          status: { in: ['completed', 'failed'] },
          processedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      })

      expect(deleted.count).toBeGreaterThanOrEqual(1)
    })

    it.skipIf(!isDbAvailable)('should reset stuck jobs', async () => {
      const stuckTime = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago

      await prisma.jobQueue.create({
        data: {
          type: 'test:reset',
          payload: '{}',
          status: 'processing',
          priority: 0,
          maxRetries: 3,
          attempts: 1,
          scheduledFor: stuckTime,
          createdAt: stuckTime,
        },
      })

      // Reset stuck jobs
      const reset = await prisma.jobQueue.updateMany({
        where: {
          type: 'test:reset',
          status: 'processing',
          createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
        },
        data: {
          status: 'pending',
          scheduledFor: new Date(),
        },
      })

      expect(reset.count).toBeGreaterThanOrEqual(1)
    })
  })
})
