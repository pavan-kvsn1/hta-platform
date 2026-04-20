/**
 * Service Communication Integration Tests
 *
 * Tests the communication patterns between API and Worker services.
 * Verifies job enqueueing and cross-service data flow.
 *
 * Requires: Redis running on REDIS_URL (default: redis://localhost:6379)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Queue } from 'bullmq'
import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// Check Redis availability at module load time (before test collection)
let isRedisAvailable = false
try {
  const testConnection = new Redis(REDIS_URL, {
    connectTimeout: 2000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  })
  await testConnection.connect()
  await testConnection.ping()
  await testConnection.quit()
  isRedisAvailable = true
} catch {
  console.warn('[Service Communication] Redis not available, skipping tests')
}

describe.skipIf(!isRedisAvailable)('API → Worker Communication', () => {
  let connection: Redis

  beforeAll(async () => {
    connection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
    })
  })

  afterAll(async () => {
    if (connection) {
      await connection.quit()
    }
  })

  describe('Email Job Enqueueing', () => {
    let emailQueue: Queue

    beforeAll(async () => {
      emailQueue = new Queue('email', { connection })
    })

    afterAll(async () => {
      if (emailQueue) {
        // Clean up test jobs
        const jobs = await emailQueue.getJobs(['waiting', 'active', 'delayed'])
        for (const job of jobs) {
          if (job.data?.isTest) {
            await job.remove()
          }
        }
        await emailQueue.close()
      }
    })

    it('should enqueue certificate delivery email', async () => {
      const jobData = {
        type: 'certificate-delivery' as const,
        to: 'customer@test.example.com',
        certificateId: 'test-cert-123',
        tenantId: 'test-tenant',
        customerName: 'Test Customer',
        certificateNumber: 'HTA-2026-0001',
        isTest: true,
      }

      const job = await emailQueue.add('certificate-delivery', jobData, {
        removeOnComplete: true,
        removeOnFail: 100,
      })

      expect(job.id).toBeDefined()
      expect(job.name).toBe('certificate-delivery')

      // Verify job data
      const fetchedJob = await emailQueue.getJob(job.id!)
      expect(fetchedJob?.data.type).toBe('certificate-delivery')
      expect(fetchedJob?.data.certificateId).toBe('test-cert-123')

      // Clean up
      await job.remove()
    })

    it('should enqueue password reset email', async () => {
      const jobData = {
        type: 'password-reset' as const,
        to: 'user@test.example.com',
        resetToken: 'test-reset-token-xyz',
        userName: 'Test User',
        tenantId: 'test-tenant',
        isTest: true,
      }

      const job = await emailQueue.add('password-reset', jobData)

      expect(job.id).toBeDefined()

      const fetchedJob = await emailQueue.getJob(job.id!)
      expect(fetchedJob?.data.type).toBe('password-reset')

      await job.remove()
    })

    it('should handle bulk email enqueueing', async () => {
      const emails = Array.from({ length: 10 }, (_, i) => ({
        name: `bulk-notification-${i}`,
        data: {
          type: 'notification' as const,
          to: `user${i}@test.example.com`,
          subject: `Test Notification ${i}`,
          tenantId: 'test-tenant',
          isTest: true,
        },
      }))

      const jobs = await emailQueue.addBulk(emails)

      expect(jobs.length).toBe(10)
      for (const job of jobs) {
        expect(job.id).toBeDefined()
        await job.remove()
      }
    })
  })

  describe('Notification Job Enqueueing', () => {
    let notificationQueue: Queue

    beforeAll(async () => {
      notificationQueue = new Queue('notifications', { connection })
    })

    afterAll(async () => {
      if (notificationQueue) {
        await notificationQueue.close()
      }
    })

    it('should enqueue certificate approval notification', async () => {
      const jobData = {
        type: 'CERTIFICATE_APPROVED',
        userId: 'test-user-123',
        tenantId: 'test-tenant',
        title: 'Certificate Approved',
        message: 'Certificate HTA-2026-0001 has been approved',
        certificateId: 'test-cert-123',
        isTest: true,
      }

      const job = await notificationQueue.add('certificate-approved', jobData, {
        removeOnComplete: true,
      })

      expect(job.id).toBeDefined()

      const fetchedJob = await notificationQueue.getJob(job.id!)
      expect(fetchedJob?.data.type).toBe('CERTIFICATE_APPROVED')
      expect(fetchedJob?.data.certificateId).toBe('test-cert-123')

      await job.remove()
    })

    it('should enqueue review feedback notification', async () => {
      const jobData = {
        type: 'REVIEW_FEEDBACK_RECEIVED',
        userId: 'test-engineer-123',
        tenantId: 'test-tenant',
        title: 'Review Feedback Received',
        message: 'Reviewer has provided feedback on your certificate',
        certificateId: 'test-cert-456',
        reviewerId: 'test-reviewer-123',
        isTest: true,
      }

      const job = await notificationQueue.add('review-feedback', jobData)

      expect(job.id).toBeDefined()
      await job.remove()
    })
  })

  describe('Cleanup Job Enqueueing', () => {
    let cleanupQueue: Queue

    beforeAll(async () => {
      cleanupQueue = new Queue('cleanup', { connection })
    })

    afterAll(async () => {
      if (cleanupQueue) {
        await cleanupQueue.close()
      }
    })

    it('should enqueue token cleanup job', async () => {
      const jobData = {
        type: 'expired-tokens',
        tenantId: 'test-tenant',
        olderThanDays: 30,
        isTest: true,
      }

      const job = await cleanupQueue.add('token-cleanup', jobData, {
        removeOnComplete: true,
      })

      expect(job.id).toBeDefined()
      await job.remove()
    })

    it('should schedule recurring cleanup', async () => {
      const job = await cleanupQueue.add(
        'scheduled-cleanup',
        { type: 'all', isTest: true },
        {
          repeat: {
            pattern: '0 2 * * *', // Daily at 2 AM
          },
          removeOnComplete: true,
        }
      )

      expect(job.id).toBeDefined()

      // Remove the repeatable job
      const repeatableJobs = await cleanupQueue.getRepeatableJobs()
      for (const rJob of repeatableJobs) {
        if (rJob.name === 'scheduled-cleanup') {
          await cleanupQueue.removeRepeatableByKey(rJob.key)
        }
      }
    })
  })

  describe('Queue Health Checks', () => {
    it('should verify Redis connection', async () => {
      const pong = await connection.ping()
      expect(pong).toBe('PONG')
    })

    it('should get queue metrics', async () => {
      const emailQueue = new Queue('email', { connection })

      const counts = await emailQueue.getJobCounts()
      expect(counts).toHaveProperty('waiting')
      expect(counts).toHaveProperty('active')
      expect(counts).toHaveProperty('completed')
      expect(counts).toHaveProperty('failed')

      await emailQueue.close()
    })

    it('should check if queues are paused', async () => {
      const emailQueue = new Queue('email', { connection })
      const notificationQueue = new Queue('notifications', { connection })

      const [emailPaused, notificationPaused] = await Promise.all([
        emailQueue.isPaused(),
        notificationQueue.isPaused(),
      ])

      expect(emailPaused).toBe(false)
      expect(notificationPaused).toBe(false)

      await emailQueue.close()
      await notificationQueue.close()
    })
  })
})
