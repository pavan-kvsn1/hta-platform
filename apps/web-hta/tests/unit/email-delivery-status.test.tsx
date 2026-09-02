import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmailDeliveryStatus } from '@/components/email-delivery/EmailDeliveryStatus'

describe('EmailDeliveryStatus', () => {
  it.each([
    ['QUEUED', 'Queued'], ['SENT', 'Sent'], ['DELIVERED', 'Delivered'],
    ['DELAYED', 'Delayed'], ['BOUNCED', 'Bounced'], ['FAILED', 'Failed'],
    ['SUPPRESSED', 'Suppressed'], ['COMPLAINED', 'Complained'],
  ] as const)('renders %s as %s', (status, label) => {
    render(<EmailDeliveryStatus status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
