/**
 * OfflineCodesClient Component Tests
 *
 * Tests for the offline challenge-response codes dashboard component.
 * Covers loading state, request button, pending/rejected banners, and code grid.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock apiFetch so we bypass token refresh logic
const mockApiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

// next/navigation is already mocked in setup.ts

import { OfflineCodesClient } from '@/app/(dashboard)/dashboard/offline-codes/OfflineCodesClient'

// Helper to create a mock Response
function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OfflineCodesClient', () => {
  it('renders loading state initially', () => {
    // Never resolve the fetch so the component stays in loading
    mockApiFetch.mockReturnValue(new Promise(() => {}))

    render(<OfflineCodesClient />)

    // The loading spinner has the animate-spin class
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('shows request button when no batch and no pending request', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/offline-codes') {
        return Promise.resolve(
          jsonResponse({
            hasBatch: false,
            pendingRequest: null,
          })
        )
      }
      if (url === '/api/devices/my') {
        return Promise.resolve(jsonResponse({ devices: [] }))
      }
      return Promise.resolve(jsonResponse({}))
    })

    render(<OfflineCodesClient />)

    await waitFor(() => {
      expect(screen.getByText('Request New Card')).toBeInTheDocument()
    })
  })

  it('shows pending banner when request is pending', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/offline-codes') {
        return Promise.resolve(
          jsonResponse({
            hasBatch: false,
            pendingRequest: {
              id: 'req-1',
              status: 'PENDING',
              adminNote: null,
              createdAt: '2026-04-01T00:00:00Z',
            },
          })
        )
      }
      if (url === '/api/devices/my') {
        return Promise.resolve(jsonResponse({ devices: [] }))
      }
      return Promise.resolve(jsonResponse({}))
    })

    render(<OfflineCodesClient />)

    await waitFor(() => {
      expect(screen.getByText('Request Pending')).toBeInTheDocument()
    })

    expect(
      screen.getByText(/awaiting admin approval/i)
    ).toBeInTheDocument()
  })

  it('shows rejection banner with admin note', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/offline-codes') {
        return Promise.resolve(
          jsonResponse({
            hasBatch: false,
            pendingRequest: {
              id: 'req-2',
              status: 'REJECTED',
              adminNote: 'Insufficient justification provided.',
              createdAt: '2026-04-01T00:00:00Z',
            },
          })
        )
      }
      if (url === '/api/devices/my') {
        return Promise.resolve(jsonResponse({ devices: [] }))
      }
      return Promise.resolve(jsonResponse({}))
    })

    render(<OfflineCodesClient />)

    await waitFor(() => {
      expect(screen.getByText('Request Rejected')).toBeInTheDocument()
    })

    expect(
      screen.getByText('Insufficient justification provided.')
    ).toBeInTheDocument()
  })

  it('renders code grid when active batch exists', async () => {
    const pairs = [
      { sequence: 1, key: 'A1', value: '9X3K', used: false },
      { sequence: 2, key: 'A2', value: 'M7PL', used: true },
      { sequence: 3, key: 'B1', value: 'Q4WZ', used: false },
    ]

    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/api/offline-codes') {
        return Promise.resolve(
          jsonResponse({
            hasBatch: true,
            batchId: 'batch-1',
            total: 50,
            remaining: 48,
            pairs,
            expiresAt: '2026-06-01T00:00:00Z',
            isExpired: false,
            pendingRequest: null,
          })
        )
      }
      if (url === '/api/devices/my') {
        return Promise.resolve(jsonResponse({ devices: [] }))
      }
      return Promise.resolve(jsonResponse({}))
    })

    render(<OfflineCodesClient />)

    await waitFor(() => {
      expect(
        screen.getByText('Your Challenge-Response Card')
      ).toBeInTheDocument()
    })

    // Verify code values appear in the grid
    expect(screen.getByText('9X3K')).toBeInTheDocument()
    expect(screen.getByText('M7PL')).toBeInTheDocument()
    expect(screen.getByText('Q4WZ')).toBeInTheDocument()

    // Verify remaining / total is displayed
    expect(screen.getByText('48')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
  })
})
