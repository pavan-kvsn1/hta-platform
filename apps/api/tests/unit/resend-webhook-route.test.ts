import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Webhook } from 'svix'

const applyEvent = vi.hoisted(() => vi.fn().mockResolvedValue('applied'))
vi.mock('../../src/services/resend-webhook.js', () => ({
  applyResendWebhookEvent: applyEvent,
}))

import resendWebhookRoutes from '../../src/routes/webhooks/resend.js'

const secret = 'whsec_dGVzdC13ZWJob29rLXNlY3JldA=='

describe('Resend webhook route', () => {
  afterEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET
    vi.clearAllMocks()
  })

  it('accepts intact signed bytes and rejects tampering', async () => {
    process.env.RESEND_WEBHOOK_SECRET = secret
    const app = Fastify()
    await app.register(resendWebhookRoutes, { prefix: '/api/webhooks/resend' })
    const payload = JSON.stringify({
      type: 'email.delivered',
      created_at: '2026-09-01T10:00:00.000Z',
      data: { email_id: 'resend-email-1' },
    })
    const id = 'msg_test_1'
    const timestamp = new Date()
    const signature = new Webhook(secret).sign(id, timestamp, payload)
    const headers = {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': signature,
    }

    const accepted = await app.inject({
      method: 'POST', url: '/api/webhooks/resend', headers, payload,
    })
    expect(accepted.statusCode).toBe(200)
    expect(applyEvent).toHaveBeenCalledWith(expect.objectContaining({
      providerEventId: id,
      providerEmailId: 'resend-email-1',
      eventType: 'email.delivered',
    }))

    const tampered = await app.inject({
      method: 'POST', url: '/api/webhooks/resend', headers,
      payload: payload.replace('email.delivered', 'email.bounced'),
    })
    expect(tampered.statusCode).toBe(400)
    await app.close()
  })
})
