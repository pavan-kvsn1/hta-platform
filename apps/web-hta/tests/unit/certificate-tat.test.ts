import { describe, expect, it } from 'vitest'
import { resolveCertificateTat, type CertificateTatEvent } from '../../src/lib/utils/certificate-tat'

function event(eventType: string, createdAt: string): CertificateTatEvent {
  return { eventType, createdAt }
}

describe('resolveCertificateTat', () => {
  const createdAt = '2026-06-01T00:00:00.000Z'

  it('uses the latest review submission for reviewer phase TAT', () => {
    const tat = resolveCertificateTat({
      status: 'PENDING_REVIEW',
      createdAt,
      events: [
        event('SUBMITTED_FOR_REVIEW', '2026-06-01T04:00:00.000Z'),
        event('REVISION_REQUESTED', '2026-06-01T08:00:00.000Z'),
        event('RESUBMITTED_FOR_REVIEW', '2026-06-02T10:00:00.000Z'),
      ],
    })

    expect(tat.phase).toMatchObject({
      owner: 'reviewer',
      label: 'Awaiting reviewer',
      startedAt: '2026-06-02T10:00:00.000Z',
      targetHours: 12,
    })
  })

  it('uses reviewer approval handoff event for customer phase TAT', () => {
    const tat = resolveCertificateTat({
      status: 'PENDING_CUSTOMER_APPROVAL',
      createdAt,
      events: [
        event('SENT_TO_CUSTOMER', '2026-06-02T08:00:00.000Z'),
        event('REVIEWER_APPROVED_SENT_TO_CUSTOMER', '2026-06-03T09:00:00.000Z'),
      ],
    })

    expect(tat.phase).toMatchObject({
      owner: 'customer',
      label: 'Awaiting customer',
      startedAt: '2026-06-03T09:00:00.000Z',
    })
  })

  it('uses customer revision request for customer revision phase', () => {
    const tat = resolveCertificateTat({
      status: 'CUSTOMER_REVISION_REQUIRED',
      createdAt,
      events: [
        event('CUSTOMER_REVISION_FORWARDED', '2026-06-03T09:00:00.000Z'),
        event('CUSTOMER_REVISION_REQUESTED', '2026-06-04T11:00:00.000Z'),
      ],
    })

    expect(tat.phase).toMatchObject({
      owner: 'reviewer',
      label: 'Customer revision requested',
      startedAt: '2026-06-04T11:00:00.000Z',
    })
  })

  it('uses forwarded customer revision as engineer revision phase start', () => {
    const tat = resolveCertificateTat({
      status: 'REVISION_REQUIRED',
      createdAt,
      events: [
        event('REVISION_REQUESTED', '2026-06-02T09:00:00.000Z'),
        event('CUSTOMER_REVISION_FORWARDED', '2026-06-05T13:00:00.000Z'),
      ],
    })

    expect(tat.phase).toMatchObject({
      owner: 'engineer',
      label: 'Engineer revising',
      startedAt: '2026-06-05T13:00:00.000Z',
    })
  })

  it('keeps certificate-level TAT separate from phase-level TAT', () => {
    const tat = resolveCertificateTat({
      status: 'PENDING_ADMIN_AUTHORIZATION',
      createdAt,
      events: [
        event('CERTIFICATE_CREATED', '2026-06-01T01:00:00.000Z'),
        event('CUSTOMER_APPROVED', '2026-06-04T10:00:00.000Z'),
        event('SUBMITTED_FOR_AUTHORIZATION', '2026-06-04T12:00:00.000Z'),
      ],
    })

    expect(tat.phase.startedAt).toBe('2026-06-04T12:00:00.000Z')
    expect(tat.phase.owner).toBe('admin')
    expect(tat.phase.targetHours).toBe(12)
    expect(tat.certificate.startedAt).toBe('2026-06-01T01:00:00.000Z')
    expect(tat.certificate.endedAt).toBeNull()
    expect(tat.certificate.targetHours).toBe(48)
  })

  it('ends certificate-level TAT at authorization for authorized certificates', () => {
    const tat = resolveCertificateTat({
      status: 'AUTHORIZED',
      createdAt,
      events: [
        event('CERTIFICATE_CREATED', '2026-06-01T01:00:00.000Z'),
        event('ADMIN_AUTHORIZED', '2026-06-05T14:00:00.000Z'),
      ],
    })

    expect(tat.phase.startedAt).toBeNull()
    expect(tat.certificate.startedAt).toBe('2026-06-01T01:00:00.000Z')
    expect(tat.certificate.endedAt).toBe('2026-06-05T14:00:00.000Z')
  })
})
