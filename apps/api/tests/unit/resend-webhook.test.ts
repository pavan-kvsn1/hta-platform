import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  deliveryFindUnique: vi.fn(),
  deliveryUpdate: vi.fn(),
  eventFindUnique: vi.fn(),
  eventCreate: vi.fn(),
}))

vi.mock('@hta/database', () => ({
  prisma: { $transaction: mocks.transaction },
}))

describe('applyResendWebhookEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async (callback) => callback({
      emailDelivery: {
        findUnique: mocks.deliveryFindUnique,
        update: mocks.deliveryUpdate,
      },
      emailDeliveryEvent: {
        findUnique: mocks.eventFindUnique,
        create: mocks.eventCreate,
      },
    }))
    mocks.eventFindUnique.mockResolvedValue(null)
    mocks.deliveryFindUnique.mockResolvedValue({
      id: 'delivery-1',
      status: 'SENT',
      lastEventAt: new Date('2026-09-01T10:00:00.000Z'),
    })
  })

  it('stores and applies a newer delivered event', async () => {
    const { applyResendWebhookEvent } = await import('../../src/services/resend-webhook.js')

    await expect(applyResendWebhookEvent({
      providerEventId: 'msg-1',
      eventType: 'email.delivered',
      occurredAt: new Date('2026-09-01T10:01:00.000Z'),
      providerEmailId: 'resend-email-1',
      data: { email_id: 'resend-email-1' },
    })).resolves.toBe('applied')

    expect(mocks.eventCreate).toHaveBeenCalledOnce()
    expect(mocks.deliveryUpdate).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({
        status: 'DELIVERED',
        deliveredAt: expect.any(Date),
        lastEventAt: expect.any(Date),
      }),
    })
  })

  it('acknowledges duplicate and unknown deliveries', async () => {
    const { applyResendWebhookEvent } = await import('../../src/services/resend-webhook.js')
    mocks.eventFindUnique.mockResolvedValueOnce({ id: 'existing' })
    await expect(applyResendWebhookEvent({
      providerEventId: 'duplicate', eventType: 'email.sent',
      occurredAt: new Date(), providerEmailId: 'email-1', data: {},
    })).resolves.toBe('duplicate')

    mocks.eventFindUnique.mockResolvedValueOnce(null)
    mocks.deliveryFindUnique.mockResolvedValueOnce(null)
    await expect(applyResendWebhookEvent({
      providerEventId: 'unknown', eventType: 'email.sent',
      occurredAt: new Date(), providerEmailId: 'missing', data: {},
    })).resolves.toBe('unknown')
  })

  it('stores older events without regressing current status', async () => {
    const { applyResendWebhookEvent } = await import('../../src/services/resend-webhook.js')
    await expect(applyResendWebhookEvent({
      providerEventId: 'older', eventType: 'email.delivery_delayed',
      occurredAt: new Date('2026-09-01T09:00:00.000Z'),
      providerEmailId: 'resend-email-1', data: {},
    })).resolves.toBe('stored')
    expect(mocks.eventCreate).toHaveBeenCalledOnce()
    expect(mocks.deliveryUpdate).not.toHaveBeenCalled()
  })
})
