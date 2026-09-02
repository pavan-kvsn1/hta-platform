/**
 * Queue Service Unit Tests
 *
 * Tests the queue client service that connects the API to the worker's
 * BullMQ queues. Mocks Redis and BullMQ to test enqueue logic,
 * graceful degradation when REDIS_URL is unset, and retry configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockDeliveryCreate, mockDeliveryUpdate } = vi.hoisted(() => ({
  mockDeliveryCreate: vi.fn(),
  mockDeliveryUpdate: vi.fn(),
}))

vi.mock('@hta/database', () => ({
  prisma: {
    emailDelivery: {
      create: mockDeliveryCreate,
      update: mockDeliveryUpdate,
    },
  },
}))

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
    mockDeliveryCreate.mockImplementation(async ({ data }) => data)
    mockDeliveryUpdate.mockResolvedValue(undefined)
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

      const jobId = await enqueueEmail({
        type: 'password-reset',
        to: 'user@test.com',
        userName: 'Test User',
        resetUrl: 'https://app.test.com/reset?token=abc',
        expiryMinutes: 60,
      })

      expect(jobId).toBe('job-1')

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

    it('should reject required customer email when REDIS_URL is not set', async () => {
      process.env.REDIS_URL = ''
      const { enqueueEmail } = await import('../../src/services/queue.js')

      await expect(enqueueEmail({
        type: 'customer-review',
        to: 'customer@test.com',
        customerName: 'Customer',
        certificateNumber: 'HTA/CAL/001',
        instrumentDescription: 'Digital Multimeter',
        reviewUrl: 'https://hta-calibration.com/customer/review/token',
      }, { required: true })).rejects.toThrow('Email not queued (no REDIS_URL)')

      expect(mockAdd).not.toHaveBeenCalled()
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
    it('queueInternalRequestDecisionEmail queues a required decision job with retries', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.APP_URL = 'https://app.hta.com/'
      const { queueInternalRequestDecisionEmail } = await import('../../src/services/queue.js')

      await queueInternalRequestDecisionEmail({
        to: 'engineer@example.com',
        recipientName: 'Engineer',
        requestType: 'SECTION_UNLOCK',
        decision: 'REJECTED',
        certificateId: 'cert-1',
        certificateNumber: 'CERT-1',
        requestedItems: ['Results'],
        originalReason: 'Correction',
        adminNote: 'Not justified',
        requestDate: '31 Aug 2026',
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'internal-request-decision',
        expect.objectContaining({
          type: 'internal-request-decision',
          to: 'engineer@example.com',
          adminNote: 'Not justified',
          portalUrl: 'https://app.hta.com',
        }),
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      )
    })

    it('queueCustomerRequestDecisionEmail queues the POC audience without adding sensitive fields', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { queueCustomerRequestDecisionEmail } = await import('../../src/services/queue.js')

      await queueCustomerRequestDecisionEmail({
        to: 'new.poc@example.com',
        recipientName: 'New POC',
        requestType: 'POC_CHANGE',
        decision: 'APPROVED',
        audience: 'NEW_POC',
        companyName: 'Acme',
        previousPocName: 'Old POC',
        newPocName: 'New POC',
        requestDate: '31 Aug 2026',
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'customer-request-decision',
        expect.objectContaining({
          type: 'customer-request-decision',
          audience: 'NEW_POC',
          companyName: 'Acme',
        }),
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      )
      expect(mockAdd.mock.calls.at(-1)?.[1]).not.toHaveProperty('provisioningToken')
      expect(mockAdd.mock.calls.at(-1)?.[1]).not.toHaveProperty('offlineCodes')
    })

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
          resetUrl: 'https://app.hta.com/reset-password/reset-token-123',
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
          resetUrl: 'https://app.hta.com/customer/reset-password/token-abc',
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
          activationUrl: 'https://app.hta.com/activate/activation-token',
        }),
        expect.any(Object)
      )
    })

    it('queueCertificateSubmittedEmail includes dashboard URL', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.APP_URL = 'https://app.hta.com'
      const { queueCertificateSubmittedEmail } = await import('../../src/services/queue.js')

      await queueCertificateSubmittedEmail({
        tenantId: 'tenant-1',
        certificateId: 'certificate-1',
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

    it('queueCertificateSubmittedEmail rejects when the email queue is unavailable', async () => {
      process.env.REDIS_URL = ''
      const { queueCertificateSubmittedEmail } = await import('../../src/services/queue.js')

      await expect(queueCertificateSubmittedEmail({
        tenantId: 'tenant-1',
        certificateId: 'certificate-1',
        reviewerEmail: 'reviewer@test.com',
        reviewerName: 'Reviewer',
        certificateNumber: 'HTA/CAL/001',
        assigneeName: 'Engineer',
      })).rejects.toThrow('Email not queued (no REDIS_URL)')

      expect(mockAdd).not.toHaveBeenCalled()
    })

    it('queueCustomerReviewEmail builds review URL with token', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.APP_URL = 'https://app.hta.com'
      const { queueCustomerReviewEmail } = await import('../../src/services/queue.js')

      await queueCustomerReviewEmail({
        tenantId: 'tenant-1',
        certificateId: 'certificate-1',
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
          reviewUrl: 'https://app.hta.com/customer/review/approval-token-xyz',
        }),
        expect.any(Object)
      )
    })

    it('queueCustomerAuthorizedTokenEmail builds the customer download URL', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.APP_URL = 'https://hta-calibration.com/'
      const { queueCustomerAuthorizedTokenEmail } = await import('../../src/services/queue.js')

      await queueCustomerAuthorizedTokenEmail({
        tenantId: 'tenant-1',
        certificateId: 'certificate-1',
        customerEmail: 'cust@test.com',
        customerName: 'Customer',
        certificateNumber: 'HTA/CAL/003',
        instrumentDescription: 'Digital Multimeter',
        token: 'download-token-xyz',
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'customer-authorized-token',
        expect.objectContaining({
          downloadUrl: 'https://hta-calibration.com/customer/download/download-token-xyz',
          maxDownloads: 10,
          expiresInDays: 30,
        }),
        expect.any(Object)
      )
    })
    it('queueCertificateReviewedEmail sets approved flag correctly', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const { queueCertificateReviewedEmail } = await import('../../src/services/queue.js')

      // Approved
      await queueCertificateReviewedEmail({
        tenantId: 'tenant-1',
        certificateId: 'certificate-1',
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
        tenantId: 'tenant-1',
        certificateId: 'certificate-1',
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
      const uucDetails = {
        description: 'Digital Pressure Gauge',
        make: 'Wika',
        model: 'CPG1500',
        serialNumber: 'SN-90817',
        instrumentId: 'UUC-204',
        location: 'Utility Bay 3',
        machineName: 'Compressor Line A',
      }

      await queueCustomerApprovalNotificationEmail({
        tenantId: 'tenant-1',
        certificateId: 'certificate-1',
        uucDetails,
        staffEmail: 'eng@test.com',
        staffName: 'Engineer',
        certificateNumber: 'C1',
        customerName: 'Acme',
        approved: true,
      })

      expect(mockAdd).toHaveBeenCalledWith(
        'customer-approval',
        expect.objectContaining({ status: 'approved', uucDetails }),
        expect.any(Object)
      )

      mockAdd.mockClear()

      await queueCustomerApprovalNotificationEmail({
        tenantId: 'tenant-1',
        certificateId: 'certificate-1',
        uucDetails,
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
