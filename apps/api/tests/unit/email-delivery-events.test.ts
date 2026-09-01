import { describe, expect, it } from 'vitest'
import {
  mapResendEventStatus,
  sanitizeDeliveryFailure,
  shouldApplyDeliveryEvent,
} from '../../src/services/email-delivery-events.js'

describe('mapResendEventStatus', () => {
  it.each([
    ['email.sent', 'SENT'],
    ['email.delivered', 'DELIVERED'],
    ['email.delivery_delayed', 'DELAYED'],
    ['email.bounced', 'BOUNCED'],
    ['email.failed', 'FAILED'],
    ['email.suppressed', 'SUPPRESSED'],
    ['email.complained', 'COMPLAINED'],
  ] as const)('maps %s to %s', (eventType, expected) => {
    expect(mapResendEventStatus(eventType)).toBe(expected)
  })
})

describe('shouldApplyDeliveryEvent', () => {
  const earlier = new Date('2026-09-01T09:59:00.000Z')
  const sameTime = new Date('2026-09-01T10:00:00.000Z')
  const later = new Date('2026-09-01T10:01:00.000Z')

  it('applies the first provider event', () => {
    expect(shouldApplyDeliveryEvent({
      currentStatus: 'QUEUED',
      currentEventAt: null,
      incomingStatus: 'SENT',
      incomingEventAt: sameTime,
    })).toBe(true)
  })

  it('applies a newer provider event', () => {
    expect(shouldApplyDeliveryEvent({
      currentStatus: 'DELIVERED',
      currentEventAt: sameTime,
      incomingStatus: 'DELAYED',
      incomingEventAt: later,
    })).toBe(true)
  })

  it('does not apply an older provider event', () => {
    expect(shouldApplyDeliveryEvent({
      currentStatus: 'DELIVERED',
      currentEventAt: sameTime,
      incomingStatus: 'SENT',
      incomingEventAt: earlier,
    })).toBe(false)
  })

  it('lets an equal-time terminal failure replace a successful status', () => {
    expect(shouldApplyDeliveryEvent({
      currentStatus: 'DELIVERED',
      currentEventAt: sameTime,
      incomingStatus: 'BOUNCED',
      incomingEventAt: sameTime,
    })).toBe(true)
  })

  it('does not let an equal-time successful status replace a terminal failure', () => {
    expect(shouldApplyDeliveryEvent({
      currentStatus: 'BOUNCED',
      currentEventAt: sameTime,
      incomingStatus: 'DELIVERED',
      incomingEventAt: sameTime,
    })).toBe(false)
  })

  it('does not reapply an equal-time event with the same status', () => {
    expect(shouldApplyDeliveryEvent({
      currentStatus: 'DELIVERED',
      currentEventAt: sameTime,
      incomingStatus: 'DELIVERED',
      incomingEventAt: sameTime,
    })).toBe(false)
  })
})

describe('sanitizeDeliveryFailure', () => {
  it('keeps allow-listed provider diagnostics and excludes unrelated payload data', () => {
    expect(sanitizeDeliveryFailure({
      message: 'Mailbox unavailable',
      type: 'Permanent',
      subType: 'General',
      html: '<p>private email body</p>',
      token: 'secret-token',
    })).toBe('Permanent · General · Mailbox unavailable')
  })

  it('reads safe diagnostics from a nested bounce object', () => {
    expect(sanitizeDeliveryFailure({
      bounce: {
        type: 'Transient',
        message: 'Mailbox full',
        raw: 'provider payload',
      },
    })).toBe('Transient · Mailbox full')
  })

  it('caps stored diagnostics at 500 characters', () => {
    expect(sanitizeDeliveryFailure({ message: 'x'.repeat(800) })).toHaveLength(500)
  })

  it('returns null when no safe diagnostic field exists', () => {
    expect(sanitizeDeliveryFailure({ token: 'secret-token' })).toBeNull()
  })
})
