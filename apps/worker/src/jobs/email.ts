/**
 * Email Job Processor
 *
 * Processes email jobs from the queue and sends via Resend.
 */

import { Job } from 'bullmq'
import { Resend } from 'resend'
import { renderEmail } from '@hta/emails'
import type { EmailJobData } from '../types.js'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.EMAIL_FROM || 'HTA Calibration <noreply@htacalibration.com>'

/**
 * Process an email job
 */
export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { data } = job

  console.log(`[Email] Processing job ${job.id}: ${data.type} -> ${data.to}`)

  try {
    const { html, subject } = await renderEmailFromJob(data)

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: data.to,
      subject,
      html,
    })

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`)
    }

    console.log(`[Email] Sent successfully: ${result.data?.id}`)
  } catch (error) {
    console.error(`[Email] Failed to process job ${job.id}:`, error)
    throw error // Re-throw to trigger retry
  }
}

/**
 * Render email HTML from job data
 */
async function renderEmailFromJob(data: EmailJobData): Promise<{ html: string; subject: string }> {
  switch (data.type) {
    case 'password-reset':
      return renderEmail({
        template: 'password-reset',
        props: {
          userName: data.userName,
          resetUrl: data.resetUrl,
          expiryMinutes: data.expiryMinutes,
          tenantName: data.tenantName,
        },
      })

    case 'staff-activation':
      return renderEmail({
        template: 'staff-activation',
        props: {
          userName: data.userName,
          activationUrl: data.activationUrl,
          tenantName: data.tenantName,
        },
      })

    case 'certificate-submitted':
      return renderEmail({
        template: 'certificate-submitted',
        props: {
          reviewerName: data.reviewerName,
          certificateNumber: data.certificateNumber,
          assigneeName: data.assigneeName,
          customerName: data.customerName,
          dashboardUrl: data.dashboardUrl,
        },
      })

    case 'certificate-reviewed':
      return renderEmail({
        template: 'certificate-reviewed',
        props: {
          assigneeName: data.assigneeName,
          certificateNumber: data.certificateNumber,
          reviewerName: data.reviewerName,
          approved: data.approved,
          revisionNote: data.revisionNote,
          dashboardUrl: data.dashboardUrl,
        },
      })

    case 'customer-approval':
      return renderEmail({
        template: 'customer-approval',
        props: {
          recipientName: data.recipientName,
          certificateNumber: data.certificateNumber,
          customerName: data.customerName,
          approverName: data.approverName,
          status: data.status,
          rejectionNote: data.rejectionNote,
          dashboardUrl: data.dashboardUrl,
        },
      })

    case 'customer-review':
      return renderEmail({
        template: 'customer-review',
        props: {
          customerName: data.customerName,
          certificateNumber: data.certificateNumber,
          instrumentDescription: data.instrumentDescription,
          reviewUrl: data.reviewUrl,
        },
      })

    case 'customer-review-registered':
      return renderEmail({
        template: 'customer-review-registered',
        props: {
          customerName: data.customerName,
          certificateNumber: data.certificateNumber,
          instrumentDescription: data.instrumentDescription,
          loginUrl: data.loginUrl,
        },
      })

    case 'customer-authorized-registered':
      return renderEmail({
        template: 'customer-authorized-registered',
        props: {
          customerName: data.customerName,
          certificateNumber: data.certificateNumber,
          instrumentDescription: data.instrumentDescription,
          loginUrl: data.loginUrl,
        },
      })

    case 'customer-authorized-token':
      return renderEmail({
        template: 'customer-authorized-token',
        props: {
          customerName: data.customerName,
          certificateNumber: data.certificateNumber,
          instrumentDescription: data.instrumentDescription,
          downloadUrl: data.downloadUrl,
        },
      })

    case 'reviewer-customer-expired':
      return renderEmail({
        template: 'reviewer-customer-expired',
        props: {
          reviewerName: data.reviewerName,
          certificateNumber: data.certificateNumber,
          customerName: data.customerName,
          instrumentDescription: data.instrumentDescription,
          dashboardUrl: data.dashboardUrl,
        },
      })

    case 'offline-codes-expiry':
      return renderEmail({
        template: 'offline-codes-expiry',
        props: {
          engineerName: data.engineerName,
          loginUrl: data.loginUrl,
          tenantName: data.tenantName,
        },
      })

    default:
      throw new Error(`Unknown email type: ${(data as { type: string }).type}`)
  }
}
