/**
 * Email Job Processor
 *
 * Processes email jobs from the queue and sends via Resend.
 */

import { Job } from 'bullmq'
import { Resend } from 'resend'
import { prisma } from '@hta/database'
import { renderEmail } from '@hta/emails'
import type { EmailJobData } from '../types.js'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.EMAIL_FROM || 'HTA Calibration <noreply@hta-calibration.com>'

/**
 * Process an email job
 */
export async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { data } = job
  const hasTrackingMetadata = Boolean(
    data.deliveryId && data.certificateId && data.idempotencyKey,
  )
  let verifiedDeliveryId: string | null = null

  console.log(`[Email] Processing job ${job.id}: ${data.type} -> ${data.to}`)

  try {
    if (hasTrackingMetadata) {
      const delivery = await prisma.emailDelivery.findUnique({
        where: { id: data.deliveryId! },
        select: { certificateId: true, idempotencyKey: true },
      })

      if (
        !delivery
        || delivery.certificateId !== data.certificateId
        || delivery.idempotencyKey !== data.idempotencyKey
      ) {
        throw new Error('Tracked email delivery metadata does not match the persisted attempt')
      }
      verifiedDeliveryId = data.deliveryId!
    }

    const { html, subject } = await renderEmailFromJob(data)

    const payload = {
      from: FROM_EMAIL,
      to: data.to,
      subject,
      html,
    }
    const result = verifiedDeliveryId
      ? await resend.emails.send(payload, { idempotencyKey: data.idempotencyKey! })
      : await resend.emails.send(payload)

    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`)
    }

    if (verifiedDeliveryId) {
      if (!result.data?.id) {
        throw new Error('Resend accepted the email without returning a provider message ID')
      }
      await prisma.emailDelivery.update({
        where: { id: verifiedDeliveryId },
        data: {
          providerEmailId: result.data.id,
          status: 'SENT',
          sentAt: new Date(),
          failureReason: null,
        },
      })
    }

    console.log(`[Email] Sent successfully: ${result.data?.id}`)
  } catch (error) {
    if (verifiedDeliveryId) {
      const configuredAttempts = Number(job.opts.attempts ?? 1)
      const isFinalAttempt = job.attemptsMade + 1 >= configuredAttempts
      const failureReason = (error instanceof Error ? error.message : String(error)).slice(0, 500)

      await prisma.emailDelivery.update({
        where: { id: verifiedDeliveryId },
        data: {
          failureReason,
          ...(isFinalAttempt ? { status: 'FAILED' as const } : {}),
        },
      })
    }
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
          uucDetails: data.uucDetails,
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
          uucDetails: data.uucDetails,
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
          uucDetails: data.uucDetails,
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
          uucDetails: data.uucDetails,
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
          uucDetails: data.uucDetails,
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
          uucDetails: data.uucDetails,
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
          uucDetails: data.uucDetails,
          downloadUrl: data.downloadUrl,
          maxDownloads: data.maxDownloads,
          expiresInDays: data.expiresInDays,
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
          uucDetails: data.uucDetails,
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

    case 'internal-request-decision':
      return renderEmail({
        template: 'internal-request-decision',
        props: {
          recipientName: data.recipientName,
          requestType: data.requestType,
          decision: data.decision,
          requestDate: data.requestDate,
          certificateId: data.certificateId,
          certificateNumber: data.certificateNumber,
          requestedItems: data.requestedItems,
          originalReason: data.originalReason,
          adminNote: data.adminNote,
          portalUrl: data.portalUrl,
        },
      })

    case 'customer-request-decision':
      return renderEmail({
        template: 'customer-request-decision',
        props: {
          recipientName: data.recipientName,
          requestType: data.requestType,
          decision: data.decision,
          audience: data.audience,
          companyName: data.companyName,
          requestDate: data.requestDate,
          newUserName: data.newUserName,
          newUserEmail: data.newUserEmail,
          previousPocName: data.previousPocName,
          newPocName: data.newPocName,
          wasPoc: data.wasPoc,
          ...(data.decision === 'REJECTED'
            ? { rejectionReason: data.rejectionReason }
            : { adminNote: data.adminNote }),
          portalUrl: data.portalUrl,
        },
      })

    default:
      throw new Error(`Unknown email type: ${(data as { type: string }).type}`)
  }
}
