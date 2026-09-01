import type {
  EmailDeliveryStatusValue,
  ResendDeliveryEventType,
} from '@hta/shared'

const EVENT_STATUS: Record<ResendDeliveryEventType, EmailDeliveryStatusValue> = {
  'email.sent': 'SENT',
  'email.delivered': 'DELIVERED',
  'email.delivery_delayed': 'DELAYED',
  'email.bounced': 'BOUNCED',
  'email.failed': 'FAILED',
  'email.suppressed': 'SUPPRESSED',
  'email.complained': 'COMPLAINED',
}

const EQUAL_TIME_PRECEDENCE: Record<EmailDeliveryStatusValue, number> = {
  QUEUED: 0,
  SENT: 1,
  DELAYED: 2,
  DELIVERED: 3,
  SUPPRESSED: 4,
  FAILED: 5,
  BOUNCED: 6,
  COMPLAINED: 7,
}

export function mapResendEventStatus(eventType: string): EmailDeliveryStatusValue | null {
  return EVENT_STATUS[eventType as ResendDeliveryEventType] ?? null
}

export function shouldApplyDeliveryEvent(options: {
  currentStatus: EmailDeliveryStatusValue
  currentEventAt: Date | null
  incomingStatus: EmailDeliveryStatusValue
  incomingEventAt: Date
}): boolean {
  const { currentStatus, currentEventAt, incomingStatus, incomingEventAt } = options
  if (!currentEventAt) return true

  const timeDifference = incomingEventAt.getTime() - currentEventAt.getTime()
  if (timeDifference !== 0) return timeDifference > 0

  return EQUAL_TIME_PRECEDENCE[incomingStatus] > EQUAL_TIME_PRECEDENCE[currentStatus]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function safeString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function sanitizeDeliveryFailure(value: unknown): string | null {
  const root = asRecord(value)
  if (!root) return null

  const bounce = asRecord(root.bounce)
  const diagnostic = bounce ?? root
  const parts = [
    safeString(diagnostic, 'type'),
    safeString(diagnostic, 'subType') ?? safeString(diagnostic, 'subtype'),
    safeString(diagnostic, 'message'),
    safeString(diagnostic, 'reason'),
  ].filter((part): part is string => Boolean(part))

  if (parts.length === 0) return null
  return [...new Set(parts)].join(' · ').slice(0, 500)
}
