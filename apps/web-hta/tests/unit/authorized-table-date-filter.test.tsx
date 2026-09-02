import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockApiFetch = vi.fn()

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

import { AuthorizedTable } from '@/app/customer/dashboard/components/AuthorizedTable'

function emptyResponse(): Response {
  return {
    ok: true,
    json: () => Promise.resolve({
      items: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    }),
  } as unknown as Response
}

describe('AuthorizedTable date filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockImplementation(async () => emptyResponse())
  })

  it('replaces the year dropdown with start and end date inputs', async () => {
    render(<AuthorizedTable />)

    expect(await screen.findByLabelText('Start date')).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText('End date')).toHaveAttribute('type', 'date')
    expect(screen.queryByText('All Years')).not.toBeInTheDocument()
  })

  it('sends selected start and end dates to the authorized endpoint', async () => {
    render(<AuthorizedTable />)
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled())
    mockApiFetch.mockClear()

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-10' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-01-20' } })

    await waitFor(() => {
      const urls = mockApiFetch.mock.calls.map(([url]) => String(url))
      expect(urls.some((url) =>
        url.includes('startDate=2026-01-10') && url.includes('endDate=2026-01-20'),
      )).toBe(true)
    })
  })
})
