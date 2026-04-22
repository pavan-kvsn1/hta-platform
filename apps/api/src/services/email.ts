import { Resend } from 'resend'
import { renderEmail, EmailTemplate } from '@hta/emails'
import { createLogger } from '@hta/shared'

const logger = createLogger('email-service')

// Initialize Resend client
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const EMAIL_FROM = process.env.EMAIL_FROM || 'HTA Calibration <noreply@hta-calibration.com>'

interface SendEmailOptions {
  to: string | string[]
  template: EmailTemplate
  props: Record<string, unknown>
}

interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Send an email using a template
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, template, props } = options

  if (!resend) {
    logger.warn({ template, to }, 'Email not sent: RESEND_API_KEY not configured')
    return {
      success: false,
      error: 'Email service not configured',
    }
  }

  try {
    // Render the email template
    const { html, subject } = await renderEmail({ template, props })

    // Send via Resend
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    })

    if (error) {
      logger.error({ error, template, to }, 'Failed to send email')
      return {
        success: false,
        error: error.message,
      }
    }

    logger.info({ messageId: data?.id, template, to }, 'Email sent successfully')
    return {
      success: true,
      messageId: data?.id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error, template, to }, 'Email send error')
    return {
      success: false,
      error: message,
    }
  }
}

/**
 * Send security alert emails to multiple recipients
 */
export async function sendSecurityAlertEmail(
  recipients: { email: string; name: string }[],
  alert: {
    alertType: 'CSP_VIOLATION' | 'SUSPICIOUS_LOGIN' | 'BRUTE_FORCE'
    severity: 'HIGH' | 'CRITICAL'
    summary: string
    details: { label: string; value: string }[]
    timestamp: string
  }
): Promise<{ sent: number; failed: number }> {
  const dashboardUrl = process.env.APP_URL
    ? `${process.env.APP_URL}/admin/security`
    : 'https://app.hta-calibration.com/admin/security'

  let sent = 0
  let failed = 0

  // Send emails in parallel with concurrency limit
  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendEmail({
        to: recipient.email,
        template: 'security-alert',
        props: {
          recipientName: recipient.name,
          alertType: alert.alertType,
          severity: alert.severity,
          summary: alert.summary,
          details: alert.details,
          timestamp: alert.timestamp,
          dashboardUrl,
        },
      })
    )
  )

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.success) {
      sent++
    } else {
      failed++
    }
  }

  return { sent, failed }
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!resend
}
