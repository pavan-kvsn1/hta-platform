import type { FastifyPluginAsync } from 'fastify'
import { Webhook } from 'svix'
import type { ResendDeliveryEventType } from '@hta/shared'
import { mapResendEventStatus } from '../../services/email-delivery-events.js'
import { applyResendWebhookEvent } from '../../services/resend-webhook.js'

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const resendWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.removeContentTypeParser('application/json')
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body)
  })

  fastify.post('/', async (request, reply) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
      request.log.error('RESEND_WEBHOOK_SECRET is not configured')
      return reply.status(503).send({ error: 'Webhook unavailable' })
    }

    const svixId = headerValue(request.headers['svix-id'])
    const svixTimestamp = headerValue(request.headers['svix-timestamp'])
    const svixSignature = headerValue(request.headers['svix-signature'])
    if (!svixId || !svixTimestamp || !svixSignature || !Buffer.isBuffer(request.body)) {
      return reply.status(400).send({ error: 'Invalid webhook signature' })
    }

    let payload: unknown
    try {
      const rawBody = request.body.toString('utf8')
      new Webhook(secret).verify(rawBody, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      })
      payload = JSON.parse(rawBody)
    } catch {
      return reply.status(400).send({ error: 'Invalid webhook signature' })
    }

    const event = payload as {
      type?: string
      created_at?: string
      data?: Record<string, unknown>
    }
    const providerEmailId = typeof event.data?.email_id === 'string' ? event.data.email_id : null
    const occurredAt = event.created_at ? new Date(event.created_at) : null
    if (
      !event.type
      || !mapResendEventStatus(event.type)
      || !providerEmailId
      || !occurredAt
      || Number.isNaN(occurredAt.getTime())
    ) {
      return reply.status(400).send({ error: 'Invalid webhook payload' })
    }

    const result = await applyResendWebhookEvent({
      providerEventId: svixId,
      eventType: event.type as ResendDeliveryEventType,
      occurredAt,
      providerEmailId,
      data: event.data ?? {},
    })

    if (result === 'unknown') {
      request.log.warn({ providerEmailId, providerEventId: svixId }, 'Webhook email delivery not found')
    }
    return reply.send({ received: true, result })
  })
}

export default resendWebhookRoutes
