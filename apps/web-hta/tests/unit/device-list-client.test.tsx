/**
 * DeviceListClient Component Tests
 *
 * Tests for the admin device management list component.
 * Covers loading state, device table rendering, empty state,
 * summary cards, and search filtering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

// Mock apiFetch so we bypass token refresh logic
const mockApiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

// Mock date-fns formatDistanceToNow to return deterministic strings
vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '2 days ago',
}))

// next/navigation is already mocked in setup.ts

import { DeviceListClient } from '@/app/admin/devices/DeviceListClient'

// Helper to create a mock Response
function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

function makeDevice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dev-1',
    deviceId: 'device-abcd1234efgh',
    deviceName: 'Bench Laptop A',
    platform: 'Windows',
    appVersion: '1.2.0',
    status: 'ACTIVE',
    lastSyncAt: '2026-05-01T10:00:00Z',
    registeredAt: '2026-04-01T08:00:00Z',
    wipedAt: null,
    user: { id: 'user-1', name: 'Jane Engineer', email: 'jane@hta.com' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DeviceListClient', () => {
  it('renders loading state initially', () => {
    // Never resolve so the component stays in loading
    mockApiFetch.mockReturnValue(new Promise(() => {}))

    render(<DeviceListClient />)

    // Loader2 spinner with animate-spin class
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('renders device table with device data', async () => {
    const devices = [
      makeDevice(),
      makeDevice({
        id: 'dev-2',
        deviceId: 'device-xyz98765mnop',
        deviceName: 'Field Tablet B',
        platform: 'macOS',
        status: 'REVOKED',
        user: { id: 'user-2', name: 'Bob Tech', email: 'bob@hta.com' },
      }),
    ]

    mockApiFetch.mockResolvedValue(jsonResponse({ devices }))

    render(<DeviceListClient />)

    await waitFor(() => {
      expect(screen.getByText('Bench Laptop A')).toBeInTheDocument()
    })

    expect(screen.getByText('Field Tablet B')).toBeInTheDocument()
    expect(screen.getByText('Jane Engineer')).toBeInTheDocument()
    expect(screen.getByText('Bob Tech')).toBeInTheDocument()

    // Column headers (scoped to thead to avoid filter label collisions)
    const thead = document.querySelector('thead')!
    expect(thead.textContent).toContain('Device')
    expect(thead.textContent).toContain('Engineer')
    expect(thead.textContent).toContain('Platform')
    expect(thead.textContent).toContain('Status')
  })

  it('shows empty state when no devices', async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ devices: [] }))

    render(<DeviceListClient />)

    await waitFor(() => {
      expect(
        screen.getByText('No devices registered yet')
      ).toBeInTheDocument()
    })
  })

  it('shows summary cards with correct counts', async () => {
    const devices = [
      makeDevice({ id: 'dev-1', status: 'ACTIVE' }),
      makeDevice({ id: 'dev-2', status: 'ACTIVE' }),
      makeDevice({ id: 'dev-3', status: 'REVOKED' }),
    ]

    mockApiFetch.mockResolvedValue(jsonResponse({ devices }))

    render(<DeviceListClient />)

    // Summary cards are rendered in a grid; query the cards by their
    // uppercase label (the <p> with "TOTAL", "ACTIVE", etc.) to avoid
    // colliding with status filter options and status badges.
    await waitFor(() => {
      expect(screen.getByText('Total')).toBeInTheDocument()
    })

    // Total = 3, Active = 2, Revoked = 1, Wipe Pending = 0
    // Each summary card has structure: <div><p>LABEL</p><p>VALUE</p></div>
    // Use the unique label text node to locate the parent card, then check value.
    const summaryGrid = screen.getByText('Total').closest('.grid')!

    const totalCard = summaryGrid.querySelector('div')!
    expect(totalCard.textContent).toContain('Total')
    expect(totalCard.textContent).toContain('3')

    // Find all cards inside the summary grid
    const cards = summaryGrid.querySelectorAll(':scope > div')
    // cards[0]=Total, cards[1]=Active, cards[2]=Revoked, cards[3]=Wipe Pending
    expect(cards[1].textContent).toContain('Active')
    expect(cards[1].textContent).toContain('2')

    expect(cards[2].textContent).toContain('Revoked')
    expect(cards[2].textContent).toContain('1')
  })

  it('filters devices by search term', async () => {
    const user = userEvent.setup()
    const devices = [
      makeDevice({ id: 'dev-1', deviceName: 'Bench Laptop A' }),
      makeDevice({
        id: 'dev-2',
        deviceId: 'device-xyz98765mnop',
        deviceName: 'Field Tablet B',
        user: { id: 'user-2', name: 'Bob Tech', email: 'bob@hta.com' },
      }),
    ]

    mockApiFetch.mockResolvedValue(jsonResponse({ devices }))

    render(<DeviceListClient />)

    // Wait for table to render
    await waitFor(() => {
      expect(screen.getByText('Bench Laptop A')).toBeInTheDocument()
    })

    // Both devices visible initially
    expect(screen.getByText('Field Tablet B')).toBeInTheDocument()

    // Type a search term that matches only the first device
    const searchInput = screen.getByPlaceholderText(/search by device name/i)
    await user.type(searchInput, 'Bench')

    // First device still visible
    await waitFor(() => {
      expect(screen.getByText('Bench Laptop A')).toBeInTheDocument()
    })

    // Second device filtered out
    expect(screen.queryByText('Field Tablet B')).not.toBeInTheDocument()
  })
})
