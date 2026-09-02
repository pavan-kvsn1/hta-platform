import { beforeEach, describe, expect, it, vi } from 'vitest'

const { queueInternal, queueCustomer } = vi.hoisted(() => ({
  queueInternal: vi.fn().mockResolvedValue(undefined),
  queueCustomer: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/services/queue.js', () => ({
  queueInternalRequestDecisionEmail: queueInternal,
  queueCustomerRequestDecisionEmail: queueCustomer,
}))

import {
  dedupeDecisionRecipients,
  sendCustomerDecisionEmails,
  sendInternalDecisionEmail,
} from '../../src/services/request-decision-emails.js'

describe('request decision email dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueInternal.mockResolvedValue(undefined)
    queueCustomer.mockResolvedValue(undefined)
  })

  it('deduplicates recipient addresses case-insensitively using POC priority', () => {
    expect(dedupeDecisionRecipients([
      { email: 'same@example.com', recipientName: 'Requester', audience: 'REQUESTER', priority: 1 },
      { email: 'SAME@example.com', recipientName: 'New POC', audience: 'NEW_POC', priority: 3 },
    ])).toEqual([
      { email: 'SAME@example.com', recipientName: 'New POC', audience: 'NEW_POC', priority: 3 },
    ])
  })

  it('queues one internal decision for the requester', async () => {
    const result = await sendInternalDecisionEmail({
      requestId: 'request-1',
      to: 'engineer@example.com',
      recipientName: 'Engineer',
      requestType: 'OFFLINE_CODE_REQUEST',
      decision: 'APPROVED',
      requestDate: '31 Aug 2026',
    })

    expect(result).toEqual({})
    expect(queueInternal).toHaveBeenCalledOnce()
    expect(queueInternal).toHaveBeenCalledWith(expect.objectContaining({
      to: 'engineer@example.com',
      requestType: 'OFFLINE_CODE_REQUEST',
    }))
  })

  it('queues only the highest-priority POC email for a duplicate address', async () => {
    const result = await sendCustomerDecisionEmails({
      requestId: 'request-2',
      jobs: [
        {
          to: 'same@example.com', recipientName: 'Requester', requestType: 'POC_CHANGE',
          decision: 'APPROVED', audience: 'REQUESTER', companyName: 'Acme',
          requestDate: '31 Aug 2026', previousPocName: 'Old POC', newPocName: 'New POC',
        },
        {
          to: 'same@example.com', recipientName: 'Old POC', requestType: 'POC_CHANGE',
          decision: 'APPROVED', audience: 'PREVIOUS_POC', companyName: 'Acme',
          requestDate: '31 Aug 2026', previousPocName: 'Old POC', newPocName: 'New POC',
        },
        {
          to: 'SAME@example.com', recipientName: 'New POC', requestType: 'POC_CHANGE',
          decision: 'APPROVED', audience: 'NEW_POC', companyName: 'Acme',
          requestDate: '31 Aug 2026', previousPocName: 'Old POC', newPocName: 'New POC',
        },
      ],
    })

    expect(result).toEqual({})
    expect(queueCustomer).toHaveBeenCalledOnce()
    expect(queueCustomer).toHaveBeenCalledWith(expect.objectContaining({
      to: 'SAME@example.com',
      audience: 'NEW_POC',
    }))
  })

  it('preserves an approved account-deletion recipient original address', async () => {
    await sendCustomerDecisionEmails({
      requestId: 'request-3',
      jobs: [{
        to: 'original@example.com', recipientName: 'Former User', requestType: 'ACCOUNT_DELETION',
        decision: 'APPROVED', companyName: 'Acme', requestDate: '31 Aug 2026', wasPoc: false,
      }],
    })

    expect(queueCustomer).toHaveBeenCalledWith(expect.objectContaining({
      to: 'original@example.com',
      decision: 'APPROVED',
    }))
  })

  it('returns one warning without throwing when any queue write fails', async () => {
    queueCustomer.mockRejectedValueOnce(new Error('Redis unavailable'))
    const logger = { error: vi.fn() }

    const result = await sendCustomerDecisionEmails({
      requestId: 'request-4',
      logger,
      jobs: [{
        to: 'requester@example.com', recipientName: 'Requester', requestType: 'DATA_EXPORT',
        decision: 'REJECTED', rejectionReason: 'Scope incomplete', companyName: 'Acme',
        requestDate: '31 Aug 2026',
      }],
    })

    expect(result.emailWarning).toContain('could not be queued')
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-4', recipient: 'requester@example.com' }),
      'Failed to queue request decision email',
    )
  })
})
