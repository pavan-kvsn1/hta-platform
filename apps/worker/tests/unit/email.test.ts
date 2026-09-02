/**
 * Email Job Tests
 *
 * Tests for email job processing functionality.
 * Tests the renderEmailFromJob logic and email validation utilities.
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import type { Job } from 'bullmq'
import type { EmailJobData } from '../../src/types.js'

// Create mock send function that we can control
const mockSend = vi.fn()
const mockDeliveryFindUnique = vi.fn()
const mockDeliveryUpdate = vi.fn()

vi.mock('@hta/database', () => ({
  prisma: {
    emailDelivery: {
      findUnique: mockDeliveryFindUnique,
      update: mockDeliveryUpdate,
    },
  },
}))

// Mock @hta/emails
vi.mock('@hta/emails', () => ({
  renderEmail: vi.fn(),
}))

// Mock resend - this mock is hoisted to the top
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}))

// Import after mocking
import { renderEmail } from '@hta/emails'

// Helper to create mock job
function createMockEmailJob<T extends EmailJobData>(
  data: T,
  opts?: { id?: string; attempts?: number; attemptsMade?: number }
): Job<T> {
  return {
    id: opts?.id || 'test-email-job-id',
    name: 'email',
    data,
    progress: vi.fn(),
    log: vi.fn(),
    updateProgress: vi.fn(),
    opts: { attempts: opts?.attempts },
    attemptsMade: opts?.attemptsMade ?? 0,
  } as unknown as Job<T>
}

describe('Email Job Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module cache to get fresh import
    vi.resetModules()

    // Set default mock implementations
    vi.mocked(renderEmail).mockResolvedValue({
      html: '<html><body>Test email</body></html>',
      subject: 'Test Subject',
    })
    mockSend.mockResolvedValue({
      data: { id: 'email-123' },
      error: null,
    })
    mockDeliveryFindUnique.mockResolvedValue({
      certificateId: 'certificate-1',
      idempotencyKey: 'email-delivery/delivery-1',
    })
    mockDeliveryUpdate.mockResolvedValue({})
  })

  describe('password-reset email', () => {
    it('should process password reset email successfully', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'password-reset',
        to: 'user@example.com',
        userName: 'Test User',
        resetUrl: 'https://example.com/reset/token123',
        expiryMinutes: 60,
        tenantName: 'HTA Platform',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'password-reset',
        props: {
          userName: 'Test User',
          resetUrl: 'https://example.com/reset/token123',
          expiryMinutes: 60,
          tenantName: 'HTA Platform',
        },
      })

      expect(mockSend).toHaveBeenCalledWith({
        from: expect.any(String),
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<html><body>Test email</body></html>',
      })
    })

    it('should include default expiry when not provided', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'password-reset',
        to: 'user@example.com',
        userName: 'Test User',
        resetUrl: 'https://example.com/reset/token456',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'password-reset',
        props: expect.objectContaining({
          userName: 'Test User',
          resetUrl: 'https://example.com/reset/token456',
        }),
      })
    })
  })

  describe('staff-activation email', () => {
    it('should process staff activation email', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'staff-activation',
        to: 'newstaff@example.com',
        userName: 'New Staff',
        activationUrl: 'https://example.com/activate/abc123',
        tenantName: 'HTA Lab',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'staff-activation',
        props: {
          userName: 'New Staff',
          activationUrl: 'https://example.com/activate/abc123',
          tenantName: 'HTA Lab',
        },
      })
    })
  })

  describe('certificate-submitted email', () => {
    it('should process certificate submitted email', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'certificate-submitted',
        to: 'reviewer@example.com',
        reviewerName: 'John Reviewer',
        certificateNumber: 'HTA/C00001/24/12',
        assigneeName: 'Jane Engineer',
        customerName: 'Test Company',
        dashboardUrl: 'https://example.com/dashboard',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'certificate-submitted',
        props: {
          reviewerName: 'John Reviewer',
          certificateNumber: 'HTA/C00001/24/12',
          assigneeName: 'Jane Engineer',
          customerName: 'Test Company',
          dashboardUrl: 'https://example.com/dashboard',
        },
      })
    })
  })

  describe('certificate-reviewed email', () => {
    it('should process approved certificate email', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'certificate-reviewed',
        to: 'engineer@example.com',
        assigneeName: 'Jane Engineer',
        certificateNumber: 'HTA/C00001/24/12',
        reviewerName: 'John Reviewer',
        approved: true,
        dashboardUrl: 'https://example.com/dashboard',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'certificate-reviewed',
        props: {
          assigneeName: 'Jane Engineer',
          certificateNumber: 'HTA/C00001/24/12',
          reviewerName: 'John Reviewer',
          approved: true,
          revisionNote: undefined,
          dashboardUrl: 'https://example.com/dashboard',
        },
      })
    })

    it('should include revision note for rejected certificates', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'certificate-reviewed',
        to: 'engineer@example.com',
        assigneeName: 'Jane Engineer',
        certificateNumber: 'HTA/C00001/24/12',
        reviewerName: 'John Reviewer',
        approved: false,
        revisionNote: 'Please check the accuracy values',
        dashboardUrl: 'https://example.com/dashboard',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'certificate-reviewed',
        props: expect.objectContaining({
          approved: false,
          revisionNote: 'Please check the accuracy values',
        }),
      })
    })
  })

  describe('customer-approval email', () => {
    it('should process approved customer notification', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'customer-approval',
        to: 'manager@company.com',
        recipientName: 'Company Manager',
        certificateNumber: 'HTA/C00001/24/12',
        customerName: 'Test Company',
        approverName: 'Quality Manager',
        status: 'approved',
        dashboardUrl: 'https://example.com/dashboard',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'customer-approval',
        props: {
          recipientName: 'Company Manager',
          certificateNumber: 'HTA/C00001/24/12',
          customerName: 'Test Company',
          approverName: 'Quality Manager',
          status: 'approved',
          rejectionNote: undefined,
          dashboardUrl: 'https://example.com/dashboard',
        },
      })
    })

    it('should include rejection note when status is rejected', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'customer-approval',
        to: 'manager@company.com',
        recipientName: 'Company Manager',
        certificateNumber: 'HTA/C00001/24/12',
        customerName: 'Test Company',
        approverName: 'Quality Manager',
        status: 'rejected',
        rejectionNote: 'Accuracy values are not within tolerance',
        dashboardUrl: 'https://example.com/dashboard',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'customer-approval',
        props: expect.objectContaining({
          status: 'rejected',
          rejectionNote: 'Accuracy values are not within tolerance',
        }),
      })
    })
  })

  describe('customer-review email', () => {
    it('should process customer review notification', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'customer-review',
        to: 'customer@company.com',
        customerName: 'Test Company',
        certificateNumber: 'HTA/C00001/24/12',
        instrumentDescription: 'Digital Multimeter Model X100',
        reviewUrl: 'https://portal.example.com/review/abc123',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'customer-review',
        props: {
          customerName: 'Test Company',
          certificateNumber: 'HTA/C00001/24/12',
          instrumentDescription: 'Digital Multimeter Model X100',
          reviewUrl: 'https://portal.example.com/review/abc123',
        },
      })
    })
  })

  it('forwards UUC details for every certificate lifecycle email', async () => {
    const { processEmailJob } = await import('../../src/jobs/email.js')
    const uucDetails = {
      description: 'Digital Pressure Gauge',
      make: 'Wika',
      model: 'CPG1500',
      serialNumber: 'SN-90817',
      instrumentId: 'UUC-204',
      location: 'Utility Bay 3',
      machineName: 'Compressor Line A',
    }
    const common = {
      to: 'recipient@example.com',
      certificateNumber: 'HTA-2026-0042',
      uucDetails,
    }
    const jobs: EmailJobData[] = [
      { ...common, type: 'certificate-submitted', reviewerName: 'Reviewer', assigneeName: 'Engineer', dashboardUrl: 'https://example.com/dashboard' },
      { ...common, type: 'certificate-reviewed', assigneeName: 'Engineer', reviewerName: 'Reviewer', approved: true, dashboardUrl: 'https://example.com/dashboard' },
      { ...common, type: 'customer-approval', recipientName: 'Engineer', customerName: 'Acme', approverName: 'Approver', status: 'approved', dashboardUrl: 'https://example.com/dashboard' },
      { ...common, type: 'customer-review', customerName: 'Acme', instrumentDescription: 'Digital Pressure Gauge', reviewUrl: 'https://example.com/review' },
      { ...common, type: 'customer-review-registered', customerName: 'Acme', instrumentDescription: 'Digital Pressure Gauge', loginUrl: 'https://example.com/login' },
      { ...common, type: 'customer-authorized-registered', customerName: 'Acme', instrumentDescription: 'Digital Pressure Gauge', loginUrl: 'https://example.com/login' },
      { ...common, type: 'customer-authorized-token', customerName: 'Acme', instrumentDescription: 'Digital Pressure Gauge', downloadUrl: 'https://example.com/download' },
      { ...common, type: 'reviewer-customer-expired', reviewerName: 'Reviewer', customerName: 'Acme', instrumentDescription: 'Digital Pressure Gauge', dashboardUrl: 'https://example.com/dashboard' },
    ]

    for (const data of jobs) {
      await processEmailJob(createMockEmailJob(data))
      expect(renderEmail).toHaveBeenLastCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({ uucDetails }),
        }),
      )
    }
  })

  describe('request decision emails', () => {
    it('maps an internal request decision job to the shared renderer', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')
      const job = createMockEmailJob({
        type: 'internal-request-decision',
        to: 'engineer@example.com',
        recipientName: 'Engineer',
        requestType: 'SECTION_UNLOCK',
        decision: 'REJECTED',
        requestDate: '31 Aug 2026',
        certificateId: 'cert-1',
        certificateNumber: 'CERT-1',
        requestedItems: ['Results'],
        originalReason: 'Correction',
        adminNote: 'Not justified',
        portalUrl: 'https://hta-calibration.com',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'internal-request-decision',
        props: {
          recipientName: 'Engineer',
          requestType: 'SECTION_UNLOCK',
          decision: 'REJECTED',
          requestDate: '31 Aug 2026',
          certificateId: 'cert-1',
          certificateNumber: 'CERT-1',
          requestedItems: ['Results'],
          originalReason: 'Correction',
          adminNote: 'Not justified',
          portalUrl: 'https://hta-calibration.com',
        },
      })
    })

    it('maps a customer request decision job to the shared renderer', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')
      const job = createMockEmailJob({
        type: 'customer-request-decision',
        to: 'new.poc@example.com',
        recipientName: 'New POC',
        requestType: 'POC_CHANGE',
        decision: 'APPROVED',
        audience: 'NEW_POC',
        companyName: 'Acme',
        requestDate: '31 Aug 2026',
        previousPocName: 'Old POC',
        newPocName: 'New POC',
        portalUrl: 'https://hta-calibration.com',
      })

      await processEmailJob(job)

      expect(renderEmail).toHaveBeenCalledWith({
        template: 'customer-request-decision',
        props: {
          recipientName: 'New POC',
          requestType: 'POC_CHANGE',
          decision: 'APPROVED',
          audience: 'NEW_POC',
          companyName: 'Acme',
          requestDate: '31 Aug 2026',
          newUserName: undefined,
          newUserEmail: undefined,
          previousPocName: 'Old POC',
          newPocName: 'New POC',
          wasPoc: undefined,
          adminNote: undefined,
          portalUrl: 'https://hta-calibration.com',
        },
      })
    })
  })

  describe('error handling', () => {
    it('should throw error for unknown email type', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'unknown-type' as any,
        to: 'test@example.com',
      })

      await expect(processEmailJob(job)).rejects.toThrow('Unknown email type')
    })

    it('should throw error when Resend returns an error', async () => {
      mockSend.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key', name: 'api_key_invalid' },
      })

      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'password-reset',
        to: 'user@example.com',
        userName: 'Test User',
        resetUrl: 'https://example.com/reset/token',
      })

      await expect(processEmailJob(job)).rejects.toThrow('Resend error: Invalid API key')
    })

    it('should re-throw rendering errors', async () => {
      vi.mocked(renderEmail).mockRejectedValue(new Error('Template not found'))

      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'password-reset',
        to: 'user@example.com',
        userName: 'Test User',
        resetUrl: 'https://example.com/reset/token',
      })

      await expect(processEmailJob(job)).rejects.toThrow('Template not found')
    })

    it('should re-throw network errors from Resend', async () => {
      mockSend.mockRejectedValue(new Error('Network error'))

      const { processEmailJob } = await import('../../src/jobs/email.js')

      const job = createMockEmailJob({
        type: 'password-reset',
        to: 'user@example.com',
        userName: 'Test User',
        resetUrl: 'https://example.com/reset/token',
      })

      await expect(processEmailJob(job)).rejects.toThrow('Network error')
    })
  })

  describe('tracked certificate delivery', () => {
    const trackedData = {
      type: 'certificate-submitted' as const,
      to: 'reviewer@example.com',
      reviewerName: 'Reviewer',
      certificateNumber: 'CERT-001',
      assigneeName: 'Engineer',
      dashboardUrl: 'https://hta-calibration.com/dashboard',
      deliveryId: 'delivery-1',
      certificateId: 'certificate-1',
      idempotencyKey: 'email-delivery/delivery-1',
    }

    it('uses provider idempotency and records provider acceptance', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      await processEmailJob(createMockEmailJob(trackedData))

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'reviewer@example.com' }),
        { idempotencyKey: 'email-delivery/delivery-1' },
      )
      expect(mockDeliveryUpdate).toHaveBeenCalledWith({
        where: { id: 'delivery-1' },
        data: expect.objectContaining({
          providerEmailId: 'email-123',
          status: 'SENT',
          sentAt: expect.any(Date),
          failureReason: null,
        }),
      })
    })

    it('stores a safe reason without final status while retries remain', async () => {
      mockSend.mockRejectedValueOnce(new Error('temporary provider outage'))
      const { processEmailJob } = await import('../../src/jobs/email.js')

      await expect(processEmailJob(createMockEmailJob(trackedData, {
        attempts: 3,
        attemptsMade: 0,
      }))).rejects.toThrow('temporary provider outage')

      expect(mockDeliveryUpdate).toHaveBeenLastCalledWith({
        where: { id: 'delivery-1' },
        data: { failureReason: 'temporary provider outage' },
      })
    })

    it('marks the final exhausted attempt failed', async () => {
      mockSend.mockRejectedValueOnce(new Error('permanent provider outage'))
      const { processEmailJob } = await import('../../src/jobs/email.js')

      await expect(processEmailJob(createMockEmailJob(trackedData, {
        attempts: 3,
        attemptsMade: 2,
      }))).rejects.toThrow('permanent provider outage')

      expect(mockDeliveryUpdate).toHaveBeenLastCalledWith({
        where: { id: 'delivery-1' },
        data: {
          failureReason: 'permanent provider outage',
          status: 'FAILED',
        },
      })
    })

    it('keeps untracked email sends free of delivery database writes', async () => {
      const { processEmailJob } = await import('../../src/jobs/email.js')

      await processEmailJob(createMockEmailJob({
        type: 'password-reset',
        to: 'user@example.com',
        userName: 'User',
        resetUrl: 'https://example.com/reset',
      }))

      expect(mockSend).toHaveBeenCalledWith(expect.any(Object))
      expect(mockDeliveryFindUnique).not.toHaveBeenCalled()
      expect(mockDeliveryUpdate).not.toHaveBeenCalled()
    })
  })
})

describe('Email Validation', () => {
  it('should validate email recipient format', () => {
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true)
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('@missing-local.com')).toBe(false)
    expect(isValidEmail('missing-at.com')).toBe(false)
    expect(isValidEmail('spaces in@email.com')).toBe(false)
  })

  it('should validate email job has required fields', () => {
    const validateEmailJob = (job: { type: string; to: string }) => {
      return Boolean(job.type && job.to)
    }

    expect(validateEmailJob({ type: 'password-reset', to: 'test@test.com' })).toBe(true)
    expect(validateEmailJob({ type: '', to: 'test@test.com' })).toBe(false)
    expect(validateEmailJob({ type: 'password-reset', to: '' })).toBe(false)
  })

  it('should validate certificate number format', () => {
    const isValidCertNumber = (certNumber: string) =>
      /^HTA\/C\d+\/\d{2}\/\d{2}$/.test(certNumber)

    expect(isValidCertNumber('HTA/C00001/24/12')).toBe(true)
    expect(isValidCertNumber('HTA/C99999/25/01')).toBe(true)
    expect(isValidCertNumber('INVALID')).toBe(false)
    expect(isValidCertNumber('HTA/00001/24/12')).toBe(false)
  })

  it('should validate URL format', () => {
    const isValidUrl = (url: string) => {
      try {
        new URL(url)
        return true
      } catch {
        return false
      }
    }

    expect(isValidUrl('https://example.com/reset/token')).toBe(true)
    expect(isValidUrl('http://localhost:3000/dashboard')).toBe(true)
    expect(isValidUrl('not-a-url')).toBe(false)
    expect(isValidUrl('')).toBe(false)
  })
})

describe('Email Job Data Types', () => {
  it('should validate password-reset job data structure', () => {
    const job: EmailJobData = {
      type: 'password-reset',
      to: 'user@example.com',
      userName: 'Test User',
      resetUrl: 'https://example.com/reset/token123',
    }

    expect(job.type).toBe('password-reset')
    expect(job.to).toBeDefined()
    expect(job.userName).toBeDefined()
    expect(job.resetUrl).toBeDefined()
  })

  it('should validate certificate-reviewed job data structure', () => {
    const job: EmailJobData = {
      type: 'certificate-reviewed',
      to: 'engineer@example.com',
      assigneeName: 'Jane Engineer',
      certificateNumber: 'HTA/C00001/24/12',
      reviewerName: 'John Reviewer',
      approved: true,
      dashboardUrl: 'https://example.com/dashboard',
    }

    expect(job.type).toBe('certificate-reviewed')
    expect(job.approved).toBe(true)
  })

  it('should validate customer-approval job data structure', () => {
    const job: EmailJobData = {
      type: 'customer-approval',
      to: 'customer@example.com',
      recipientName: 'Customer Name',
      certificateNumber: 'HTA/C00001/24/12',
      customerName: 'Test Company',
      approverName: 'Approver Name',
      status: 'approved',
      dashboardUrl: 'https://example.com/dashboard',
    }

    expect(job.type).toBe('customer-approval')
    expect(job.status).toBe('approved')
  })
})
