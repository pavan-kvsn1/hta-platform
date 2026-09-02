import { prisma, Prisma } from '@hta/database'
import type { ResendDeliveryEventType } from '@hta/shared'
import {
  mapResendEventStatus,
  sanitizeDeliveryFailure,
  shouldApplyDeliveryEvent,
} from './email-delivery-events.js'

export interface VerifiedResendEvent {
  providerEventId: string
  eventType: ResendDeliveryEventType
  occurredAt: Date
  providerEmailId: string
  data: Record<string, unknown>
}

export type ResendEventResult = 'applied' | 'stored' | 'duplicate' | 'unknown'

function safeEventDetails(data: Record<string, unknown>): Record<string, unknown> {
  const allowed = ['to', 'from', 'subject', 'bounce', 'failed', 'reason']
  return Object.fromEntries(allowed.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]))
}

export async function applyResendWebhookEvent(
  event: VerifiedResendEvent,
): Promise<ResendEventResult> {
  const incomingStatus = mapResendEventStatus(event.eventType)
  if (!incomingStatus) return 'unknown'

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.emailDeliveryEvent.findUnique({
      where: { providerEventId: event.providerEventId },
      select: { id: true },
    })
    if (duplicate) return 'duplicate'

    const delivery = await tx.emailDelivery.findUnique({
      where: { providerEmailId: event.providerEmailId },
      select: { id: true, status: true, lastEventAt: true },
    })
    if (!delivery) return 'unknown'

    await tx.emailDeliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        occurredAt: event.occurredAt,
        details: safeEventDetails(event.data) as Prisma.InputJsonValue,
      },
    })

    const shouldApply = shouldApplyDeliveryEvent({
      currentStatus: delivery.status,
      currentEventAt: delivery.lastEventAt,
      incomingStatus,
      incomingEventAt: event.occurredAt,
    })
    if (!shouldApply) return 'stored'

    const isFailure = ['BOUNCED', 'FAILED', 'SUPPRESSED', 'COMPLAINED'].includes(incomingStatus)
    await tx.emailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: incomingStatus,
        lastEventAt: event.occurredAt,
        ...(incomingStatus === 'SENT' ? { sentAt: event.occurredAt } : {}),
        ...(incomingStatus === 'DELIVERED' ? {
          deliveredAt: event.occurredAt,
          failureReason: null,
        } : {}),
        ...(isFailure ? {
          failureReason: sanitizeDeliveryFailure(event.data)
            ?? `Provider reported ${incomingStatus.toLowerCase()}`,
        } : {}),
      },
    })
    return 'applied'
  })
}
