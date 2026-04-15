import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getEmailSubject, renderEmail } from '../src/render'
import type { EmailTemplate } from '../src/render'

// Mock @react-email/components render function
vi.mock('@react-email/components', () => ({
  render: vi.fn().mockResolvedValue('<html><body>Mocked Email</body></html>'),
}))

describe('getEmailSubject', () => {
  describe('password-reset template', () => {
    it('returns correct subject', () => {
      const subject = getEmailSubject('password-reset', {})
      expect(subject).toBe('Reset Your Password')
    })
  })

  describe('staff-activation template', () => {
    it('returns correct subject', () => {
      const subject = getEmailSubject('staff-activation', {})
      expect(subject).toBe('Activate Your Account')
    })
  })

  describe('certificate-submitted template', () => {
    it('returns subject with certificate number', () => {
      const subject = getEmailSubject('certificate-submitted', { certificateNumber: 'CERT-001' })
      expect(subject).toBe('Certificate CERT-001 Submitted for Review')
    })

    it('returns subject without certificate number when not provided', () => {
      const subject = getEmailSubject('certificate-submitted', {})
      expect(subject).toBe('Certificate  Submitted for Review')
    })
  })

  describe('certificate-reviewed template', () => {
    it('returns subject with certificate number', () => {
      const subject = getEmailSubject('certificate-reviewed', { certificateNumber: 'CERT-002' })
      expect(subject).toBe('Certificate CERT-002 Review Complete')
    })

    it('returns subject without certificate number when not provided', () => {
      const subject = getEmailSubject('certificate-reviewed', {})
      expect(subject).toBe('Certificate  Review Complete')
    })
  })

  describe('customer-approval template', () => {
    it('returns approved subject when status is approved', () => {
      const subject = getEmailSubject('customer-approval', {
        status: 'approved',
        certificateNumber: 'CERT-003',
      })
      expect(subject).toBe('Customer Approved - Certificate CERT-003')
    })

    it('returns requested changes subject when status is not approved', () => {
      const subject = getEmailSubject('customer-approval', {
        status: 'rejected',
        certificateNumber: 'CERT-004',
      })
      expect(subject).toBe('Customer Requested Changes - Certificate CERT-004')
    })

    it('returns requested changes subject when status is not provided', () => {
      const subject = getEmailSubject('customer-approval', { certificateNumber: 'CERT-005' })
      expect(subject).toBe('Customer Requested Changes - Certificate CERT-005')
    })
  })

  describe('customer-review template', () => {
    it('returns subject with certificate number', () => {
      const subject = getEmailSubject('customer-review', { certificateNumber: 'CERT-006' })
      expect(subject).toBe('Certificate CERT-006 Ready for Review')
    })

    it('returns subject without certificate number when not provided', () => {
      const subject = getEmailSubject('customer-review', {})
      expect(subject).toBe('Certificate  Ready for Review')
    })
  })

  describe('unknown template', () => {
    it('returns default subject for unknown template', () => {
      const subject = getEmailSubject('unknown-template' as EmailTemplate, {})
      expect(subject).toBe('HTA Calibration Notification')
    })
  })
})

describe('renderEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders password-reset template', async () => {
    const result = await renderEmail({
      template: 'password-reset',
      props: { userName: 'Test User', resetUrl: 'https://example.com/reset' },
    })

    expect(result).toHaveProperty('html')
    expect(result).toHaveProperty('subject')
    expect(result.subject).toBe('Reset Your Password')
    expect(result.html).toContain('Mocked Email')
  })

  it('renders staff-activation template', async () => {
    const result = await renderEmail({
      template: 'staff-activation',
      props: { userName: 'Test User', activationUrl: 'https://example.com/activate' },
    })

    expect(result.subject).toBe('Activate Your Account')
    expect(result.html).toContain('Mocked Email')
  })

  it('renders certificate-submitted template', async () => {
    const result = await renderEmail({
      template: 'certificate-submitted',
      props: { certificateNumber: 'CERT-100' },
    })

    expect(result.subject).toBe('Certificate CERT-100 Submitted for Review')
    expect(result.html).toContain('Mocked Email')
  })

  it('renders certificate-reviewed template', async () => {
    const result = await renderEmail({
      template: 'certificate-reviewed',
      props: { certificateNumber: 'CERT-101' },
    })

    expect(result.subject).toBe('Certificate CERT-101 Review Complete')
    expect(result.html).toContain('Mocked Email')
  })

  it('renders customer-approval template with approved status', async () => {
    const result = await renderEmail({
      template: 'customer-approval',
      props: { status: 'approved', certificateNumber: 'CERT-102' },
    })

    expect(result.subject).toBe('Customer Approved - Certificate CERT-102')
    expect(result.html).toContain('Mocked Email')
  })

  it('renders customer-approval template with non-approved status', async () => {
    const result = await renderEmail({
      template: 'customer-approval',
      props: { status: 'changes_requested', certificateNumber: 'CERT-103' },
    })

    expect(result.subject).toBe('Customer Requested Changes - Certificate CERT-103')
    expect(result.html).toContain('Mocked Email')
  })

  it('renders customer-review template', async () => {
    const result = await renderEmail({
      template: 'customer-review',
      props: { certificateNumber: 'CERT-104' },
    })

    expect(result.subject).toBe('Certificate CERT-104 Ready for Review')
    expect(result.html).toContain('Mocked Email')
  })

  it('throws error for unknown template', async () => {
    await expect(
      renderEmail({
        template: 'unknown-template' as EmailTemplate,
        props: {},
      })
    ).rejects.toThrow('Unknown email template: unknown-template')
  })
})
