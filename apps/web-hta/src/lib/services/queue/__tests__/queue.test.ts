import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database queue service
const mockQueueService = {
  enqueue: vi.fn(),
  enqueueBatch: vi.fn(),
  getJob: vi.fn(),
  cancelJob: vi.fn(),
  getJobCounts: vi.fn(),
  claimJobs: vi.fn(),
  completeJob: vi.fn(),
  failJob: vi.fn(),
  cleanup: vi.fn(),
  resetStuckJobs: vi.fn(),
}

vi.mock('../providers/database', () => ({
  getDatabaseQueueService: vi.fn(() => mockQueueService),
}))

// Mock workers
vi.mock('../workers/chat.worker', () => ({
  chatWorkers: {
    'chat:send': vi.fn(),
  },
}))

vi.mock('../workers/notification.worker', () => ({
  notificationWorkers: {
    'notification:send': vi.fn(),
  },
}))

vi.mock('../workers/email.worker', () => ({
  emailWorkers: {
    'email:send': vi.fn(),
  },
}))

vi.mock('../workers/realtime.worker', () => ({
  realtimeWorkers: {
    'realtime:broadcast': vi.fn(),
  },
}))

import {
  enqueue,
  enqueueBatch,
  getJob,
  cancelJob,
  getJobCounts,
  processJobs,
  cleanupJobs,
  resetStuckJobs,
} from '../index'

import { chatWorkers } from '../workers/chat.worker'
import { notificationWorkers } from '../workers/notification.worker'

