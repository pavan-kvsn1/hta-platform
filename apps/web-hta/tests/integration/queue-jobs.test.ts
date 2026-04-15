/**
 * Queue & Job Processing Integration Tests
 *
 * Tests the job queue system against the real PostgreSQL database.
 * Covers job creation, claiming, completion, failure, and cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  prisma,
  createTestUser,
  cleanupTestData,
} from './setup/test-helpers'

describe('Queue & Job Processing Integration Tests', () => {
  beforeEach(async () => {
    await cleanupTestData()
  })

  describe('Job Queue Operations', () => {
    it('should create a pending job', async () => {
      const job = await prisma.jobQueue.create({
        data: {
          type: 'notification:send',
          payload: {
            userId: 'user-123',
            type: 'INFO',
            title: 'Test Notification',
            message: 'This is a test',
          },
          status: 'pending',
          priority: 0,
          scheduledFor: new Date(),
          attempts: 0,
          maxRetries: 3,
        },
      })

      expect(job.type).toBe('notification:send')
      expect(job.status).toBe('pending')
      expect(job.attempts).toBe(0)
    })

    it('should create jobs with different priorities', async () => {
      await prisma.jobQueue.createMany({
        data: [
          {
            type: 'email:send',
            payload: { email: 'test1@example.com' },
            status: 'pending',
            priority: 0,
            scheduledFor: new Date(),
            attempts: 0,
            maxRetries: 3,
          },
          {
            type: 'email:send',
            payload: { email: 'test2@example.com' },
            status: 'pending',
            priority: 10,
            scheduledFor: new Date(),
            attempts: 0,
            maxRetries: 3,
          },
          {
            type: 'email:send',
            payload: { email: 'test3@example.com' },
            status: 'pending',
            priority: 5,
            scheduledFor: new Date(),
            attempts: 0,
            maxRetries: 3,
          },
        ],
      })

      // Query jobs by priority
      const jobs = await prisma.jobQueue.findMany({
        where: { type: 'email:send' },
        orderBy: { priority: 'desc' },
      })

      expect(jobs).toHaveLength(3)
      expect(jobs[0].priority).toBe(10)
      expect(jobs[1].priority).toBe(5)
      expect(jobs[2].priority).toBe(0)
    })

    it('should claim jobs for processing', async () => {
      // Create multiple pending jobs
      const jobIds: string[] = []
      for (let i = 0; i < 5; i++) {
        const job = await prisma.jobQueue.create({
          data: {
            type: 'test:job',
            payload: { index: i },
            status: 'pending',
            priority: 0,
            scheduledFor: new Date(),
            attempts: 0,
            maxRetries: 3,
          },
        })
        jobIds.push(job.id)
      }

      // Claim 3 jobs
      const claimedJobs = await prisma.jobQueue.findMany({
        where: {
          status: 'pending',
          scheduledFor: { lte: new Date() },
        },
        take: 3,
        orderBy: [{ priority: 'desc' }, { scheduledFor: 'asc' }],
      })

      // Update status to processing
      for (const job of claimedJobs) {
        await prisma.jobQueue.update({
          where: { id: job.id },
          data: {
            status: 'processing',
          },
        })
      }

      // Verify
      const processingJobs = await prisma.jobQueue.findMany({
        where: { status: 'processing' },
      })
      const pendingJobs = await prisma.jobQueue.findMany({
        where: { status: 'pending' },
      })

      expect(processingJobs).toHaveLength(3)
      expect(pendingJobs).toHaveLength(2)
    })

    it('should complete job successfully', async () => {
      const job = await prisma.jobQueue.create({
        data: {
          type: 'test:complete',
          payload: { data: 'test' },
          status: 'pending',
          priority: 0,
          scheduledFor: new Date(),
          attempts: 0,
          maxRetries: 3,
        },
      })

      // Mark as processing
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'processing',
          attempts: 1,
        },
      })

      // Mark as completed
      const completed = await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          processedAt: new Date(),
        },
      })

      expect(completed.status).toBe('completed')
      expect(completed.processedAt).toBeDefined()
      expect(completed.attempts).toBe(1)
    })

    it('should handle job failure with retry', async () => {
      const job = await prisma.jobQueue.create({
        data: {
          type: 'test:retry',
          payload: { data: 'test' },
          status: 'pending',
          priority: 0,
          scheduledFor: new Date(),
          attempts: 0,
          maxRetries: 3,
        },
      })

      // Simulate first failure
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'pending',
          attempts: 1,
          error: 'Connection timeout',
          scheduledFor: new Date(Date.now() + 60000), // Retry in 1 minute
        },
      })

      // Simulate second failure
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'pending',
          attempts: 2,
          error: 'Service unavailable',
          scheduledFor: new Date(Date.now() + 120000), // Retry in 2 minutes
        },
      })

      const retried = await prisma.jobQueue.findUnique({
        where: { id: job.id },
      })

      expect(retried!.attempts).toBe(2)
      expect(retried!.error).toBe('Service unavailable')
    })

    it('should mark job as failed after max attempts', async () => {
      const job = await prisma.jobQueue.create({
        data: {
          type: 'test:fail',
          payload: { data: 'test' },
          status: 'pending',
          priority: 0,
          scheduledFor: new Date(),
          attempts: 2,
          maxRetries: 3,
        },
      })

      // Simulate final failure
      const failed = await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          attempts: 3,
          error: 'Permanent failure',
          processedAt: new Date(),
        },
      })

      expect(failed.status).toBe('failed')
      expect(failed.attempts).toBe(3)
      expect(failed.error).toBe('Permanent failure')
    })

    it('should schedule job for future execution', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

      const job = await prisma.jobQueue.create({
        data: {
          type: 'scheduled:task',
          payload: { data: 'scheduled' },
          status: 'pending',
          priority: 0,
          scheduledFor: futureDate,
          attempts: 0,
          maxRetries: 3,
        },
      })

      // Query only current jobs
      const currentJobs = await prisma.jobQueue.findMany({
        where: {
          status: 'pending',
          scheduledFor: { lte: new Date() },
        },
      })

      expect(currentJobs.find(j => j.id === job.id)).toBeUndefined()

      // Query including future jobs
      const allJobs = await prisma.jobQueue.findMany({
        where: { type: 'scheduled:task' },
      })

      expect(allJobs).toHaveLength(1)
      expect(allJobs[0].scheduledFor.getTime()).toBeGreaterThan(Date.now())
    })
  })

  describe('Job Queue Cleanup', () => {
    it('should cleanup old completed jobs', async () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // 8 days ago
      const recentDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 3 days ago

      // Create old completed job
      await prisma.jobQueue.create({
        data: {
          type: 'old:job',
          payload: {},
          status: 'completed',
          priority: 0,
          scheduledFor: oldDate,
          processedAt: oldDate,
          attempts: 1,
          maxRetries: 3,
        },
      })

      // Create recent completed job
      await prisma.jobQueue.create({
        data: {
          type: 'recent:job',
          payload: {},
          status: 'completed',
          priority: 0,
          scheduledFor: recentDate,
          processedAt: recentDate,
          attempts: 1,
          maxRetries: 3,
        },
      })

      // Cleanup jobs older than 7 days
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const deleted = await prisma.jobQueue.deleteMany({
        where: {
          status: { in: ['completed', 'failed'] },
          processedAt: { lt: cutoff },
        },
      })

      expect(deleted.count).toBe(1)

      // Verify recent job still exists
      const remaining = await prisma.jobQueue.findMany({
        where: { type: 'recent:job' },
      })
      expect(remaining).toHaveLength(1)
    })

    it('should reset stuck jobs', async () => {
      const stuckTime = new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago

      // Create stuck job
      const stuckJob = await prisma.jobQueue.create({
        data: {
          type: 'stuck:job',
          payload: {},
          status: 'processing',
          priority: 0,
          scheduledFor: stuckTime,
          attempts: 1,
          maxRetries: 3,
        },
      })

      // Find and reset stuck jobs (processing for more than 30 minutes)
      // For simplicity, we identify stuck by scheduledFor being old while status is processing
      const stuckJobs = await prisma.jobQueue.findMany({
        where: {
          status: 'processing',
          scheduledFor: { lt: new Date(Date.now() - 30 * 60 * 1000) },
        },
      })

      for (const job of stuckJobs) {
        await prisma.jobQueue.update({
          where: { id: job.id },
          data: {
            status: 'pending',
            error: 'Job reset: stuck in processing',
          },
        })
      }

      // Verify job was reset
      const resetJob = await prisma.jobQueue.findUnique({
        where: { id: stuckJob.id },
      })

      expect(resetJob!.status).toBe('pending')
      expect(resetJob!.error).toContain('stuck')
    })
  })

  describe('Notification Job Integration', () => {
    it('should process notification job and create notification', async () => {
      const user = await createTestUser()

      // Create notification job
      const job = await prisma.jobQueue.create({
        data: {
          type: 'notification:send',
          payload: {
            userId: user.id,
            type: 'INFO',
            title: 'Test Notification',
            message: 'This is a test notification',
          },
          status: 'pending',
          priority: 0,
          scheduledFor: new Date(),
          attempts: 0,
          maxRetries: 3,
        },
      })

      // Simulate processing - create notification
      const payload = job.payload as { userId: string; type: string; title: string; message: string }
      const notification = await prisma.notification.create({
        data: {
          user: { connect: { id: payload.userId } },
          type: payload.type,
          title: payload.title,
          message: payload.message,
          read: false,
        },
      })

      // Complete job
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          processedAt: new Date(),
          attempts: 1,
        },
      })

      // Verify
      expect(notification.userId).toBe(user.id)
      expect(notification.title).toBe('Test Notification')

      const completedJob = await prisma.jobQueue.findUnique({
        where: { id: job.id },
      })
      expect(completedJob!.status).toBe('completed')
    })

    it('should batch process multiple notification jobs', async () => {
      const user = await createTestUser()

      // Create multiple notification jobs
      const jobIds: string[] = []
      for (let i = 0; i < 5; i++) {
        const job = await prisma.jobQueue.create({
          data: {
            type: 'notification:send',
            payload: {
              userId: user.id,
              type: 'INFO',
              title: `Notification ${i + 1}`,
              message: `Message ${i + 1}`,
            },
            status: 'pending',
            priority: 0,
            scheduledFor: new Date(),
            attempts: 0,
            maxRetries: 3,
          },
        })
        jobIds.push(job.id)
      }

      // Claim and process all jobs
      const jobs = await prisma.jobQueue.findMany({
        where: { id: { in: jobIds } },
      })

      for (const job of jobs) {
        const payload = job.payload as { userId: string; type: string; title: string; message: string }

        // Create notification
        await prisma.notification.create({
          data: {
            user: { connect: { id: payload.userId } },
            type: payload.type,
            title: payload.title,
            message: payload.message,
            read: false,
          },
        })

        // Mark complete
        await prisma.jobQueue.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            processedAt: new Date(),
            attempts: 1,
          },
        })
      }

      // Verify all notifications created
      const notifications = await prisma.notification.findMany({
        where: { userId: user.id },
      })
      expect(notifications).toHaveLength(5)

      // Verify all jobs completed
      const completedJobs = await prisma.jobQueue.findMany({
        where: { id: { in: jobIds }, status: 'completed' },
      })
      expect(completedJobs).toHaveLength(5)
    })
  })

  describe('Job Queue Statistics', () => {
    it('should calculate job counts by status', async () => {
      // Create jobs with various statuses
      await prisma.jobQueue.createMany({
        data: [
          { type: 'stat:job', payload: {}, status: 'pending', priority: 0, scheduledFor: new Date(), attempts: 0, maxRetries: 3 },
          { type: 'stat:job', payload: {}, status: 'pending', priority: 0, scheduledFor: new Date(), attempts: 0, maxRetries: 3 },
          { type: 'stat:job', payload: {}, status: 'processing', priority: 0, scheduledFor: new Date(), attempts: 1, maxRetries: 3 },
          { type: 'stat:job', payload: {}, status: 'completed', priority: 0, scheduledFor: new Date(), attempts: 1, maxRetries: 3 },
          { type: 'stat:job', payload: {}, status: 'completed', priority: 0, scheduledFor: new Date(), attempts: 1, maxRetries: 3 },
          { type: 'stat:job', payload: {}, status: 'completed', priority: 0, scheduledFor: new Date(), attempts: 1, maxRetries: 3 },
          { type: 'stat:job', payload: {}, status: 'failed', priority: 0, scheduledFor: new Date(), attempts: 3, maxRetries: 3 },
        ],
      })

      // Get counts using groupBy
      const counts = await prisma.jobQueue.groupBy({
        by: ['status'],
        where: { type: 'stat:job' },
        _count: { status: true },
      })

      const statusCounts = counts.reduce((acc, curr) => {
        acc[curr.status] = curr._count.status
        return acc
      }, {} as Record<string, number>)

      expect(statusCounts.pending).toBe(2)
      expect(statusCounts.processing).toBe(1)
      expect(statusCounts.completed).toBe(3)
      expect(statusCounts.failed).toBe(1)
    })
  })
})
