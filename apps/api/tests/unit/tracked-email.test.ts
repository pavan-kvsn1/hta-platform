import { beforeEach, describe, expect, it, vi } from 'vitest'

const { deliveryCreate, deliveryUpdate } = vi.hoisted(() => ({
  deliveryCreate: vi.fn(),
  deliveryUpdate: vi.fn(),
}))

vi.mock('@hta/database', () => ({
  prisma: {
    emailDelivery: {
      create: deliveryCreate,
      update: deliveryUpdate,
    },
  },
}))

import { enqueueTrackedCertificateEmail } from '../../src/services/tracked-email.js'

const emailData = {
  type: 'certificate-submitted' as const,
  to: 'reviewer@example.com',
  reviewerName: 'Reviewer',
  certificateNumber: 'HTA/CAL/001',
  assigneeName: 'Engineer',
  dashboardUrl: 'https://hta-calibration.com/dashboard/certificates',
}

describe('enqueueTrackedCertificateEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deliveryCreate.mockImplementation(async ({ data }) => data)
    deliveryUpdate.mockResolvedValue(undefined)
  })

  it('persists QUEUED before enqueue and correlates the BullMQ job', async () => {
    const enqueue = vi.fn().mockResolvedValue('job-1')

    const deliveryId = await enqueueTrackedCertificateEmail({
      tenantId: 'tenant-1',
      certificateId: 'certificate-1',
      emailType: 'CERTIFICATE_SUBMITTED',
      recipientEmail: 'reviewer@example.com',
      recipientName: 'Reviewer',
      data: emailData,
      required: true,
    }, enqueue)

    const created = deliveryCreate.mock.calls[0][0].data
    expect(created).toEqual(expect.objectContaining({
      id: deliveryId,
      tenantId: 'tenant-1',
      certificateId: 'certificate-1',
      emailType: 'CERTIFICATE_SUBMITTED',
      recipientEmail: 'reviewer@example.com',
      recipientName: 'Reviewer',
      status: 'QUEUED',
      idempotencyKey: `email-delivery/${deliveryId}`,
    }))
    expect(deliveryCreate.mock.invocationCallOrder[0]).toBeLessThan(enqueue.mock.invocationCallOrder[0])
    expect(enqueue).toHaveBeenCalledWith({
      ...emailData,
      deliveryId,
      certificateId: 'certificate-1',
      idempotencyKey: `email-delivery/${deliveryId}`,
    }, { required: true })
    expect(deliveryUpdate).toHaveBeenCalledWith({
      where: { id: deliveryId },
      data: { bullJobId: 'job-1' },
    })
  })

  it('records optional dispatch skipped because Redis is unavailable', async () => {
    const enqueue = vi.fn().mockResolvedValue(null)

    const deliveryId = await enqueueTrackedCertificateEmail({
      tenantId: 'tenant-1',
      certificateId: 'certificate-1',
      emailType: 'CERTIFICATE_REVIEWED',
      recipientEmail: 'engineer@example.com',
      data: { ...emailData, to: 'engineer@example.com' },
    }, enqueue)

    expect(deliveryUpdate).toHaveBeenCalledWith({
      where: { id: deliveryId },
      data: {
        status: 'FAILED',
        failureReason: 'Email queue unavailable',
      },
    })
  })

  it('records and rethrows a required enqueue failure', async () => {
    const enqueue = vi.fn().mockRejectedValue(new Error('Redis unavailable'))

    await expect(enqueueTrackedCertificateEmail({
      tenantId: 'tenant-1',
      certificateId: 'certificate-1',
      emailType: 'CUSTOMER_REVIEW',
      recipientEmail: 'customer@example.com',
      data: { ...emailData, to: 'customer@example.com' },
      required: true,
    }, enqueue)).rejects.toThrow('Redis unavailable')

    expect(deliveryUpdate).toHaveBeenLastCalledWith({
      where: { id: expect.any(String) },
      data: {
        status: 'FAILED',
        failureReason: 'Redis unavailable',
      },
    })
  })

  it('caps stored enqueue failures at 500 characters', async () => {
    const enqueue = vi.fn().mockRejectedValue(new Error('x'.repeat(800)))

    await expect(enqueueTrackedCertificateEmail({
      tenantId: 'tenant-1',
      certificateId: 'certificate-1',
      emailType: 'CUSTOMER_REVIEW',
      recipientEmail: 'customer@example.com',
      data: { ...emailData, to: 'customer@example.com' },
      required: true,
    }, enqueue)).rejects.toThrow()

    expect(deliveryUpdate.mock.calls.at(-1)?.[0].data.failureReason).toHaveLength(500)
  })
})
