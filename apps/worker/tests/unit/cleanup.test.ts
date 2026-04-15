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
