import { beforeEach, describe, expect, it } from 'vitest'
import { Prisma } from '@hta/database'
import { cleanTestDatabase, prisma } from './setup/test-db'
import { createEngineerWithAdmin, createTestCertificate } from './setup/fixtures'

async function createCertificateDelivery() {
  const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
  const certificate = await createTestCertificate(prisma, tenantId, engineer.id)
  const delivery = await prisma.emailDelivery.create({
    data: {
      tenantId,
      certificateId: certificate.id,
      emailType: 'CERTIFICATE_SUBMITTED',
      recipientEmail: 'reviewer@example.com',
      recipientName: 'Reviewer',
      idempotencyKey: 'email-delivery/attempt-1',
      providerEmailId: 'resend-email-1',
    },
  })

  return { certificate, delivery, tenantId }
}

describe('email delivery persistence', () => {
  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('stores a certificate delivery and its provider events', async () => {
    const { delivery } = await createCertificateDelivery()

    const event = await prisma.emailDeliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        providerEventId: 'svix-event-1',
        eventType: 'email.sent',
        occurredAt: new Date('2026-09-01T10:00:00.000Z'),
      },
    })

    const stored = await prisma.emailDelivery.findUnique({
      where: { id: delivery.id },
      include: { events: true },
    })

    expect(stored?.status).toBe('QUEUED')
    expect(stored?.events).toEqual([expect.objectContaining({ id: event.id })])
  })

  it.each([
    ['idempotencyKey', 'email-delivery/attempt-1'],
    ['providerEmailId', 'resend-email-1'],
  ] as const)('enforces uniqueness for %s', async (field, value) => {
    const { certificate, tenantId } = await createCertificateDelivery()

    await expect(prisma.emailDelivery.create({
      data: {
        tenantId,
        certificateId: certificate.id,
        emailType: 'CERTIFICATE_REVIEWED',
        recipientEmail: 'engineer@example.com',
        idempotencyKey: field === 'idempotencyKey' ? value : 'email-delivery/attempt-2',
        providerEmailId: field === 'providerEmailId' ? value : 'resend-email-2',
      },
    })).rejects.toMatchObject<Partial<Prisma.PrismaClientKnownRequestError>>({ code: 'P2002' })
  })

  it('enforces provider event idempotency', async () => {
    const { delivery } = await createCertificateDelivery()
    const data = {
      deliveryId: delivery.id,
      providerEventId: 'svix-event-duplicate',
      eventType: 'email.delivered',
      occurredAt: new Date('2026-09-01T10:05:00.000Z'),
    }

    await prisma.emailDeliveryEvent.create({ data })

    await expect(prisma.emailDeliveryEvent.create({ data })).rejects.toMatchObject<
      Partial<Prisma.PrismaClientKnownRequestError>
    >({ code: 'P2002' })
  })

  it('cascades delivery attempts and events when the certificate is deleted', async () => {
    const { certificate, delivery } = await createCertificateDelivery()
    await prisma.emailDeliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        providerEventId: 'svix-event-cascade',
        eventType: 'email.delivered',
        occurredAt: new Date('2026-09-01T10:05:00.000Z'),
      },
    })

    await prisma.certificate.delete({ where: { id: certificate.id } })

    expect(await prisma.emailDelivery.findUnique({ where: { id: delivery.id } })).toBeNull()
    expect(await prisma.emailDeliveryEvent.count({ where: { deliveryId: delivery.id } })).toBe(0)
  })
})