describe('Queue Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('enqueue', () => {
    it('enqueues a notification job', async () => {
      mockQueueService.enqueue.mockResolvedValue('job-123')

      const jobId = await enqueue('notification:send', {
        userId: 'user-1',
        type: 'CERTIFICATE_APPROVED',
        title: 'Approved',
        message: 'Your certificate was approved',
      })

      expect(jobId).toBe('job-123')
      expect(mockQueueService.enqueue).toHaveBeenCalledWith(
        'notification:send',
        {
          userId: 'user-1',
          type: 'CERTIFICATE_APPROVED',
          title: 'Approved',
          message: 'Your certificate was approved',
        },
        undefined
      )
    })

    it('enqueues a job with options', async () => {
      mockQueueService.enqueue.mockResolvedValue('job-456')

      const jobId = await enqueue(
        'email:send',
        {
          to: 'user@test.com',
          subject: 'Test',
          template: 'welcome',
          data: {},
        },
        { priority: 'high', delay: 5000 }
      )

      expect(jobId).toBe('job-456')
      expect(mockQueueService.enqueue).toHaveBeenCalledWith(
        'email:send',
        expect.any(Object),
        { priority: 'high', delay: 5000 }
      )
    })
  })

  describe('enqueueBatch', () => {
    it('enqueues multiple jobs', async () => {
      mockQueueService.enqueueBatch.mockResolvedValue(['job-1', 'job-2'])

      const jobIds = await enqueueBatch([
        { type: 'notification:send', payload: { userId: 'user-1', type: 'INFO', title: 'Test 1', message: 'Msg 1' } },
        { type: 'notification:send', payload: { userId: 'user-2', type: 'INFO', title: 'Test 2', message: 'Msg 2' } },
      ])

      expect(jobIds).toEqual(['job-1', 'job-2'])
      expect(mockQueueService.enqueueBatch).toHaveBeenCalled()
    })
  })

  describe('getJob', () => {
    it('retrieves a job by ID', async () => {
      const mockJob = {
        id: 'job-123',
        type: 'notification:send',
        payload: {},
        status: 'pending',
        createdAt: new Date(),
      }
      mockQueueService.getJob.mockResolvedValue(mockJob)

      const job = await getJob('job-123')

      expect(job).toEqual(mockJob)
      expect(mockQueueService.getJob).toHaveBeenCalledWith('job-123')
    })

    it('returns null for non-existent job', async () => {
      mockQueueService.getJob.mockResolvedValue(null)

      const job = await getJob('non-existent')

      expect(job).toBeNull()
    })
  })

  describe('cancelJob', () => {
    it('cancels a pending job', async () => {
      mockQueueService.cancelJob.mockResolvedValue(true)

      const result = await cancelJob('job-123')

      expect(result).toBe(true)
      expect(mockQueueService.cancelJob).toHaveBeenCalledWith('job-123')
    })

    it('returns false when job cannot be cancelled', async () => {
      mockQueueService.cancelJob.mockResolvedValue(false)

      const result = await cancelJob('job-456')

      expect(result).toBe(false)
    })
  })

  describe('getJobCounts', () => {
    it('returns job counts by status', async () => {
      mockQueueService.getJobCounts.mockResolvedValue({
        pending: 5,
        processing: 2,
        completed: 100,
        failed: 3,
      })

      const counts = await getJobCounts()

      expect(counts).toEqual({
        pending: 5,
        processing: 2,
        completed: 100,
        failed: 3,
      })
    })
  })

  describe('processJobs', () => {
    it('returns early when no jobs to process', async () => {
      mockQueueService.claimJobs.mockResolvedValue([])

      const result = await processJobs()

      expect(result).toEqual({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      })
    })

    it('processes jobs successfully', async () => {
      const mockJobs = [
        { id: 'job-1', type: 'notification:send', payload: { userId: 'user-1' } },
        { id: 'job-2', type: 'chat:send', payload: { threadId: 'thread-1' } },
      ]
      mockQueueService.claimJobs.mockResolvedValue(mockJobs)
      vi.mocked(notificationWorkers['notification:send']).mockResolvedValue(undefined)
      vi.mocked(chatWorkers['chat:send']).mockResolvedValue(undefined)

      const result = await processJobs(10)

      expect(result).toEqual({
        processed: 2,
        succeeded: 2,
        failed: 0,
        errors: [],
      })
      expect(mockQueueService.completeJob).toHaveBeenCalledTimes(2)
    })

    it('handles worker failures', async () => {
      const mockJobs = [
        { id: 'job-1', type: 'notification:send', payload: { userId: 'user-1' } },
      ]
      mockQueueService.claimJobs.mockResolvedValue(mockJobs)
      vi.mocked(notificationWorkers['notification:send']).mockRejectedValue(new Error('Worker failed'))

      const result = await processJobs()

      expect(result).toEqual({
        processed: 1,
        succeeded: 0,
        failed: 1,
        errors: [{ jobId: 'job-1', error: 'Worker failed' }],
      })
      expect(mockQueueService.failJob).toHaveBeenCalledWith('job-1', 'Worker failed')
    })

    it('handles missing worker', async () => {
      const mockJobs = [
        { id: 'job-1', type: 'unknown:type', payload: {} },
      ]
      mockQueueService.claimJobs.mockResolvedValue(mockJobs)

      const result = await processJobs()

      expect(result).toEqual({
        processed: 1,
        succeeded: 0,
        failed: 1,
        errors: [{ jobId: 'job-1', error: 'No worker registered for job type: unknown:type' }],
      })
      expect(mockQueueService.failJob).toHaveBeenCalled()
    })

    it('respects limit parameter', async () => {
      mockQueueService.claimJobs.mockResolvedValue([])

      await processJobs(5)

      expect(mockQueueService.claimJobs).toHaveBeenCalledWith(5)
    })
  })

  describe('cleanupJobs', () => {
    it('cleans up old jobs with default retention', async () => {
      mockQueueService.cleanup.mockResolvedValue(50)

      const count = await cleanupJobs()

      expect(count).toBe(50)
      expect(mockQueueService.cleanup).toHaveBeenCalledWith(7)
    })

    it('cleans up old jobs with custom retention', async () => {
      mockQueueService.cleanup.mockResolvedValue(100)

      const count = await cleanupJobs(30)

      expect(count).toBe(100)
      expect(mockQueueService.cleanup).toHaveBeenCalledWith(30)
    })
  })

  describe('resetStuckJobs', () => {
    it('resets stuck jobs with default timeout', async () => {
      mockQueueService.resetStuckJobs.mockResolvedValue(3)

      const count = await resetStuckJobs()

      expect(count).toBe(3)
      expect(mockQueueService.resetStuckJobs).toHaveBeenCalledWith(30)
    })

    it('resets stuck jobs with custom timeout', async () => {
      mockQueueService.resetStuckJobs.mockResolvedValue(5)

      const count = await resetStuckJobs(60)

      expect(count).toBe(5)
      expect(mockQueueService.resetStuckJobs).toHaveBeenCalledWith(60)
    })
  })
})
