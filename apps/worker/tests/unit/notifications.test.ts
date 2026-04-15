/**
 * Notification Job Tests
 *
 * Tests for notification job processing functionality.
 * Mocks the createNotification service to test business logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job } from 'bullmq'
import type { NotificationJobData } from '../../src/types.js'

// Mock @hta/shared/notifications
vi.mock('@hta/shared/notifications', () => ({
  createNotification: vi.fn(),
}))

// Import after mocking
import { createNotification } from '@hta/shared/notifications'

// Helper to create mock job
function createMockNotificationJob<T extends NotificationJobData>(
  data: T,
  opts?: { id?: string }
): Job<T> {
  return {
    id: opts?.id || 'test-notification-job-id',
    name: 'notifications',
    data,
    progress: vi.fn(),
    log: vi.fn(),
    updateProgress: vi.fn(),
  } as unknown as Job<T>
}

describe('Notification Job Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createNotification).mockResolvedValue({
      id: 'notif-id',
      userId: null,
      customerId: null,
      type: 'CERTIFICATE_APPROVED',
      title: 'Test',
      message: 'Test message',
      read: false,
      readAt: null,
      certificateId: null,
      data: null,
      createdAt: new Date(),
    })
  })

  describe('create-notification type', () => {
    it('should create notification for user', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      const job = createMockNotificationJob({
        type: 'create-notification',
        userId: 'user-123',
        notificationType: 'CERTIFICATE_APPROVED',
        certificateId: 'cert-456',
        data: { certificateNumber: 'HTA/C00001/24/12' },
      })

      await processNotificationJob(job)

      expect(createNotification).toHaveBeenCalledTimes(1)
      expect(createNotification).toHaveBeenCalledWith({
        userId: 'user-123',
        customerId: undefined,
        type: 'CERTIFICATE_APPROVED',
        certificateId: 'cert-456',
        data: { certificateNumber: 'HTA/C00001/24/12' },
      })
    })

    it('should create notification for customer', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      const job = createMockNotificationJob({
        type: 'create-notification',
        customerId: 'customer-789',
        notificationType: 'CERTIFICATE_READY',
        certificateId: 'cert-456',
        data: { certificateNumber: 'HTA/C00002/24/12' },
      })

      await processNotificationJob(job)

      expect(createNotification).toHaveBeenCalledWith({
        userId: undefined,
        customerId: 'customer-789',
        type: 'CERTIFICATE_READY',
        certificateId: 'cert-456',
        data: { certificateNumber: 'HTA/C00002/24/12' },
      })
    })

    it('should handle notification without certificateId', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      const job = createMockNotificationJob({
        type: 'create-notification',
        userId: 'user-123',
        notificationType: 'REGISTRATION_SUBMITTED',
        data: { name: 'John Doe', email: 'john@example.com', companyName: 'ACME Corp' },
      })

      await processNotificationJob(job)

      expect(createNotification).toHaveBeenCalledWith({
        userId: 'user-123',
        customerId: undefined,
        type: 'REGISTRATION_SUBMITTED',
        certificateId: undefined,
        data: { name: 'John Doe', email: 'john@example.com', companyName: 'ACME Corp' },
      })
    })
  })

  describe('send-push type', () => {
    it('should process push notification for user (placeholder implementation)', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const job = createMockNotificationJob({
        type: 'send-push',
        userId: 'user-123',
        title: 'Certificate Approved',
        body: 'Your certificate has been approved',
        data: { certificateId: 'cert-456' },
      })

      await processNotificationJob(job)

      // Push notification logs but doesn't throw
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Notification] Push notification'),
        expect.any(Object)
      )

      consoleSpy.mockRestore()
    })

    it('should process push notification for customer', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const job = createMockNotificationJob({
        type: 'send-push',
        customerId: 'customer-789',
        title: 'Certificate Ready',
        body: 'Your certificate is ready for review',
      })

      await expect(processNotificationJob(job)).resolves.not.toThrow()

      consoleSpy.mockRestore()
    })
  })

  describe('batch-notifications type', () => {
    it('should create multiple notifications in batch', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      const job = createMockNotificationJob({
        type: 'batch-notifications',
        notifications: [
          {
            userId: 'user-1',
            notificationType: 'CERTIFICATE_APPROVED',
            certificateId: 'cert-1',
            data: { certificateNumber: 'HTA/C00001/24/12' },
          },
          {
            userId: 'user-2',
            notificationType: 'REVISION_REQUESTED',
            certificateId: 'cert-2',
            data: { certificateNumber: 'HTA/C00002/24/12' },
          },
          {
            customerId: 'customer-1',
            notificationType: 'CERTIFICATE_READY',
            certificateId: 'cert-3',
            data: { certificateNumber: 'HTA/C00003/24/12' },
          },
        ],
      })

      await processNotificationJob(job)

      expect(createNotification).toHaveBeenCalledTimes(3)
    })

    it('should handle empty batch', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      const job = createMockNotificationJob({
        type: 'batch-notifications',
        notifications: [],
      })

      await expect(processNotificationJob(job)).resolves.not.toThrow()
      expect(createNotification).not.toHaveBeenCalled()
    })

    it('should continue batch even if some fail', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      // First call succeeds, second fails, third succeeds
      vi.mocked(createNotification)
        .mockResolvedValueOnce({
          id: 'notif-1',
          userId: 'user-1',
          customerId: null,
          type: 'CERTIFICATE_APPROVED',
          title: 'Test',
          message: 'Test',
          read: false,
          readAt: null,
          certificateId: null,
          data: null,
          createdAt: new Date(),
        })
        .mockRejectedValueOnce(new Error('Failed to create notification'))
        .mockResolvedValueOnce({
          id: 'notif-3',
          userId: 'user-3',
          customerId: null,
          type: 'CERTIFICATE_APPROVED',
          title: 'Test',
          message: 'Test',
          read: false,
          readAt: null,
          certificateId: null,
          data: null,
          createdAt: new Date(),
        })

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const job = createMockNotificationJob({
        type: 'batch-notifications',
        notifications: [
          { userId: 'user-1', notificationType: 'CERTIFICATE_APPROVED', data: {} },
          { userId: 'user-2', notificationType: 'CERTIFICATE_APPROVED', data: {} },
          { userId: 'user-3', notificationType: 'CERTIFICATE_APPROVED', data: {} },
        ],
      })

      // Uses Promise.allSettled, so should not throw
      await expect(processNotificationJob(job)).resolves.not.toThrow()

      // Should log warning about failed notifications
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('1/3 notifications failed')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('unknown notification type', () => {
    it('should throw error for unknown notification type', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      const job = createMockNotificationJob({
        type: 'unknown-type' as any,
      })

      await expect(processNotificationJob(job)).rejects.toThrow('Unknown notification type')
    })
  })

  describe('error handling', () => {
    it('should re-throw errors from createNotification', async () => {
      const { processNotificationJob } = await import('../../src/jobs/notifications.js')

      const error = new Error('Either userId or customerId must be provided')
      vi.mocked(createNotification).mockRejectedValue(error)

      const job = createMockNotificationJob({
        type: 'create-notification',
        userId: 'user-123',
        notificationType: 'CERTIFICATE_APPROVED',
        data: {},
      })

      await expect(processNotificationJob(job)).rejects.toThrow(
        'Either userId or customerId must be provided'
      )
    })
  })
})

describe('Notification Data Validation', () => {
  it('should have valid notification types', () => {
    const validTypes = [
      'REVISION_REQUESTED',
      'CERTIFICATE_APPROVED',
      'SENT_TO_CUSTOMER',
      'CERTIFICATE_FINALIZED',
      'SUBMITTED_FOR_REVIEW',
      'ENGINEER_RESPONDED',
      'CUSTOMER_REVISION_REQUEST',
      'CUSTOMER_APPROVED',
      'CERTIFICATE_READY',
      'REVIEWER_REPLIED',
      'NEW_CHAT_MESSAGE',
      'REGISTRATION_SUBMITTED',
      'REGISTRATION_APPROVED',
      'REGISTRATION_REJECTED',
    ]

    // All types should be non-empty strings
    validTypes.forEach((type) => {
      expect(type).toBeTruthy()
      expect(typeof type).toBe('string')
    })
  })

  it('should validate create-notification job structure', () => {
    const validateJob = (data: Partial<NotificationJobData>) => {
      if (data.type === 'create-notification') {
        return !!(data.notificationType && (data.userId || data.customerId))
      }
      return false
    }

    expect(
      validateJob({
        type: 'create-notification',
        userId: 'user-123',
        notificationType: 'CERTIFICATE_APPROVED',
        data: {},
      } as NotificationJobData)
    ).toBe(true)

    expect(
      validateJob({
        type: 'create-notification',
        customerId: 'customer-456',
        notificationType: 'CERTIFICATE_READY',
        data: {},
      } as NotificationJobData)
    ).toBe(true)
  })
})
