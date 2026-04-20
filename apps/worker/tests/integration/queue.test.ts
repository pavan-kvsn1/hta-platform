/**
 * Queue Integration Tests
 *
 * Tests BullMQ queue operations with real Redis connection.
 * Verifies inter-service communication between API and Worker.
 *
 * Requires: Redis running on REDIS_URL (default: redis://localhost:6379)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Queue, Worker, Job } from 'bullmq'
import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const TEST_QUEUE_PREFIX = 'test-integration'

describe('Queue Integration', () => {
  let connection: Redis
  let isRedisAvailable = false

  beforeAll(async () => {
    try {
      connection = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        connectTimeout: 5000,
      })
      await connection.ping()
      isRedisAvailable = true
      console.log('[Queue Integration] Redis connected')
    } catch (error) {
      console.warn('[Queue Integration] Redis not available, skipping tests')
      isRedisAvailable = false
    }
  })

  afterAll(async () => {
    if (connection) {
      await connection.quit()
    }
  })

  describe('Email Queue', () => {
    let emailQueue: Queue
    let emailWorker: Worker
    const queueName = `${TEST_QUEUE_PREFIX}-email-${Date.now()}`

    beforeAll(async () => {
      if (!isRedisAvailable) return

      emailQueue = new Queue(queueName, { connection })
    })

    afterAll(async () => {
      if (emailQueue) {
        await emailQueue.obliterate({ force: true })
        await emailQueue.close()
      }
      if (emailWorker) {
        await emailWorker.close()
      }
    })

    it.skipIf(!isRedisAvailable)('should enqueue and process email job', async () => {
      const processedJobs: Array<{ id: string; data: any }> = []

      // Create worker
      emailWorker = new Worker(
        queueName,
        async (job: Job) => {
          processedJobs.push({ id: job.id!, data: job.data })
          return { sent: true }
        },
        { connection }
      )

      // Enqueue job
      const job = await emailQueue.add('send-certificate', {
        type: 'certificate-delivery',
        to: 'customer@example.com',
        certificateId: 'cert-123',
        tenantId: 'tenant-abc',
      })

      expect(job.id).toBeDefined()

      // Wait for processing
      await new Promise((resolve) => {
        emailWorker.on('completed', resolve)
        setTimeout(resolve, 3000) // Timeout fallback
      })

      // Verify job was processed
      expect(processedJobs.length).toBe(1)
      expect(processedJobs[0].data.to).toBe('customer@example.com')
      expect(processedJobs[0].data.certificateId).toBe('cert-123')
    })

    it.skipIf(!isRedisAvailable)('should handle job failure and retry', async () => {
      const failQueue = new Queue(`${TEST_QUEUE_PREFIX}-fail-${Date.now()}`, { connection })
      let attempts = 0

      const failWorker = new Worker(
        failQueue.name,
        async () => {
          attempts++
          if (attempts < 2) {
            throw new Error('Simulated failure')
          }
          return { success: true }
        },
        {
          connection,
          settings: {
            backoffStrategy: () => 100, // Fast retry for testing
          },
        }
      )

      const job = await failQueue.add(
        'retry-test',
        { test: true },
        { attempts: 3, backoff: { type: 'fixed', delay: 100 } }
      )

      // Wait for retries
      await new Promise((resolve) => {
        failWorker.on('completed', resolve)
        setTimeout(resolve, 5000)
      })

      expect(attempts).toBeGreaterThanOrEqual(2)

      await failWorker.close()
      await failQueue.obliterate({ force: true })
      await failQueue.close()
    })

    it.skipIf(!isRedisAvailable)('should respect rate limiting', async () => {
      const rateLimitQueue = new Queue(`${TEST_QUEUE_PREFIX}-ratelimit-${Date.now()}`, {
        connection,
      })

      const processedTimes: number[] = []

      const rateLimitWorker = new Worker(
        rateLimitQueue.name,
        async () => {
          processedTimes.push(Date.now())
          return { ok: true }
        },
        {
          connection,
          concurrency: 1,
          limiter: {
            max: 2,
            duration: 1000, // 2 jobs per second
          },
        }
      )

      // Add 4 jobs
      await Promise.all([
        rateLimitQueue.add('job1', {}),
        rateLimitQueue.add('job2', {}),
        rateLimitQueue.add('job3', {}),
        rateLimitQueue.add('job4', {}),
      ])

      // Wait for all to complete
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Should have processed all 4
      expect(processedTimes.length).toBe(4)

      // Rate limiting should have spread them out
      if (processedTimes.length >= 4) {
        const totalDuration = processedTimes[3] - processedTimes[0]
        expect(totalDuration).toBeGreaterThan(500) // At least some delay
      }

      await rateLimitWorker.close()
      await rateLimitQueue.obliterate({ force: true })
      await rateLimitQueue.close()
    })
  })

  describe('Notification Queue', () => {
    let notificationQueue: Queue
    const queueName = `${TEST_QUEUE_PREFIX}-notifications-${Date.now()}`

    beforeAll(async () => {
      if (!isRedisAvailable) return
      notificationQueue = new Queue(queueName, { connection })
    })

    afterAll(async () => {
      if (notificationQueue) {
        await notificationQueue.obliterate({ force: true })
        await notificationQueue.close()
      }
    })

    it.skipIf(!isRedisAvailable)('should enqueue notification with correct structure', async () => {
      const job = await notificationQueue.add('in-app-notification', {
        type: 'CERTIFICATE_APPROVED',
        userId: 'user-123',
        tenantId: 'tenant-abc',
        title: 'Certificate Approved',
        message: 'Your certificate has been approved',
        certificateId: 'cert-456',
      })

      expect(job.id).toBeDefined()

      const fetchedJob = await notificationQueue.getJob(job.id!)
      expect(fetchedJob).toBeDefined()
      expect(fetchedJob?.data.type).toBe('CERTIFICATE_APPROVED')
      expect(fetchedJob?.data.userId).toBe('user-123')
    })

    it.skipIf(!isRedisAvailable)('should process notifications with high concurrency', async () => {
      const processedCount = { value: 0 }

      const notificationWorker = new Worker(
        notificationQueue.name,
        async () => {
          processedCount.value++
          return { delivered: true }
        },
        {
          connection,
          concurrency: 10, // High concurrency for notifications
        }
      )

      // Add 20 notifications
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          notificationQueue.add(`notification-${i}`, {
            type: 'TEST_NOTIFICATION',
            userId: `user-${i}`,
            message: `Test message ${i}`,
          })
        )
      )

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 2000))

      expect(processedCount.value).toBe(20)

      await notificationWorker.close()
    })
  })

  describe('Queue Metrics', () => {
    let metricsQueue: Queue
    const queueName = `${TEST_QUEUE_PREFIX}-metrics-${Date.now()}`

    beforeAll(async () => {
      if (!isRedisAvailable) return
      metricsQueue = new Queue(queueName, { connection })
    })

    afterAll(async () => {
      if (metricsQueue) {
        await metricsQueue.obliterate({ force: true })
        await metricsQueue.close()
      }
    })

    it.skipIf(!isRedisAvailable)('should track job counts by status', async () => {
      // Add some jobs
      await metricsQueue.add('waiting-job-1', {})
      await metricsQueue.add('waiting-job-2', {})

      const counts = await metricsQueue.getJobCounts()

      expect(counts.waiting).toBeGreaterThanOrEqual(2)
    })

    it.skipIf(!isRedisAvailable)('should provide queue health metrics', async () => {
      const isPaused = await metricsQueue.isPaused()
      expect(isPaused).toBe(false)

      const workers = await metricsQueue.getWorkers()
      expect(Array.isArray(workers)).toBe(true)
    })
  })
})
