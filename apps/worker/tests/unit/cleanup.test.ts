/**
 * Cleanup Job Tests
 *
 * Tests for cleanup job processing functionality.
 * Mocks Prisma database operations to test business logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job } from 'bullmq'
import type { CleanupJobData } from '../../src/types.js'

// Mock @hta/database
vi.mock('@hta/database', () => ({
  prisma: {
    passwordResetToken: {
      deleteMany: vi.fn(),
    },
    notification: {
      deleteMany: vi.fn(),
    },
    certificateImage: {
      findMany: vi.fn(),
    },
    certificate: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    certificateEvent: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    offlineCodeBatch: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// Import after mocking
import { prisma } from '@hta/database'

// Helper to create mock job
function createMockCleanupJob<T extends CleanupJobData>(
  data: T,
  opts?: { id?: string }
): Job<T> {
  return {
    id: opts?.id || 'test-cleanup-job-id',
    name: 'cleanup',
    data,
    progress: vi.fn(),
    log: vi.fn(),
    updateProgress: vi.fn(),
  } as unknown as Job<T>
}

describe('Cleanup Job Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('expired-tokens cleanup', () => {
    it('should delete expired tokens with default cutoff date', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({ count: 5 })

      const job = createMockCleanupJob({
        type: 'expired-tokens',
      })

      await processCleanupJob(job)

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledTimes(1)
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lt: expect.any(Date) },
        },
      })
    })

    it('should delete expired tokens with custom cutoff date', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      const cutoffDate = new Date('2024-01-01T00:00:00Z')
      vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({ count: 10 })

      const job = createMockCleanupJob({
        type: 'expired-tokens',
        olderThan: cutoffDate,
      })

      await processCleanupJob(job)

      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: { lt: cutoffDate },
        },
      })
    })

    it('should handle zero expired tokens', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({ count: 0 })

      const job = createMockCleanupJob({
        type: 'expired-tokens',
      })

      await expect(processCleanupJob(job)).resolves.not.toThrow()
    })
  })

  describe('expired-sessions cleanup', () => {
    it('should skip session cleanup when no session table exists', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      const job = createMockCleanupJob({
        type: 'expired-sessions',
      })

      // Should not throw and should complete successfully
      await expect(processCleanupJob(job)).resolves.not.toThrow()
    })
  })

  describe('old-notifications cleanup', () => {
    it('should delete old notifications based on days threshold', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 25 })

      const job = createMockCleanupJob({
        type: 'old-notifications',
        olderThanDays: 30,
      })

      await processCleanupJob(job)

      expect(prisma.notification.deleteMany).toHaveBeenCalledTimes(1)
      const callArgs = vi.mocked(prisma.notification.deleteMany).mock.calls[0][0]
      expect(callArgs?.where?.createdAt).toBeDefined()
    })

    it('should only delete read notifications when onlyRead is true', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 15 })

      const job = createMockCleanupJob({
        type: 'old-notifications',
        olderThanDays: 90,
        onlyRead: true,
      })

      await processCleanupJob(job)

      const callArgs = vi.mocked(prisma.notification.deleteMany).mock.calls[0][0]
      expect(callArgs?.where?.read).toBe(true)
    })

    it('should delete all old notifications when onlyRead is false', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 50 })

      const job = createMockCleanupJob({
        type: 'old-notifications',
        olderThanDays: 30,
        onlyRead: false,
      })

      await processCleanupJob(job)

      const callArgs = vi.mocked(prisma.notification.deleteMany).mock.calls[0][0]
      expect(callArgs?.where?.read).toBeUndefined()
    })
  })

  describe('orphaned-files cleanup', () => {
    it('should find referenced images in database', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.certificateImage.findMany).mockResolvedValue([
        {
          id: '1',
          certificateId: 'cert-1',
          storageKey: 'certificates/img1.jpg',
          optimizedKey: 'certificates/img1-opt.jpg',
          thumbnailKey: 'certificates/img1-thumb.jpg',
          imageType: 'BEFORE',
          uploadedAt: new Date(),
          originalFilename: 'img1.jpg',
          mimeType: 'image/jpeg',
          size: 1000,
          isLatest: true,
          version: 1,
        },
      ])

      const job = createMockCleanupJob({
        type: 'orphaned-files',
        dryRun: true,
      })

      await processCleanupJob(job)

      expect(prisma.certificateImage.findMany).toHaveBeenCalledWith({
        where: { isLatest: true },
        select: {
          storageKey: true,
          optimizedKey: true,
          thumbnailKey: true,
        },
      })
    })

    it('should not delete files in dry run mode', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.certificateImage.findMany).mockResolvedValue([])

      const job = createMockCleanupJob({
        type: 'orphaned-files',
        dryRun: true,
      })

      // Should complete without actual deletion
      await expect(processCleanupJob(job)).resolves.not.toThrow()
    })

    it('should handle empty image list', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.certificateImage.findMany).mockResolvedValue([])

      const job = createMockCleanupJob({
        type: 'orphaned-files',
        dryRun: false,
      })

      await expect(processCleanupJob(job)).resolves.not.toThrow()
    })
  })

  describe('unknown cleanup type', () => {
    it('should throw error for unknown cleanup type', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      const job = createMockCleanupJob({
        type: 'unknown-type' as any,
      })

      await expect(processCleanupJob(job)).rejects.toThrow('Unknown cleanup type')
    })
  })

  describe('error handling', () => {
    it('should re-throw database errors', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      const dbError = new Error('Database connection failed')
      vi.mocked(prisma.passwordResetToken.deleteMany).mockRejectedValue(dbError)

      const job = createMockCleanupJob({
        type: 'expired-tokens',
      })

      await expect(processCleanupJob(job)).rejects.toThrow('Database connection failed')
    })
  })

  describe('cleanupExpiredReviews', () => {
    it('should transition expired reviews to CUSTOMER_REVIEW_EXPIRED and queue emails', async () => {
      const { processCleanupJob, setEmailQueue } = await import('../../src/jobs/cleanup.js')

      const mockEmailQueue = { add: vi.fn().mockResolvedValue({}) } as any
      setEmailQueue(mockEmailQueue)

      const mockCerts = [
        {
          id: 'cert-1',
          status: 'PENDING_CUSTOMER_APPROVAL',
          currentRevision: 1,
          certificateNumber: 'HTA-2026-0001',
          customerName: 'Acme Corp',
          uucDescription: 'Pressure Gauge 0-100 PSI',
          reviewer: { id: 'user-r1', email: 'reviewer@example.com', name: 'Jane Reviewer' },
          createdBy: { id: 'user-e1', email: 'engineer@example.com', name: 'Bob Engineer' },
          approvalTokens: [{ customer: { name: 'Alice Customer' } }],
        },
      ]

      vi.mocked(prisma.certificate.findMany).mockResolvedValue(mockCerts as any)
      vi.mocked(prisma.certificateEvent.findFirst).mockResolvedValue({
        sequenceNumber: 3,
      } as any)
      vi.mocked(prisma.$transaction).mockResolvedValue(undefined as any)

      const job = createMockCleanupJob({ type: 'expired-reviews' })
      await processCleanupJob(job)

      expect(prisma.certificate.findMany).toHaveBeenCalledTimes(1)
      expect(prisma.certificate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING_CUSTOMER_APPROVAL',
          }),
        })
      )

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      const txnArgs = vi.mocked(prisma.$transaction).mock.calls[0][0] as any[]
      expect(txnArgs).toHaveLength(2)

      expect(mockEmailQueue.add).toHaveBeenCalledTimes(1)
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'reviewer-customer-expired',
        expect.objectContaining({
          type: 'reviewer-customer-expired',
          to: 'reviewer@example.com',
          reviewerName: 'Jane Reviewer',
          certificateNumber: 'HTA-2026-0001',
          customerName: 'Alice Customer',
          instrumentDescription: 'Pressure Gauge 0-100 PSI',
        }),
        expect.objectContaining({ attempts: 3 })
      )
    })

    it('should return early with zero deleted when no expired reviews exist', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.certificate.findMany).mockResolvedValue([])

      const job = createMockCleanupJob({ type: 'expired-reviews' })
      await expect(processCleanupJob(job)).resolves.not.toThrow()

      expect(prisma.certificate.findMany).toHaveBeenCalledTimes(1)
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('should fall back to createdBy when reviewer is null', async () => {
      const { processCleanupJob, setEmailQueue } = await import('../../src/jobs/cleanup.js')

      const mockEmailQueue = { add: vi.fn().mockResolvedValue({}) } as any
      setEmailQueue(mockEmailQueue)

      const mockCerts = [
        {
          id: 'cert-2',
          status: 'PENDING_CUSTOMER_APPROVAL',
          currentRevision: 1,
          certificateNumber: null,
          customerName: 'Fallback Corp',
          uucDescription: null,
          reviewer: null,
          createdBy: { id: 'user-e2', email: 'engineer2@example.com', name: 'Sam Engineer' },
          approvalTokens: [],
        },
      ]

      vi.mocked(prisma.certificate.findMany).mockResolvedValue(mockCerts as any)
      vi.mocked(prisma.certificateEvent.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.$transaction).mockResolvedValue(undefined as any)

      const job = createMockCleanupJob({ type: 'expired-reviews' })
      await processCleanupJob(job)

      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'reviewer-customer-expired',
        expect.objectContaining({
          to: 'engineer2@example.com',
          reviewerName: 'Sam Engineer',
        }),
        expect.any(Object)
      )
    })

    it('should continue processing remaining certs when one transaction fails', async () => {
      const { processCleanupJob, setEmailQueue } = await import('../../src/jobs/cleanup.js')

      const mockEmailQueue = { add: vi.fn().mockResolvedValue({}) } as any
      setEmailQueue(mockEmailQueue)

      const mockCerts = [
        {
          id: 'cert-fail',
          status: 'PENDING_CUSTOMER_APPROVAL',
          currentRevision: 1,
          certificateNumber: 'HTA-FAIL',
          customerName: 'Fail Corp',
          uucDescription: 'Broken gauge',
          reviewer: { id: 'u1', email: 'r1@example.com', name: 'Rev One' },
          createdBy: { id: 'u2', email: 'e1@example.com', name: 'Eng One' },
          approvalTokens: [],
        },
        {
          id: 'cert-ok',
          status: 'PENDING_CUSTOMER_APPROVAL',
          currentRevision: 2,
          certificateNumber: 'HTA-OK',
          customerName: 'OK Corp',
          uucDescription: 'Good gauge',
          reviewer: { id: 'u3', email: 'r2@example.com', name: 'Rev Two' },
          createdBy: { id: 'u4', email: 'e2@example.com', name: 'Eng Two' },
          approvalTokens: [],
        },
      ]

      vi.mocked(prisma.certificate.findMany).mockResolvedValue(mockCerts as any)
      vi.mocked(prisma.certificateEvent.findFirst).mockResolvedValue(null)
      vi.mocked(prisma.$transaction)
        .mockRejectedValueOnce(new Error('Deadlock'))
        .mockResolvedValueOnce(undefined as any)

      const job = createMockCleanupJob({ type: 'expired-reviews' })

      // Should not throw — individual failures are caught internally
      await expect(processCleanupJob(job)).resolves.not.toThrow()

      // The second cert should still get its email queued
      expect(mockEmailQueue.add).toHaveBeenCalledTimes(1)
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'reviewer-customer-expired',
        expect.objectContaining({ certificateNumber: 'HTA-OK' }),
        expect.any(Object)
      )
    })
  })

  describe('cleanupExpiredOfflineCodes', () => {
    it('should deactivate expired batches and queue notification emails', async () => {
      const { processCleanupJob, setEmailQueue } = await import('../../src/jobs/cleanup.js')

      const mockEmailQueue = { add: vi.fn().mockResolvedValue({}) } as any
      setEmailQueue(mockEmailQueue)

      const mockBatches = [
        {
          id: 'batch-1',
          userId: 'user-1',
          isActive: true,
          expiresAt: new Date('2026-04-01'),
          user: { id: 'user-1', email: 'eng@example.com', name: 'Kelly Engineer' },
        },
      ]

      vi.mocked(prisma.offlineCodeBatch.findMany).mockResolvedValue(mockBatches as any)
      vi.mocked(prisma.offlineCodeBatch.update).mockResolvedValue({} as any)

      const job = createMockCleanupJob({ type: 'offline-codes' })
      await processCleanupJob(job)

      expect(prisma.offlineCodeBatch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            expiresAt: { lt: expect.any(Date) },
          },
        })
      )

      expect(prisma.offlineCodeBatch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: { isActive: false },
      })

      expect(mockEmailQueue.add).toHaveBeenCalledTimes(1)
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'offline-codes-expiry',
        expect.objectContaining({
          type: 'offline-codes-expiry',
          to: 'eng@example.com',
          engineerName: 'Kelly Engineer',
        }),
        expect.objectContaining({ attempts: 3 })
      )
    })

    it('should return early with zero deleted when no expired batches exist', async () => {
      const { processCleanupJob } = await import('../../src/jobs/cleanup.js')

      vi.mocked(prisma.offlineCodeBatch.findMany).mockResolvedValue([])

      const job = createMockCleanupJob({ type: 'offline-codes' })
      await expect(processCleanupJob(job)).resolves.not.toThrow()

      expect(prisma.offlineCodeBatch.findMany).toHaveBeenCalledTimes(1)
      expect(prisma.offlineCodeBatch.update).not.toHaveBeenCalled()
    })

    it('should handle multiple expired batches', async () => {
      const { processCleanupJob, setEmailQueue } = await import('../../src/jobs/cleanup.js')

      const mockEmailQueue = { add: vi.fn().mockResolvedValue({}) } as any
      setEmailQueue(mockEmailQueue)

      const mockBatches = [
        {
          id: 'batch-a',
          userId: 'user-a',
          isActive: true,
          expiresAt: new Date('2026-03-15'),
          user: { id: 'user-a', email: 'eng-a@example.com', name: 'Alice Eng' },
        },
        {
          id: 'batch-b',
          userId: 'user-b',
          isActive: true,
          expiresAt: new Date('2026-04-01'),
          user: { id: 'user-b', email: 'eng-b@example.com', name: 'Bob Eng' },
        },
      ]

      vi.mocked(prisma.offlineCodeBatch.findMany).mockResolvedValue(mockBatches as any)
      vi.mocked(prisma.offlineCodeBatch.update).mockResolvedValue({} as any)

      const job = createMockCleanupJob({ type: 'offline-codes' })
      await processCleanupJob(job)

      expect(prisma.offlineCodeBatch.update).toHaveBeenCalledTimes(2)
      expect(mockEmailQueue.add).toHaveBeenCalledTimes(2)
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'offline-codes-expiry',
        expect.objectContaining({ to: 'eng-a@example.com' }),
        expect.any(Object)
      )
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'offline-codes-expiry',
        expect.objectContaining({ to: 'eng-b@example.com' }),
        expect.any(Object)
      )
    })

    it('should continue processing remaining batches when one update fails', async () => {
      const { processCleanupJob, setEmailQueue } = await import('../../src/jobs/cleanup.js')

      const mockEmailQueue = { add: vi.fn().mockResolvedValue({}) } as any
      setEmailQueue(mockEmailQueue)

      const mockBatches = [
        {
          id: 'batch-fail',
          userId: 'user-x',
          isActive: true,
          expiresAt: new Date('2026-03-01'),
          user: { id: 'user-x', email: 'fail@example.com', name: 'Fail Eng' },
        },
        {
          id: 'batch-ok',
          userId: 'user-y',
          isActive: true,
          expiresAt: new Date('2026-03-15'),
          user: { id: 'user-y', email: 'ok@example.com', name: 'OK Eng' },
        },
      ]

      vi.mocked(prisma.offlineCodeBatch.findMany).mockResolvedValue(mockBatches as any)
      vi.mocked(prisma.offlineCodeBatch.update)
        .mockRejectedValueOnce(new Error('Write conflict'))
        .mockResolvedValueOnce({} as any)

      const job = createMockCleanupJob({ type: 'offline-codes' })

      // Should not throw — individual failures are caught internally
      await expect(processCleanupJob(job)).resolves.not.toThrow()

      // The second batch should still get its email queued
      expect(mockEmailQueue.add).toHaveBeenCalledTimes(1)
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'offline-codes-expiry',
        expect.objectContaining({ to: 'ok@example.com' }),
        expect.any(Object)
      )
    })
  })
})

describe('Scheduled Cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should run all cleanup tasks', async () => {
    const { runScheduledCleanup } = await import('../../src/jobs/cleanup.js')

    vi.mocked(prisma.passwordResetToken.deleteMany).mockResolvedValue({ count: 3 })
    vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 10 })

    await runScheduledCleanup()

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled()
    expect(prisma.notification.deleteMany).toHaveBeenCalled()
  })

  it('should continue even if one task fails', async () => {
    const { runScheduledCleanup } = await import('../../src/jobs/cleanup.js')

    vi.mocked(prisma.passwordResetToken.deleteMany).mockRejectedValue(new Error('Token cleanup failed'))
    vi.mocked(prisma.notification.deleteMany).mockResolvedValue({ count: 5 })

    // Should not throw - uses Promise.allSettled
    await expect(runScheduledCleanup()).resolves.not.toThrow()
  })
})
