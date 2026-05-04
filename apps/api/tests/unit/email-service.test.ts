/**
 * Email Service Unit Tests
 *
 * Tests for sendEmail, sendSecurityAlertEmail, and isEmailConfigured.
 * Mocks Resend and @hta/emails render utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock dependencies ─────────────────────────────────────────────────────────
// vi.mock is hoisted — avoid using variables defined after the mock call inside
// the factory. Use vi.fn() directly and capture the reference from the module.

const mockSend = vi.fn()

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

vi.mock('@hta/emails', () => ({
  renderEmail: vi.fn().mockResolvedValue({
    html: '<p>Hello</p>',
    subject: 'Test Subject',
  }),
}))

vi.mock('@hta/shared', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

// ── Import after mocking ──────────────────────────────────────────────────────
import { renderEmail } from '@hta/emails'
const mockedRenderEmail = vi.mocked(renderEmail)

// ── Helpers ───────────────────────────────────────────────────────────────────
// Because the email service captures the Resend instance at module-init time,
// we reset modules and re-import for each test group that needs a different
// RESEND_API_KEY value.

async function importEmailService() {
  vi.resetModules()
  vi.mock('resend', () => ({
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
  }))
  vi.mock('@hta/emails', () => ({
    renderEmail: vi.fn().mockResolvedValue({
      html: '<p>Hello</p>',
      subject: 'Test Subject',
    }),
  }))
  vi.mock('@hta/shared', () => ({
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }))
  return import('../../src/services/email.js')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('isEmailConfigured', () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY
    vi.resetModules()
  })

  it('returns true when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 'test-api-key'
    const { isEmailConfigured } = await importEmailService()
    expect(isEmailConfigured()).toBe(true)
  })

  it('returns false when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY
    const { isEmailConfigured } = await importEmailService()
    expect(isEmailConfigured()).toBe(false)
  })
})

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
    vi.resetModules()
  })

  it('returns failure result when email service is not configured', async () => {
    delete process.env.RESEND_API_KEY
    const { sendEmail } = await importEmailService()

    const result = await sendEmail({
      to: 'user@example.com',
      template: 'password-reset' as any,
      props: { resetUrl: 'https://example.com/reset' },
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Email service not configured')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('calls Resend with correct params when configured', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    mockSend.mockResolvedValue({ data: { id: 'msg-123' }, error: null })

    const { sendEmail } = await importEmailService()

    const result = await sendEmail({
      to: 'recipient@example.com',
      template: 'password-reset' as any,
      props: { resetUrl: 'https://app.example.com/reset?token=abc' },
    })

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        html: '<p>Hello</p>',
      })
    )
    expect(result.success).toBe(true)
    expect(result.messageId).toBe('msg-123')
  })

  it('converts string "to" to array when calling Resend', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    mockSend.mockResolvedValue({ data: { id: 'id-1' }, error: null })

    const { sendEmail } = await importEmailService()

    await sendEmail({
      to: 'single@example.com',
      template: 'staff-activation' as any,
      props: {},
    })

    const call = mockSend.mock.calls[0][0]
    expect(Array.isArray(call.to)).toBe(true)
    expect(call.to).toContain('single@example.com')
  })

  it('passes array "to" directly to Resend', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    mockSend.mockResolvedValue({ data: { id: 'id-2' }, error: null })

    const { sendEmail } = await importEmailService()

    await sendEmail({
      to: ['a@example.com', 'b@example.com'],
      template: 'staff-activation' as any,
      props: {},
    })

    const call = mockSend.mock.calls[0][0]
    expect(call.to).toEqual(['a@example.com', 'b@example.com'])
  })

  it('returns failure when Resend API returns an error', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key', name: 'api_error' },
    })

    const { sendEmail } = await importEmailService()

    const result = await sendEmail({
      to: 'user@example.com',
      template: 'password-reset' as any,
      props: {},
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid API key')
  })

  it('returns failure when Resend throws an exception', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    mockSend.mockRejectedValue(new Error('Network error'))

    const { sendEmail } = await importEmailService()

    const result = await sendEmail({
      to: 'user@example.com',
      template: 'password-reset' as any,
      props: {},
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Network error')
  })

  it('uses EMAIL_FROM env var when set', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'custom@myapp.com'
    mockSend.mockResolvedValue({ data: { id: 'id-3' }, error: null })

    const { sendEmail } = await importEmailService()

    await sendEmail({
      to: 'user@example.com',
      template: 'password-reset' as any,
      props: {},
    })

    const call = mockSend.mock.calls[0][0]
    expect(call.from).toBe('custom@myapp.com')

    delete process.env.EMAIL_FROM
  })
})

describe('sendSecurityAlertEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.RESEND_API_KEY
    delete process.env.APP_URL
    vi.resetModules()
  })

  const alertData = {
    alertType: 'SUSPICIOUS_LOGIN' as const,
    severity: 'HIGH' as const,
    summary: 'Unusual login detected from IP 10.0.0.1',
    details: [{ label: 'IP Address', value: '10.0.0.1' }],
    timestamp: '2025-01-15T12:00:00Z',
  }

  it('sends to all recipients and returns correct sent count', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null })

    const { sendSecurityAlertEmail } = await importEmailService()

    const result = await sendSecurityAlertEmail(
      [
        { email: 'admin1@example.com', name: 'Admin One' },
        { email: 'admin2@example.com', name: 'Admin Two' },
      ],
      alertData
    )

    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('counts failed sends when Resend returns errors', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    mockSend
      .mockResolvedValueOnce({ data: { id: 'msg-1' }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Delivery failed', name: 'delivery_error' },
      })

    const { sendSecurityAlertEmail } = await importEmailService()

    const result = await sendSecurityAlertEmail(
      [
        { email: 'admin1@example.com', name: 'Admin One' },
        { email: 'admin2@example.com', name: 'Admin Two' },
      ],
      alertData
    )

    expect(result.sent).toBe(1)
    expect(result.failed).toBe(1)
  })

  it('sends with correct recipient name in props', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null })

    const { sendSecurityAlertEmail } = await importEmailService()
    // After importEmailService, get the mocked renderEmail again from the module
    const { renderEmail: re } = await import('@hta/emails')
    const mockedRe = vi.mocked(re)

    await sendSecurityAlertEmail([{ email: 'sec@example.com', name: 'Security Team' }], alertData)

    expect(mockedRe).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'security-alert',
        props: expect.objectContaining({
          recipientName: 'Security Team',
          alertType: 'SUSPICIOUS_LOGIN',
          severity: 'HIGH',
        }),
      })
    )
  })

  it('returns sent=0, failed=0 for empty recipients list', async () => {
    process.env.RESEND_API_KEY = 'test-key'

    const { sendSecurityAlertEmail } = await importEmailService()

    const result = await sendSecurityAlertEmail([], alertData)

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(0)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('uses APP_URL env for dashboard link when set', async () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.APP_URL = 'https://myapp.example.com'
    mockSend.mockResolvedValue({ data: { id: 'msg-1' }, error: null })

    const { sendSecurityAlertEmail } = await importEmailService()
    const { renderEmail: re } = await import('@hta/emails')
    const mockedRe = vi.mocked(re)

    await sendSecurityAlertEmail([{ email: 'admin@example.com', name: 'Admin' }], alertData)

    expect(mockedRe).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          dashboardUrl: 'https://myapp.example.com/admin/security',
        }),
      })
    )
  })

  it('counts as failed when email service is not configured', async () => {
    delete process.env.RESEND_API_KEY

    const { sendSecurityAlertEmail } = await importEmailService()

    const result = await sendSecurityAlertEmail(
      [{ email: 'admin@example.com', name: 'Admin' }],
      alertData
    )

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(1)
  })
})
