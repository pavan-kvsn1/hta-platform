/**
 * Email Worker
 *
 * Handles background processing of email jobs:
 * - email:send - Send a single email
 * - email:batch - Send multiple emails
 *
 * Uses Resend for production email delivery.
 * In development mode, logs to console unless RESEND_API_KEY is set.
 *
 * Email templates use React Email for professional branded emails.
 */

import { Resend } from 'resend'
import { render } from '@react-email/components'
import { JobWorker } from '../types'

// React Email Templates
import {
  AccountDeleted,
  PasswordChanged,
  PasswordReset,
  StaffActivation,
  CertificateSubmitted,
  CertificateReviewed,
  CertificateSentToCustomer,
  CustomerApproval,
  CertificateDownloadReady,
} from '@/emails'

// Initialize Resend client (only if API key is available)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// Default sender email
const EMAIL_FROM = process.env.EMAIL_FROM || 'HTA Calibration <noreply@hta-calibration.com>'

// Template configuration with React Email components and fallback text templates
type TemplateConfig = {
  subject: string | ((data: Record<string, unknown>) => string)
  render?: (data: Record<string, unknown>) => Promise<{ html: string; text: string }>
  fallbackText: (data: Record<string, unknown>) => string
}

const emailTemplates: Record<string, TemplateConfig> = {
  'account-deleted': {
    subject: 'Your HTA Calibration Account Has Been Deleted',
    render: async (data) => ({
      html: await render(AccountDeleted({
        userName: String(data.userName || 'User'),
      })),
      text: await render(AccountDeleted({
        userName: String(data.userName || 'User'),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Hello ${data.userName},

Your HTA Calibration account has been successfully deleted as requested.

What happens now:
- Your personal information has been removed from our systems
- You will no longer receive emails from us
- Calibration certificates are retained for 7 years per regulatory requirements

If you did not request this deletion, please contact us immediately at services@htaipl.com.

Thank you for using HTA Calibration.

Best regards,
HTA Instrumentation (P) Ltd.
    `.trim(),
  },

  'password-changed': {
    subject: 'Your Password Has Been Changed',
    render: async (data) => ({
      html: await render(PasswordChanged({
        userName: String(data.userName || 'User'),
        changedAt: String(data.changedAt || new Date().toLocaleString()),
      })),
      text: await render(PasswordChanged({
        userName: String(data.userName || 'User'),
        changedAt: String(data.changedAt || new Date().toLocaleString()),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Hello ${data.userName},

This is to confirm that your password for the HTA Calibration Portal was successfully changed.

Time of change: ${data.changedAt}

If you made this change, no further action is needed.

If you did NOT change your password, please contact support immediately.

Best regards,
HTA Instrumentation (P) Ltd.
    `.trim(),
  },

  'password-reset': {
    subject: 'Reset Your HTA Calibration Portal Password',
    render: async (data) => ({
      html: await render(PasswordReset({
        userName: String(data.userName || 'User'),
        resetUrl: String(data.resetUrl || ''),
        expiryMinutes: Number(data.expiryMinutes) || 60,
      })),
      text: await render(PasswordReset({
        userName: String(data.userName || 'User'),
        resetUrl: String(data.resetUrl || ''),
        expiryMinutes: Number(data.expiryMinutes) || 60,
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Hello ${data.userName},

We received a request to reset your password for the HTA Calibration Portal.

Click the link below to set a new password:
${data.resetUrl}

This link will expire in 1 hour.

If you did not request this password reset, please ignore this email.

Best regards,
HTA Instrumentation (P) Ltd.
    `.trim(),
  },

  'staff-activation': {
    subject: 'Welcome to HTA Calibration System - Activate Your Account',
    render: async (data) => ({
      html: await render(StaffActivation({
        userName: String(data.userName || 'User'),
        activationUrl: String(data.activationUrl || ''),
      })),
      text: await render(StaffActivation({
        userName: String(data.userName || 'User'),
        activationUrl: String(data.activationUrl || ''),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Hello ${data.userName},

Your account has been created for the HTA Calibration System.

To activate your account and set your password, please visit:
${data.activationUrl}

This link will expire in 24 hours.

Best regards,
HTA Instrumentation (P) Ltd.
    `.trim(),
  },

  'certificate-submitted': {
    subject: 'Certificate Submitted for Review',
    render: async (data) => ({
      html: await render(CertificateSubmitted({
        reviewerName: String(data.reviewerName || 'Reviewer'),
        certificateNumber: String(data.certificateNumber || ''),
        assigneeName: String(data.assigneeName || ''),
        customerName: data.customerName ? String(data.customerName) : undefined,
        dashboardUrl: String(data.dashboardUrl || ''),
      })),
      text: await render(CertificateSubmitted({
        reviewerName: String(data.reviewerName || 'Reviewer'),
        certificateNumber: String(data.certificateNumber || ''),
        assigneeName: String(data.assigneeName || ''),
        customerName: data.customerName ? String(data.customerName) : undefined,
        dashboardUrl: String(data.dashboardUrl || ''),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Hello ${data.reviewerName},

A new certificate has been submitted for your review.

Certificate: ${data.certificateNumber}
Submitted by: ${data.assigneeName}
${data.customerName ? `Customer: ${data.customerName}` : ''}

Please log in to review: ${data.dashboardUrl}

Best regards,
HTA Calibration System
    `.trim(),
  },

  'certificate-approved': {
    subject: 'Certificate Approved',
    render: async (data) => ({
      html: await render(CertificateReviewed({
        assigneeName: String(data.assigneeName || 'User'),
        certificateNumber: String(data.certificateNumber || ''),
        reviewerName: String(data.reviewerName || ''),
        status: 'approved',
        dashboardUrl: String(data.dashboardUrl || ''),
      })),
      text: await render(CertificateReviewed({
        assigneeName: String(data.assigneeName || 'User'),
        certificateNumber: String(data.certificateNumber || ''),
        reviewerName: String(data.reviewerName || ''),
        status: 'approved',
        dashboardUrl: String(data.dashboardUrl || ''),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Hello ${data.assigneeName},

Your certificate has been approved by ${data.reviewerName}.

Certificate: ${data.certificateNumber}

The certificate will now be sent to the customer for approval.

View certificate: ${data.dashboardUrl}

Best regards,
HTA Calibration System
    `.trim(),
  },

  'revision-requested': {
    subject: 'Revision Requested',
    render: async (data) => ({
      html: await render(CertificateReviewed({
        assigneeName: String(data.assigneeName || 'User'),
        certificateNumber: String(data.certificateNumber || ''),
        reviewerName: String(data.reviewerName || ''),
        status: 'revision',
        revisionNote: data.revisionNote ? String(data.revisionNote) : undefined,
        dashboardUrl: String(data.dashboardUrl || ''),
      })),
      text: await render(CertificateReviewed({
        assigneeName: String(data.assigneeName || 'User'),
        certificateNumber: String(data.certificateNumber || ''),
        reviewerName: String(data.reviewerName || ''),
        status: 'revision',
        revisionNote: data.revisionNote ? String(data.revisionNote) : undefined,
        dashboardUrl: String(data.dashboardUrl || ''),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Hello ${data.assigneeName},

A revision has been requested for your certificate by ${data.reviewerName}.

Certificate: ${data.certificateNumber}
${data.revisionNote ? `Feedback: ${data.revisionNote}` : ''}

Please log in to view the feedback and make the requested changes: ${data.dashboardUrl}

Best regards,
HTA Calibration System
    `.trim(),
  },

  'customer-review': {
    subject: 'Certificate Ready for Your Review',
    render: async (data) => ({
      html: await render(CertificateSentToCustomer({
        customerName: String(data.customerName || 'Valued Customer'),
        certificateNumber: String(data.certificateNumber || ''),
        instrumentDescription: data.instrumentDescription ? String(data.instrumentDescription) : undefined,
        reviewUrl: String(data.reviewUrl || ''),
      })),
      text: await render(CertificateSentToCustomer({
        customerName: String(data.customerName || 'Valued Customer'),
        certificateNumber: String(data.certificateNumber || ''),
        instrumentDescription: data.instrumentDescription ? String(data.instrumentDescription) : undefined,
        reviewUrl: String(data.reviewUrl || ''),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Dear ${data.customerName},

A calibration certificate is ready for your review.

Certificate: ${data.certificateNumber}
${data.instrumentDescription ? `Instrument: ${data.instrumentDescription}` : ''}

Click the link below to review and approve:
${data.reviewUrl}

This link will expire in 7 days.

Best regards,
HTA Instrumentation (P) Ltd.
    `.trim(),
  },

  'certificate-customer-approved': {
    subject: (data) => `Customer Approved Certificate ${data.certificateNumber}`,
    render: async (data) => ({
      html: await render(CustomerApproval({
        recipientName: String(data.recipientName || 'User'),
        certificateNumber: String(data.certificateNumber || ''),
        customerName: String(data.customerName || ''),
        approverName: String(data.approverName || ''),
        status: 'approved',
        dashboardUrl: String(data.dashboardUrl || ''),
      })),
      text: await render(CustomerApproval({
        recipientName: String(data.recipientName || 'User'),
        certificateNumber: String(data.certificateNumber || ''),
        customerName: String(data.customerName || ''),
        approverName: String(data.approverName || ''),
        status: 'approved',
        dashboardUrl: String(data.dashboardUrl || ''),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Hello ${data.recipientName},

Great news! The customer has approved the certificate.

Certificate: ${data.certificateNumber}
Customer: ${data.customerName}
Approved by: ${data.approverName}

The certificate is now ready for admin authorization.

View certificate: ${data.dashboardUrl}

Best regards,
HTA Calibration System
    `.trim(),
  },

  'certificate-customer-rejected': {
    subject: (data) => `Customer Requested Changes - ${data.certificateNumber}`,
    render: async (data) => ({
      html: await render(CustomerApproval({
        recipientName: String(data.recipientName || 'User'),
        certificateNumber: String(data.certificateNumber || ''),
        customerName: String(data.customerName || ''),
        approverName: String(data.approverName || ''),
        status: 'rejected',
        rejectionNote: data.feedback ? String(data.feedback) : undefined,
        dashboardUrl: String(data.dashboardUrl || ''),
      })),
      text: await render(CustomerApproval({
        recipientName: String(data.recipientName || 'User'),
        certificateNumber: String(data.certificateNumber || ''),
        customerName: String(data.customerName || ''),
        approverName: String(data.approverName || ''),
        status: 'rejected',
        rejectionNote: data.feedback ? String(data.feedback) : undefined,
        dashboardUrl: String(data.dashboardUrl || ''),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Hello ${data.recipientName},

The customer has requested changes to the certificate.

Certificate: ${data.certificateNumber}
Customer: ${data.customerName}
${data.feedback ? `Feedback: ${data.feedback}` : ''}

Please log in to review the feedback and make the necessary revisions: ${data.dashboardUrl}

Best regards,
HTA Calibration System
    `.trim(),
  },

  'certificate-download-ready': {
    subject: (data) => `Your Calibration Certificate is Ready - ${data.certificateNumber}`,
    render: async (data) => ({
      html: await render(CertificateDownloadReady({
        customerName: String(data.customerName || 'Customer'),
        certificateNumber: String(data.certificateNumber || ''),
        instrumentDescription: data.instrumentDescription ? String(data.instrumentDescription) : undefined,
        serialNumber: data.serialNumber ? String(data.serialNumber) : undefined,
        calibrationDate: data.calibrationDate ? String(data.calibrationDate) : undefined,
        downloadUrl: String(data.downloadUrl || ''),
      })),
      text: await render(CertificateDownloadReady({
        customerName: String(data.customerName || 'Customer'),
        certificateNumber: String(data.certificateNumber || ''),
        instrumentDescription: data.instrumentDescription ? String(data.instrumentDescription) : undefined,
        serialNumber: data.serialNumber ? String(data.serialNumber) : undefined,
        calibrationDate: data.calibrationDate ? String(data.calibrationDate) : undefined,
        downloadUrl: String(data.downloadUrl || ''),
      }), { plainText: true }),
    }),
    fallbackText: (data) => `
Dear ${data.customerName},

Great news! Your calibration certificate has been completed and is ready for download.

Certificate Details:
Certificate Number: ${data.certificateNumber}
${data.instrumentDescription ? `Instrument: ${data.instrumentDescription}` : ''}
${data.serialNumber ? `Serial Number: ${data.serialNumber}` : ''}
${data.calibrationDate ? `Calibration Date: ${data.calibrationDate}` : ''}

Click the link below to download your certificate:
${data.downloadUrl}

Important:
- This link will expire in 7 days
- Maximum 5 downloads allowed
- Save a copy for your records

Best regards,
HTA Instrumentation (P) Ltd.
    `.trim(),
  },

  // Legacy templates without React Email components (for backwards compatibility)
  'new-chat-message': {
    subject: 'New Message on Certificate',
    fallbackText: (data) => `
You have a new message regarding certificate ${data.certificateNumber}.

From: ${data.senderName}

Please log in to view and respond.
    `.trim(),
  },

  'customer-activation': {
    subject: 'Activate Your HTA Calibration Portal Account',
    fallbackText: (data) => `
Hello ${data.userName},

Your account has been created for ${data.companyName} on the HTA Calibration Portal.

To activate your account and set your password, please click the link below:
${data.activationUrl}

This link will expire in 7 days.

Best regards,
HTA Instrumentation (P) Ltd.
    `.trim(),
  },

  'request-approved': {
    subject: 'Your Request Has Been Approved',
    fallbackText: (data) => `
Hello,

Your ${data.requestType === 'USER_ADDITION' ? 'user addition' : 'POC change'} request has been approved.

${data.requestType === 'USER_ADDITION'
  ? `New user ${data.userName} (${data.userEmail}) has been added to your account.`
  : `${data.newPocName} is now the Primary Point of Contact for ${data.companyName}.`}

Company: ${data.companyName}
Approved by: ${data.approvedBy}
Approved on: ${data.approvedDate}

Best regards,
HTA Instrumentation (P) Ltd.
    `.trim(),
  },

  'request-rejected': {
    subject: 'Your Request Has Been Rejected',
    fallbackText: (data) => `
Hello,

Unfortunately, your ${data.requestType === 'USER_ADDITION' ? 'user addition' : 'POC change'} request has been rejected.

Company: ${data.companyName}
Reason: ${data.rejectionReason}
Reviewed by: ${data.reviewedBy}
Reviewed on: ${data.reviewedDate}

Best regards,
HTA Instrumentation (P) Ltd.
    `.trim(),
  },
}

/**
 * Process single email
 */
export const emailSendWorker: JobWorker<'email:send'> = async (job) => {
  const { to, subject, template, templateData, text, html } = job.payload

  let finalSubject = subject || ''
  let finalText = text || ''
  let finalHtml = html || ''

  // Apply template if specified
  if (template && emailTemplates[template]) {
    const tpl = emailTemplates[template]

    // Resolve subject (may be string or function)
    if (!subject) {
      finalSubject = typeof tpl.subject === 'function'
        ? tpl.subject(templateData || {})
        : tpl.subject
    }

    // Try to render React Email template, fall back to text template
    if (tpl.render) {
      try {
        const rendered = await tpl.render(templateData || {})
        finalHtml = rendered.html
        finalText = rendered.text
      } catch (renderError) {
        console.warn(`[EmailWorker] Failed to render React Email template '${template}':`, renderError)
        finalText = tpl.fallbackText(templateData || {})
        finalHtml = formatTextAsHtml(finalText)
      }
    } else {
      finalText = tpl.fallbackText(templateData || {})
      finalHtml = formatTextAsHtml(finalText)
    }
  }

  const recipients = Array.isArray(to) ? to : [to]

  // Development mode: log to console if no Resend API key
  if (!resend) {
    console.log('\n' + '='.repeat(60))
    console.log('📧 EMAIL (Development Mode - No RESEND_API_KEY)')
    console.log('='.repeat(60))
    console.log(`From: ${EMAIL_FROM}`)
    console.log(`To: ${recipients.join(', ')}`)
    console.log(`Subject: ${finalSubject}`)
    console.log(`Template: ${template || 'none'}`)
    console.log('\n--- Text Body ---')
    console.log(finalText.substring(0, 500))
    if (finalHtml) {
      console.log('\n--- HTML Body (truncated) ---')
      console.log(finalHtml.substring(0, 300) + '...')
    }
    console.log('='.repeat(60) + '\n')
    return
  }

  // Production: Send via Resend
  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: recipients,
      subject: finalSubject,
      text: finalText,
      html: finalHtml || formatTextAsHtml(finalText),
    })

    if (error) {
      console.error('[EmailWorker] Resend error:', error)
      throw new Error(`Failed to send email: ${error.message}`)
    }

    console.log(`[EmailWorker] Email sent successfully via Resend. ID: ${data?.id}`)
  } catch (err) {
    console.error('[EmailWorker] Failed to send email:', err)
    throw err
  }
}

/**
 * Convert plain text to simple HTML (used as fallback)
 */
function formatTextAsHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>\n')

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${escaped}
      </body>
    </html>
  `
}

/**
 * Process batch emails
 */
export const emailBatchWorker: JobWorker<'email:batch'> = async (job) => {
  const { emails } = job.payload

  if (emails.length === 0) {
    return
  }

  // Prepare all emails
  const preparedEmails = await Promise.all(
    emails.map(async (email) => {
      const { to, subject, template, templateData } = email

      let finalSubject = subject || ''
      let finalText = ''
      let finalHtml = ''

      if (template && emailTemplates[template]) {
        const tpl = emailTemplates[template]

        if (!subject) {
          finalSubject = typeof tpl.subject === 'function'
            ? tpl.subject(templateData || {})
            : tpl.subject
        }

        if (tpl.render) {
          try {
            const rendered = await tpl.render(templateData || {})
            finalHtml = rendered.html
            finalText = rendered.text
          } catch {
            finalText = tpl.fallbackText(templateData || {})
            finalHtml = formatTextAsHtml(finalText)
          }
        } else {
          finalText = tpl.fallbackText(templateData || {})
          finalHtml = formatTextAsHtml(finalText)
        }
      }

      return {
        to: Array.isArray(to) ? to : [to],
        subject: finalSubject,
        text: finalText,
        html: finalHtml,
      }
    })
  )

  // Development mode: log to console if no Resend API key
  if (!resend) {
    for (const email of preparedEmails) {
      console.log(`[EmailWorker] Would send to ${email.to.join(', ')}: ${email.subject}`)
    }
    console.log(`[EmailWorker] Processed ${emails.length} emails in batch (development mode)`)
    return
  }

  // Production: Send via Resend batch API
  try {
    const { data, error } = await resend.batch.send(
      preparedEmails.map((email) => ({
        from: EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html || formatTextAsHtml(email.text),
      }))
    )

    if (error) {
      console.error('[EmailWorker] Resend batch error:', error)
      throw new Error(`Failed to send batch emails: ${error.message}`)
    }

    console.log(`[EmailWorker] Batch sent successfully via Resend. Count: ${data?.data?.length || emails.length}`)
  } catch (err) {
    console.error('[EmailWorker] Failed to send batch emails:', err)
    throw err
  }
}

// Export workers map
export const emailWorkers = {
  'email:send': emailSendWorker,
  'email:batch': emailBatchWorker,
}
