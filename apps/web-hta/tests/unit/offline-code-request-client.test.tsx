/**
 * OfflineCodeRequestClient Component Tests
 *
 * Tests for the admin offline-code request review component.
 * Covers requester info display, action buttons for pending vs reviewed,
 * and success flow after approval.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'

// Capture router.push calls
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/requests/req-1',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'req-1' }),
}))

// Mock apiFetch so we bypass token refresh logic
const mockApiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

// Mock date-fns to return deterministic strings
vi.mock('date-fns', () => ({
  format: () => 'Apr 15, 2026, 10:30 AM',
  formatDistanceToNow: () => '19 days ago',
}))

// Mock next/link to render a plain anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { OfflineCodeRequestClient } from '@/app/admin/requests/[id]/OfflineCodeRequestClient'

// Helper to create a mock Response
function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response
}

function makePendingRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    status: 'PENDING' as const,
    data: { reason: 'Need codes for onsite visit next week' },
    requestedBy: { id: 'user-1', name: 'Jane Engineer', email: 'jane@hta.com' },
    reviewedBy: null,
    reviewedAt: null,
    adminNote: null,
    createdAt: '2026-04-15T10:30:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OfflineCodeRequestClient', () => {
  it('renders requester info and reason', () => {
    const request = makePendingRequest()

    render(<OfflineCodeRequestClient request={request} />)

    // Requester name and email
    expect(screen.getByText('Jane Engineer')).toBeInTheDocument()
    expect(screen.getByText('jane@hta.com')).toBeInTheDocument()

    // Reason text
    expect(
      screen.getByText('Need codes for onsite visit next week')
    ).toBeInTheDocument()

    // Section header
    expect(screen.getByText('Requested By')).toBeInTheDocument()
  })

  it('renders approve and reject buttons for PENDING status', () => {
    const request = makePendingRequest()

    render(<OfflineCodeRequestClient request={request} />)

    expect(
      screen.getByRole('button', { name: /approve/i })
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: /reject/i })
    ).toBeInTheDocument()
  })

  it('does not show action buttons for already-reviewed requests', () => {
    const request = makePendingRequest({
      status: 'APPROVED',
      reviewedBy: { id: 'admin-1', name: 'Admin Smith' },
      reviewedAt: '2026-04-16T14:00:00Z',
      adminNote: 'Approved for next visit.',
    })

    render(<OfflineCodeRequestClient request={request} />)

    // Status badge shows APPROVED
    expect(screen.getByText('APPROVED')).toBeInTheDocument()

    // Reviewed-by info visible
    expect(screen.getByText(/Admin Smith/)).toBeInTheDocument()

    // No approve or reject buttons
    expect(
      screen.queryByRole('button', { name: /approve/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /reject/i })
    ).not.toBeInTheDocument()
  })

  it('redirects to requests list after approval', async () => {
    const user = userEvent.setup()
    const request = makePendingRequest()

    mockApiFetch.mockResolvedValue(
      jsonResponse({ success: true, message: 'Approved' })
    )

    render(<OfflineCodeRequestClient request={request} />)

    const approveButton = screen.getByRole('button', { name: /approve/i })
    await user.click(approveButton)

    // Verify the API was called with correct args
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/admin/internal-requests/req-1/review',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"action":"approve"'),
        })
      )
    })

    // After success, router.push redirects to the requests list
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/admin/requests')
    })
  })
})
