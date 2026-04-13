import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    jobQueue: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { DatabaseQueueService, getDatabaseQueueService } from '../database'

describe('DatabaseQueueService', () => {
  let service: DatabaseQueueService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new DatabaseQueueService()
  })

  describe('enqueue', () => {
    it('creates a job with default options', async () => {
      vi.mocked(prisma.jobQueue.create).mockResolvedValue({
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
      expect(prisma.jobQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'notification:send',
          status: 'pending',
          priority: 0,
          maxRetries: 3,
        }),
      })
    })

    it('creates a job with custom priority', async () => {
      vi.mocked(prisma.jobQueue.create).mockResolvedValue({
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

      expect(prisma.jobQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: 10,
        }),
      })
    })

    it('creates a job with delay', async () => {
      vi.mocked(prisma.jobQueue.create).mockResolvedValue({
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

      expect(prisma.jobQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scheduledFor: expect.any(Date),
        }),
      })
    })

    it('creates a job with custom retries', async () => {
      vi.mocked(prisma.jobQueue.create).mockResolvedValue({
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

      expect(prisma.jobQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          maxRetries: 5,
        }),
      })
    })
  })

  describe('enqueueBatch', () => {
    it('enqueues multiple jobs', async () => {
      vi.mocked(prisma.jobQueue.create)
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
      expect(prisma.jobQueue.create).toHaveBeenCalledTimes(2)
    })
  })

  describe('getJob', () => {
    it('returns job by ID', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'notification:send',
        payload: '{"userId":"user-1"}',
        status: 'pending',
        priority: 0,
        attempts: 0,
        maxRetries: 3,
        error: null,
        scheduledFor: new Date(),
        createdAt: new Date(),
        processedAt: null,
      }
      vi.mocked(prisma.jobQueue.findUnique).mockResolvedValue(mockJob)

      const job = await service.getJob('job-123')

      expect(job).toBeDefined()
      expect(job?.id).toBe('job-123')
      expect(job?.payload).toEqual({ userId: 'user-1' })
    })

    it('returns null when job not found', async () => {
      vi.mocked(prisma.jobQueue.findUnique).mockResolvedValue(null)

      const job = await service.getJob('non-existent')

      expect(job).toBeNull()
    })
  })

  describe('cancelJob', () => {
    it('cancels a pending job', async () => {
      vi.mocked(prisma.jobQueue.updateMany).mockResolvedValue({ count: 1 })

      const result = await service.cancelJob('job-123')

      expect(result).toBe(true)
      expect(prisma.jobQueue.updateMany).toHaveBeenCalledWith({
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
      vi.mocked(prisma.jobQueue.updateMany).mockResolvedValue({ count: 0 })

      const result = await service.cancelJob('job-456')

      expect(result).toBe(false)
    })
  })

  describe('getJobsByStatus', () => {
    it('returns jobs by status', async () => {
      vi.mocked(prisma.jobQueue.findMany).mockResolvedValue([
        {
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
        },
        {
          id: 'job-2',
          type: 'email:send',
          payload: '{}',
          status: 'pending',
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
      expect(prisma.jobQueue.findMany).toHaveBeenCalledWith({
        where: { status: 'pending' },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 100,
      })
    })

    it('respects limit parameter', async () => {
      vi.mocked(prisma.jobQueue.findMany).mockResolvedValue([])

      await service.getJobsByStatus('completed', 50)

      expect(prisma.jobQueue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      )
    })
  })

  describe('getJobCounts', () => {
    it('returns counts by status', async () => {
      vi.mocked(prisma.jobQueue.groupBy).mockResolvedValue([
        { status: 'pending', _count: { status: 5 } },
        { status: 'processing', _count: { status: 2 } },
        { status: 'completed', _count: { status: 100 } },
        { status: 'failed', _count: { status: 3 } },
      ] as any)

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
      vi.mocked(prisma.jobQueue.findMany)
        .mockResolvedValueOnce([{ id: 'job-1' }, { id: 'job-2' }] as any)
        .mockResolvedValueOnce([
          {
            id: 'job-1',
            type: 'notification:send',
            payload: '{}',
            status: 'processing',
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
            status: 'processing',
            priority: 0,
            attempts: 1,
            maxRetries: 3,
            error: null,
            scheduledFor: new Date(),
            createdAt: new Date(),
            processedAt: null,
          },
        ])
      vi.mocked(prisma.jobQueue.updateMany).mockResolvedValue({ count: 2 })

      const jobs = await service.claimJobs(10)

      expect(jobs).toHaveLength(2)
      expect(prisma.jobQueue.updateMany).toHaveBeenCalled()
    })

    it('returns empty array when no jobs to claim', async () => {
      vi.mocked(prisma.jobQueue.findMany).mockResolvedValue([])

      const jobs = await service.claimJobs()

      expect(jobs).toEqual([])
      expect(prisma.jobQueue.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('completeJob', () => {
    it('marks job as completed', async () => {
      vi.mocked(prisma.jobQueue.update).mockResolvedValue({} as any)

      await service.completeJob('job-123')

      expect(prisma.jobQueue.update).toHaveBeenCalledWith({
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
      vi.mocked(prisma.jobQueue.findUnique).mockResolvedValue({
        id: 'job-123',
        attempts: 1,
        maxRetries: 3,
      } as any)
      vi.mocked(prisma.jobQueue.update).mockResolvedValue({} as any)

      await service.failJob('job-123', 'Worker error')

      expect(prisma.jobQueue.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: {
          status: 'pending',
          error: 'Worker error',
          scheduledFor: expect.any(Date),
        },
      })
    })

    it('marks job as failed when max retries reached', async () => {
      vi.mocked(prisma.jobQueue.findUnique).mockResolvedValue({
        id: 'job-123',
        attempts: 3,
        maxRetries: 3,
      } as any)
      vi.mocked(prisma.jobQueue.update).mockResolvedValue({} as any)

      await service.failJob('job-123', 'Final failure')

      expect(prisma.jobQueue.update).toHaveBeenCalledWith({
        where: { id: 'job-123' },
        data: {
          status: 'failed',
          error: 'Final failure',
          processedAt: expect.any(Date),
        },
      })
    })

    it('handles non-existent job', async () => {
      vi.mocked(prisma.jobQueue.findUnique).mockResolvedValue(null)

      await service.failJob('non-existent', 'Error')

      expect(prisma.jobQueue.update).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('deletes old completed/failed/cancelled jobs', async () => {
      vi.mocked(prisma.jobQueue.deleteMany).mockResolvedValue({ count: 50 })

      const count = await service.cleanup(7)

      expect(count).toBe(50)
      expect(prisma.jobQueue.deleteMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['completed', 'failed', 'cancelled'] },
          processedAt: { lt: expect.any(Date) },
        },
      })
    })

    it('uses default 7 days retention', async () => {
      vi.mocked(prisma.jobQueue.deleteMany).mockResolvedValue({ count: 0 })

      await service.cleanup()

      expect(prisma.jobQueue.deleteMany).toHaveBeenCalled()
    })
  })

  describe('resetStuckJobs', () => {
    it('resets stuck jobs with retries remaining', async () => {
      vi.mocked(prisma.jobQueue.findMany).mockResolvedValue([
        { id: 'stuck-1', attempts: 1, maxRetries: 3 },
        { id: 'stuck-2', attempts: 2, maxRetries: 3 },
      ] as any)
      vi.mocked(prisma.jobQueue.update).mockResolvedValue({} as any)

      const count = await service.resetStuckJobs(30)

      expect(count).toBe(2)
      expect(prisma.jobQueue.update).toHaveBeenCalledTimes(2)
    })

    it('marks as failed when max retries reached', async () => {
      vi.mocked(prisma.jobQueue.findMany).mockResolvedValue([
        { id: 'stuck-1', attempts: 3, maxRetries: 3 },
      ] as any)
      vi.mocked(prisma.jobQueue.update).mockResolvedValue({} as any)

      const count = await service.resetStuckJobs()

      expect(count).toBe(0) // Not reset, but failed
      expect(prisma.jobQueue.update).toHaveBeenCalledWith({
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
  it('returns singleton instance', () => {
    const service1 = getDatabaseQueueService()
    const service2 = getDatabaseQueueService()

    expect(service1).toBe(service2)
  })
})
