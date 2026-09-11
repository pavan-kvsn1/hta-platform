import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const apiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/instruments',
}))

import InstrumentsPage from '@/app/admin/instruments/page'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const fail = (status: number, body: unknown = null) => ({
  ok: false,
  status,
  json: async () => {
    if (body === null) throw new Error('no body')
    return body
  },
})

describe('admin instruments register, when the request fails', () => {
  // No mockReset/mockClear between tests. Each one installs its own implementation, so
  // there is nothing to reset, and clearing the spy here makes the runner report the
  // rejection in the last test against the test itself rather than letting it reach the
  // component's catch.

  it('says the session expired on a 401 rather than claiming there are no instruments', async () => {
    apiFetch.mockResolvedValue(fail(401))
    render(<InstrumentsPage />)

    await waitFor(() => expect(screen.getByText(/session has expired/i)).toBeTruthy())
    expect(screen.queryByText('No instruments found')).toBeNull()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('reports the status code on a server error', async () => {
    apiFetch.mockResolvedValue(fail(500))
    render(<InstrumentsPage />)

    await waitFor(() => expect(screen.getByText(/error 500/i)).toBeTruthy())
    expect(screen.queryByText('No instruments found')).toBeNull()
  })

  it("prefers the server's own message when it sends one", async () => {
    apiFetch.mockResolvedValue(fail(400, { error: 'Unknown category filter' }))
    render(<InstrumentsPage />)

    await waitFor(() => expect(screen.getByText('Unknown category filter')).toBeTruthy())
  })

  it('says it could not reach the server when the request throws', async () => {
    // The rejection has to be built when the call is made, not when the mock is
    // configured: mockRejectedValue builds it up front, before anything can attach a
    // handler, and the runner then reports it as an unhandled rejection.
    apiFetch.mockImplementation(() => Promise.reject(new Error('network down')))
    render(<InstrumentsPage />)

    await waitFor(() => expect(screen.getByText(/could not reach the server/i)).toBeTruthy())
    expect(screen.queryByText('No instruments found')).toBeNull()
  })

  it('still shows the empty state when the register really is empty', async () => {
    apiFetch.mockResolvedValue(
      ok({
        instruments: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
        stats: null,
      }),
    )
    render(<InstrumentsPage />)

    await waitFor(() => expect(screen.getByText('No instruments found')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })
})
