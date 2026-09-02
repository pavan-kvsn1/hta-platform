import { randomUUID } from 'node:crypto'
import { prisma } from '@hta/database'
import type { CertificateEmailType } from '@hta/shared'
import type { EmailJobData } from './queue.js'

type EnqueueEmail = (
  data: EmailJobData,
  options?: { required?: boolean },
) => Promise<string | null>

function safeErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500)
}

export async function enqueueTrackedCertificateEmail(options: {
  tenantId: string
  certificateId: string
  emailType: CertificateEmailType
  recipientEmail: string
  recipientName?: string
  data: EmailJobData
  required?: boolean
}, enqueue: EnqueueEmail): Promise<string> {
  const id = randomUUID()
  const idempotencyKey = `email-delivery/${id}`

  await prisma.emailDelivery.create({
    data: {
      id,
      tenantId: options.tenantId,
      certificateId: options.certificateId,
      emailType: options.emailType,
      recipientEmail: options.recipientEmail,
      recipientName: options.recipientName,
      status: 'QUEUED',
      idempotencyKey,
    },
  })

  try {
    const bullJobId = await enqueue({
      ...options.data,
      deliveryId: id,
      certificateId: options.certificateId,
      idempotencyKey,
    }, { required: options.required })

    if (!bullJobId) {
      await prisma.emailDelivery.update({
        where: { id },
        data: {
          status: 'FAILED',
          failureReason: 'Email queue unavailable',
        },
      })
      return id
    }

    await prisma.emailDelivery.update({
      where: { id },
      data: { bullJobId },
    })
    return id
  } catch (error) {
    await prisma.emailDelivery.update({
      where: { id },
      data: {
        status: 'FAILED',
        failureReason: safeErrorMessage(error),
      },
    })
    throw error
  }
}
