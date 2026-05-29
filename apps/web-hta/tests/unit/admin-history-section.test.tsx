import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminHistorySection } from '@/app/admin/certificates/[id]/AdminHistorySection'

describe('AdminHistorySection', () => {
  it('does not repeat generated customer revision rollup notes when section feedback is present', () => {
    render(
      <AdminHistorySection
        currentRevision={1}
        feedbacks={[]}
        events={[
          {
            id: 'event-1',
            sequenceNumber: 1,
            revision: 1,
            eventType: 'CUSTOMER_REVISION_REQUESTED',
            eventData: JSON.stringify({
              customerName: 'Test Customer',
              customerEmail: 'customer@example.com',
              sectionFeedbacks: [
                { section: 'uuc-details', comment: 'Please change the machine name to Machine2' },
                { section: 'summary', comment: 'The calibration date needs to be changed to 23rd April' },
              ],
              notes: '[Section 2: UUC Details] Please change the machine name to Machine2\n[Section 1: Summary] The calibration date needs to be changed to 23rd April',
            }),
            userRole: 'CUSTOMER',
            createdAt: '2026-04-28T07:04:00.000Z',
            user: null,
            customer: {
              id: 'customer-1',
              name: 'Test Customer',
              email: 'customer@example.com',
            },
          },
        ]}
      />
    )

    expect(screen.getByText('UUC Details')).toBeInTheDocument()
    expect(screen.getByText('Please change the machine name to Machine2')).toBeInTheDocument()
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('The calibration date needs to be changed to 23rd April')).toBeInTheDocument()
    expect(screen.queryByText(/\[Section 2: UUC Details\]/)).not.toBeInTheDocument()
  })

  it('keeps true general customer notes alongside section feedback', () => {
    render(
      <AdminHistorySection
        currentRevision={1}
        feedbacks={[]}
        events={[
          {
            id: 'event-1',
            sequenceNumber: 1,
            revision: 1,
            eventType: 'CUSTOMER_REVISION_REQUESTED',
            eventData: JSON.stringify({
              sectionFeedbacks: [
                { section: 'summary', comment: 'Update the calibration date' },
              ],
              generalNotes: 'Please handle this urgently.',
            }),
            userRole: 'CUSTOMER',
            createdAt: '2026-04-28T07:04:00.000Z',
            user: null,
            customer: {
              id: 'customer-1',
              name: 'Test Customer',
              email: 'customer@example.com',
            },
          },
        ]}
      />
    )

    expect(screen.getByText('Update the calibration date')).toBeInTheDocument()
    expect(screen.getByText(/Please handle this urgently/i)).toBeInTheDocument()
  })
})
