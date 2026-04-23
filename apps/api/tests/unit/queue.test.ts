/**
 * Queue Service Unit Tests
 *
 * Tests the queue client service that connects the API to the worker's
 * BullMQ queues. Mocks Redis and BullMQ to test enqueue logic,
 * graceful degradation when REDIS_URL is unset, and retry configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock BullMQ Queue
const mockAdd = vi.fn().mockResolvedValue({ id: 'job-1' })
const mockClose = vi.fn().mockResolvedValue(undefined)
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    close: mockClose,
  })),
}))

// Mock ioredis
const mockDisconnect = vi.fn()
const mockOn = vi.fn()
vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    disconnect: mockDisconnect,
    on: mockOn,
  })),
}))

describe('Queue Service', () => {
  let originalRedisUrl: string | undefined

  beforeEach(() => {
    originalRedisUrl = process.env.REDIS_URL
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalRedisUrl !== undefined) {
      process.env.REDIS_URL = originalRedisUrl
    } else {
      delete process.env.REDIS_URL
    }
    // Reset module cache so each test gets a fresh module
    vi.resetModules()
  })

  describe('enqueueEmail', () => {
    it('should queue an email job with correct data and retry config', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { enqueueEmail } = await import('../../src/services/queue.js')

      await enqueueEmail({
        type: 'password-reset',
        to: 'user@test.com',
        userName: 'Test User',
        resetUrl: 'https://app.test.com/reset?token=abc',
        expiryMinutes: 60,
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'password-reset',
        {
          type: 'password-reset',
          to: 'user@test.com',
          userName: 'Test User',
          resetUrl: 'https://app.test.com/reset?token=abc',
          expiryMinutes: 60,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      )
    })

    it('should no-op gracefully when REDIS_URL is not set', async () => {
      process.env.REDIS_URL = ''
      const { enqueueEmail } = await import('../../src/services/queue.js')

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await enqueueEmail({
        type: 'staff-activation',
        to: 'new@test.com',
        userName: 'New User',
        activationUrl: 'https://app.test.com/activate?token=xyz',
      })

      expect(mockAdd).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Email not queued (no REDIS_URL)')
      )
      consoleSpy.mockRestore()
    })

    it('should queue all 6 email types', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { enqueueEmail } = await import('../../src/services/queue.js')

      const emailTypes = [
        { type: 'password-reset' as const, to: 'a@t.com', userName: 'A', resetUrl: 'url' },
        { type: 'staff-activation' as const, to: 'b@t.com', userName: 'B', activationUrl: 'url' },
        { type: 'certificate-submitted' as const, to: 'c@t.com', reviewerName: 'R', certificateNumber: 'C1', assigneeName: 'E', dashboardUrl: 'url' },
        { type: 'certificate-reviewed' as const, to: 'd@t.com', assigneeName: 'E', certificateNumber: 'C2', reviewerName: 'R', approved: true, dashboardUrl: 'url' },
        { type: 'customer-approval' as const, to: 'e@t.com', recipientName: 'S', certificateNumber: 'C3', customerName: 'Cust', approverName: 'App', status: 'approved' as const, dashboardUrl: 'url' },
        { type: 'customer-review' as const, to: 'f@t.com', customerName: 'C', certificateNumber: 'C4', instrumentDescription: 'DMM', reviewUrl: 'url' },
      ]

      for (const data of emailTypes) {
        await enqueueEmail(data)
      }

      expect(mockAdd).toHaveBeenCalledTimes(6)
    })
  })

  describe('enqueueNotification', () => {
    it('should queue a notification job', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { enqueueNotification } = await import('../../src/services/queue.js')

      await enqueueNotification({
        type: 'create-notification',
        userId: 'user-123',
        notificationType: 'CERTIFICATE_APPROVED',
        certificateId: 'cert-456',
        data: { certificateNumber: 'HTA/CAL/001' },
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'create-notification',
        {
          type: 'create-notification',
          userId: 'user-123',
          notificationType: 'CERTIFICATE_APPROVED',
          certificateId: 'cert-456',
          data: { certificateNumber: 'HTA/CAL/001' },
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 3000 },
        }
      )
    })

    it('should no-op gracefully when REDIS_URL is not set', async () => {
      process.env.REDIS_URL = ''
      const { enqueueNotification } = await import('../../src/services/queue.js')

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await enqueueNotification({
        type: 'create-notification',
        userId: 'user-123',
        notificationType: 'PASSWORD_CHANGED',
        data: {},
      })

      expect(mockAdd).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Notification not queued (no REDIS_URL)')
      )
      consoleSpy.mockRestore()
    })
  })

  describe('Convenience helpers', () => {
    it('queuePasswordResetEmail builds correct URL for staff', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.APP_URL = 'https://app.hta.com'
      const { queuePasswordResetEmail } = await import('../../src/services/queue.js')

      await queuePasswordResetEmail({
        to: 'staff@test.com',
        userName: 'Staff User',
        token: 'reset-token-123',
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'password-reset',
        expect.objectContaining({
          type: 'password-reset',
          to: 'staff@test.com',
          resetUrl: 'https://app.hta.com/reset-password?token=reset-token-123',
          expiryMinutes: 60,
        }),
        expect.any(Object)
      )
    })

    it('queuePasswordResetEmail builds correct URL for customer', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.APP_URL = 'https://app.hta.com'
      const { queuePasswordResetEmail } = await import('../../src/services/queue.js')

      await queuePasswordResetEmail({
        to: 'customer@test.com',
        userName: 'Customer',
        token: 'token-abc',
        isCustomer: true,
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'password-reset',
        expect.objectContaining({
          resetUrl: 'https://app.hta.com/customer/reset-password?token=token-abc',
        }),
        expect.any(Object)
      )
    })

    it('queueStaffActivationEmail builds activation URL', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.APP_URL = 'https://app.hta.com'
      const { queueStaffActivationEmail } = await import('../../src/services/queue.js')

      await queueStaffActivationEmail({
        to: 'new@test.com',
        userName: 'New Engineer',
        token: 'activation-token',
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'staff-activation',
        expect.objectContaining({
          type: 'staff-activation',
          activationUrl: 'https://app.hta.com/activate?token=activation-token',
        }),
        expect.any(Object)
      )
    })

    it('queueCertificateSubmittedEmail includes dashboard URL', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.APP_URL = 'https://app.hta.com'
      const { queueCertificateSubmittedEmail } = await import('../../src/services/queue.js')

      await queueCertificateSubmittedEmail({
        reviewerEmail: 'reviewer@test.com',
        reviewerName: 'Reviewer',
        certificateNumber: 'HTA/CAL/001',
        assigneeName: 'Engineer',
        customerName: 'Acme Corp',
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'certificate-submitted',
        expect.objectContaining({
          type: 'certificate-submitted',
          to: 'reviewer@test.com',
          dashboardUrl: 'https://app.hta.com/dashboard/certificates',
          customerName: 'Acme Corp',
        }),
        expect.any(Object)
      )
    })

    it('queueCustomerReviewEmail builds review URL with token', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.APP_URL = 'https://app.hta.com'
      const { queueCustomerReviewEmail } = await import('../../src/services/queue.js')

      await queueCustomerReviewEmail({
        customerEmail: 'cust@test.com',
        customerName: 'Customer',
        certificateNumber: 'HTA/CAL/002',
        instrumentDescription: 'Digital Multimeter',
        token: 'approval-token-xyz',
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'customer-review',
        expect.objectContaining({
          type: 'customer-review',
          reviewUrl: 'https://app.hta.com/review/approval-token-xyz',
        }),
        expect.any(Object)
      )
    })

    it('queueCertificateReviewedEmail sets approved flag correctly', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { queueCertificateReviewedEmail } = await import('../../src/services/queue.js')

      // Approved
      await queueCertificateReviewedEmail({
        assigneeEmail: 'eng@test.com',
        assigneeName: 'Engineer',
        certificateNumber: 'C1',
        reviewerName: 'Reviewer',
        approved: true,
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'certificate-reviewed',
        expect.objectContaining({ approved: true, revisionNote: undefined }),
        expect.any(Object)
      )

      mockAdd.mockClear()

      // Revision requested
      await queueCertificateReviewedEmail({
        assigneeEmail: 'eng@test.com',
        assigneeName: 'Engineer',
        certificateNumber: 'C1',
        reviewerName: 'Reviewer',
        approved: false,
        revisionNote: 'Please fix readings',
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'certificate-reviewed',
        expect.objectContaining({ approved: false, revisionNote: 'Please fix readings' }),
        expect.any(Object)
      )
    })

    it('queueCustomerApprovalNotificationEmail handles approved and rejected', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { queueCustomerApprovalNotificationEmail } = await import('../../src/services/queue.js')

      await queueCustomerApprovalNotificationEmail({
        staffEmail: 'eng@test.com',
        staffName: 'Engineer',
        certificateNumber: 'C1',
        customerName: 'Acme',
        approved: true,
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'customer-approval',
        expect.objectContaining({ status: 'approved' }),
        expect.any(Object)
      )

      mockAdd.mockClear()

      await queueCustomerApprovalNotificationEmail({
        staffEmail: 'eng@test.com',
        staffName: 'Engineer',
        certificateNumber: 'C1',
        customerName: 'Acme',
        approved: false,
        rejectionNote: 'Readings incorrect',
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'customer-approval',
        expect.objectContaining({ status: 'rejected', rejectionNote: 'Readings incorrect' }),
        expect.any(Object)
      )
    })
  })

  describe('closeQueues', () => {
    it('should close queues and disconnect redis', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { enqueueEmail, closeQueues } = await import('../../src/services/queue.js')

      // Trigger connection by enqueuing
      await enqueueEmail({
        type: 'password-reset',
        to: 'test@test.com',
        userName: 'Test',
        resetUrl: 'url',
      })

      await closeQueues()

      expect(mockClose).toHaveBeenCalled()
      expect(mockDisconnect).toHaveBeenCalled()
    })

    it('should be safe to call when no connection exists', async () => {
      process.env.REDIS_URL = ''
      const { closeQueues } = await import('../../src/services/queue.js')

      // Should not throw
      await closeQueues()
    })
  })

  describe('Redis TLS', () => {
    it('should use TLS config for rediss:// URLs', async () => {
      process.env.REDIS_URL = 'rediss://memorystore.gcp:6379'
      const { enqueueEmail } = await import('../../src/services/queue.js')
      const { Redis } = await import('ioredis')

      await enqueueEmail({
        type: 'password-reset',
        to: 'test@test.com',
        userName: 'Test',
        resetUrl: 'url',
      })

      expect(Redis).toHaveBeenCalledWith(
        'rediss://memorystore.gcp:6379',
        expect.objectContaining({
          maxRetriesPerRequest: null,
          tls: { rejectUnauthorized: false },
        })
      )
    })

    it('should not use TLS for redis:// URLs', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { enqueueEmail } = await import('../../src/services/queue.js')
      const { Redis } = await import('ioredis')

      await enqueueEmail({
        type: 'password-reset',
        to: 'test@test.com',
        userName: 'Test',
        resetUrl: 'url',
      })

      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({
          maxRetriesPerRequest: null,
        })
      )
      // Verify tls is NOT in the options
      const callArgs = (Redis as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]
      expect(callArgs.tls).toBeUndefined()
    })
  })
})
