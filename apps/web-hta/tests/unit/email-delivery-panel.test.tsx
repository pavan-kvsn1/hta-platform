import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EmailDeliveryPanel } from '@/components/email-delivery/EmailDeliveryPanel'

const getDeliveries = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email-deliveries', async (loadOriginal) => ({
  ...await loadOriginal<typeof import('@/lib/email-deliveries')>(),
  getCertificateEmailDeliveries: getDeliveries,
}))

describe('EmailDeliveryPanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the latest attempt and safe delivered meaning', async () => {
    getDeliveries.mockResolvedValue([{
      id: 'new', emailType: 'CUSTOMER_REVIEW', recipientEmail: 'customer@example.com',
      recipientName: 'Customer', status: 'DELIVERED', queuedAt: '2026-09-01T10:00:00Z',
      sentAt: '2026-09-01T10:01:00Z', deliveredAt: '2026-09-01T10:02:00Z',
      lastEventAt: '2026-09-01T10:02:00Z', failureReason: null, events: [],
    }, {
      id: 'old', emailType: 'CUSTOMER_REVIEW', recipientEmail: 'old@example.com',
      recipientName: null, status: 'FAILED', queuedAt: '2026-09-01T09:00:00Z',
      sentAt: null, deliveredAt: null, lastEventAt: null,
      failureReason: 'Mailbox unavailable', events: [],
    }])

    render(<EmailDeliveryPanel certificateId="cert-1" />)
    await waitFor(() => expect(screen.getByText('Delivered')).toBeInTheDocument())
    expect(screen.getByText(/mail server accepted/i)).toBeInTheDocument()
    expect(screen.queryByText('Mailbox unavailable')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /show 1 prior attempt/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the approved empty copy', async () => {
    getDeliveries.mockResolvedValue([])
    render(<EmailDeliveryPanel certificateId="cert-1" />)
    await waitFor(() => expect(screen.getByText('Delivery tracking unavailable.')).toBeInTheDocument())
  })
})
