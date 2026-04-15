/**
 * Database Queue Provider Unit Tests
 *
 * Tests for the DatabaseQueueService:
 * - Job enqueuing (single and batch)
 * - Job retrieval and cancellation
 * - Job claiming and processing
 * - Job completion and failure handling
 * - Cleanup and stuck job recovery
 *
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

interface JobQueueRecord {
  id: string
  type: string
  payload: string
  status: JobStatus
  priority: number
  attempts: number
  maxRetries: number
  error: string | null
  scheduledFor: Date
  createdAt: Date
  processedAt: Date | null
}

interface EnqueueOptions {
  priority?: number
  delay?: number
  retries?: number
}

interface Job {
  id: string
  type: string
  payload: Record<string, unknown>
  status: JobStatus
  priority: number
  attempts: number
  maxRetries: number
  error: string | null
  scheduledFor: Date
  createdAt: Date
  processedAt: Date | null
}

interface JobCounts {
  pending: number
  processing: number
  completed: number
  failed: number
  cancelled: number
}

// Mock Prisma client
const mockPrisma = {
  jobQueue: {
    create: vi.fn<[{ data: Partial<JobQueueRecord> }], Promise<JobQueueRecord>>(),
    findUnique: vi.fn<[{ where: { id: string } }], Promise<JobQueueRecord | null>>(),
    findMany: vi.fn<[unknown], Promise<JobQueueRecord[]>>(),
    updateMany: vi.fn<[unknown], Promise<{ count: number }>>(),
    update: vi.fn<[unknown], Promise<JobQueueRecord>>(),
    deleteMany: vi.fn<[unknown], Promise<{ count: number }>>(),
    groupBy: vi.fn<[unknown], Promise<Array<{ status: string; _count: { status: number } }>>>(),
  },
}

// DatabaseQueueService implementation
class DatabaseQueueService {
  async enqueue(
    type: string,
    payload: Record<string, unknown>,
    options: EnqueueOptions = {}
  ): Promise<string> {
    const { priority = 0, delay = 0, retries = 3 } = options

    const job = await mockPrisma.jobQueue.create({
      data: {
        type,
        payload: JSON.stringify(payload),
        status: 'pending',
        priority,
        maxRetries: retries,
        scheduledFor: new Date(Date.now() + delay),
      },
    })

    return job.id
  }

  async enqueueBatch(
    jobs: Array<{ type: string; payload: Record<string, unknown>; options?: EnqueueOptions }>
  ): Promise<string[]> {
    const jobIds: string[] = []

    for (const job of jobs) {
      const id = await this.enqueue(job.type, job.payload, job.options)
      jobIds.push(id)
    }

    return jobIds
  }

  async getJob(jobId: string): Promise<Job | null> {
    const job = await mockPrisma.jobQueue.findUnique({
      where: { id: jobId },
    })

    if (!job) return null

    return {
      ...job,
      payload: JSON.parse(job.payload),
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const result = await mockPrisma.jobQueue.updateMany({
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

  async getJobsByStatus(status: JobStatus, limit: number = 100): Promise<Job[]> {
    const jobs = await mockPrisma.jobQueue.findMany({
      where: { status },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    })

    return jobs.map(job => ({
      ...job,
      payload: JSON.parse(job.payload),
    }))
  }

  async getJobCounts(): Promise<JobCounts> {
    const groups = await mockPrisma.jobQueue.groupBy({
      by: ['status'],
      _count: { status: true },
    })

    const counts: JobCounts = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    }

    for (const group of groups) {
      const status = group.status as JobStatus
      if (status in counts) {
        counts[status] = group._count.status
      }
    }

    return counts
  }

  async claimJobs(limit: number = 10): Promise<Job[]> {
    // Find pending jobs ready to process
    const pendingJobs = await mockPrisma.jobQueue.findMany({
      where: {
        status: 'pending',
        scheduledFor: { lte: new Date() },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
      select: { id: true },
    })

    if (pendingJobs.length === 0) return []

    const ids = pendingJobs.map((j: { id: string }) => j.id)

    // Atomically claim the jobs
    await mockPrisma.jobQueue.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'processing',
        attempts: { increment: 1 },
      },
    })

    // Fetch claimed jobs
    const claimedJobs = await mockPrisma.jobQueue.findMany({
      where: { id: { in: ids } },
    })

    return claimedJobs.map(job => ({
      ...job,
      payload: JSON.parse(job.payload),
    }))
  }

  async completeJob(jobId: string): Promise<void> {
    await mockPrisma.jobQueue.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
    })
  }

  async failJob(jobId: string, error: string): Promise<void> {
    const job = await mockPrisma.jobQueue.findUnique({
      where: { id: jobId },
    })

    if (!job) return

    if (job.attempts < job.maxRetries) {
      // Schedule for retry with exponential backoff
      const delay = Math.pow(2, job.attempts) * 1000
      await mockPrisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'pending',
          error,
          scheduledFor: new Date(Date.now() + delay),
        },
      })
    } else {
      // Max retries reached
      await mockPrisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error,
          processedAt: new Date(),
        },
      })
    }
  }

  async cleanup(retentionDays: number = 7): Promise<number> {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)

    const result = await mockPrisma.jobQueue.deleteMany({
      where: {
        status: { in: ['completed', 'failed', 'cancelled'] },
        processedAt: { lt: cutoff },
      },
    })

    return result.count
  }

  async resetStuckJobs(timeoutMinutes: number = 30): Promise<number> {
    const cutoff = new Date()
    cutoff.setMinutes(cutoff.getMinutes() - timeoutMinutes)

    // Find stuck jobs
    const stuckJobs = await mockPrisma.jobQueue.findMany({
      where: {
        status: 'processing',
        createdAt: { lt: cutoff },
      },
    })

    let resetCount = 0

    for (const job of stuckJobs) {
      if (job.attempts < job.maxRetries) {
        await mockPrisma.jobQueue.update({
          where: { id: job.id },
          data: {
            status: 'pending',
            error: 'Job timed out, retrying',
          },
        })
        resetCount++
      } else {
        await mockPrisma.jobQueue.update({
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
}

// Singleton getter
let instance: DatabaseQueueService | null = null

function getDatabaseQueueService(): DatabaseQueueService {
  if (!instance) {
    instance = new DatabaseQueueService()
  }
  return instance
}

describe('DatabaseQueueService', () => {
  let service: DatabaseQueueService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new DatabaseQueueService()
  })

  describe('enqueue', () => {
    it('creates a job with default options', async () => {
      mockPrisma.jobQueue.create.mockResolvedValue({
        id: 'job-123',
        type: 'notification:send',
        payload: '{}',
        status: 'pending',
        priority: 0,
        attempts: 0,
        maxRetries: 3,
        error: null,
        scheduledFor: new Date(),
        createdAt: new Date(),
        processedAt: null,
      })

      const jobId = await service.enqueue('notification:send', {
        userId: 'user-1',
        type: 'CERTIFICATE_APPROVED',
        title: 'Approved',
        message: 'Your certificate was approved',
      })

      expect(jobId).toBe('job-123')
      expect(mockPrisma.jobQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'notification:send',
          status: 'pending',
          priority: 0,
          maxRetries: 3,
        }),
      })
    })

    it('creates a job with custom priority', async () => {
      mockPrisma.jobQueue.create.mockResolvedValue({
        id: 'job-456',
        type: 'email:send',
        payload: '{}',
        status: 'pending',
        priority: 10,
        attempts: 0,
        maxRetries: 3,
        error: null,
        scheduledFor: new Date(),
        createdAt: new Date(),
        processedAt: null,
      })

      await service.enqueue(
        'email:send',
        { to: 'test@test.com', subject: 'Test', template: 'welcome', data: {} },
        { priority: 10 }
      )

      expect(mockPrisma.jobQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 10,
        }),
      })
    })

    it('creates a job with delay', async () => {
      mockPrisma.jobQueue.create.mockResolvedValue({
        id: 'job-789',
        type: 'notification:send',
        payload: '{}',
        status: 'pending',
        priority: 0,
        attempts: 0,
        maxRetries: 3,
        error: null,
        scheduledFor: new Date(Date.now() + 5000),
        createdAt: new Date(),
        processedAt: null,
      })

      await service.enqueue(
        'notification:send',
        { userId: 'user-1', type: 'INFO', title: 'Test', message: 'Delayed' },
        { delay: 5000 }
      )

      expect(mockPrisma.jobQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scheduledFor: expect.any(Date),
        }),
      })
    })

    it('creates a job with custom retries', async () => {
      mockPrisma.jobQueue.create.mockResolvedValue({
        id: 'job-101',
        type: 'notification:send',
        payload: '{}',
        status: 'pending',
        priority: 0,
        attempts: 0,
        maxRetries: 5,
        error: null,
        scheduledFor: new Date(),
        createdAt: new Date(),
        processedAt: null,
      })

      await service.enqueue(
        'notification:send',
        { userId: 'user-1', type: 'INFO', title: 'Test', message: 'Test' },
        { retries: 5 }
      )

      expect(mockPrisma.jobQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          maxRetries: 5,
        }),
      })
    })
  })

  describe('enqueueBatch', () => {
    it('enqueues multiple jobs', async () => {
      mockPrisma.jobQueue.create
        .mockResolvedValueOnce({
          id: 'job-1',
          type: 'notification:send',
          payload: '{}',
          status: 'pending',
          priority: 0,
          attempts: 0,
          maxRetries: 3,
          error: null,
          scheduledFor: new Date(),
          createdAt: new Date(),
          processedAt: null,
        })
        .mockResolvedValueOnce({
          id: 'job-2',
          type: 'notification:send',
          payload: '{}',
          status: 'pending',
          priority: 0,
          attempts: 0,
          maxRetries: 3,
          error: null,
          scheduledFor: new Date(),
          createdAt: new Date(),
          processedAt: null,
        })

      const jobIds = await service.enqueueBatch([
        { type: 'notification:send', payload: { userId: 'user-1', type: 'INFO', title: 'Test 1', message: 'Msg 1' } },
        { type: 'notification:send', payload: { userId: 'user-2', type: 'INFO', title: 'Test 2', message: 'Msg 2' } },
      ])

      expect(jobIds).toEqual(['job-1', 'job-2'])
      expect(mockPrisma.jobQueue.create).toHaveBeenCalledTimes(2)
    })
  })

  describe('getJob', () => {
    it('returns job by ID', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'notification:send',
        payload: '{"userId":"user-1"}',
        status: 'pending' as JobStatus,
        priority: 0,
        attempts: 0,
        maxRetries: 3,
        error: null,
        scheduledFor: new Date(),
        createdAt: new Date(),
        processedAt: null,
      }
      mockPrisma.jobQueue.findUnique.mockResolvedValue(mockJob)

      const job = await service.getJob('job-123')

      expect(job).toBeDefined()
      expect(job?.id).toBe('job-123')
      expect(job?.payload).toEqual({ userId: 'user-1' })
    })

    it('returns null when job not found', async () => {
      mockPrisma.jobQueue.findUnique.mockResolvedValue(null)

      const job = await service.getJob('non-existent')

      expect(job).toBeNull()
    })
  })

  describe('cancelJob', () => {
    it('cancels a pending job', async () => {
      mockPrisma.jobQueue.updateMany.mockResolvedValue({ count: 1 })

      const result = await service.cancelJob('job-123')

      expect(result).toBe(true)
      expect(mockPrisma.jobQueue.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'job-123',
          status: 'pending',
        },
        data: {
          status: 'cancelled',
        },
      })
    })

    it('returns false when job cannot be cancelled', async () => {
      mockPrisma.jobQueue.updateMany.mockResolvedValue({ count: 0 })

      const result = await service.cancelJob('job-456')

      expect(result).toBe(false)
    })
  })

  describe('getJobsByStatus', () => {
    it('returns jobs by status', async () => {
      mockPrisma.jobQueue.findMany.mockResolvedValue([
        {
          id: 'job-1',
          type: 'notification:send',
          payload: '{}',
          status: 'pending' as JobStatus,
          priority: 0,
          attempts: 0,
          maxRetries: 3,
          error: null,
          scheduledFor: new Date(),
          createdAt: new Date(),
          processedAt: null,
        },
        {
          id: 'job-2',
          type: 'email:send',
          payload: '{}',
          status: 'pending' as JobStatus,
          priority: 5,
          attempts: 0,
          maxRetries: 3,
          error: null,
          scheduledFor: new Date(),
          createdAt: new Date(),
          processedAt: null,
        },
      ])

      const jobs = await service.getJobsByStatus('pending')

      expect(jobs).toHaveLength(2)
      expect(mockPrisma.jobQueue.findMany).toHaveBeenCalledWith({
        where: { status: 'pending' },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 100,
      })
    })

    it('respects limit parameter', async () => {
      mockPrisma.jobQueue.findMany.mockResolvedValue([])

      await service.getJobsByStatus('completed', 50)

      expect(mockPrisma.jobQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      )
    })
  })

  describe('getJobCounts', () => {
    it('returns counts by status', async () => {
      mockPrisma.jobQueue.groupBy.mockResolvedValue([
        { status: 'pending', _count: { status: 5 } },
        { status: 'processing', _count: { status: 2 } },
        { status: 'completed', _count: { status: 100 } },
        { status: 'failed', _count: { status: 3 } },
      ])

      const counts = await service.getJobCounts()

      expect(counts).toEqual({
        pending: 5,
        processing: 2,
        completed: 100,
        failed: 3,
        cancelled: 0,
      })
    })
  })

  describe('claimJobs', () => {
    it('claims pending jobs', async () => {
      mockPrisma.jobQueue.findMany
        .mockResolvedValueOnce([{ id: 'job-1' }, { id: 'job-2' }] as JobQueueRecord[])
        .mockResolvedValueOnce([
          {
            id: 'job-1',
            type: 'notification:send',
            payload: '{}',
            status: 'processing' as JobStatus,
            priority: 0,
            attempts: 1,
            maxRetries: 3,
            error: null,
            scheduledFor: new Date(),
            createdAt: new Date(),
            processedAt: null,
          },
          {
            id: 'job-2',
            type: 'email:send',
            payload: '{}',
            status: 'processing' as JobStatus,
            priority: 0,
            attempts: 1,
            maxRetries: 3,
            error: null,
            scheduledFor: new Date(),
            createdAt: new Date(),
            processedAt: null,
          },
        ])
      mockPrisma.jobQueue.updateMany.mockResolvedValue({ count: 2 })

      const jobs = await service.claimJobs(10)

      expect(jobs).toHaveLength(2)
      expect(mockPrisma.jobQueue.updateMany).toHaveBeenCalled()
    })

    it('returns empty array when no jobs to claim', async () => {
      mockPrisma.jobQueue.findMany.mockResolvedValue([])

      const jobs = await service.claimJobs()

      expect(jobs).toEqual([])
      expect(mockPrisma.jobQueue.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('completeJob', () => {
    it('marks job as completed', async () => {
      mockPrisma.jobQueue.update.mockResolvedValue({} as JobQueueRecord)

      await service.completeJob('job-123')

      expect(mockPrisma.jobQueue.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: {
          status: 'completed',
          processedAt: expect.any(Date),
        },
      })
    })
  })

  describe('failJob', () => {
    it('retries job when attempts < maxRetries', async () => {
      mockPrisma.jobQueue.findUnique.mockResolvedValue({
        id: 'job-123',
        type: 'notification:send',
        payload: '{}',
        status: 'processing' as JobStatus,
        priority: 0,
        attempts: 1,
        maxRetries: 3,
        error: null,
        scheduledFor: new Date(),
        createdAt: new Date(),
        processedAt: null,
      })
      mockPrisma.jobQueue.update.mockResolvedValue({} as JobQueueRecord)

      await service.failJob('job-123', 'Worker error')

      expect(mockPrisma.jobQueue.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: {
          status: 'pending',
          error: 'Worker error',
          scheduledFor: expect.any(Date),
        },
      })
    })

    it('marks job as failed when max retries reached', async () => {
      mockPrisma.jobQueue.findUnique.mockResolvedValue({
        id: 'job-123',
        type: 'notification:send',
        payload: '{}',
        status: 'processing' as JobStatus,
        priority: 0,
        attempts: 3,
        maxRetries: 3,
        error: null,
        scheduledFor: new Date(),
        createdAt: new Date(),
        processedAt: null,
      })
      mockPrisma.jobQueue.update.mockResolvedValue({} as JobQueueRecord)

      await service.failJob('job-123', 'Final failure')

      expect(mockPrisma.jobQueue.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: {
          status: 'failed',
          error: 'Final failure',
          processedAt: expect.any(Date),
        },
      })
    })

    it('handles non-existent job', async () => {
      mockPrisma.jobQueue.findUnique.mockResolvedValue(null)

      await service.failJob('non-existent', 'Error')

      expect(mockPrisma.jobQueue.update).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('deletes old completed/failed/cancelled jobs', async () => {
      mockPrisma.jobQueue.deleteMany.mockResolvedValue({ count: 50 })

      const count = await service.cleanup(7)

      expect(count).toBe(50)
      expect(mockPrisma.jobQueue.deleteMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['completed', 'failed', 'cancelled'] },
          processedAt: { lt: expect.any(Date) },
        },
      })
    })

    it('uses default 7 days retention', async () => {
      mockPrisma.jobQueue.deleteMany.mockResolvedValue({ count: 0 })

      await service.cleanup()

      expect(mockPrisma.jobQueue.deleteMany).toHaveBeenCalled()
    })
  })

  describe('resetStuckJobs', () => {
    it('resets stuck jobs with retries remaining', async () => {
      mockPrisma.jobQueue.findMany.mockResolvedValue([
        {
          id: 'stuck-1',
          type: 'notification:send',
          payload: '{}',
          status: 'processing' as JobStatus,
          priority: 0,
          attempts: 1,
          maxRetries: 3,
          error: null,
          scheduledFor: new Date(),
          createdAt: new Date(),
          processedAt: null,
        },
        {
          id: 'stuck-2',
          type: 'email:send',
          payload: '{}',
          status: 'processing' as JobStatus,
          priority: 0,
          attempts: 2,
          maxRetries: 3,
          error: null,
          scheduledFor: new Date(),
          createdAt: new Date(),
          processedAt: null,
        },
      ])
      mockPrisma.jobQueue.update.mockResolvedValue({} as JobQueueRecord)

      const count = await service.resetStuckJobs(30)

      expect(count).toBe(2)
      expect(mockPrisma.jobQueue.update).toHaveBeenCalledTimes(2)
    })

    it('marks as failed when max retries reached', async () => {
      mockPrisma.jobQueue.findMany.mockResolvedValue([
        {
          id: 'stuck-1',
          type: 'notification:send',
          payload: '{}',
          status: 'processing' as JobStatus,
          priority: 0,
          attempts: 3,
          maxRetries: 3,
          error: null,
          scheduledFor: new Date(),
          createdAt: new Date(),
          processedAt: null,
        },
      ])
      mockPrisma.jobQueue.update.mockResolvedValue({} as JobQueueRecord)

      const count = await service.resetStuckJobs()

      expect(count).toBe(0) // Not reset, but failed
      expect(mockPrisma.jobQueue.update).toHaveBeenCalledWith({
        where: { id: 'stuck-1' },
        data: {
          status: 'failed',
          error: 'Job timed out after max retries',
          processedAt: expect.any(Date),
        },
      })
    })
  })
})

describe('getDatabaseQueueService', () => {
  beforeEach(() => {
    // Reset singleton for testing
    instance = null
  })

  it('returns singleton instance', () => {
    const service1 = getDatabaseQueueService()
    const service2 = getDatabaseQueueService()

    expect(service1).toBe(service2)
  })
})
