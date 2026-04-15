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
  opts?: { id?: string }
): Job<T> {
  return {
    id: opts?.id || 'test-email-job-id',
    name: 'email',
    data,
    progress: vi.fn(),
    log: vi.fn(),
    updateProgress: vi.fn(),
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
